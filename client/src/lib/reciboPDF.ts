import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLOR_INYECTA = [30, 58, 95] as const;
const COLOR_ACCENT = [232, 131, 58] as const;
const COLOR_LIGHT_GRAY = [245, 245, 245] as const;
const COLOR_MEDIUM_GRAY = [200, 200, 200] as const;
const COLOR_DARK_TEXT = [40, 40, 40] as const;
const COLOR_GREEN = [22, 128, 71] as const;

export interface ReciboData {
  folio: string;
  pago: {
    id: string;
    tipo: string;
    periodo: number | null;
    fechaPago: string;
    fechaVencimiento: string | null;
    montoRenta: number;
    montoIVA: number;
    montoSeguro: number;
    montoMoratorio: number;
    montoIVAMoratorio: number;
    montoCapitalExtra: number;
    montoTotal: number;
    diasAtraso: number;
    referencia: string | null;
    observaciones: string | null;
    createdAt: string;
  };
  contrato: {
    folio: string;
    producto: 'PURO' | 'FINANCIERO';
    plazo: number;
    client: {
      tipo: string;
      nombre?: string | null;
      apellidoPaterno?: string | null;
      apellidoMaterno?: string | null;
      razonSocial?: string | null;
      rfc?: string | null;
      telefono?: string | null;
      email?: string | null;
    } | null;
  };
  usuario: string | null;
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(v) || 0);

const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));

const TIPO_LABELS: Record<string, string> = {
  RENTA_ORDINARIA: 'Renta ordinaria',
  RENTA_ADELANTADA: 'Renta adelantada',
  ABONO_CAPITAL: 'Abono a capital',
  LIQUIDACION_ANTICIPADA: 'Liquidación anticipada',
  MORATORIO: 'Cargo moratorio',
  RENTA_EXTRAORDINARIA: 'Renta extraordinaria',
  ENGANCHE: 'Enganche',
  DEPOSITO_GARANTIA: 'Depósito en garantía',
  COMISION_APERTURA: 'Comisión por apertura',
  SEGURO: 'Seguro',
  GPS: 'GPS',
  OTRO: 'Otro',
};

function getClienteNombre(c: ReciboData['contrato']['client']): string {
  if (!c) return 'Cliente';
  if (c.tipo === 'PERSONA_MORAL' && c.razonSocial) return c.razonSocial;
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || c.razonSocial || 'Cliente';
}

// Convertir monto a letras (versión simple)
function montoEnLetras(monto: number): string {
  const partes = monto.toFixed(2).split('.');
  const entero = Number(partes[0]);
  const cents = partes[1];
  return `${numeroALetras(entero)} pesos ${cents}/100 M.N.`;
}

function numeroALetras(n: number): string {
  if (n === 0) return 'cero';
  if (n < 0) return `menos ${numeroALetras(-n)}`;
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const especiales: Record<number, string> = {
    10: 'diez', 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
    16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 20: 'veinte',
    30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta',
    80: 'ochenta', 90: 'noventa', 100: 'cien', 500: 'quinientos', 700: 'setecientos', 900: 'novecientos',
  };
  const decenas = (x: number): string => {
    if (especiales[x]) return especiales[x];
    if (x < 30) return 'venti' + unidades[x - 20];
    const d = Math.floor(x / 10) * 10, u = x % 10;
    return especiales[d] + (u ? ' y ' + unidades[u] : '');
  };
  const centenas = (x: number): string => {
    if (especiales[x]) return especiales[x];
    if (x < 100) return decenas(x);
    const c = Math.floor(x / 100), r = x % 100;
    const cs = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    return cs[c] + (r ? ' ' + decenas(r) : '');
  };
  if (n < 1000) return centenas(n);
  if (n < 1000000) {
    const m = Math.floor(n / 1000), r = n % 1000;
    const pre = m === 1 ? 'mil' : centenas(m) + ' mil';
    return pre + (r ? ' ' + centenas(r) : '');
  }
  const mill = Math.floor(n / 1000000), r = n % 1000000;
  const pre = mill === 1 ? 'un millón' : numeroALetras(mill) + ' millones';
  return pre + (r ? ' ' + numeroALetras(r) : '');
}

