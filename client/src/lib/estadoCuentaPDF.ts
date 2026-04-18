import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Brand colors (RGB) ─────────────────────────────────────
const COLOR_INYECTA = [30, 58, 95] as const;
const COLOR_ACCENT = [232, 131, 58] as const;
const COLOR_LIGHT_GRAY = [245, 245, 245] as const;
const COLOR_MEDIUM_GRAY = [200, 200, 200] as const;
const COLOR_DARK_TEXT = [40, 40, 40] as const;
const COLOR_RED = [185, 28, 28] as const;
const COLOR_AMBER = [217, 119, 6] as const;

// ─── Types matching the backend response ────────────────────
export interface EstadoCuentaData {
  fechaCorte: string;
  contrato: {
    folio: string;
    producto: 'PURO' | 'FINANCIERO';
    plazo: number;
    tasaAnual: number;
    tasaMoratoria: number;
    client: {
      tipo: 'PFAE' | 'PM' | 'PERSONA_FISICA' | 'PERSONA_MORAL' | string;
      nombre?: string | null;
      apellidoPaterno?: string | null;
      razonSocial?: string | null;
      rfc?: string | null;
      telefono?: string | null;
      email?: string | null;
    } | null;
  };
  resumen: {
    rentaVencida: number;
    moratorios: number;
    rentaPendiente: number;
    totalAdeudo: number;
    periodosVencidos: number;
    periodosParciales: number;
  };
  periodos: Array<{
    periodo: number;
    fechaPago: string;
    estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
    diasAtraso: number;
    renta: number;
    ivaRenta: number;
    pagoTotal: number;
    moratorio: {
      generado: number;
      ivaGenerado: number;
      pendiente: number;
      ivaPendiente: number;
    };
    desglose: {
      rentaPendiente: number;
      ivaPendiente: number;
      rentaTotalPendiente: number;
      moratorioPendiente: number;
      ivaMoratorioPendiente: number;
      totalAdeudado: number;
    };
    pagos: {
      cantidad: number;
      totalPagado: number;
    };
  }>;
}

// ─── Formatters ────────────────────────────────────────────
const fmtMoney = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(v) || 0);

const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));

const fmtDateShort = (d: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

const fmtPct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

function getClienteNombre(c: EstadoCuentaData['contrato']['client']): string {
  if (!c) return 'Cliente';
  if ((c.tipo === 'PM' || c.tipo === 'PERSONA_MORAL') && c.razonSocial) return c.razonSocial;
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || c.razonSocial || 'Cliente';
}

// ─── Main generator ────────────────────────────────────────
export function generateEstadoCuentaPDF(data: EstadoCuentaData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;

  renderHeader(doc, marginX, pageWidth, data);
  let y = 40;

  y = renderInfoBlock(doc, data, marginX, y, pageWidth);
  y += 4;

  y = renderResumen(doc, data, marginX, y, pageWidth);
  y += 4;

  if (y > pageHeight - 60) { doc.addPage(); renderHeader(doc, marginX, pageWidth, data); y = 40; }
  y = renderPeriodosTable(doc, data, marginX, y, pageWidth);
  y += 4;

  if (y > pageHeight - 70) { doc.addPage(); renderHeader(doc, marginX, pageWidth, data); y = 40; }
  y = renderDatosBancarios(doc, marginX, y, pageWidth);

  // Footer en todas las páginas
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    renderFooter(doc, marginX, pageWidth, pageHeight, data, p, totalPages);
  }

  const safeName = getClienteNombre(data.contrato.client).replace(/[^a-z0-9]/gi, '_').substring(0, 25);
  const fechaStr = new Date(data.fechaCorte).toISOString().slice(0, 10);
  doc.save(`EstadoCuenta_${data.contrato.folio}_${safeName}_${fechaStr}.pdf`);
}

// ─── Header ────────────────────────────────────────────────
function renderHeader(doc: jsPDF, marginX: number, pageWidth: number, data: EstadoCuentaData) {
  doc.setFillColor(...COLOR_INYECTA);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setFillColor(...COLOR_ACCENT);
  doc.rect(0, 22, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('INYECTA', marginX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('FSMP SOLUCIONES DE CAPITAL, S.A. DE C.V., SOFOM, E.N.R.', marginX, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ESTADO DE CUENTA', pageWidth - marginX, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Folio: ${data.contrato.folio}`, pageWidth - marginX, 16, { align: 'right' });
}

// ─── Info block ────────────────────────────────────────────
function renderInfoBlock(doc: jsPDF, data: EstadoCuentaData, marginX: number, y: number, pageWidth: number): number {
  const cliente = getClienteNombre(data.contrato.client);
  const c = data.contrato.client;
  const producto = data.contrato.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero';
  const half = (pageWidth - marginX * 2) / 2 - 40;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 40 },
      1: { cellWidth: half },
      2: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 40 },
      3: { cellWidth: half },
    },
    body: [
      ['Cliente', cliente, 'Folio Contrato', data.contrato.folio],
      ['RFC', c?.rfc || '—', 'Producto', producto],
      ['Teléfono', c?.telefono || '—', 'Plazo', `${data.contrato.plazo} meses`],
      ['Email', c?.email || '—', 'Tasa Anual', fmtPct(data.contrato.tasaAnual)],
      ['Fecha de Corte', fmtDate(data.fechaCorte), 'Tasa Moratoria', `${fmtPct(data.contrato.tasaMoratoria)} (0.2% diario aprox.)`],
    ],
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Resumen ────────────────────────────────────────────────
function renderResumen(doc: jsPDF, data: EstadoCuentaData, marginX: number, y: number, pageWidth: number): number {
  const r = data.resumen;
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'RESUMEN DE ADEUDO', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35 },
    },
    body: [
      [`Renta vencida (${r.periodosVencidos + r.periodosParciales} periodos)`, fmtMoney(r.rentaVencida)],
      [{ content: 'Moratorios + IVA (0.2% diario sobre saldo vencido)', styles: { textColor: COLOR_RED as any } },
       { content: fmtMoney(r.moratorios), styles: { textColor: COLOR_RED as any } }],
      ['Renta del periodo actual', fmtMoney(r.rentaPendiente)],
    ],
    foot: [['TOTAL A PAGAR', fmtMoney(r.totalAdeudo)]],
    footStyles: { fillColor: COLOR_ACCENT as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 11, halign: 'right' },
    didParseCell: (cell) => {
      if (cell.section === 'foot' && cell.column.index === 0) cell.cell.styles.halign = 'left';
    },
  });
  return (doc as any).lastAutoTable.finalY;
}

