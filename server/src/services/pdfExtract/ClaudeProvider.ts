/**
 * ClaudeProvider.ts — Provider real usando Claude Vision via @anthropic-ai/sdk.
 *
 * Estrategia:
 *   1. Construye un prompt específico por `tipo` que pide JSON con la
 *      forma del schema Zod correspondiente.
 *   2. Manda el archivo como `document` (PDF) o `image` content block.
 *   3. Parsea la respuesta como JSON. Si viene rodeada de texto, extrae
 *      el primer bloque {...} con regex y reintenta.
 *   4. Valida con Zod. Si falla, intenta reintentar 1 vez con un prompt
 *      más estricto. Si sigue fallando, devuelve ok=false con el raw.
 *
 * NOTA: este provider NO se ejercita en `npm test` — los tests usan el
 * MockProvider. Existe un script manual de smoke test en /__verify__/.
 */
import Anthropic from '@anthropic-ai/sdk';
import { childLogger } from '../../lib/logger';
import { computeConfidence, getSchemaForTipo } from './schemas';
import type { ExtractResult, IExtractProvider, TipoExtract } from './types';

const log = childLogger('claudeExtractProvider');

interface ClaudeProviderOpts {
  apiKey: string;
  model: string;
}

const PROMPTS: Record<TipoExtract, string> = {
  CSF: `Eres un extractor de datos de la Constancia de Situación Fiscal (CSF) del SAT mexicano.
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta. Todos los campos son opcionales — usa null cuando un dato no esté legible o no aparezca en el documento.

{
  "rfc": "string|null",
  "razonSocial": "string|null",
  "curp": "string|null",
  "regimenFiscal": "string|null (ej: '601 - General de Ley Personas Morales')",
  "codigoPostal": "string|null",
  "domicilioFiscal": "string|null",
  "fechaInicioOperaciones": "string|null (formato YYYY-MM-DD)",
  "estatusPadron": "string|null (ej: 'ACTIVO')"
}

NO agregues comentarios, NO uses markdown, NO escribas texto antes o después del JSON.`,
  INE: `Eres un extractor de datos de credenciales para votar (INE) de México. Trabaja sobre el ANVERSO.
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta. Usa null cuando un campo no sea legible.

{
  "nombre": "string|null",
  "apellidoPaterno": "string|null",
  "apellidoMaterno": "string|null",
  "curp": "string|null (18 caracteres)",
  "claveElector": "string|null",
  "fechaNacimiento": "string|null (YYYY-MM-DD)",
  "vigencia": "string|null (año o YYYY-MM-DD)",
  "domicilio": "string|null",
  "sexo": "H | M | null"
}

NO agregues comentarios, NO uses markdown, NO escribas texto antes o después del JSON.`,
  COMPROBANTE_DOMICILIO: `Eres un extractor de datos de un comprobante de domicilio mexicano (CFE, Telmex, agua, predial, etc.).
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta. Usa null cuando un campo no aparezca.

{
  "emisor": "string|null (ej: 'CFE', 'Telmex')",
  "titular": "string|null",
  "direccion": "string|null (calle + colonia + ciudad)",
  "codigoPostal": "string|null",
  "fechaEmision": "string|null (YYYY-MM-DD)",
  "periodo": "string|null (texto del periodo facturado)"
}

NO agregues comentarios ni markdown.`,
  FACTURA_BIEN: `Eres un extractor de datos de una factura CFDI 4.0 mexicana del bien arrendado (vehículo, maquinaria, equipo).
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta. Los montos son números (no strings con $).

{
  "proveedor": "string|null",
  "rfcProveedor": "string|null",
  "bienDescripcion": "string|null (descripción concatenada de los conceptos del bien principal)",
  "bienMarca": "string|null",
  "bienModelo": "string|null",
  "bienAnio": "number|null (4 dígitos)",
  "bienNumSerie": "string|null (NIV/VIN/serie)",
  "valorBienSinIVA": "number|null",
  "ivaTrasladado": "number|null",
  "valorBienConIVA": "number|null",
  "fechaFactura": "string|null (YYYY-MM-DD)",
  "folio": "string|null"
}

NO agregues comentarios ni markdown.`,
  ACTA_CONSTITUTIVA: `Eres un extractor de datos de un acta constitutiva mexicana de Persona Moral (SA de CV, S de RL, etc.).
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta. Usa null cuando un dato no aparezca con claridad.

{
  "razonSocial": "string|null",
  "fechaConstitucion": "string|null (YYYY-MM-DD)",
  "numeroEscritura": "string|null",
  "notario": "string|null",
  "numeroNotaria": "string|null",
  "ciudadNotaria": "string|null",
  "capitalSocial": "number|null",
  "duracion": "string|null (ej: '99 años')",
  "objetoSocial": "string|null (resumen breve)",
  "representanteLegal": "string|null"
}

NO agregues comentarios ni markdown.`,
  SOLICITUD: `Eres un extractor de datos de una SOLICITUD DE ARRENDAMIENTO mexicana (PFAE o Persona Moral) para Inyecta SOFOM.
El documento contiene TODO el expediente de alta en un solo formulario, cruzando datos del cliente, representante legal, cónyuge, perfil transaccional, PEP, referencias y obligados solidarios.

REGLAS DE EXTRACCIÓN:
1. Devuelve EXCLUSIVAMENTE un objeto JSON con la forma documentada abajo. NO incluyas texto, comentarios, ni markdown.
2. Usa null cuando un campo no aparezca o no sea legible. NO inventes datos.
3. Para booleanos: si hay checkbox/casilla marcada → true; si está en blanco → false; si no aparece → null.
4. Los montos son números (sin $ ni comas). Los porcentajes son números (0.05 para 5%).
5. Fechas en formato YYYY-MM-DD siempre. Si solo aparece "marzo 2024" → "2024-03-01".
6. RFC siempre en mayúsculas, sin espacios. CURP siempre 18 caracteres en mayúsculas.
7. Si el solicitante es PM (Persona Moral): llena "solicitantePM", deja "solicitantePFAE" en null, llena también "representanteLegal".
8. Si el solicitante es PFAE (Persona Física con Actividad Empresarial): llena "solicitantePFAE", deja "solicitantePM" y "representanteLegal" en null. Llena "conyuge" solo si está casado bajo sociedad conyugal y aparece la info; en todos los demás casos → null.
9. Los arrays (referenciasBancarias, referenciasComerciales, obligadosSolidarios): incluye SOLO los elementos que aparecen en la solicitud. Si no hay ninguno, devuelve [] (array vacío) o null. No rellenes con null.
10. En obligadosSolidarios[].tipo: PFAE si es PF con actividad empresarial, PF si es persona física sin actividad empresarial (asalariado), PM si es persona moral.

FORMA EXACTA DEL JSON:
{
  "tipoSolicitante": "PFAE | PM | null",
  "operacion": {
    "tipoArrendamiento": "PURO | FINANCIERO | null",
    "plazoMeses": "number|null",
    "moneda": "string|null (MXN / USD)",
    "destino": "string|null (uso del bien)"
  } | null,
  "bien": {
    "descripcion": "string|null",
    "marca": "string|null",
    "modelo": "string|null",
    "anio": "number|null",
    "numSerie": "string|null",
    "color": "string|null",
    "valorConIVA": "number|null",
    "nuevo": "boolean|null",
    "proveedor": "string|null",
    "rfcProveedor": "string|null"
  } | null,
  "solicitantePFAE": {
    "nombre": "string|null",
    "apellidoPaterno": "string|null",
    "apellidoMaterno": "string|null",
    "rfc": "string|null",
    "curp": "string|null",
    "fechaNacimiento": "string|null (YYYY-MM-DD)",
    "lugarNacimiento": "string|null",
    "nacionalidad": "string|null",
    "sexo": "H | M | null",
    "estadoCivil": "string|null",
    "regimenMatrimonial": "string|null",
    "email": "string|null",
    "telefono": "string|null",
    "celular": "string|null",
    "actividad": "string|null",
    "giro": "string|null",
    "antiguedadNegocio": "string|null",
    "ingresoMensual": "number|null",
    "calle": "string|null", "numExterior": "string|null", "numInterior": "string|null",
    "colonia": "string|null", "municipio": "string|null", "ciudad": "string|null",
    "estado": "string|null", "codigoPostal": "string|null", "pais": "string|null",
    "tipoInmueble": "string|null", "antiguedadDomicilio": "string|null"
  } | null,
  "solicitantePM": {
    "razonSocial": "string|null",
    "rfc": "string|null",
    "fechaConstitucion": "string|null (YYYY-MM-DD)",
    "giro": "string|null",
    "actividad": "string|null",
    "sector": "string|null",
    "numeroEscritura": "string|null",
    "numeroNotaria": "string|null",
    "notario": "string|null",
    "ciudadNotaria": "string|null",
    "capitalSocial": "number|null",
    "email": "string|null",
    "telefono": "string|null",
    "ingresosAnuales": "number|null",
    "numEmpleados": "number|null",
    "calle": "string|null", "numExterior": "string|null", "numInterior": "string|null",
    "colonia": "string|null", "municipio": "string|null", "ciudad": "string|null",
    "estado": "string|null", "codigoPostal": "string|null", "pais": "string|null",
    "tipoInmueble": "string|null", "antiguedadDomicilio": "string|null"
  } | null,
  "representanteLegal": {
    "nombre": "string|null", "apellidoPaterno": "string|null", "apellidoMaterno": "string|null",
    "rfc": "string|null", "curp": "string|null", "cargo": "string|null",
    "email": "string|null", "telefono": "string|null",
    "numeroEscrituraPoder": "string|null", "fechaEscrituraPoder": "string|null",
    "numeroNotariaPoder": "string|null", "notarioPoder": "string|null"
  } | null,
  "conyuge": {
    "nombre": "string|null", "apellidoPaterno": "string|null", "apellidoMaterno": "string|null",
    "rfc": "string|null", "curp": "string|null", "ocupacion": "string|null", "telefono": "string|null"
  } | null,
  "perfilTransaccional": {
    "montoMensualOperaciones": "number|null",
    "numeroOperacionesMensuales": "number|null",
    "origenRecursos": "string|null",
    "destinoRecursos": "string|null",
    "operaComercioExterior": "boolean|null",
    "paisesComercioExterior": "string|null",
    "realizaDivisas": "boolean|null",
    "realizaTransferenciasInternacionales": "boolean|null"
  } | null,
  "pep": {
    "esPEP": "boolean|null",
    "cargoPEP": "string|null",
    "periodoPEP": "string|null",
    "familiarPEP": "boolean|null",
    "nombreFamiliarPEP": "string|null",
    "parentescoPEP": "string|null",
    "cargoFamiliarPEP": "string|null"
  } | null,
  "referenciasBancarias": [
    { "banco": "string|null", "tipoCuenta": "string|null", "numeroCuenta": "string|null", "antiguedad": "string|null" }
  ] | null,
  "referenciasComerciales": [
    { "nombre": "string|null", "giro": "string|null", "telefono": "string|null", "email": "string|null", "antiguedad": "string|null", "lineaCredito": "number|null" }
  ] | null,
  "obligadosSolidarios": [
    {
      "tipo": "PFAE | PM | PF | null",
      "nombre": "string|null", "apellidoPaterno": "string|null", "apellidoMaterno": "string|null",
      "razonSocial": "string|null",
      "rfc": "string|null", "curp": "string|null",
      "fechaNacimiento": "string|null",
      "email": "string|null", "telefono": "string|null",
      "relacion": "string|null",
      "ingresoMensual": "number|null", "ocupacion": "string|null"
    }
  ] | null
}

NO agregues comentarios ni markdown. Empieza DIRECTAMENTE con { y termina con }.`,
};

