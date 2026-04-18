/**
 * Motor de cálculo de arrendamiento.
 * Replica la lógica exacta de los Excels de Inyecta.
 */

export interface LeaseParams {
  producto: 'PURO' | 'FINANCIERO';
  valorBien: number;        // sin IVA
  plazo: number;            // meses (12-48)
  tasaAnual: number;        // e.g. 0.36
  enganchePct: number;      // porcentaje sobre valor del bien con IVA
  depositoGarantiaPct: number; // porcentaje sobre valor del bien con IVA
  comisionAperturaPct: number; // porcentaje sobre monto financiado
  comisionAperturaFinanciada: boolean;
  valorResidualPct: number; // porcentaje sobre valor del bien con IVA
  rentaInicial: number;
  gpsInstalacion: number;
  gpsFinanciado: boolean;
  seguroAnual: number;
  seguroFinanciado: boolean;
}

export interface LeaseResult {
  valorBienIVA: number;
  enganche: number;
  depositoGarantia: number;
  comisionApertura: number;
  valorResidual: number;
  montoFinanciar: number;
  rentaMensual: number;
  ivaRenta: number;
  rentaMensualIVA: number;
  totalRentas: number;
  desembolsoInicial: number;
  totalPagar: number;
  ganancia: number;
  amortizacion: AmortizationRow[];
}

export interface AmortizationRow {
  periodo: number;
  fecha: Date;
  saldoInicial: number;
  intereses: number;
  pagoCapital: number;
  renta: number;
  iva: number;
  seguro: number;
  pagoTotal: number;
  saldoFinal: number;
}

const IVA_RATE = 0.16;

/**
 * Calcula la renta mensual usando PMT (Payment) financiero.
 * Para Financiero: PMT clásico donde se amortiza todo el capital.
 * Para Puro: PMT con valor futuro (valor residual) no amortizado.
 */
function calcularPMT(capital: number, tasaMensual: number, periodos: number, valorFuturo: number = 0): number {
  if (tasaMensual === 0) {
    return (capital - valorFuturo) / periodos;
  }
  const factor = Math.pow(1 + tasaMensual, periodos);
  const pmt = (capital * tasaMensual * factor - valorFuturo * tasaMensual) / (factor - 1);
  return pmt;
}

export function calcularArrendamiento(params: LeaseParams): LeaseResult {
  const {
    producto, valorBien, plazo, tasaAnual,
    enganchePct, depositoGarantiaPct, comisionAperturaPct,
    comisionAperturaFinanciada, valorResidualPct,
    rentaInicial, gpsInstalacion, gpsFinanciado,
    seguroAnual, seguroFinanciado,
  } = params;

  const tasaMensual = tasaAnual / 12;
  const valorBienIVA = valorBien * (1 + IVA_RATE);

  // Enganche y depósito sobre valor del bien con IVA
  const enganche = valorBienIVA * enganchePct;
  const depositoGarantia = valorBienIVA * depositoGarantiaPct;
  const valorResidual = valorBienIVA * valorResidualPct;

  // Monto base a financiar = valor del bien con IVA - enganche
  let montoFinanciar = valorBienIVA - enganche;

  // Comisión por apertura sobre el monto financiado del bien
  const comisionApertura = montoFinanciar * comisionAperturaPct;
  if (comisionAperturaFinanciada) {
    montoFinanciar += comisionApertura;
  }

  // GPS financiado
  if (gpsFinanciado && gpsInstalacion > 0) {
    montoFinanciar += gpsInstalacion;
  }

  // Seguro financiado
  if (seguroFinanciado && seguroAnual > 0) {
    montoFinanciar += seguroAnual;
  }

  // Calcular renta mensual
  let rentaMensual: number;
  if (producto === 'PURO') {
    // Arrendamiento Puro: PMT con valor residual como valor futuro
    rentaMensual = calcularPMT(montoFinanciar, tasaMensual, plazo, valorResidual);
  } else {
    // Arrendamiento Financiero: amortiza 100% del capital
    rentaMensual = calcularPMT(montoFinanciar, tasaMensual, plazo, 0);
  }

  // IVA solo sobre la porción de intereses (Art. 18-A LIVA)
  // Para simplificar en cotización, se calcula IVA sobre la renta completa
  // El desglose exacto se hace en la tabla de amortización
  const ivaRenta = rentaMensual * IVA_RATE;
  const rentaMensualIVA = rentaMensual + ivaRenta;

  const totalRentas = rentaMensualIVA * plazo;

  // Desembolso inicial
  let desembolsoInicial = depositoGarantia + rentaInicial;
  if (!comisionAperturaFinanciada) {
    desembolsoInicial += comisionApertura;
  }
  if (!gpsFinanciado && gpsInstalacion > 0) {
    desembolsoInicial += gpsInstalacion;
  }
  desembolsoInicial += enganche;

  const totalPagar = totalRentas + desembolsoInicial;
  const ganancia = totalPagar - valorBienIVA;

  // Generar tabla de amortización
  const amortizacion = generarAmortizacion(
    producto, montoFinanciar, tasaMensual, plazo,
    rentaMensual, valorResidual, seguroAnual, seguroFinanciado,
    new Date()
  );

  return {
    valorBienIVA: round2(valorBienIVA),
    enganche: round2(enganche),
    depositoGarantia: round2(depositoGarantia),
    comisionApertura: round2(comisionApertura),
    valorResidual: round2(valorResidual),
    montoFinanciar: round2(montoFinanciar),
    rentaMensual: round2(rentaMensual),
    ivaRenta: round2(ivaRenta),
    rentaMensualIVA: round2(rentaMensualIVA),
    totalRentas: round2(totalRentas),
    desembolsoInicial: round2(desembolsoInicial),
    totalPagar: round2(totalPagar),
    ganancia: round2(ganancia),
    amortizacion,
  };
}

