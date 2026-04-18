/**
 * Parser genérico de estados de cuenta bancarios en CSV.
 *
 * Soporta los formatos exportados por:
 *  - BBVA México:    Fecha,Descripción,Cargo,Abono,Saldo
 *  - Santander:      Fecha,Descripción,Referencia,Cargo,Abono,Saldo
 *  - Banamex/Citi:   Fecha,Descripción,Importe,Saldo
 *  - Genérico:       Fecha, Concepto, Monto, Referencia
 *
 * El detector busca encabezados conocidos y mapea columnas. Los importes
 * se interpretan en MXN (decimales con punto, separador de miles "," opcional).
 */

export interface ParsedTransaction {
  fecha: Date;
  descripcion: string;
  monto: number;        // positivo=abono, negativo=cargo
  referencia: string | null;
  tipo: 'ABONO' | 'CARGO';
}

export interface ParseResult {
  banco: string;
  totalRows: number;
  transactions: ParsedTransaction[];
  errors: string[];
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  s = s.trim();
  // dd/mm/yyyy o dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    return new Date(year, parseInt(mo) - 1, parseInt(d));
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  // ISO con tiempo
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function parseAmount(s: string): number {
  if (!s) return 0;
  // Quitar símbolos, espacios, signos pesos, separador de miles
  const cleaned = s.replace(/[$\s]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Divide una línea CSV respetando comillas dobles */
function splitCSVLine(line: string, delim = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map(s => s.trim());
}

function detectBank(headers: string[]): string {
  const h = headers.join('|').toLowerCase();
  if (h.includes('cargo') && h.includes('abono')) {
    if (h.includes('referencia')) return 'SANTANDER';
    return 'BBVA';
  }
  if (h.includes('importe')) return 'BANAMEX';
  return 'GENERICO';
}

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];
  // Normalizar saltos de línea y eliminar BOM
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return { banco: 'DESCONOCIDO', totalRows: 0, transactions: [], errors: ['Archivo vacío o sin datos'] };
  }

  // Detectar separador (coma o punto y coma)
  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  // Saltar líneas iniciales que no son tabulares (resúmenes, fechas de corte)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.some(c => /fecha/i.test(c)) && cols.length >= 3) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCSVLine(lines[headerIdx], delim).map(h => h.toLowerCase());
  const banco = detectBank(headers);

  // Mapeo de columnas
  const idxFecha = headers.findIndex(h => /fecha/i.test(h));
  const idxDesc = headers.findIndex(h => /(descripci|concepto|movimiento)/i.test(h));
  const idxRef = headers.findIndex(h => /(referencia|ref)/i.test(h));
  const idxMonto = headers.findIndex(h => /(importe|monto)/i.test(h));
  const idxAbono = headers.findIndex(h => /abono/i.test(h));
  const idxCargo = headers.findIndex(h => /cargo/i.test(h));

  if (idxFecha < 0) {
    return { banco, totalRows: 0, transactions: [], errors: ['No se encontró columna Fecha'] };
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.length < headers.length - 1) continue; // fila incompleta (a veces totales al final)

    const fecha = parseDate(cols[idxFecha] || '');
    if (!fecha) continue;

    const descripcion = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
    const referencia = idxRef >= 0 ? (cols[idxRef] || null) : null;

    let monto = 0;
    if (idxAbono >= 0 || idxCargo >= 0) {
      const abono = idxAbono >= 0 ? parseAmount(cols[idxAbono] || '') : 0;
      const cargo = idxCargo >= 0 ? parseAmount(cols[idxCargo] || '') : 0;
      monto = abono - cargo;
    } else if (idxMonto >= 0) {
      monto = parseAmount(cols[idxMonto] || '');
    }

    if (monto === 0) continue;

    transactions.push({
      fecha,
      descripcion: descripcion.replace(/\s+/g, ' ').trim(),
      monto,
      referencia: referencia?.trim() || null,
      tipo: monto > 0 ? 'ABONO' : 'CARGO',
    });
  }

  if (transactions.length === 0) {
    errors.push('No se pudieron extraer transacciones del archivo');
  }

  return { banco, totalRows: transactions.length, transactions, errors };
}
