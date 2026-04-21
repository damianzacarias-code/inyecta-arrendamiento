/**
 * seedTest.ts — Crea 4 clientes de prueba con escenarios de cobranza distintos.
 *
 * Escenarios (today = 2026-04-20):
 *   1. PM   · PURO        · fechaInicio 2025-12-15 → P1 vencido 95d  (Cartera vencida / Legal)
 *   2. PM   · FINANCIERO  · fechaInicio 2026-02-05 → P1 vencido 46d  (Mora intermedia, gatilla aval)
 *   3. PFAE · PURO        · fechaInicio 2026-03-04 → P1 vencido 16d  (Mora temprana)
 *   4. PFAE · FINANCIERO  · fechaInicio 2026-03-10 → P1 ya pagado, P2 al día  (Vigente)
 *
 * Cada cliente recibe: aval, póliza de seguro, dispositivo GPS.
 *
 * Idempotente: si ya existen clientes con el mismo RFC los borra primero.
 *
 * Uso:
 *   cd sistema/server && npx tsx src/seedTest.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TASA = 0.36;
const IVA = 0.16;
const TASA_MORATORIA = 0.72;

// ─── Helpers financieros ─────────────────────────────────────
function pmt(monto: number, n: number, tasaMensual: number, fv = 0): number {
  if (tasaMensual === 0) return (monto - fv) / n;
  const factor = Math.pow(1 + tasaMensual, n);
  return (monto * tasaMensual * factor - fv * tasaMensual) / (factor - 1);
}

function addMeses(base: Date, meses: number): Date {
  const total = base.getMonth() + meses;
  const yr = base.getFullYear() + Math.floor(total / 12);
  const mo = ((total % 12) + 12) % 12;
  const dia = base.getDate();
  const maxDia = new Date(yr, mo + 1, 0).getDate();
  return new Date(yr, mo, Math.min(dia, maxDia), 12, 0, 0);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Tipos del escenario ─────────────────────────────────────
type Scenario = {
  label: string;
  tipoCliente: 'PM' | 'PFAE';
  producto: 'PURO' | 'FINANCIERO';
  fechaInicio: Date;
  valorBien: number;
  plazo: number;
  pagosCompletos: number;
  rfcCliente: string;
  clientData: {
    razonSocial?: string;
    nombre?: string;
    apellidoPaterno?: string;
    apellidoMaterno?: string;
    email: string;
    telefono: string;
    sector?: string;
    actividadEconomica?: string;
    representanteLegal?: string;
  };
  bien: {
    descripcion: string;
    marca: string;
    modelo: string;
    anio: number;
    numSerie: string;
    proveedor: string;
  };
  aval: {
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno?: string;
    rfc: string;
    telefono: string;
    email: string;
    relacion: string;
  };
  aseguradora: string;
};

const TODAY = new Date(2026, 3, 20, 12, 0, 0); // 2026-04-20

const SCENARIOS: Scenario[] = [
  {
    label: 'PM · PURO · 95+d vencido',
    tipoCliente: 'PM',
    producto: 'PURO',
    fechaInicio: new Date(2025, 11, 15, 12, 0, 0),  // 2025-12-15 → P1 vence 2026-01-15 (~95d)
    valorBien: 420000,
    plazo: 24,
    pagosCompletos: 0,
    rfcCliente: 'CNT250101TST',
    clientData: {
      razonSocial: 'Constructora Norte de México SA de CV',
      email: 'contacto@constructoranorte.test',
      telefono: '8181234501',
      sector: 'CONSTRUCCION',
      actividadEconomica: 'Construcción de obra civil',
      representanteLegal: 'Roberto Hernández Salinas',
    },
    bien: {
      descripcion: 'Camioneta pickup doble cabina 4x4',
      marca: 'Toyota',
      modelo: 'Hilux SR',
      anio: 2024,
      numSerie: 'MR0FB22G500TEST01',
      proveedor: 'Distribuidora Toyota Monterrey',
    },
    aval: {
      nombre: 'Roberto',
      apellidoPaterno: 'Hernández',
      apellidoMaterno: 'Salinas',
      rfc: 'HESR800101A11',
      telefono: '8189876501',
      email: 'rh@constructoranorte.test',
      relacion: 'Accionista mayoritario',
    },
    aseguradora: 'Seguros El Potosí',
  },
  {
    label: 'PM · FINANCIERO · 46d vencido',
    tipoCliente: 'PM',
    producto: 'FINANCIERO',
    fechaInicio: new Date(2026, 1, 5, 12, 0, 0),  // 2026-02-05 → P1 vence 2026-03-05 (~46d)
    valorBien: 350000,
    plazo: 36,
    pagosCompletos: 0,
    rfcCliente: 'LGI240301TST',
    clientData: {
      razonSocial: 'Logística Inteligente del Bajío SA de CV',
      email: 'admin@logbajio.test',
      telefono: '4771234502',
      sector: 'TRANSPORTE',
      actividadEconomica: 'Transporte de carga',
      representanteLegal: 'María Elena Vargas Cruz',
    },
    bien: {
      descripcion: 'Camión de carga 3.5 ton',
      marca: 'Hino',
      modelo: '300 Series 616',
      anio: 2025,
      numSerie: 'JHHEPB73HTEST002',
      proveedor: 'Hino Centro León',
    },
    aval: {
      nombre: 'María Elena',
      apellidoPaterno: 'Vargas',
      apellidoMaterno: 'Cruz',
      rfc: 'VACM850515B22',
      telefono: '4779876502',
      email: 'mevargas@logbajio.test',
      relacion: 'Representante legal',
    },
    aseguradora: 'GNP Seguros',
  },
  {
    label: 'PFAE · PURO · 16d vencido',
    tipoCliente: 'PFAE',
    producto: 'PURO',
    fechaInicio: new Date(2026, 2, 4, 12, 0, 0),  // 2026-03-04 → P1 vence 2026-04-04 (~16d)
    valorBien: 280000,
    plazo: 24,
    pagosCompletos: 0,
    rfcCliente: 'GORA800301TST',
    clientData: {
      nombre: 'Andrea',
      apellidoPaterno: 'González',
      apellidoMaterno: 'Ramírez',
      email: 'andrea.gonzalez@correo.test',
      telefono: '5551234503',
      sector: 'COMERCIO',
      actividadEconomica: 'Comercio al por menor',
    },
    bien: {
      descripcion: 'Vehículo utilitario para reparto',
      marca: 'Nissan',
      modelo: 'NV200',
      anio: 2024,
      numSerie: '3N6CM0KN0TEST003',
      proveedor: 'Nissan Polanco',
    },
    aval: {
      nombre: 'Carlos',
      apellidoPaterno: 'González',
      apellidoMaterno: 'Pérez',
      rfc: 'GOPC550210C33',
      telefono: '5559876503',
      email: 'carlos.gonzalez@correo.test',
      relacion: 'Padre',
    },
    aseguradora: 'AXA Seguros',
  },
  {
    label: 'PFAE · FINANCIERO · al día (P1 pagado)',
    tipoCliente: 'PFAE',
    producto: 'FINANCIERO',
    fechaInicio: new Date(2026, 2, 10, 12, 0, 0),  // 2026-03-10 → P1 venció 2026-04-10, ya pagado
    valorBien: 360000,
    plazo: 36,
    pagosCompletos: 1, // P1 cubierto
    rfcCliente: 'MELJ750515TST',
    clientData: {
      nombre: 'Jorge',
      apellidoPaterno: 'Mendoza',
      apellidoMaterno: 'López',
      email: 'jorge.mendoza@correo.test',
      telefono: '3331234504',
      sector: 'SERVICIOS',
      actividadEconomica: 'Consultoría profesional',
    },
    bien: {
      descripcion: 'SUV mediana para uso ejecutivo',
      marca: 'Mazda',
      modelo: 'CX-5 Sport',
      anio: 2025,
      numSerie: 'JM3KFBCM0TEST004',
      proveedor: 'Mazda Guadalajara Centro',
    },
    aval: {
      nombre: 'Laura',
      apellidoPaterno: 'Mendoza',
      apellidoMaterno: 'López',
      rfc: 'MELL780825D44',
      telefono: '3339876504',
      email: 'laura.mendoza@correo.test',
      relacion: 'Hermana',
    },
    aseguradora: 'Quálitas Compañía de Seguros',
  },
];

// ─── Limpieza idempotente ───────────────────────────────────
async function cleanScenario(rfcCliente: string) {
  const c = await prisma.client.findUnique({ where: { rfc: rfcCliente } });
  if (!c) return;
  const contracts = await prisma.contract.findMany({ where: { clientId: c.id }, select: { id: true } });
  for (const ct of contracts) {
    await prisma.payment.deleteMany({ where: { contractId: ct.id } });
    await prisma.amortizationEntry.deleteMany({ where: { contractId: ct.id } });
    await prisma.insurancePolicy.deleteMany({ where: { contractId: ct.id } });
    await prisma.gPSDevice.deleteMany({ where: { contractId: ct.id } });
    await prisma.stageHistory.deleteMany({ where: { contractId: ct.id } });
    await prisma.contract.delete({ where: { id: ct.id } });
  }
  await prisma.guarantor.deleteMany({ where: { clientId: c.id } });
  await prisma.clientDocument.deleteMany({ where: { clientId: c.id } });
  await prisma.client.delete({ where: { id: c.id } });
  console.log(`  ↺ limpieza previa de RFC ${rfcCliente}`);
}

// ─── Crear escenario ───────────────────────────────────────
async function createScenario(s: Scenario, userId: string, seq: number) {
  // 1. Cliente
  const client = await prisma.client.create({
    data: {
      tipo: s.tipoCliente,
      ...s.clientData,
      rfc: s.rfcCliente,
      calle: 'Av. Constitución',
      numExterior: String(seq * 100),
      colonia: 'Centro',
      municipio: 'Monterrey',
      ciudad: 'Monterrey',
      estado: 'Nuevo León',
      cp: '64000',
    },
  });

  // 2. Aval
  await prisma.guarantor.create({ data: { clientId: client.id, ...s.aval } });

  // 3. Cálculo financiero
  const valorSinIVA = s.valorBien / 1.16;
  const baseBien = valorSinIVA;                         // sin GPS financiado en este seed
  const comisionApertura = baseBien * 0.05;
  const montoFinanciar = baseBien + comisionApertura;
  const depositoGarantia = s.producto === 'PURO' ? baseBien * 0.16 : 0;
  const fv = depositoGarantia;                           // PURO: FV = depósito; FIN: FV = 0
  const tasaMensual = TASA / 12;
  const rentaMensual = pmt(montoFinanciar, s.plazo, tasaMensual, fv);
  const rentaMensualIVA = rentaMensual * 1.16;
  const seguroAnual = r2(s.valorBien * 0.025);
  const seguroMensual = seguroAnual / 12;

  // 4. Contrato (directo en estado VIGENTE/ACTIVO con fechaInicio backdated)
  const folio = `ARR-T${String(seq).padStart(2, '0')}-2026`;
  const contract = await prisma.contract.create({
    data: {
      folio,
      clientId: client.id,
      userId,
      bienDescripcion: s.bien.descripcion,
      bienMarca: s.bien.marca,
      bienModelo: s.bien.modelo,
      bienAnio: s.bien.anio,
      bienNumSerie: s.bien.numSerie,
      bienEstado: 'NUEVO',
      proveedor: s.bien.proveedor,
      producto: s.producto,
      valorBien: s.valorBien,
      valorBienIVA: r2(s.valorBien * 1.16),
      plazo: s.plazo,
      tasaAnual: TASA,
      tasaMoratoria: TASA_MORATORIA,
      nivelRiesgo: 'A',
      enganche: 0,
      depositoGarantia: r2(depositoGarantia),
      comisionApertura: r2(comisionApertura),
      rentaInicial: 0,
      gpsInstalacion: 0,
      seguroAnual,
      valorResidual: r2(depositoGarantia),
      montoFinanciar: r2(montoFinanciar),
      rentaMensual: r2(rentaMensual),
      rentaMensualIVA: r2(rentaMensualIVA),
      fechaFirma: s.fechaInicio,
      fechaInicio: s.fechaInicio,
      fechaEntregaBien: s.fechaInicio,
      etapa: 'ACTIVO',
      estatus: 'VIGENTE',
      stageHistory: {
        create: { etapa: 'ACTIVO', observacion: `[seed] ${s.label}`, usuarioId: userId },
      },
    },
  });

  // 5. Tabla de amortización
  const isPuro = s.producto === 'PURO';
  let saldo = montoFinanciar;
  const entries: Array<{
    contractId: string;
    periodo: number;
    fechaPago: Date;
    saldoInicial: number;
    intereses: number;
    pagoCapital: number;
    renta: number;
    iva: number;
    seguro: number;
    pagoTotal: number;
    saldoFinal: number;
  }> = [];

  for (let i = 1; i <= s.plazo; i++) {
    const fechaPago = addMeses(s.fechaInicio, i);
    const interes = saldo * tasaMensual;
    let capital: number;
    let saldoFinal: number;
    if (isPuro) {
      capital = 0;
      saldoFinal = saldo;
    } else if (i === s.plazo) {
      capital = saldo - fv;        // última fila cierra exacto en FV (=0 para FIN)
      saldoFinal = fv;
    } else {
      capital = rentaMensual - interes;
      saldoFinal = Math.max(0, saldo - capital);
    }
    const renta = rentaMensual;
    const iva = renta * IVA;
    const pagoTotal = renta + iva + seguroMensual;

    entries.push({
      contractId: contract.id,
      periodo: i,
      fechaPago,
      saldoInicial: r2(saldo),
      intereses: r2(interes),
      pagoCapital: r2(capital),
      renta: r2(renta),
      iva: r2(iva),
      seguro: r2(seguroMensual),
      pagoTotal: r2(pagoTotal),
      saldoFinal: r2(saldoFinal),
    });
    saldo = saldoFinal;
  }
  await prisma.amortizationEntry.createMany({ data: entries });
  await prisma.contract.update({
    where: { id: contract.id },
    data: { fechaVencimiento: entries[entries.length - 1].fechaPago },
  });

  // 6. Pagos previos (períodos completos)
  for (let i = 0; i < s.pagosCompletos; i++) {
    const e = entries[i];
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        userId,
        periodo: e.periodo,
        tipo: 'RENTA_ORDINARIA',
        fechaPago: e.fechaPago,                  // pagado a tiempo
        fechaVencimiento: e.fechaPago,
        montoRenta: e.renta,
        montoIVA: e.iva,
        montoMoratorio: 0,
        montoIVAMoratorio: 0,
        montoTotal: r2(e.renta + e.iva),
        diasAtraso: 0,
        observaciones: '[seed] Pago completo a tiempo',
      },
    });
  }

  // 7. Póliza de seguro
  await prisma.insurancePolicy.create({
    data: {
      contractId: contract.id,
      aseguradora: s.aseguradora,
      numPoliza: `POL-${folio}`,
      tipoCobertura: 'AMPLIA',
      montoAsegurado: s.valorBien,
      primaAnual: seguroAnual,
      fechaInicio: s.fechaInicio,
      fechaVencimiento: addMeses(s.fechaInicio, 12),
      endosoPref: true,
      vigente: true,
      observaciones: '[seed] Endoso preferente a Inyecta SOFOM',
    },
  });

  // 8. GPS
  await prisma.gPSDevice.create({
    data: {
      contractId: contract.id,
      marca: 'Coban',
      modelo: 'GT06N',
      numSerie: `GPS-${folio}`,
      proveedor: 'Track4U México',
      fechaInstalacion: s.fechaInicio,
      activo: true,
      costoInstalacion: 16000,
      observaciones: '[seed] Instalado al firmar contrato',
    },
  });

  // Cálculo de días de atraso del primer período no pagado para reporte
  const primerNoPagado = entries[s.pagosCompletos];
  const diasAtraso = primerNoPagado
    ? Math.max(0, Math.floor((TODAY.getTime() - primerNoPagado.fechaPago.getTime()) / 86400000))
    : 0;

  console.log(
    `✓ ${folio.padEnd(15)} ${s.label.padEnd(40)} renta=$${r2(rentaMensual).toLocaleString('es-MX')} P${s.pagosCompletos + 1} atraso=${diasAtraso}d`,
  );
  return { folio, contractId: contract.id, clientId: client.id };
}

async function main() {
  const damian = await prisma.user.findFirst({ where: { email: 'damian@inyecta.com' } });
  if (!damian) {
    throw new Error('Usuario damian@inyecta.com no encontrado. Ejecuta primero el seed inicial.');
  }
  console.log(`Usuario seed: ${damian.email}`);
  console.log(`Fecha base (TODAY): ${TODAY.toISOString().slice(0, 10)}\n`);

  for (const s of SCENARIOS) cleanScenario(s.rfcCliente).catch(() => {});
  // Esperamos las limpiezas
  for (const s of SCENARIOS) await cleanScenario(s.rfcCliente);

  console.log('\nCreando escenarios...\n');
  let seq = 1;
  for (const s of SCENARIOS) {
    await createScenario(s, damian.id, seq++);
  }
  console.log('\n✅ Seed test completado.');
}

main()
  .catch((e) => {
    console.error('\n❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