/** Intenta extraer un objeto JSON del texto. Acepta JSON puro o JSON envuelto en markdown/texto. */
function tryParseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.trim();
  // Caso 1: JSON puro.
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  }
  // Caso 2: bloque ```json {...} ```.
  const fenced = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fallthrough */ }
  }
  // Caso 3: extrae el primer {...} balanceado-por-conteo.
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return null; }
      }
    }
  }
  return null;
}

export class ClaudeProvider implements IExtractProvider {
  readonly name = 'CLAUDE' as const;
  private client: Anthropic;
  private model: string;

  constructor(opts: ClaudeProviderOpts) {
    if (!opts.apiKey) {
      throw new Error('ClaudeProvider requiere ANTHROPIC_API_KEY');
    }
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model || 'claude-sonnet-4-5-20250929';
  }

  async extract(file: Buffer, mimeType: string, tipo: TipoExtract): Promise<ExtractResult> {
    const prompt = PROMPTS[tipo];
    if (!prompt) {
      return {
        ok: false, data: {}, confidence: 0, provider: 'CLAUDE',
        error: `Tipo no soportado: ${tipo}`,
      };
    }

    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');
    if (!isPdf && !isImage) {
      return {
        ok: false, data: {}, confidence: 0, provider: 'CLAUDE',
        error: `Mimetype no soportado por Claude Vision: ${mimeType}`,
      };
    }

    const base64 = file.toString('base64');
    // Claude SDK acepta document (PDF) o image como content blocks.
    const documentBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: base64,
          },
        };

    let raw = '';
    let parsed: Record<string, unknown> | null = null;
    let intentos = 0;
    const maxIntentos = 2;

    while (intentos < maxIntentos && !parsed) {
      intentos++;
      try {
        const reinforced = intentos === 1 ? prompt :
          prompt + '\n\nIMPORTANTE: tu respuesta anterior no fue JSON válido. Devuelve SOLO el objeto JSON, sin texto previo, sin markdown, sin comentarios.';

        // SOLICITUD tiene ~13 secciones anidadas + 3 arrays de longitud
        // variable — el JSON puede pasar de 1K tokens fácilmente. Los demás
        // tipos son planos con ≤12 campos y con 1024 sobra.
        const maxTokens = tipo === 'SOLICITUD' ? 4096 : 1024;

        const resp = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'user',
              content: [
                documentBlock,
                { type: 'text', text: reinforced },
              ],
            },
          ],
        });

        // El SDK devuelve `content` como array de bloques. Concatenamos los text blocks.
        raw = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        parsed = tryParseJson(raw);
      } catch (err) {
        log.error({ err, intento: intentos }, 'Claude extract API error');
        return {
          ok: false, data: {}, confidence: 0, provider: 'CLAUDE',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (!parsed) {
      return {
        ok: false, data: {}, confidence: 0, provider: 'CLAUDE',
        error: 'No se pudo parsear JSON tras 2 intentos',
        raw,
      };
    }

    // Validación con Zod.
    const schema = getSchemaForTipo(tipo);
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      // Devolvemos lo que sí venga, marcado con confidence baja.
      const conf = computeConfidence(tipo, parsed) * 0.5; // penaliza por no validar.
      return {
        ok: true,                                          // hay datos extraídos, aunque imperfectos
        data: parsed,
        confidence: Math.max(0.2, conf),
        provider: 'CLAUDE',
        raw,
        error: `Schema validation failed: ${validated.error.errors.map(e => e.path.join('.') + ':' + e.message).join('; ')}`,
      };
    }

    const data = validated.data as Record<string, unknown>;
    const confidence = computeConfidence(tipo, data);
    return { ok: true, data, confidence, provider: 'CLAUDE' };
  }
}
