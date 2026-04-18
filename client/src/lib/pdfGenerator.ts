import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Brand colors (RGB) ─────────────────────────────────────
const COLOR_INYECTA = [30, 58, 95] as const;       // #1e3a5f deep blue (header bg)
const COLOR_ACCENT = [232, 131, 58] as const;      // #e8833a orange
const COLOR_LIGHT_GRAY = [245, 245, 245] as const;
const COLOR_MEDIUM_GRAY = [200, 200, 200] as const;
const COLOR_DARK_TEXT = [40, 40, 40] as const;

const IVA_RATE = 0.16;

// ─── Types that match the backend response ─────────────────
export interface QuotationForPDF {
  folio: string;
  nombreCliente: string;
  producto: string;
  bienDescripcion?: string;
  bienMarca?: string;
  bienModelo?: string;
  bienAnio?: number;
  bienNuevo?: boolean;
  valorBien: number | string;
  valorBienIVA: number | string;
  plazo: number;
  tasaAnual: number | string;
  nivelRiesgo: string;
  enganche: number | string;
  enganchePorcentaje: number | string;
  depositoGarantia: number | string;
  depositoGarantiaPct: number | string;
  comisionApertura: number | string;
  comisionAperturaPct: number | string;
  comisionAperturaFinanciada: boolean;
  rentaInicial: number | string;
  gpsInstalacion: number | string;
  gpsFinanciado: boolean;
  seguroAnual: number | string;
  seguroFinanciado: boolean;
  valorResidual: number | string;
  valorResidualPct: number | string;
  montoFinanciar: number | string;
  rentaMensual: number | string;
  rentaMensualIVA: number | string;
  vigenciaHasta: string | Date;
  observaciones?: string;
  createdAt: string | Date;
  user?: { nombre?: string; apellidos?: string; email?: string };
  amortizacion?: Array<{
    periodo: number;
    fecha: string | Date;
    saldoInicial: number;
    intereses: number;
    pagoCapital: number;
    renta: number;
    iva: number;
    seguro: number;
    pagoTotal: number;
    saldoFinal: number;
  }>;
}

// ─── Formatters ────────────────────────────────────────────
const n = (v: number | string) => Number(v) || 0;

const fmtMoney = (v: number | string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n(v));

const fmtPercent = (v: number | string, digits = 2) =>
  `${(n(v) * 100).toFixed(digits)}%`;

const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));

const fmtDateShort = (d: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

// ─── Main generator ────────────────────────────────────────
export function generateQuotationPDF(q: QuotationForPDF): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;

  // ═══ PAGE 1 ═══════════════════════════════════════════════
  renderHeader(doc, marginX, pageWidth);
  let y = 38;

  // Client & asset info block
  y = renderInfoBlock(doc, q, marginX, y, pageWidth);
  y += 3;

  // 4 financial tables
  y = renderMontoFinanciarTable(doc, q, marginX, y, pageWidth);
  y += 2;
  y = renderPagoInicialTable(doc, q, marginX, y, pageWidth);
  y += 2;
  y = renderRentaMensualTable(doc, q, marginX, y, pageWidth);
  y += 2;
  y = renderValorRescateTable(doc, q, marginX, y, pageWidth);

  // Observaciones
  if (q.observaciones) {
    y += 4;
    if (y > pageHeight - 35) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_INYECTA);
    doc.text('Observaciones:', marginX, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_DARK_TEXT);
    const lines = doc.splitTextToSize(q.observaciones, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4;
  }

  renderFooter(doc, marginX, pageWidth, pageHeight, q, 1);

  // ═══ PAGE 2 — Amortization ════════════════════════════════
  if (q.amortizacion && q.amortizacion.length > 0) {
    doc.addPage();
    renderHeader(doc, marginX, pageWidth);
    let yAm = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_INYECTA);
    doc.text('TABLA DE AMORTIZACIÓN', pageWidth / 2, yAm, { align: 'center' });
    yAm += 6;

    renderAmortizationTable(doc, q, marginX, yAm, pageWidth);

    renderFooter(doc, marginX, pageWidth, pageHeight, q, 2);
  }

  // Save
  const producto = q.producto === 'PURO' ? 'Puro' : 'Financiero';
  const safeName = q.nombreCliente.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  doc.save(`Cotizacion_${producto}_${q.folio}_${safeName}.pdf`);
}

