/**
 * Desglose de la operación — cargos y abonos
 * --------------------------------------------------------------------
 * Panel INFORMATIVO (no se imprime en la cotización). Reacomoda los
 * números que el motor ya calculó (`ResultadoCotizacion`) en tres vistas:
 *
 *   • Flujo de caja de Inyecta — salidas vs entradas + utilidad.
 *   • Estado de cuenta del cliente — cargos vs abonos (prelación §4.9).
 *   • Contable — asientos cargo (debe) / abono (haber) por etapa.
 *
 * NO hace matemática financiera nueva: la única derivación es el split
 * capital/interés del primer periodo (interés = saldo × tasa/12), que
 * coincide al centavo con la tabla de amortización del motor. Se calcula
 * con Decimal.js para mantener la precisión del resto del sistema.
 *
 * La vista contable es la LÓGICA cargo/abono, no el dictamen formal: la
 * clasificación NIF D-5 / IFRS-16 y el desglose exacto del IVA en CFDI
 * los define el contador (ver server/CLAUDE.md §4.17).
 */
import { useState } from 'react';
import Decimal from 'decimal.js';
import { formatCurrency } from '@/lib/utils';
import type { ResultadoCotizacion } from '@/lib/cotizacion/calculos';
import { engancheLabel } from '@/lib/cotizacion/labels';

interface Props {
  cot: ResultadoCotizacion;
  /** Tasa anual del contrato (form.tasaAnual). El motor no la expone en su salida. */
  tasaAnual: number;
}

type Vista = 'flujo' | 'cliente' | 'contable';

const f = formatCurrency;