// ─── Periodos table ─────────────────────────────────────────
function renderPeriodosTable(doc: jsPDF, data: EstadoCuentaData, marginX: number, y: number, pageWidth: number): number {
  const periodos = data.periodos;
  if (periodos.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Sin periodos vencidos o pendientes a la fecha de corte.', marginX, y + 4);
    return y + 8;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [['No.', 'Vencimiento', 'Estatus', 'Días', 'Renta+IVA', 'Moratorio+IVA', 'Pagado', 'Adeudo']],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    body: periodos.map(p => [
      p.periodo,
      fmtDateShort(p.fechaPago),
      p.estatus,
      p.diasAtraso > 0 ? String(p.diasAtraso) : '—',
      fmtMoney(p.renta + p.ivaRenta),
      fmtMoney(p.moratorio.pendiente + p.moratorio.ivaPendiente),
      fmtMoney(p.pagos.totalPagado),
      fmtMoney(p.desglose.totalAdeudado),
    ]),
    foot: [[
      { content: 'TOTALES', colSpan: 4, styles: { halign: 'left' } },
      fmtMoney(periodos.reduce((s, p) => s + p.desglose.rentaTotalPendiente, 0)),
      fmtMoney(periodos.reduce((s, p) => s + p.moratorio.pendiente + p.moratorio.ivaPendiente, 0)),
      fmtMoney(periodos.reduce((s, p) => s + p.pagos.totalPagado, 0)),
      fmtMoney(periodos.reduce((s, p) => s + p.desglose.totalAdeudado, 0)),
    ]],
    footStyles: { fillColor: COLOR_LIGHT_GRAY as any, textColor: COLOR_INYECTA as any, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 250] as any },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      const row = periodos[cell.row.index];
      if (!row) return;
      if (cell.column.index === 2) {
        if (row.estatus === 'VENCIDO') cell.cell.styles.textColor = COLOR_RED as any;
        else if (row.estatus === 'PARCIAL') cell.cell.styles.textColor = COLOR_AMBER as any;
      }
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

// ─── Datos bancarios ───────────────────────────────────────
function renderDatosBancarios(doc: jsPDF, marginX: number, y: number, pageWidth: number): number {
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'DATOS BANCARIOS PARA PAGO', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 50 },
      1: { cellWidth: pageWidth - marginX * 2 - 50 },
    },
    body: [
      ['Beneficiario', 'FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.'],
      ['Banco', 'BBVA México'],
      ['Cuenta', '0123456789'],
      ['CLABE', '012 180 01234567890 1'],
      ['Referencia', 'Folio del contrato (indicar al pie de la transferencia)'],
      ['Concepto', 'Pago de renta arrendamiento'],
    ],
  });

  let yEnd = (doc as any).lastAutoTable.finalY;
  yEnd += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const aviso = 'Una vez realizado el pago, envíe el comprobante a cobranza@inyecta.mx indicando el folio del contrato. Los montos moratorios continuarán generándose hasta la fecha efectiva de pago.';
  const lines = doc.splitTextToSize(aviso, pageWidth - marginX * 2);
  doc.text(lines, marginX, yEnd);
  yEnd += lines.length * 3.5;
  return yEnd;
}

// ─── Footer ────────────────────────────────────────────────
function renderFooter(doc: jsPDF, marginX: number, pageWidth: number, pageHeight: number, data: EstadoCuentaData, pageNum: number, totalPages: number) {
  const footerY = pageHeight - 14;
  doc.setDrawColor(...COLOR_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_INYECTA);
  doc.text('FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.', marginX, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado: ${fmtDate(new Date())}`, marginX, footerY + 4);

  doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - marginX, footerY + 4, { align: 'right' });
  doc.text(`Folio: ${data.contrato.folio}`, pageWidth - marginX, footerY, { align: 'right' });
}