// ─── Header ────────────────────────────────────────────────
function renderHeader(doc: jsPDF, marginX: number, pageWidth: number) {
  // Top colored stripe
  doc.setFillColor(...COLOR_INYECTA);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Accent orange stripe
  doc.setFillColor(...COLOR_ACCENT);
  doc.rect(0, 22, pageWidth, 1.5, 'F');

  // Title text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('INYECTA', marginX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('FSMP SOLUCIONES DE CAPITAL, S.A. DE C.V., SOFOM, E.N.R.', marginX, 16);

  // Right side title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('COTIZACIÓN', pageWidth - marginX, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('ARRENDAMIENTO', pageWidth - marginX, 16, { align: 'right' });
}

// ─── Client & asset info block ─────────────────────────────
function renderInfoBlock(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number): number {
  const bienArrendado = [q.bienMarca, q.bienModelo, q.bienAnio].filter(Boolean).join(' ') ||
                        q.bienDescripcion || '—';
  const estadoBien = q.bienNuevo === false ? 'Usado' : 'Nuevo';
  const producto = q.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero';
  const seguroTxt = n(q.seguroAnual) > 0
    ? `${fmtMoney(q.seguroAnual)} ${q.seguroFinanciado ? '(Financiado)' : '(Contado)'}`
    : 'Por cuenta del arrendatario';

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 40 },
      1: { cellWidth: (pageWidth - marginX * 2) / 2 - 40 },
      2: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 40 },
      3: { cellWidth: (pageWidth - marginX * 2) / 2 - 40 },
    },
    body: [
      ['Nombre del cliente', q.nombreCliente, 'Folio', q.folio],
      ['Valor del Bien', fmtMoney(q.valorBien), 'Producto', producto],
      ['Bien Arrendado', bienArrendado, 'Plazo', `${q.plazo} meses`],
      ['Estado del Bien', estadoBien, 'Nivel de Riesgo', q.nivelRiesgo],
      ['Seguro', seguroTxt, 'Tasa Anual', fmtPercent(q.tasaAnual)],
      ['Fecha de cotización', fmtDate(q.createdAt), 'Vigencia', fmtDate(q.vigenciaHasta)],
    ],
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Table 1: Monto a financiar ────────────────────────────
function renderMontoFinanciarTable(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number): number {
  const valorBien = n(q.valorBien);
  const iva = valorBien * IVA_RATE;
  const enganche = n(q.enganche);
  const comisionFinanciada = q.comisionAperturaFinanciada ? n(q.comisionApertura) : 0;
  const seguroFinanciado = q.seguroFinanciado ? n(q.seguroAnual) : 0;
  const gpsFinanciado = q.gpsFinanciado ? n(q.gpsInstalacion) : 0;
  const total = n(q.montoFinanciar);

  const body: any[] = [
    ['Valor del bien', fmtMoney(valorBien)],
    ['IVA (+)', fmtMoney(iva)],
  ];
  if (enganche > 0) body.push(['Enganche (-)', `- ${fmtMoney(enganche)}`]);
  if (comisionFinanciada > 0) body.push([`Comisión por apertura ${fmtPercent(q.comisionAperturaPct, 1)} (+)`, fmtMoney(comisionFinanciada)]);
  if (seguroFinanciado > 0) body.push(['Seguro (+)', fmtMoney(seguroFinanciado)]);
  if (gpsFinanciado > 0) body.push(['GPS financiado (+)', fmtMoney(gpsFinanciado)]);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'Monto a financiar', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35, fontStyle: 'normal' },
    },
    body,
    foot: [['TOTAL', fmtMoney(total)]],
    footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 9, halign: 'right' },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Table 2: Pago Inicial ─────────────────────────────────
function renderPagoInicialTable(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number): number {
  const rentaInicial = n(q.rentaInicial);
  const enganche = n(q.enganche);
  const comisionContado = !q.comisionAperturaFinanciada ? n(q.comisionApertura) : 0;
  const seguroContado = !q.seguroFinanciado ? n(q.seguroAnual) : 0;
  const deposito = n(q.depositoGarantia);
  const gpsContado = !q.gpsFinanciado ? n(q.gpsInstalacion) : 0;

  const body: any[] = [];
  if (enganche > 0) body.push([`Enganche ${fmtPercent(q.enganchePorcentaje, 1)}`, fmtMoney(enganche)]);
  if (rentaInicial > 0) body.push(['Renta Inicial', fmtMoney(rentaInicial)]);
  if (comisionContado > 0) body.push([`Comisión por apertura ${fmtPercent(q.comisionAperturaPct, 1)} (contado)`, fmtMoney(comisionContado)]);
  if (seguroContado > 0) body.push(['Apertura de Seguro', fmtMoney(seguroContado)]);
  body.push([`Depósito en garantía ${fmtPercent(q.depositoGarantiaPct, 1)}`, fmtMoney(deposito)]);
  if (gpsContado > 0) body.push(['Instalación GPS', fmtMoney(gpsContado)]);

  const total = enganche + rentaInicial + comisionContado + seguroContado + deposito + gpsContado;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'Pago Inicial', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35 },
    },
    body,
    foot: [['TOTAL', fmtMoney(total)]],
    footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 9, halign: 'right' },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Table 3: Renta mensual ────────────────────────────────
