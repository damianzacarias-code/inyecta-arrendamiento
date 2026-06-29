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
  const esFin = producto === 'FINANCIERO';
  const sec4 = esFin ? 'Opción de compra' : 'Valor de rescate';

  // Derivaciones (Decimal, espejo del motor)
  const interes1 = new Decimal(cot.montoFinanciadoReal).times(new Decimal(tasaAnual).div(12));
  const capital1 = new Decimal(cot.rentaMensual.montoNeto).minus(interes1);
  const i1 = interes1.toNumber();
  const c1 = capital1.toNumber();
  const iva1 = cot.rentaMensual.iva;

  const ivaBien = new Decimal(cot.valorBienConIVA).minus(cot.valorBienSinIVA).toNumber();
  const ivaEnganche = cot.pagoInicial.ivaEnganche;
  const ivaBienEnRentas = new Decimal(ivaBien).minus(ivaEnganche).toNumber();
  const comisionFinanc = cot.monto.comisionAperturaFinanciada;
  const ivaComisionFinanc = new Decimal(comisionFinanc).times(0.16).toNumber();
  const interesIvaComision = new Decimal(cot.financiamientoIvaComision).div(1.16).toNumber();
  const p = cot.pagoInicial;

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

          <Bloque titulo="2. IVA trasladado (lo que Inyecta cobra)">
            <KV k="IVA del enganche (firma, de contado)" v={f(ivaEnganche)} />
            {p.ivaComisionContado > 0 && <KV k="IVA de comisión (firma, de contado)" v={f(p.ivaComisionContado)} />}
            <KV k="IVA de cada renta (× plazo)" v={`${f(cot.rentaMensual.iva)} mensual`} />
            <KV k={`IVA del ${sec4.toLowerCase()} (cierre)`} v={f(cot.residual.iva)} />
          </Bloque>

          {comisionFinanc > 0 && (
            <Bloque titulo="3. IVA de comisión FINANCIADA — capitalización (§4.17)">
              <KV k="IVA de la comisión (se adelanta al SAT)" v={f(ivaComisionFinanc)} />
              <KV k="Se recupera vía el IVA de las rentas" v="(no se cobra dos veces)" />
              <KV k="Costo de fondear el adelanto = interés" v={f(interesIvaComision)} />
              <KV k="+ IVA de ese interés = financiamiento" v={f(cot.financiamientoIvaComision)} />
              <p className="text-xs text-gray-500">
                Inyecta entera el IVA de la comisión al SAT antes de cobrarlo, así que lo "presta": se
                capitaliza al plazo y se le cobra el interés (que a su vez causa IVA).
              </p>
            </Bloque>
          )}

          <Bloque titulo="4. Reconciliación del IVA del bien">
            <KV k="IVA del enganche (de contado)" v={f(ivaEnganche)} />
            <KV k="+ IVA del bien recuperado en rentas" v={f(ivaBienEnRentas)} />
            <div className="border-t border-gray-200 mt-1 pt-1">
              <KV k="= IVA total del bien" v={f(ivaBien)} bold />
            </div>
          </Bloque>

          <Bloque titulo="5. Retención de IVA / ISR">
            <p className="text-xs text-amber-700">
              El sistema NO calcula retención de IVA ni de ISR. Si alguna operación la requiere
              (p. ej. según el régimen del arrendatario), debe confirmarse con el contador y manejarse
              en la facturación. Ver el documento de reglas de IVA.
            </p>
          </Bloque>
        </div>
      </Tarjeta>

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
