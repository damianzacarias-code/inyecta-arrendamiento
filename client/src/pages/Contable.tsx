/**
 * Apartado Contable — tratamiento contable y de IVA de una operación
 * --------------------------------------------------------------------
 * Página AUTÓNOMA (no es la cotización): captura una operación y muestra
 * su desglose contable completo (asientos cargo/abono por etapa) y el
 * flujo del IVA, para revisión con contadores. Usa el MISMO motor
 * verificado al centavo (calcularCotizacion); la única derivación propia
 * es el split capital/interés del mes 1 (saldo × tasa/12), con Decimal.js.
 *
 * La clasificación formal NIF D-5 / IFRS-16 y el desglose exacto del IVA
 * en CFDI los define el contador (ver server/CLAUDE.md §4.16 y §4.17 y el
 * documento descargable de reglas de IVA).
 */
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { calcularCotizacion } from '@/lib/cotizacion/calculos';
import { engancheLabel } from '@/lib/cotizacion/labels';

const f = formatCurrency;

type Producto = 'PURO' | 'FINANCIERO';

export default function Contable() {
  const [producto, setProducto] = useState<Producto>('FINANCIERO');
  const [valorConIVA, setValorConIVA] = useState(1_160_000);
  const [plazo, setPlazo] = useState(36);
  const [tasaPct, setTasaPct] = useState(36);
  const [enganchePct, setEnganchePct] = useState(10);
  const [comisionPct, setComisionPct] = useState(5);
  const [comisionContado, setComisionContado] = useState(false);
  const [depositoPct, setDepositoPct] = useState(10);

  const cot = useMemo(() => {
    if (valorConIVA <= 0 || plazo <= 0) return null;
    return calcularCotizacion({
      valorBienConIVA: valorConIVA,
      tasaIVA: 0.16,
      plazo,
      tasaAnual: tasaPct / 100,
      tasaComisionApertura: comisionPct / 100,
      comisionAperturaEsContado: comisionContado,
      porcentajeDeposito: depositoPct / 100,
      valorResidual: producto === 'FINANCIERO' ? 0.02 : 0.16,
      valorResidualEsDeposito: false,
      gpsMonto: 0,
      gpsEsContado: false,
      seguroAnual: 0,
      seguroPendiente: false,
      seguroEsContado: true,
      // Enganche en % sobre el valor SIN IVA (igual que el cotizador). El IVA
      // se suma encima (modelo actual): el cliente paga neto + IVA.
      engancheMonto: (valorConIVA / 1.16) * (enganchePct / 100),
      nombreBien: '',
      estadoBien: '',
      seguroEstado: '',
      nombreCliente: '',
      fecha: new Date(),
      producto,
    } as never);
  }, [producto, valorConIVA, plazo, tasaPct, enganchePct, comisionPct, comisionContado, depositoPct]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Apartado contable</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tratamiento contable y de IVA de una operación, para revisión con contadores. Captura los
          parámetros y revisa los asientos cargo/abono y el flujo del IVA.
        </p>
        <a
          href="/reglas-iva-inyecta.docx"
          download
          className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-inyecta-700 hover:text-inyecta-800"
        >
          <Download size={16} /> Descargar reglas de IVA del sistema (Word)
        </a>
      </div>

      {/* ── Formulario ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Operación a analizar</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Campo label="Producto">
            <select
              value={producto}
              onChange={(e) => setProducto(e.target.value as Producto)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              <option value="FINANCIERO">Financiero</option>
              <option value="PURO">Puro</option>
            </select>
          </Campo>
          <Num label="Valor del bien (con IVA)" value={valorConIVA} onChange={setValorConIVA} step={10000} />
          <Num label="Plazo (meses)" value={plazo} onChange={setPlazo} step={1} />
          <Num label="Tasa anual (%)" value={tasaPct} onChange={setTasaPct} step={1} />
          <Num label={`${engancheLabel(producto)} (% s/ valor sin IVA)`} value={enganchePct} onChange={setEnganchePct} step={1} />
          <Num label="Comisión apertura (%)" value={comisionPct} onChange={setComisionPct} step={0.5} />
          <Campo label="Comisión">
            <select
              value={comisionContado ? 'contado' : 'financiada'}
              onChange={(e) => setComisionContado(e.target.value === 'contado')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
            >
              <option value="financiada">Financiada</option>
              <option value="contado">De contado</option>
            </select>
          </Campo>
          <Num label="Depósito garantía (%)" value={depositoPct} onChange={setDepositoPct} step={1} />
        </div>
      </div>

      {cot && <Resultado cot={cot} tasaAnual={tasaPct / 100} producto={producto} />}
    </div>
  );
}

// ── Resultado: asientos + flujo de IVA ──────────────────────────────

function Resultado({ cot, tasaAnual, producto }: { cot: ReturnType<typeof calcularCotizacion>; tasaAnual: number; producto: Producto }) {
  const [verMensual, setVerMensual] = useState(false);
  const esFin = producto === 'FINANCIERO';
  const sec4 = esFin ? 'Opción de compra' : 'Valor de rescate';

  // ── Derivaciones (Decimal, espejo del motor) ──────────────────────
  const r2 = (d: Decimal) => d.toDecimalPlaces(2).toNumber();
  const interes1 = new Decimal(cot.montoFinanciadoReal).times(new Decimal(tasaAnual).div(12));
  const capital1 = new Decimal(cot.rentaMensual.montoNeto).minus(interes1);
  const i1 = interes1.toNumber();
  const c1 = capital1.toNumber();
  const iva1 = cot.rentaMensual.iva;
  const p = cot.pagoInicial;

  const ivaBien = r2(new Decimal(cot.valorBienConIVA).minus(cot.valorBienSinIVA)); // 16% × valor sin IVA
  const ivaEnganche = p.ivaEnganche;
  const comisionFinanc = cot.monto.comisionAperturaFinanciada;
  const ivaComisionFinanc = r2(new Decimal(comisionFinanc).times(0.16));
  const interesIvaComision = r2(new Decimal(cot.financiamientoIvaComision).div(1.16));
  const ivaFinanc = r2(new Decimal(cot.financiamientoIvaComision).minus(interesIvaComision)); // IVA del interés §4.17

  // ── Reconciliación REAL del IVA (por momento × destino) ───────────
  // El IVA del bien NO se recupera todo en rentas: en PURO una parte queda
  // en el saldo final del PMT y se cobra en el cierre (vía el rescate); en
  // FINANCIERO el saldo final es 0, así que todo entra en firma + rentas.
  // La parte bien/comisión del capital (y del saldo final) se reparte
  // proporcional a su peso en el PV. Verificado: las columnas y los totales
  // cuadran al centavo.
  const PV = new Decimal(cot.montoFinanciadoReal);
  const FV = new Decimal(cot.fvAmortizacion);              // saldo final (0 en FIN, rescate en PURO)
  const capRentas = PV.minus(FV);                          // capital recuperado en las rentas
  const sumaInteres = new Decimal(cot.rentaMensual.montoNeto).times(cot.plazo).minus(capRentas);
  const ivaInteres = r2(sumaInteres.times(0.16));          // IVA del interés ordinario (ingreso real)
  const bienFin = new Decimal(cot.valorBienSinIVA).minus(p.engancheContado); // bien financiado
  const fracBien = PV.isZero() ? new Decimal(0) : bienFin.div(PV);
  const fracCom  = PV.isZero() ? new Decimal(0) : new Decimal(comisionFinanc).div(PV);
  const ivaBienRentas = r2(capRentas.times(fracBien).times(0.16));
  const ivaBienCierre = r2(FV.times(fracBien).times(0.16));        // 0 en FINANCIERO
  const ivaComRentas  = r2(capRentas.times(fracCom).times(0.16));
  const ivaComCierre  = r2(FV.times(fracCom).times(0.16));
  const ivaComisionTotal = r2(new Decimal(p.comisionAperturaContado).plus(comisionFinanc).times(0.16));
  const ivaOpcion = esFin ? cot.residual.iva : 0;          // FIN: opción (cargo extra); PURO va en cierre bien/com

  const reconFilas: ReconFila[] = [
    { concepto: 'IVA del bien (16% × valor s/IVA)', firma: ivaEnganche,      rentas: ivaBienRentas, cierre: ivaBienCierre, total: ivaBien },
    { concepto: 'IVA de la comisión de apertura',   firma: p.ivaComisionContado, rentas: ivaComRentas, cierre: ivaComCierre, total: ivaComisionTotal },
    { concepto: 'IVA del interés (ingreso)',        firma: 0,                rentas: ivaInteres,    cierre: 0,             total: ivaInteres },
    ...(esFin ? [{ concepto: 'IVA de la opción de compra', firma: 0, rentas: 0, cierre: ivaOpcion, total: ivaOpcion }] : []),
  ];
  const reconTot = (k: keyof Omit<ReconFila, 'concepto'>) => reconFilas.reduce((s, r) => s + r[k], 0);

  // ── Desglose mensual del IVA (amortización del PMT) ───────────────
  // Interés_n = saldo × tasa/12; capital_n = renta − interés (última fila
  // cierra en el saldo final exacto). El IVA cobrado = renta × 16% es
  // constante; se separa en IVA s/interés (baja) + IVA s/capital (sube).
  const rMens = new Decimal(tasaAnual).div(12);
  const rentaNetaD = new Decimal(cot.rentaMensual.montoNeto);
  const ivaMes = rentaNetaD.times(0.16);
  const filasMes: { mes: number; interes: number; capital: number; ivaInt: number; ivaCap: number; iva: number }[] = [];
  const totMes = { interes: new Decimal(0), capital: new Decimal(0), ivaInt: new Decimal(0), ivaCap: new Decimal(0), iva: new Decimal(0) };
  let saldoM = new Decimal(cot.montoFinanciadoReal);
  for (let m = 1; m <= cot.plazo; m++) {
    const interesM = saldoM.times(rMens);
    const capitalM = m === cot.plazo ? saldoM.minus(FV) : rentaNetaD.minus(interesM);
    const ivaIntM = interesM.times(0.16);
    const ivaCapM = capitalM.times(0.16);
    filasMes.push({ mes: m, interes: interesM.toNumber(), capital: capitalM.toNumber(), ivaInt: ivaIntM.toNumber(), ivaCap: ivaCapM.toNumber(), iva: ivaMes.toNumber() });
    totMes.interes = totMes.interes.plus(interesM); totMes.capital = totMes.capital.plus(capitalM);
    totMes.ivaInt = totMes.ivaInt.plus(ivaIntM); totMes.ivaCap = totMes.ivaCap.plus(ivaCapM); totMes.iva = totMes.iva.plus(ivaMes);
    saldoM = saldoM.minus(capitalM);
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <Tarjeta titulo="Resumen de la operación">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          <KV k="Valor del bien (sin IVA)" v={f(cot.valorBienSinIVA)} />
          <KV k="IVA del bien (acreditable)" v={f(ivaBien)} />
          <KV k="Valor del bien (con IVA)" v={f(cot.valorBienConIVA)} />
          <KV k={`${engancheLabel(producto)} (neto) + su IVA`} v={`${f(cot.pagoInicial.engancheContado)} + ${f(cot.pagoInicial.ivaEnganche)}`} />
          <KV k="Monto a financiar (PV)" v={f(cot.montoFinanciadoReal)} />
          <KV k="Renta neta + IVA" v={`${f(cot.rentaMensual.montoNeto)} + ${f(cot.rentaMensual.iva)}`} />
          <KV k="Renta total mensual" v={f(cot.rentaMensual.total)} />
          <KV k="Pago inicial" v={f(cot.pagoInicial.total)} />
          <KV k={`${sec4} (con IVA)`} v={f(cot.residual.total)} />
          <KV k="Total a pagar" v={f(cot.totalPagar)} />
        </div>
      </Tarjeta>

      {/* Asientos */}
      <Tarjeta titulo="Asientos contables (cargo = Debe · abono = Haber)">
        <Asiento
          titulo="1) Compra del bien — Inyecta adquiere el activo"
          rows={[
            { c: 'Bien en arrendamiento (activo)', d: cot.valorBienSinIVA },
            { c: 'IVA acreditable', d: ivaBien },
            { c: 'Bancos / Proveedor', h: cot.valorBienConIVA },
          ]}
        />
        <Asiento
          titulo="2) Firma — cobro del pago inicial"
          rows={[
            { c: 'Bancos', d: p.total },
            { c: engancheLabel(producto), h: p.engancheContado },
            { c: 'IVA trasladado (enganche)', h: p.ivaEnganche },
            ...(p.comisionAperturaContado > 0
              ? [
                  { c: 'Comisión de apertura (ingreso)', h: p.comisionAperturaContado },
                  { c: 'IVA trasladado (comisión)', h: p.ivaComisionContado },
                ]
              : []),
            { c: 'Depósito en garantía (pasivo)', h: p.depositoGarantia },
          ]}
        />
        {esFin ? (
          <Asiento
            titulo="3) Renta cobrada — ejemplo mes 1 (Financiero: separa capital/interés)"
            rows={[
              { c: 'Bancos', d: cot.rentaMensual.total },
              { c: 'Ingreso por intereses', h: i1 },
              { c: 'Recuperación de capital (cta. x cobrar)', h: c1 },
              { c: 'IVA trasladado', h: iva1 },
            ]}
          />
        ) : (
          <Asiento
            titulo="3) Renta cobrada — ejemplo mes 1 (Puro: arrendamiento operativo)"
            rows={[
              { c: 'Bancos', d: cot.rentaMensual.total },
              { c: 'Ingreso por arrendamiento', h: cot.rentaMensual.montoNeto },
              { c: 'IVA trasladado', h: iva1 },
            ]}
          />
        )}
        <Asiento
          titulo="4) Entero mensual del IVA al SAT (neto trasladado − acreditable)"
          nota="El IVA acreditable del bien (una sola vez) compensa el trasladado hasta agotarse; después se entera el neto."
          rows={[
            { c: 'IVA trasladado del periodo', d: cot.rentaMensual.iva },
            { c: 'IVA acreditable / Bancos (neto a enterar)', h: cot.rentaMensual.iva },
          ]}
        />
        <Asiento
          titulo={`5) Cierre — ${sec4.toLowerCase()}${esFin ? ' y devolución del depósito' : ''}`}
          rows={[
            { c: 'Bancos', d: cot.residual.total },
            { c: `Ingreso por ${sec4.toLowerCase()}`, h: cot.residual.monto },
            { c: 'IVA trasladado', h: cot.residual.iva },
            ...(esFin && p.depositoGarantia > 0
              ? [
                  { c: 'Depósito en garantía (pasivo)', d: p.depositoGarantia },
                  { c: 'Bancos (devolución)', h: p.depositoGarantia },
                ]
              : []),
          ]}
        />
      </Tarjeta>

      {/* Flujo del IVA */}
      <Tarjeta titulo="Flujo del IVA de la operación">
        <div className="space-y-3 text-sm">
          <Bloque titulo="1. IVA acreditable (lo que Inyecta paga)">
            <KV k="IVA del bien (al comprarlo)" v={f(ivaBien)} />
            <p className="text-xs text-gray-500">Se acredita contra el IVA trasladado que Inyecta cobra.</p>
          </Bloque>

          <Bloque titulo="2. IVA trasladado — reconciliación por momento × destino">
            <p className="text-xs text-gray-500 mb-2">
              Cada IVA que cobra Inyecta, ubicado por CUÁNDO se cobra (firma / rentas / cierre) y por
              QUÉ recupera (bien / comisión / interés). El IVA del bien NO entra todo en las rentas.
            </p>
            <ReconTabla filas={reconFilas} tot={reconTot} />
            <p className="text-[11px] text-gray-500 mt-2 leading-snug">
              <strong>Lectura del IVA del bien</strong> ({f(ivaBien)} = 16% × valor sin IVA): {f(ivaEnganche)} en
              la firma (enganche) + {f(ivaBienRentas)} dentro de las rentas
              {ivaBienCierre > 0 ? ` + ${f(ivaBienCierre)} en el cierre (vía el rescate)` : ''}.
              {esFin
                ? ' En FINANCIERO el saldo final del PMT es 0, así que el bien se recupera completo en firma + rentas.'
                : ' En PURO una parte del bien queda en el saldo final del PMT (el rescate), por eso ese IVA se cobra hasta el cierre y NO en las rentas — antes la página lo sumaba todo a "rentas", que era impreciso.'}
              {' '}La columna “En rentas” coincide con el IVA mensual ({f(cot.rentaMensual.iva)}) × {cot.plazo} meses.
            </p>
          </Bloque>

          {comisionFinanc > 0 && (
            <Bloque titulo="3. IVA de comisión FINANCIADA — capitalización (§4.17)">
              <KV k="IVA de la comisión (se adelanta al SAT)" v={f(ivaComisionFinanc)} />
              <KV k="Se recupera vía el IVA de las rentas" v="(en la fila de comisión, arriba)" />
              <KV k="Costo de fondear el adelanto = interés" v={f(interesIvaComision)} />
              <KV k="IVA de ese interés (adicional a la tabla)" v={f(ivaFinanc)} />
              <KV k="= Financiamiento (se agrega al Total a Pagar)" v={f(cot.financiamientoIvaComision)} />
              <p className="text-xs text-gray-500">
                Inyecta entera el IVA de la comisión al SAT antes de cobrarlo, así que lo “presta”: se
                capitaliza al plazo y se le cobra el interés (que a su vez causa IVA).
              </p>
            </Bloque>
          )}

        </div>
      </Tarjeta>

      {/* Desglose mensual del IVA (colapsable) */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          type="button"
          onClick={() => setVerMensual((v) => !v)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <div>
            <h2 className="font-semibold text-gray-900">Desglose mensual del IVA cobrado</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cómo se separa el IVA de cada renta (interés vs capital), mes a mes · {cot.plazo} meses
            </p>
          </div>
          <span className="text-gray-400 text-lg">{verMensual ? '−' : '+'}</span>
        </button>
        {verMensual && (
          <div className="px-6 pb-6">
            <div className="max-h-[32rem] overflow-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {['Mes', 'Interés', 'Capital', 'IVA s/ interés', 'IVA s/ capital', 'IVA cobrado'].map((h, i) => (
                      <th key={h} className={`sticky top-0 bg-gray-50 px-3 py-2 font-medium text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasMes.map((r) => (
                    <tr key={r.mes} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 text-gray-700">{r.mes}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900">{f(r.interes)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900">{f(r.capital)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900">{f(r.ivaInt)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900">{f(r.ivaCap)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900">{f(r.iva)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-gray-700 border-t border-gray-300">Σ</td>
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-right border-t border-gray-300">{f(totMes.interes.toNumber())}</td>
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-right border-t border-gray-300">{f(totMes.capital.toNumber())}</td>
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-right border-t border-gray-300">{f(totMes.ivaInt.toNumber())}</td>
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-right border-t border-gray-300">{f(totMes.ivaCap.toNumber())}</td>
                    <td className="sticky bottom-0 bg-gray-50 px-3 py-2 text-right border-t border-gray-300">{f(totMes.iva.toNumber())}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 leading-snug">
              IVA cobrado = renta neta ({f(cot.rentaMensual.montoNeto)}) × 16%, constante todos los meses.
              Se separa en IVA sobre el interés (tu ingreso, baja con el tiempo) + IVA sobre el capital
              (recupera el IVA del bien y de la comisión, sube). Σ IVA cobrado = {f(totMes.iva.toNumber())}.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-amber-700 leading-snug">
        ⚠️ Los asientos son la lógica cargo/abono informativa. La clasificación formal NIF D-5 / IFRS-16
        (inversión neta en el arrendamiento, intereses por devengar) y el desglose exacto del IVA en el
        CFDI los define el contador. Reglas de IVA divergentes del Excel: IVA del enganche (§4.16) e IVA
        de la comisión (§4.17).
      </p>
    </div>
  );
}

// ── Helpers de UI ───────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <Campo label={label}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
      />
    </Campo>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-3">{titulo}</h2>
      {children}
    </div>
  );
}

function KV({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-0.5 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{k}</span>
      <span className="text-gray-900 text-right whitespace-nowrap">{v}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-inyecta-200 pl-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{titulo}</div>
      {children}
    </div>
  );
}

interface ReconFila { concepto: string; firma: number; rentas: number; cierre: number; total: number }

/** Tabla de reconciliación del IVA: destino (fila) × momento (columna). Las
 *  columnas suman el IVA cobrado por momento; los totales de fila, por destino. */
function ReconTabla({ filas, tot }: { filas: ReconFila[]; tot: (k: keyof Omit<ReconFila, 'concepto'>) => number }) {
  const cell = (v: number) => (v === 0 ? '—' : f(v));
  const head = ['Concepto', 'Firma', 'En rentas', 'Cierre', 'Total'];
  return (
    <div className="grid grid-cols-[1.7fr_1fr_1fr_1fr_1fr] text-xs border border-gray-100 rounded-lg overflow-hidden">
      {head.map((h, i) => (
        <div key={h} className={`bg-gray-50 px-3 py-1.5 font-medium text-gray-500 ${i === 0 ? '' : 'text-right'}`}>{h}</div>
      ))}
      {filas.map((r, i) => (
        <div key={i} className="contents">
          <div className="px-3 py-1.5 text-gray-700 border-t border-gray-50">{r.concepto}</div>
          <div className="px-3 py-1.5 text-right text-gray-900 border-t border-gray-50">{cell(r.firma)}</div>
          <div className="px-3 py-1.5 text-right text-gray-900 border-t border-gray-50">{cell(r.rentas)}</div>
          <div className="px-3 py-1.5 text-right text-gray-900 border-t border-gray-50">{cell(r.cierre)}</div>
          <div className="px-3 py-1.5 text-right font-medium text-gray-900 border-t border-gray-50">{f(r.total)}</div>
        </div>
      ))}
      <div className="contents">
        <div className="px-3 py-1.5 font-semibold text-gray-700 border-t border-gray-200 bg-gray-50">Total IVA trasladado</div>
        <div className="px-3 py-1.5 text-right font-semibold text-gray-900 border-t border-gray-200 bg-gray-50">{f(tot('firma'))}</div>
        <div className="px-3 py-1.5 text-right font-semibold text-gray-900 border-t border-gray-200 bg-gray-50">{f(tot('rentas'))}</div>
        <div className="px-3 py-1.5 text-right font-semibold text-gray-900 border-t border-gray-200 bg-gray-50">{f(tot('cierre'))}</div>
        <div className="px-3 py-1.5 text-right font-semibold text-gray-900 border-t border-gray-200 bg-gray-50">{f(tot('total'))}</div>
      </div>
    </div>
  );
}

interface AsientoR { c: string; d?: number; h?: number }

function Asiento({ titulo, rows, nota }: { titulo: string; rows: AsientoR[]; nota?: string }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-medium text-gray-700 mb-1">{titulo}</div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 text-sm border border-gray-100 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-1.5 font-medium text-gray-500">Cuenta</div>
        <div className="bg-gray-50 px-3 py-1.5 font-medium text-gray-500 text-right">Debe</div>
        <div className="bg-gray-50 px-3 py-1.5 font-medium text-gray-500 text-right">Haber</div>
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const b = last ? '' : 'border-b border-gray-50';
          return (
            <div key={i} className="contents">
              <div className={`px-3 py-1.5 text-gray-700 ${b}`}>{r.c}</div>
              <div className={`px-3 py-1.5 text-right text-gray-900 ${b}`}>{r.d != null ? f(r.d) : ''}</div>
              <div className={`px-3 py-1.5 text-right text-gray-900 ${b}`}>{r.h != null ? f(r.h) : ''}</div>
            </div>
          );
        })}
      </div>
      {nota && <p className="text-xs text-gray-500 mt-1">{nota}</p>}
    </div>
  );
}
