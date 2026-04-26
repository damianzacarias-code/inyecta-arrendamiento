/**
 * ChecklistExpedientePDF — Reproduce los formatos oficiales de
 * "Documentación a integrar al expediente de crédito" de Inyecta SOFOM.
 *
 * Formato:
 *   - Header con logo + razón social + título del actor
 *   - Tabla con filas: descripción · Físico (☐/☑) · Digital (☐/☑) · Notas
 *   - Una sección por actor del expediente del contrato
 *   - Footer con folio + fecha de generación + paginación
 *
 * Pensado para imprimir y firmar/anotar a mano cuando el expediente
 * llega físico a oficina; o para compartir como PDF al cliente con
 * la lista de pendientes.
 */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import { colors, fontSize, spacing } from './tokens';
import { getBranding } from '@/lib/branding';

// ───────────────────────────────────────────────────────────────────
// Tipos del input (mismo shape que devuelve /api/contracts/:id/expediente)
// ───────────────────────────────────────────────────────────────────

export interface ChecklistInput {
  contract: {
    id: string;
    folio: string;
    tipoTitular: 'PFAE' | 'PM';
    bienDescripcion: string;
    client: {
      tipo: 'PFAE' | 'PM';
      nombre: string | null;
      apellidoPaterno: string | null;
      apellidoMaterno: string | null;
      razonSocial: string | null;
      rfc: string | null;
    };
  };
  cobertura: {
    total: number;
    cubiertos: number;
    porcentaje: number;
    porActor: Record<string, { total: number; cubiertos: number; porcentaje: number }>;
  };
  actores: Array<{
    id: string;
    tipo: string;
    subtipo: 'PF' | 'PM' | null;
    orden: number;
    nombre: string | null;
    rfc: string | null;
    etiqueta: string;
    catalogo: Array<{
      clave: string;
      etiqueta: string;
      descripcion?: string;
      opcional?: boolean;
      aplica?: boolean;
    }>;
    documentos: Array<{
      id: string;
      tipoDocumento: string | null;
      nombreArchivo: string;
      tieneFisico: boolean;
      tieneDigital: boolean;
      estatus: 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';
    }>;
  }>;
}