export default function DesgloseOperacion({ cot, tasaAnual }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>('flujo');

  const esFin = cot.producto === 'FINANCIERO';

  // ── Derivaciones (Decimal, espejo del motor) ──────────────────────
  const tasaMensual = new Decimal(tasaAnual).dividedBy(12);
  const interes1 = new Decimal(cot.montoFinanciadoReal).times(tasaMensual); // saldo inicial × r
  const capital1 = new Decimal(cot.rentaMensual.montoNeto).minus(interes1);
  const iva1 = cot.rentaMensual.iva;

  const comisionFinanc = cot.monto.comisionAperturaFinanciada;
  const ivaComisionAdelantado = new Decimal(comisionFinanc).times(0.16).toNumber(); // se entera al SAT
  const ivaBien = new Decimal(cot.valorBienConIVA).minus(cot.valorBienSinIVA).toNumber();
  // El IVA del bien NO entra todo en rentas: en PURO una parte queda en el
  // saldo final (rescate) y se cobra al cierre; en FIN (FV=0) todo en
  // firma+rentas. La parte del bien se reparte proporcional al PV.
  const PVd = new Decimal(cot.montoFinanciadoReal);
  const FVd = new Decimal(cot.fvAmortizacion);
  const fracBienD = PVd.isZero()
    ? new Decimal(0)
    : new Decimal(cot.valorBienSinIVA).minus(cot.pagoInicial.engancheContado).dividedBy(PVd);
  const ivaBienRentas = PVd.minus(FVd).times(fracBienD).times(0.16).toNumber();
  const ivaBienCierre = FVd.times(fracBienD).times(0.16).toNumber();

  const sec4Label = esFin ? 'Opción de compra' : 'Valor de rescate';
  const i1 = interes1.toNumber();
  const c1 = capital1.toNumber();

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <div>
          <h3 className="font-semibold text-gray-900">Desglose de la operación</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Cómo se separan cargos y abonos · informativo, no se imprime
          </p>
        </div>
        <span className="text-gray-400 text-lg">{abierto ? '−' : '+'}</span>
      </button>

      {abierto && (
        <div className="px-6 pb-6">
          {/* Selector de vista */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 text-xs font-medium">
            {([
              ['flujo', 'Flujo de Inyecta'],
              ['cliente', 'Estado de cuenta'],
              ['contable', 'Contable'],
            ] as [Vista, string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  vista === v ? 'bg-white text-inyecta-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {vista === 'flujo' && (
            <Flujo cot={cot} esFin={esFin} ivaComisionAdelantado={ivaComisionAdelantado} sec4Label={sec4Label} />
          )}
          {vista === 'cliente' && (
            <Cliente cot={cot} esFin={esFin} i1={i1} c1={c1} iva1={iva1} sec4Label={sec4Label} />
          )}
          {vista === 'contable' && (
            <Contable
              cot={cot}
              esFin={esFin}
              i1={i1}
              c1={c1}
              iva1={iva1}
              ivaBien={ivaBien}
              ivaComisionAdelantado={ivaComisionAdelantado}
              sec4Label={sec4Label}
            />
          )}

          {/* Hilo del IVA — reconciliación, común a las 3 vistas */}
          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-600">El IVA del bien cuadra:</span>{' '}
            {f(ivaBien)} = {f(cot.pagoInicial.ivaEnganche)} del enganche + {f(ivaBienRentas)} en las rentas
            {ivaBienCierre > 0 ? ` + ${f(ivaBienCierre)} en el cierre (rescate)` : ''}. El IVA es de paso al SAT; la utilidad real es sin IVA.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers de presentación ─────────────────────────────────────────

function Linea({ label, value, tone, strong }: { label: string; value: number; tone?: 'in' | 'out'; strong?: boolean }) {
  const color = tone === 'out' ? 'text-red-600' : tone === 'in' ? 'text-emerald-700' : 'text-gray-900';
  const sign = tone === 'out' ? '−' : tone === 'in' ? '+' : '';
  return (
    <div className={`flex justify-between py-1 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={color}>{sign}{f(Math.abs(value))}</span>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mt-3 mb-1">{children}</div>;
}

// ── Vista 1: Flujo de caja de Inyecta ───────────────────────────────

function Flujo({
  cot, esFin, ivaComisionAdelantado, sec4Label,
}: { cot: ResultadoCotizacion; esFin: boolean; ivaComisionAdelantado: number; sec4Label: string }) {
  const p = cot.pagoInicial;
  const engancheConIVA = p.engancheContado + p.ivaEnganche;
  const comisionConIVA = p.comisionAperturaContado + p.ivaComisionContado;
  // Desembolso neto de Inyecta al inicio = lo que paga por el bien − lo que
  // entra del cliente en la firma (enganche, depósito, etc.). El enganche
  // NO es salida extra: ya cubre parte del bien (de ahí que se reste aquí).
  const desembolsoNeto = cot.valorBienConIVA - p.total;
  return (
    <div>
      <Titulo>Al inicio (firma)</Titulo>
      <Linea label="Compra del bien (con IVA)" value={cot.valorBienConIVA} tone="out" />
      <Linea label={`${engancheLabel(cot.producto)} del cliente (con IVA)`} value={engancheConIVA} tone="in" />
      {comisionConIVA > 0 && (
        <Linea label="Comisión de apertura de contado (con IVA)" value={comisionConIVA} tone="in" />
      )}
      {p.aperturaSeguros > 0 && <Linea label="Apertura de seguro" value={p.aperturaSeguros} tone="in" />}
      {p.gpsContado > 0 && <Linea label="Instalación del GPS" value={p.gpsContado} tone="in" />}
      {p.depositoGarantia > 0 && <Linea label="Depósito en garantía" value={p.depositoGarantia} tone="in" />}
      <div className="border-t border-gray-200 mt-1 pt-1">
        <Linea label="Desembolso neto de Inyecta" value={desembolsoNeto} tone="out" strong />
      </div>
      <p className="text-[11px] text-gray-500 mt-1 leading-snug">
        El enganche del cliente ya cubre parte del bien; Inyecta solo fondea la diferencia
        y la recupera con las rentas.
      </p>

      <Titulo>Durante el plazo ({cot.plazo} meses)</Titulo>
      <Linea label={`Rentas (${cot.plazo} × ${f(cot.rentaMensual.total)})`} value={cot.totalRentas} tone="in" />
      {ivaComisionAdelantado > 0 && (
        <Linea label="IVA de comisión enterado al SAT (adelantado)" value={ivaComisionAdelantado} tone="out" />
      )}
      {cot.financiamientoIvaComision > 0 && (
        <Linea label="Financiamiento del IVA de comisión" value={cot.financiamientoIvaComision} tone="in" />
      )}

      <Titulo>Al cierre</Titulo>
      <Linea label={sec4Label} value={cot.residual.total} tone="in" />
      {esFin && cot.pagoInicial.depositoGarantia > 0 && (
        <Linea label="Devolución del depósito" value={cot.pagoInicial.depositoGarantia} tone="out" />
      )}

      <div className="mt-3 pt-2 border-t-2 border-inyecta-200 bg-inyecta-50/40 -mx-2 px-2 py-2 rounded-lg">
        <Titulo>Utilidad de la operación (sin IVA)</Titulo>
        <Linea label="Comisión de apertura" value={cot.ganancia.comisionApertura} />
        <Linea label="Intereses (incl. del IVA adelantado)" value={cot.ganancia.intereses} />
        <Linea label={sec4Label} value={cot.ganancia.opcionCompra} />
        <div className="border-t border-inyecta-200 mt-1 pt-1">
          <Linea label="Utilidad total" value={cot.ganancia.total} strong />
        </div>
      </div>
    </div>
  );
}

// ── Vista 2: Estado de cuenta del cliente ───────────────────────────

function Cliente({
  cot, esFin, i1, c1, iva1, sec4Label,
}: { cot: ResultadoCotizacion; esFin: boolean; i1: number; c1: number; iva1: number; sec4Label: string }) {
  const engancheConIVA = cot.pagoInicial.engancheContado + cot.pagoInicial.ivaEnganche;
  const comisionContadoConIVA = cot.pagoInicial.comisionAperturaContado + cot.pagoInicial.ivaComisionContado;
  return (
    <div>
      <Titulo>Cargos (lo que se le cobra)</Titulo>
      <Linea label={`${engancheLabel(cot.producto)} + IVA (firma)`} value={engancheConIVA} />
      {comisionContadoConIVA > 0 && (
        <Linea label="Comisión de apertura + IVA (firma)" value={comisionContadoConIVA} />
      )}
      <Linea label="Depósito en garantía (reembolsable)" value={cot.pagoInicial.depositoGarantia} />
      <Linea label={`Renta + IVA (mensual × ${cot.plazo})`} value={cot.rentaMensual.total} />
      <Linea label={`${sec4Label} + IVA (cierre)`} value={cot.residual.total} />
      {cot.financiamientoIvaComision > 0 && (
        <Linea label="Financiamiento del IVA de comisión (en plazo)" value={cot.financiamientoIvaComision} />
      )}

      <Titulo>Abono — aplicación de un pago puntual (mes 1)</Titulo>
      <p className="text-[11px] text-gray-500 mb-1 leading-snug">
        Prelación §4.9: moratorios → IVA mora → interés → IVA interés → capital.
      </p>
      {esFin ? (
        <>
          <Linea label="Interés ordinario" value={i1} />
          <Linea label="IVA (de la renta)" value={iva1} />
          <Linea label="Capital" value={c1} />
        </>
      ) : (
        <>
          <Linea label="Renta (arrendamiento)" value={cot.rentaMensual.montoNeto} />
          <Linea label="IVA (de la renta)" value={iva1} />
          <p className="text-[11px] text-gray-400 mt-1">
            PURO: la renta no separa capital/interés (arrendamiento operativo, §4.7).
          </p>
        </>
      )}
      <p className="text-[11px] text-gray-500 mt-2">
        El depósito se le abona/devuelve al final{esFin ? '' : ' o queda como rescate del bien'}.
      </p>
    </div>
  );
}

// ── Vista 3: Contable (cargo = debe, abono = haber) ─────────────────

interface AsientoRow { concepto: string; debe?: number; haber?: number }

function Asiento({ titulo, rows }: { titulo: string; rows: AsientoRow[] }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-gray-700 mb-1">{titulo}</div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs border border-gray-100 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-2 py-1 font-medium text-gray-500">Cuenta</div>
        <div className="bg-gray-50 px-2 py-1 font-medium text-gray-500 text-right">Debe</div>
        <div className="bg-gray-50 px-2 py-1 font-medium text-gray-500 text-right">Haber</div>
        {rows.map((r, idx) => (
          <Row key={idx} r={r} last={idx === rows.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Row({ r, last }: { r: AsientoRow; last: boolean }) {
  const border = last ? '' : 'border-b border-gray-50';
  return (
    <>
      <div className={`px-2 py-1 text-gray-700 ${border}`}>{r.concepto}</div>
      <div className={`px-2 py-1 text-right text-gray-900 ${border}`}>{r.debe != null ? f(r.debe) : ''}</div>
      <div className={`px-2 py-1 text-right text-gray-900 ${border}`}>{r.haber != null ? f(r.haber) : ''}</div>
    </>
  );
}

function Contable({
  cot, esFin, i1, c1, iva1, ivaBien, ivaComisionAdelantado, sec4Label,
}: {
  cot: ResultadoCotizacion; esFin: boolean; i1: number; c1: number; iva1: number;
  ivaBien: number; ivaComisionAdelantado: number; sec4Label: string;
}) {
  const rentaAsiento: AsientoRow[] = esFin
    ? [
        { concepto: 'Bancos', debe: cot.rentaMensual.total },
        { concepto: 'Ingreso por intereses', haber: i1 },
        { concepto: 'Recuperación de capital (cta. x cobrar)', haber: c1 },
        { concepto: 'IVA trasladado', haber: iva1 },
      ]
    : [
        { concepto: 'Bancos', debe: cot.rentaMensual.total },
        { concepto: 'Ingreso por arrendamiento', haber: cot.rentaMensual.montoNeto },
        { concepto: 'IVA trasladado', haber: iva1 },
      ];

  return (
    <div>
      <Asiento
        titulo="1) Compra del bien"
        rows={[
          { concepto: 'Bien en arrendamiento (activo)', debe: cot.valorBienSinIVA },
          { concepto: 'IVA acreditable', debe: ivaBien },
          { concepto: 'Bancos / Proveedor', haber: cot.valorBienConIVA },
        ]}
      />
      <Asiento
        titulo="2) Firma — pago inicial"
        rows={[
          { concepto: 'Bancos', debe: cot.pagoInicial.total },
          { concepto: engancheLabel(cot.producto), haber: cot.pagoInicial.engancheContado },
          { concepto: 'IVA trasladado (enganche)', haber: cot.pagoInicial.ivaEnganche },
          ...(cot.pagoInicial.comisionAperturaContado > 0
            ? [
                { concepto: 'Comisión de apertura', haber: cot.pagoInicial.comisionAperturaContado },
                { concepto: 'IVA trasladado (comisión)', haber: cot.pagoInicial.ivaComisionContado },
              ]
            : []),
          { concepto: 'Depósito en garantía (pasivo)', haber: cot.pagoInicial.depositoGarantia },
        ]}
      />
      <Asiento titulo="3) Renta cobrada (ejemplo mes 1)" rows={rentaAsiento} />
      <Asiento
        titulo={`4) Cierre — ${sec4Label.toLowerCase()} y devolución del depósito`}
        rows={[
          { concepto: 'Bancos', debe: cot.residual.total },
          { concepto: `Ingreso por ${sec4Label.toLowerCase()}`, haber: cot.residual.monto },
          { concepto: 'IVA trasladado', haber: cot.residual.iva },
          ...(esFin && cot.pagoInicial.depositoGarantia > 0
            ? [
                { concepto: 'Depósito en garantía (pasivo)', debe: cot.pagoInicial.depositoGarantia },
                { concepto: 'Bancos (devolución)', haber: cot.pagoInicial.depositoGarantia },
              ]
            : []),
        ]}
      />
      {ivaComisionAdelantado > 0 && (
        <p className="text-[11px] text-gray-500 leading-snug">
          Comisión financiada: su IVA ({f(ivaComisionAdelantado)}) se entera al SAT al mes y se recupera
          dentro de las rentas; el costo de fondearlo es el financiamiento de {f(cot.financiamientoIvaComision)}.
        </p>
      )}
      <p className="text-[11px] text-amber-700 mt-2 leading-snug">
        ⚠️ Lógica cargo/abono informativa. La clasificación formal NIF D-5 / IFRS-16 y el desglose
        del IVA en CFDI los define el contador (§4.17).
      </p>
    </div>
  );
}
