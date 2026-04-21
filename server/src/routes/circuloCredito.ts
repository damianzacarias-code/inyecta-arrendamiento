import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';

const log = childLogger('circuloCredito');

const router = Router();

const CLAVE_OTORGANTE = '0000000000'; // TODO: Asignar clave real de Círculo de Crédito
const NOMBRE_OTORGANTE = 'FSMP SOLUCIONES DE CAPITAL SA DE CV SOFOM ENR';

// ─── Helpers ────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2, '0')}${(dt.getMonth() + 1).toString().padStart(2, '0')}${dt.getFullYear()}`;
}

function fmtDateYMD(d: Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}${(dt.getMonth() + 1).toString().padStart(2, '0')}${dt.getDate().toString().padStart(2, '0')}`;
}

function calcDiasVencidos(schedule: Array<{ estatus: string; diasAtraso: number }>): number {
  const vencidos = schedule.filter(s => s.estatus === 'VENCIDO' || s.estatus === 'PARCIAL');
  return vencidos.length > 0 ? Math.max(...vencidos.map(v => v.diasAtraso)) : 0;
}

function calcHistoricoPagos(schedule: Array<{ estatus: string }>): string {
  // Últimos 24 periodos: V=al corriente, 1=30d, 2=60d, etc.
  return schedule.slice(-24).map(s => {
    if (s.estatus === 'PAGADO') return 'V';
    if (s.estatus === 'FUTURO' || s.estatus === 'PENDIENTE') return '';
    return '1'; // vencido
  }).join('');
}

function estadoCartera(diasVencidos: number): string {
  if (diasVencidos === 0) return 'Vigente';
  if (diasVencidos < 30) return 'Mora < 30 dias';
  if (diasVencidos < 60) return 'Mora < 60 dias';
  if (diasVencidos < 90) return 'Mora < 90 dias';
  return 'Mora > 90 dias';
}

// ─── GET /api/circulo-credito/preview ───────────────────────
// Genera un preview del reporte mensual para todos los contratos vigentes
router.get('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { periodo } = req.query; // formato: MMYYYY
    const now = new Date();
    const fechaCorte = periodo
      ? new Date(parseInt((periodo as string).slice(2)), parseInt((periodo as string).slice(0, 2)) - 1, 28)
      : now;

    const contracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      include: {
        client: {
          include: {
            avales: true,
            socios: true,
          },
        },
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    const reportesPF: any[] = [];
    const reportesPM: any[] = [];

    for (const contract of contracts) {
      const client = contract.client;
      const tasaAnual = Number(contract.tasaAnual);

      // Calcular estado de cada periodo
      const paymentsByPeriodo = new Map<number, typeof contract.pagos>();
      contract.pagos.forEach(p => {
        if (p.periodo === null) return;
        if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
        paymentsByPeriodo.get(p.periodo)!.push(p);
      });

      const schedule = contract.amortizacion.map(entry => {
        const payments = paymentsByPeriodo.get(entry.periodo) || [];
        const renta = Number(entry.renta);
        const iva = Number(entry.iva);
        const pagadoRenta = payments.reduce((s, p) => s + Number(p.montoRenta), 0);
        const rentaCubierta = (renta - pagadoRenta) <= 0.01;
        const vencimiento = new Date(entry.fechaPago);
        const isOverdue = !rentaCubierta && vencimiento < fechaCorte;
        const diasAtraso = isOverdue
          ? Math.floor((fechaCorte.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        let estatus: string;
        if (rentaCubierta) estatus = 'PAGADO';
        else if (payments.length > 0) estatus = 'PARCIAL';
        else if (isOverdue) estatus = 'VENCIDO';
        else if (vencimiento <= fechaCorte) estatus = 'PENDIENTE';
        else estatus = 'FUTURO';

        return {
          periodo: entry.periodo,
          fechaPago: entry.fechaPago,
          estatus,
          diasAtraso,
          saldoFinal: Number(entry.saldoFinal),
          renta,
          iva,
        };
      });

      // Calcular saldos
      const diasVencidos = calcDiasVencidos(schedule);
      const ultimoPagado = schedule.filter(s => s.estatus === 'PAGADO').pop();
      const saldoInsoluto = schedule.length > 0
        ? Number(contract.amortizacion[contract.amortizacion.length - 1]?.saldoFinal || 0) > 0
          ? schedule.find(s => s.estatus !== 'PAGADO')?.saldoFinal || Number(contract.montoFinanciar)
          : 0
        : Number(contract.montoFinanciar);

      // Saldo vencido = suma de rentas vencidas no pagadas
      const saldoVencido = schedule
        .filter(s => s.estatus === 'VENCIDO' || s.estatus === 'PARCIAL')
        .reduce((sum, s) => sum + s.renta + s.iva, 0);

      const pagosVencidos = schedule.filter(s => s.estatus === 'VENCIDO' || s.estatus === 'PARCIAL').length;

      // Intereses del periodo
      const interesesPeriodo = contract.amortizacion
        .filter(e => {
          const fecha = new Date(e.fechaPago);
          return fecha.getMonth() === fechaCorte.getMonth() && fecha.getFullYear() === fechaCorte.getFullYear();
        })
        .reduce((s, e) => s + Number(e.intereses || 0), 0);

      // Último pago
      const ultimoPago = contract.pagos.filter(p => Number(p.montoRenta) > 0).pop();

      const commonData = {
        contractId: contract.id,
        folio: contract.folio,
        producto: contract.producto,
        tipoContrato: contract.producto === 'PURO' ? 'CP' : 'PP', // CP=Arr.Puro, PP=Arr.Financiero
        estadoCartera: estadoCartera(diasVencidos),
        diasVencidos,
        saldoInsoluto: Math.round(saldoInsoluto * 100) / 100,
        saldoVencido: Math.round(saldoVencido * 100) / 100,
        saldoActual: Math.round((Number(contract.montoFinanciar) - schedule.filter(s => s.estatus === 'PAGADO').reduce((sum, s) => sum + (Number(contract.montoFinanciar) / contract.plazo), 0)) * 100) / 100,
        pagosVencidos,
        historicoPagos: calcHistoricoPagos(schedule),
        interesesPeriodo: Math.round(interesesPeriodo * 100) / 100,
      };

      // Datos faltantes para el reporte
      const faltantes: string[] = [];

      if (client.tipo === 'PFAE') {
        // Reporte PF
        if (!client.nombre) faltantes.push('Nombre');
        if (!client.apellidoPaterno) faltantes.push('Apellido Paterno');
        if (!client.rfc) faltantes.push('RFC');
        if (!client.curp) faltantes.push('CURP');
        if (!client.calle) faltantes.push('Domicilio');
        if (!client.cp) faltantes.push('Código Postal');
        if (!client.estado) faltantes.push('Estado');
        if (!client.telefono) faltantes.push('Teléfono');

        reportesPF.push({
          ...commonData,
          clientId: client.id,
          clienteTipo: 'PF',
          // Datos personales
          apellidoPaterno: client.apellidoPaterno || '',
          apellidoMaterno: client.apellidoMaterno || '',
          nombres: client.nombre || '',
          rfc: client.rfc || '',
          curp: client.curp || '',
          nacionalidad: 'MX',
          // Domicilio
          direccion: [client.calle, client.numExterior, client.numInterior].filter(Boolean).join(' '),
          colonia: client.colonia || '',
          delegacionMunicipio: client.municipio || '',
          ciudad: client.ciudad || '',
          estado: client.estado || '',
          cp: client.cp || '',
          telefono: client.telefono || '',
          email: client.email || '',
          // Cuenta
          cuentaActual: contract.folio,
          tipoResponsabilidad: 'I', // Individual
          tipoCuenta: 'F', // Financiamiento
          numeroPagos: contract.plazo,
          frecuenciaPagos: 'M', // Mensual
          montoPagar: Number(contract.rentaMensualIVA),
          fechaApertura: fmtDateYMD(contract.fechaInicio),
          fechaUltimoPago: ultimoPago ? fmtDateYMD(ultimoPago.fechaPago) : '',
          fechaCorte: fmtDateYMD(fechaCorte),
          creditoMaximo: Number(contract.montoFinanciar),
          montoUltimoPago: ultimoPago ? Number(ultimoPago.montoTotal) : 0,
          montoCreditoOriginacion: Number(contract.valorBien),
          plazoMeses: contract.plazo,
          faltantes,
        });
      } else {
        // Reporte PM
        if (!client.razonSocial) faltantes.push('Razón Social');
        if (!client.rfc) faltantes.push('RFC');
        if (!client.calle) faltantes.push('Domicilio');
        if (!client.cp) faltantes.push('Código Postal');
        if (!client.estado) faltantes.push('Estado');
        if (!client.representanteLegal) faltantes.push('Representante Legal');

        // Socios/accionistas
        const socios = client.socios.map(s => ({
          nombre: s.nombre,
          apellidoPaterno: s.apellidoPaterno,
          apellidoMaterno: s.apellidoMaterno || '',
          rfc: s.rfc || '',
          porcentaje: Number(s.porcentaje),
        }));

        // Avales
        const avales = client.avales.map(a => ({
          nombre: a.nombre,
          apellidoPaterno: a.apellidoPaterno,
          apellidoMaterno: a.apellidoMaterno || '',
          rfc: a.rfc || '',
          curp: a.curp || '',
          telefono: a.telefono || '',
          domicilio: a.domicilio || '',
        }));

        reportesPM.push({
          ...commonData,
          clientId: client.id,
          clienteTipo: 'PM',
          // Empresa
          razonSocial: client.razonSocial || '',
          rfc: client.rfc || '',
          representanteLegal: client.representanteLegal || '',
          direccion: [client.calle, client.numExterior, client.numInterior].filter(Boolean).join(' '),
          colonia: client.colonia || '',
          delegacionMunicipio: client.municipio || '',
          ciudad: client.ciudad || '',
          estado: client.estado || '',
          cp: client.cp || '',
          telefono: client.telefono || '',
          email: client.email || '',
          nacionalidad: 'MX',
          actividadEconomica: client.actividadEconomica || '',
          sector: client.sector || '',
          // Crédito
          numContrato: contract.folio,
          fechaApertura: fmtDateYMD(contract.fechaInicio),
          plazoMeses: contract.plazo,
          tipoCredito: contract.producto === 'PURO' ? '1300' : '1301', // 1300=Arr.Puro
          saldoInicial: Number(contract.montoFinanciar),
          moneda: 'MX',
          numPagos: contract.plazo,
          frecuenciaPagos: 'M',
          importePagos: Number(contract.rentaMensualIVA),
          fechaUltimoPago: ultimoPago ? fmtDateYMD(ultimoPago.fechaPago) : '',
          pagoEfectivo: ultimoPago ? Number(ultimoPago.montoTotal) : 0,
          creditoMaximo: Number(contract.montoFinanciar),
          // Socios y avales
          socios,
          avales,
          faltantes,
        });
      }
    }

    // Resumen
    const totalContratos = reportesPF.length + reportesPM.length;
    const conFaltantes = [...reportesPF, ...reportesPM].filter(r => r.faltantes.length > 0);

    res.json({
      fechaCorte: fechaCorte.toISOString(),
      claveOtorgante: CLAVE_OTORGANTE,
      nombreOtorgante: NOMBRE_OTORGANTE,
      reportesPF,
      reportesPM,
      resumen: {
        totalContratos,
        personasFisicas: reportesPF.length,
        personasMorales: reportesPM.length,
        conDatosFaltantes: conFaltantes.length,
        listos: totalContratos - conFaltantes.length,
        faltantesDetalle: conFaltantes.map(r => ({
          folio: r.folio,
          cliente: r.clienteTipo === 'PF' ? r.nombres + ' ' + r.apellidoPaterno : r.razonSocial,
          campos: r.faltantes,
        })),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Circulo preview error');
    res.status(500).json({ error: 'Error al generar preview del reporte' });
  }
});

// ─── GET /api/circulo-credito/solicitud/:contractId ─────────
// Formulario de solicitud pre-llenado para un contrato específico
router.get('/solicitud/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.contractId },
      include: {
        client: {
          include: {
            avales: true,
            socios: true,
            documentos: true,
          },
        },
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const client = contract.client;
    const isPF = client.tipo === 'PFAE';

    // Documentos relevantes
    const docsRequeridos = isPF
      ? ['INE', 'CSF', 'CURP', 'AUTORIZACION_BURO']
      : ['ACTA_CONSTITUTIVA', 'CSF', 'INE_REP_LEGAL', 'AUTORIZACION_BURO'];

    const docsEstado = docsRequeridos.map(tipo => {
      const doc = client.documentos.find(d => d.tipo === tipo);
      return {
        tipo,
        estado: doc?.estado || 'SIN_REGISTRAR',
        fechaRecepcion: doc?.fechaRecepcion,
      };
    });

    // Campos faltantes para el reporte
    const camposFaltantes: Array<{ campo: string; seccion: string }> = [];

    if (isPF) {
      if (!client.nombre) camposFaltantes.push({ campo: 'Nombres', seccion: 'Datos personales' });
      if (!client.apellidoPaterno) camposFaltantes.push({ campo: 'Apellido Paterno', seccion: 'Datos personales' });
      if (!client.rfc) camposFaltantes.push({ campo: 'RFC', seccion: 'Datos personales' });
      if (!client.curp) camposFaltantes.push({ campo: 'CURP', seccion: 'Datos personales' });
      if (!client.calle) camposFaltantes.push({ campo: 'Calle', seccion: 'Domicilio' });
      if (!client.colonia) camposFaltantes.push({ campo: 'Colonia', seccion: 'Domicilio' });
      if (!client.municipio) camposFaltantes.push({ campo: 'Municipio', seccion: 'Domicilio' });
      if (!client.estado) camposFaltantes.push({ campo: 'Estado', seccion: 'Domicilio' });
      if (!client.cp) camposFaltantes.push({ campo: 'Código Postal', seccion: 'Domicilio' });
      if (!client.telefono) camposFaltantes.push({ campo: 'Teléfono', seccion: 'Contacto' });
    } else {
      if (!client.razonSocial) camposFaltantes.push({ campo: 'Razón Social', seccion: 'Empresa' });
      if (!client.rfc) camposFaltantes.push({ campo: 'RFC', seccion: 'Empresa' });
      if (!client.representanteLegal) camposFaltantes.push({ campo: 'Representante Legal', seccion: 'Empresa' });
      if (!client.calle) camposFaltantes.push({ campo: 'Calle', seccion: 'Domicilio' });
      if (!client.colonia) camposFaltantes.push({ campo: 'Colonia', seccion: 'Domicilio' });
      if (!client.estado) camposFaltantes.push({ campo: 'Estado', seccion: 'Domicilio' });
      if (!client.cp) camposFaltantes.push({ campo: 'Código Postal', seccion: 'Domicilio' });
      if (!client.actividadEconomica) camposFaltantes.push({ campo: 'Actividad Económica', seccion: 'Empresa' });
      if (client.socios.length === 0) camposFaltantes.push({ campo: 'Accionistas', seccion: 'Estructura' });
    }

    res.json({
      contrato: {
        id: contract.id,
        folio: contract.folio,
        producto: contract.producto,
        plazo: contract.plazo,
        montoFinanciar: contract.montoFinanciar,
        valorBien: contract.valorBien,
        tasaAnual: contract.tasaAnual,
        rentaMensualIVA: contract.rentaMensualIVA,
        fechaInicio: contract.fechaInicio,
        fechaVencimiento: contract.fechaVencimiento,
      },
      cliente: {
        id: client.id,
        tipo: client.tipo,
        // PF
        nombre: client.nombre,
        apellidoPaterno: client.apellidoPaterno,
        apellidoMaterno: client.apellidoMaterno,
        curp: client.curp,
        // PM
        razonSocial: client.razonSocial,
        representanteLegal: client.representanteLegal,
        actaConstitutiva: client.actaConstitutiva,
        // Compartidos
        rfc: client.rfc,
        email: client.email,
        telefono: client.telefono,
        sector: client.sector,
        actividadEconomica: client.actividadEconomica,
        // Domicilio fiscal
        calle: client.calle,
        numExterior: client.numExterior,
        numInterior: client.numInterior,
        colonia: client.colonia,
        municipio: client.municipio,
        ciudad: client.ciudad,
        estado: client.estado,
        cp: client.cp,
      },
      socios: client.socios,
      avales: client.avales,
      documentos: docsEstado,
      camposFaltantes,
      listo: camposFaltantes.length === 0,
    });
  } catch (error) {
    log.error({ err: error }, 'Solicitud error');
    res.status(500).json({ error: 'Error al generar solicitud' });
  }
});

export default router;