// ───────────────────────────────────────────────────────────────────
// Estilos
// ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
    fontFamily: 'Helvetica',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: `1pt solid ${colors.primary}`,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
  },
  logo: { width: 70, height: 47, marginRight: spacing.lg },
  headerTextWrap: { flex: 1 },
  razonSocial: {
    fontSize: fontSize.md,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  subTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  pageTitle: {
    fontSize: fontSize.lg,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  coberturaBox: {
    backgroundColor: colors.bgHighlight,
    padding: spacing.sm,
    borderRadius: 3,
    marginBottom: spacing.md,
  },
  actorBlock: {
    marginBottom: spacing.md,
    border: `0.5pt solid ${colors.rowBorder}`,
    borderRadius: 3,
  },
  actorHeader: {
    backgroundColor: colors.headerBg,
    color: colors.headerText,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actorTipoTag: {
    fontSize: fontSize.xs - 1,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  actorEtiqueta: {
    fontSize: fontSize.md,
    fontFamily: 'Helvetica-Bold',
    color: colors.headerText,
    flex: 1,
  },
  actorCobertura: {
    fontSize: fontSize.xs,
    color: colors.headerText,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTop: `0.5pt solid ${colors.rowBorder}`,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderTop: `0.5pt solid ${colors.rowBorder}`,
  },
  cellNum: { width: 18, fontSize: fontSize.xs, color: colors.textMuted },
  cellDesc: { flex: 1, fontSize: fontSize.sm },
  cellCheck: { width: 50, fontSize: fontSize.sm, textAlign: 'center' },
  cellEstatus: { width: 70, fontSize: fontSize.xs, textAlign: 'center' },
  headCell: {
    fontSize: fontSize.xs,
    fontFamily: 'Helvetica-Bold',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  rowBand: { backgroundColor: colors.rowBand },
  emptyMsg: {
    padding: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  uploadedSubrow: {
    paddingHorizontal: spacing.sm,
    paddingBottom: 3,
    paddingTop: 1,
  },
  uploadedItem: {
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginLeft: spacing.lg,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    fontSize: fontSize.xs - 1,
    color: colors.textLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5pt solid ${colors.rowBorder}`,
    paddingTop: 3,
  },
});

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function clienteNombre(c: ChecklistInput['contract']['client']): string {
  if (c.tipo === 'PM') return c.razonSocial || '(sin razón social)';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function checkbox(marked: boolean): string {
  return marked ? '☑' : '☐';
}

function estatusLabel(e: 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO'): string {
  if (e === 'VALIDADO') return '✓ VALIDADO';
  if (e === 'RECHAZADO') return '✗ RECHAZADO';
  return '— pendiente';
}

/**
 * Cruza el catálogo del actor con los documentos subidos para
 * producir filas con estado físico/digital. Los documentos cuyo
 * tipoDocumento NO está en el catálogo se agregan al final como
 * filas "Libre / Sin clasificar".
 */
function rowsForActor(actor: ChecklistInput['actores'][number]) {
  const aplicables = actor.catalogo.filter((c) => c.aplica !== false);
  const docsByTipo = new Map<string, ChecklistInput['actores'][number]['documentos']>();
  for (const d of actor.documentos) {
    const k = d.tipoDocumento || '__libre__';
    if (!docsByTipo.has(k)) docsByTipo.set(k, []);
    docsByTipo.get(k)!.push(d);
  }
  const rows = aplicables.map((c) => {
    const docs = docsByTipo.get(c.clave) || [];
    docsByTipo.delete(c.clave);
    const tieneFisico = docs.some((d) => d.tieneFisico);
    const tieneDigital = docs.some((d) => d.tieneDigital);
    const estatus = docs.some((d) => d.estatus === 'RECHAZADO')
      ? 'RECHAZADO'
      : docs.every((d) => d.estatus === 'VALIDADO') && docs.length > 0
        ? 'VALIDADO'
        : docs.length > 0
          ? 'PENDIENTE'
          : 'PENDIENTE';
    return {
      etiqueta: c.etiqueta,
      tieneFisico,
      tieneDigital,
      estatus: estatus as 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO',
      docs,
      catalogo: true,
    };
  });
  // Documentos huérfanos (sin tipo en catálogo): "Libre / Sin clasificar"
  for (const [tipo, docs] of docsByTipo.entries()) {
    rows.push({
      etiqueta:
        tipo === '__libre__'
          ? 'Libre / Sin clasificar'
          : `(no en catálogo) ${tipo}`,
      tieneFisico: docs.some((d) => d.tieneFisico),
      tieneDigital: docs.some((d) => d.tieneDigital),
      estatus: (docs.some((d) => d.estatus === 'RECHAZADO')
        ? 'RECHAZADO'
        : docs.every((d) => d.estatus === 'VALIDADO')
          ? 'VALIDADO'
          : 'PENDIENTE') as 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO',
      docs,
      catalogo: false,
    });
  }
  return rows;
}

// ───────────────────────────────────────────────────────────────────
// Componente PDF
// ───────────────────────────────────────────────────────────────────

export function ChecklistExpedientePDF({ data }: { data: ChecklistInput }) {
  const cliente = clienteNombre(data.contract.client);
  const fechaGen = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Branding leído del singleton (cargado al boot por App.tsx).
  const branding = getBranding();

  return (
    <Document
      title={`Expediente ${data.contract.folio}`}
      author={branding.empresa.razonSocial}
      subject="Checklist de documentos del expediente de crédito"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBlock} fixed>
          <Image src="/brand/logo-inyecta.png" style={styles.logo} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.razonSocial}>
              {branding.empresa.razonSocial}
            </Text>
            <Text style={styles.subTitle}>(Marca: {branding.empresa.nombreComercial})</Text>
          </View>
        </View>

        {/* Título */}
        <Text style={styles.pageTitle}>
          Documentación a integrar al expediente de crédito
        </Text>
        <Text style={styles.meta}>
          Contrato {data.contract.folio} · Cliente: {cliente}
          {data.contract.client.rfc ? ` (${data.contract.client.rfc})` : ''} ·{' '}
          {data.contract.tipoTitular === 'PM' ? 'Persona Moral' : 'PFAE'}
          {'\n'}Bien arrendado: {data.contract.bienDescripcion}
          {'\n'}Generado: {fechaGen}
        </Text>

        {/* Cobertura global */}
        <View style={styles.coberturaBox}>
          <Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>
              Cobertura global: {data.cobertura.porcentaje}%
            </Text>{' '}
            ({data.cobertura.cubiertos} de {data.cobertura.total} documentos esperados,
            según catálogo informativo Inyecta SOFOM).
          </Text>
        </View>

        {/* Una sección por actor */}
        {data.actores.map((actor) => {
          const rows = rowsForActor(actor);
          const cob = data.cobertura.porActor[actor.id];
          return (
            <View key={actor.id} style={styles.actorBlock} wrap={false}>
              <View style={styles.actorHeader}>
                <Text style={styles.actorTipoTag}>{actor.tipo}</Text>
                <Text style={styles.actorEtiqueta}>{actor.etiqueta}</Text>
                {cob && (
                  <Text style={styles.actorCobertura}>
                    {cob.cubiertos}/{cob.total} · {cob.porcentaje}%
                  </Text>
                )}
              </View>
              <View style={styles.tableHead}>
                <Text style={[styles.cellNum, styles.headCell]}>#</Text>
                <Text style={[styles.cellDesc, styles.headCell]}>Documento</Text>
                <Text style={[styles.cellCheck, styles.headCell]}>Físico</Text>
                <Text style={[styles.cellCheck, styles.headCell]}>Digital</Text>
                <Text style={[styles.cellEstatus, styles.headCell]}>Estatus</Text>
              </View>
              {rows.length === 0 ? (
                <Text style={styles.emptyMsg}>
                  Sin catálogo definido para este actor.
                </Text>
              ) : (
                rows.map((r, idx) => (
                  <View key={idx}>
                    <View
                      style={
                        idx % 2 === 1
                          ? [styles.tableRow, styles.rowBand]
                          : [styles.tableRow]
                      }
                    >
                      <Text style={styles.cellNum}>{idx + 1}</Text>
                      <Text style={styles.cellDesc}>{r.etiqueta}</Text>
                      <Text style={styles.cellCheck}>{checkbox(r.tieneFisico)}</Text>
                      <Text style={styles.cellCheck}>{checkbox(r.tieneDigital)}</Text>
                      <Text style={styles.cellEstatus}>
                        {r.docs.length === 0 ? '☐ falta' : estatusLabel(r.estatus)}
                      </Text>
                    </View>
                    {r.docs.length > 0 && (
                      <View style={styles.uploadedSubrow}>
                        {r.docs.map((d) => (
                          <Text key={d.id} style={styles.uploadedItem}>
                            • {d.nombreArchivo}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            Inyecta SOFOM · Contrato {data.contract.folio}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