export function generateReciboPDF(data: ReciboData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;

  // Header
  doc.setFillColor(...COLOR_INYECTA);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setFillColor(...COLOR_ACCENT);
  doc.rect(0, 24, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('INYECTA', marginX, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('FSMP SOLUCIONES DE CAPITAL, S.A. DE C.V., SOFOM, E.N.R.', marginX, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RECIBO DE PAGO', pageWidth - marginX, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(data.folio, pageWidth - marginX, 17, { align: 'right' });

  let y = 36;

  // Importe destacado
  doc.setFillColor(...COLOR_LIGHT_GRAY);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('Importe recibido', marginX + 4, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLOR_GREEN);
  doc.text(fmtMoney(data.pago.montoTotal), marginX + 4, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Fecha: ${fmtDate(data.pago.fechaPago)}`, pageWidth - marginX - 4, y + 8, { align: 'right' });
  doc.text(`Tipo: ${TIPO_LABELS[data.pago.tipo] || data.pago.tipo}`, pageWidth - marginX - 4, y + 14, { align: 'right' });
  if (data.pago.periodo) {
    doc.text(`Renta #${data.pago.periodo}`, pageWidth - marginX - 4, y + 20, { align: 'right' });
  }

  y += 28;

  // Datos cliente y contrato
  const cliente = getClienteNombre(data.contrato.client);
  const c = data.contrato.client;
  const half = (pageWidth - marginX * 2) / 2 - 38;
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 38 },
      1: { cellWidth: half },
      2: { fontStyle: 'bold', fillColor: COLOR_LIGHT_GRAY as any, cellWidth: 38 },
      3: { cellWidth: half },
    },
    body: [
      ['Cliente', cliente, 'Folio Contrato', data.contrato.folio],
      ['RFC', c?.rfc || '—', 'Producto', data.contrato.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero'],
      ['Teléfono', c?.telefono || '—', 'Plazo', `${data.contrato.plazo} meses`],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Desglose de conceptos
  const body: any[] = [];
  if (data.pago.montoRenta > 0) body.push(['Renta', fmtMoney(data.pago.montoRenta)]);
  if (data.pago.montoIVA > 0) body.push(['IVA renta (16%)', fmtMoney(data.pago.montoIVA)]);
  if (data.pago.montoSeguro > 0) body.push(['Seguro', fmtMoney(data.pago.montoSeguro)]);
  if (data.pago.montoMoratorio > 0) body.push([`Moratorios (${data.pago.diasAtraso} días)`, fmtMoney(data.pago.montoMoratorio)]);
  if (data.pago.montoIVAMoratorio > 0) body.push(['IVA moratorios', fmtMoney(data.pago.montoIVAMoratorio)]);
  if (data.pago.montoCapitalExtra > 0) body.push(['Abono a capital', fmtMoney(data.pago.montoCapitalExtra)]);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[{ content: 'DESGLOSE DEL PAGO', colSpan: 2, styles: { halign: 'left' } }]],
    headStyles: { fillColor: COLOR_INYECTA as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2, textColor: COLOR_DARK_TEXT as any, lineColor: COLOR_MEDIUM_GRAY as any, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: (pageWidth - marginX * 2) * 0.65 },
      1: { halign: 'right', cellWidth: (pageWidth - marginX * 2) * 0.35, fontStyle: 'normal' },
    },
    body,
    foot: [['TOTAL RECIBIDO', fmtMoney(data.pago.montoTotal)]],
    footStyles: { fillColor: COLOR_GREEN as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 10, halign: 'right' },
    didParseCell: (cell) => {
      if (cell.section === 'foot' && cell.column.index === 0) cell.cell.styles.halign = 'left';
    },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // Importe en letras
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const enLetras = `Son: (${montoEnLetras(data.pago.montoTotal)})`;
  const lines = doc.splitTextToSize(enLetras, pageWidth - marginX * 2);
  doc.text(lines, marginX, y);
  y += lines.length * 4 + 4;

  // Referencia/observaciones
  if (data.pago.referencia || data.pago.observaciones) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_INYECTA);
    doc.text('Notas:', marginX, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_DARK_TEXT);
    if (data.pago.referencia) {
      doc.text(`Referencia bancaria: ${data.pago.referencia}`, marginX, y);
      y += 4;
    }
    if (data.pago.observaciones) {
      const obs = doc.splitTextToSize(`Observaciones: ${data.pago.observaciones}`, pageWidth - marginX * 2);
      doc.text(obs, marginX, y);
      y += obs.length * 4;
    }
    y += 2;
  }

  // Mora bloque (si aplica)
  if (data.pago.diasAtraso > 0) {
    doc.setFillColor(255, 248, 220);
    doc.setDrawColor(...COLOR_ACCENT);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_DARK_TEXT);
    doc.text(
      `Pago con ${data.pago.diasAtraso} días de atraso. Tasa moratoria 0.2% diario sobre saldo vencido.`,
      marginX + 3, y + 7,
    );
    y += 16;
  }

  // Sello
  y = Math.max(y, pageHeight - 50);
  doc.setDrawColor(...COLOR_MEDIUM_GRAY);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, marginX + 70, y);
  doc.line(pageWidth - marginX - 70, y, pageWidth - marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Recibió: ${data.usuario || '—'}`, marginX, y + 4);
  doc.text('Firma del cliente', pageWidth - marginX - 35, y + 4, { align: 'center' });

  // Footer
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
  doc.text(`Recibo: ${data.folio}`, pageWidth - marginX, footerY, { align: 'right' });
  doc.text('Documento informativo, no fiscal', pageWidth - marginX, footerY + 4, { align: 'right' });

  doc.save(`Recibo_${data.folio}_${data.contrato.folio}.pdf`);
}