function generarAmortizacion(
  producto: 'PURO' | 'FINANCIERO',
  montoFinanciar: number,
  tasaMensual: number,
  plazo: number,
  rentaMensual: number,
  valorResidual: number,
  seguroAnual: number,
  seguroFinanciado: boolean,
  fechaInicio: Date
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let saldo = montoFinanciar;

  for (let i = 1; i <= plazo; i++) {
    const fecha = new Date(fechaInicio);
    fecha.setMonth(fecha.getMonth() + i);

    let intereses = 0;
    let pagoCapital = 0;
    let seguro = 0;

    if (producto === 'FINANCIERO') {
      intereses = saldo * tasaMensual;
      pagoCapital = rentaMensual - intereses;
    } else {
      // Puro: toda la renta es "gasto", no hay amortización de capital visible
      intereses = saldo * tasaMensual;
      pagoCapital = rentaMensual - intereses;
    }

    const iva = rentaMensual * IVA_RATE;
    const saldoFinal = saldo - pagoCapital;

    rows.push({
      periodo: i,
      fecha,
      saldoInicial: round2(saldo),
      intereses: round2(intereses),
      pagoCapital: round2(pagoCapital),
      renta: round2(rentaMensual),
      iva: round2(iva),
      seguro: round2(seguro),
      pagoTotal: round2(rentaMensual + iva + seguro),
      saldoFinal: round2(Math.max(0, saldoFinal)),
    });

    saldo = saldoFinal;
  }

  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula intereses moratorios.
 * Moratoria = 2x tasa ordinaria, calculado sobre rentas vencidas e impagadas.
 * Se acumula desde el primer día de atraso.
 */
export function calcularMoratorios(
  rentaVencida: number,
  diasAtraso: number,
  tasaAnualOrdinaria: number
): { moratorio: number; ivaMoratorio: number; total: number } {
  const tasaMoratoriaAnual = tasaAnualOrdinaria * 2;
  const tasaMoratoriaDiaria = tasaMoratoriaAnual / 360;
  const moratorio = rentaVencida * tasaMoratoriaDiaria * diasAtraso;
  const ivaMoratorio = moratorio * IVA_RATE;
  return {
    moratorio: round2(moratorio),
    ivaMoratorio: round2(ivaMoratorio),
    total: round2(moratorio + ivaMoratorio),
  };
}

/**
 * Genera las 6 opciones de riesgo para una cotización.
 */
export function generarOpcionesRiesgo(valorBien: number, plazo: number, tasaAnual: number, gps: number, comisionPct: number) {
  const niveles = [
    { nivel: 'A', nombre: 'Riesgo bajo', depositoPuro: 0.16, depositoFin: 0.16, engancheFin: 0 },
    { nivel: 'B', nombre: 'Riesgo medio', depositoPuro: 0.21, depositoFin: 0.16, engancheFin: 0.05 },
    { nivel: 'C', nombre: 'Riesgo alto', depositoPuro: 0.26, depositoFin: 0.16, engancheFin: 0.10 },
  ];

  const opciones = [];

  for (const nv of niveles) {
    // Opción Puro
    const puro = calcularArrendamiento({
      producto: 'PURO',
      valorBien, plazo, tasaAnual,
      enganchePct: 0,
      depositoGarantiaPct: nv.depositoPuro,
      comisionAperturaPct: comisionPct,
      comisionAperturaFinanciada: true,
      valorResidualPct: nv.depositoPuro, // valor residual = depósito en garantía
      rentaInicial: 0,
      gpsInstalacion: gps,
      gpsFinanciado: true,
      seguroAnual: 0,
      seguroFinanciado: true,
    });

    opciones.push({
      nombre: `Puro - Nivel ${nv.nivel} (${nv.nombre})`,
      producto: 'PURO' as const,
      nivelRiesgo: nv.nivel,
      ...puro,
    });

    // Opción Financiero
    const financiero = calcularArrendamiento({
      producto: 'FINANCIERO',
      valorBien, plazo, tasaAnual,
      enganchePct: nv.engancheFin,
      depositoGarantiaPct: nv.depositoFin,
      comisionAperturaPct: comisionPct,
      comisionAperturaFinanciada: true,
      valorResidualPct: 0, // financiero amortiza 100%
      rentaInicial: 0,
      gpsInstalacion: gps,
      gpsFinanciado: true,
      seguroAnual: 0,
      seguroFinanciado: true,
    });

    opciones.push({
      nombre: `Financiero - Nivel ${nv.nivel} (${nv.nombre})`,
      producto: 'FINANCIERO' as const,
      nivelRiesgo: nv.nivel,
      ...financiero,
    });
  }

  return opciones;
}