function renderRentaMensualTable(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number): number {
  const renta = n(q.rentaMensual);
  const ivaRenta = renta * IVA_RATE;
  const total = n(q.rentaMensualIVA);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'Renta mensual', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35 },
    },
    body: [
      ['Monto de la renta', fmtMoney(renta)],
      ['IVA 16%', fmtMoney(ivaRenta)],
    ],
    foot: [['TOTAL', fmtMoney(total)]],
    footStyles: { fillColor: COLOR_ACCENT as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 10, halign: 'right' },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Table 4: Valor de rescate ─────────────────────────────
function renderValorRescateTable(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number): number {
  const monto = n(q.valorResidual);
  const iva = monto * IVA_RATE;
  const total = monto + iva;
  const pct = fmtPercent(q.valorResidualPct, 1);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'Valor de rescate / Opción de compra', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35 },
    },
    body: [
      ['Porcentaje', pct],
      ['Monto', fmtMoney(monto)],
      ['IVA 16%', fmtMoney(iva)],
    ],
    foot: [['TOTAL', fmtMoney(total)]],
    footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 9, halign: 'right' },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Amortization table ────────────────────────────────────
function renderAmortizationTable(doc: jsPDF, q: QuotationForPDF, marginX: number, y: number, pageWidth: number) {
  const isPuro = q.producto === 'PURO';
  const rows = q.amortizacion || [];

  if (isPuro) {
    // Puro: No., Fecha, Renta, IVA, Seguro, Pago Total
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [['No.', 'Fecha', 'Renta', 'IVA', 'Seguro', 'Pago Total']],
      headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      body: rows.map(r => [
        r.periodo,
        fmtDateShort(r.fecha),
        fmtMoney(r.renta),
        fmtMoney(r.iva),
        fmtMoney(r.seguro),
        fmtMoney(r.pagoTotal),
      ]),
      foot: [[
        { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' } },
        fmtMoney(rows.reduce((s, r) => s + n(r.renta), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.iva), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.seguro), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.pagoTotal), 0)),
      ]],
      footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [250, 250, 250] as any },
    });
  } else {
    // Financiero: No., Fecha, Pago Capital, Pago Intereses, Renta, IVA, Seguro, Pago Total, Saldo Capital
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [['No.', 'Fecha', 'Capital', 'Intereses', 'Renta', 'IVA', 'Seguro', 'Pago Total', 'Saldo']],
      headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 6.8, cellPadding: 1.2, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' },
        8: { halign: 'right' },
      },
      body: rows.map(r => [
        r.periodo,
        fmtDateShort(r.fecha),
        fmtMoney(r.pagoCapital),
        fmtMoney(r.intereses),
        fmtMoney(r.renta),
        fmtMoney(r.iva),
        fmtMoney(r.seguro),
        fmtMoney(r.pagoTotal),
        fmtMoney(r.saldoFinal),
      ]),
      foot: [[
        { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' } },
        fmtMoney(rows.reduce((s, r) => s + n(r.pagoCapital), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.intereses), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.renta), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.iva), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.seguro), 0)),
        fmtMoney(rows.reduce((s, r) => s + n(r.pagoTotal), 0)),
        '',
      ]],
      footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 250, 250] as any },
    });
  }
}

// ─── Footer ────────────────────────────────────────────────
function renderFooter(doc: jsPDF, marginX: number, pageWidth: number, pageHeight: number, q: QuotationForPDF, pageNum: number) {
  const footerY = pageHeight - 14;

  // Separator
  doc.setDrawColor(...COLOR_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_INYECTA);
  doc.text('FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.', marginX, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Elaborado por: ${q.user?.nombre || ''} ${q.user?.apellidos || ''}`.trim(),
    marginX,
    footerY + 4
  );

  doc.text(`Página ${pageNum}`, pageWidth - marginX, footerY + 4, { align: 'right' });
  doc.text(`Folio: ${q.folio}`, pageWidth - marginX, footerY, { align: 'right' });
}
