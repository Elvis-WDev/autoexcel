import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { AppError } from '../../../domain/errors.js';
import { proposalSchema, type RawProposal } from '../prompt.js';
import type { OpcionesDeProveedor, ProveedorDeInferencia } from './tipos.js';

/** Sobreescribible por entorno. Alias estable: no caduca con cada version. */
export const MODELO_GEMINI = 'gemini-pro-latest';

/**
 * El esquema, en el dialecto que Gemini acepta.
 *
 * Es el unico punto donde los tres proveedores no son intercambiables: Anthropic
 * y OpenAI reciben el esquema de Zod tal cual, Gemini quiere JSON Schema y solo
 * admite un subconjunto acotado de sus propiedades.
 *
 * Dos diferencias medidas —no supuestas— sobre lo que produce `z.toJSONSchema`:
 *
 *   - **`type` como lista.** `z.string().nullable()` sale como
 *     `{"type": ["string", "null"]}`. La lista de propiedades soportadas de
 *     Gemini incluye `type` y `anyOf`, pero no dice que `type` admita varias, y
 *     `anyOf` es la forma que la propia documentacion usa para lo nullable. Se
 *     reescribe. Curiosidad util: los numericos ya salen como `anyOf` por su
 *     cuenta, porque llevan minimo y maximo, asi que esto solo afecta a dos
 *     campos y por eso es facil que pasara inadvertido.
 *   - **`$schema`.** No esta en la lista. Se quita.
 */
export function aEsquemaDeGemini(esquema: z.ZodType): unknown {
  const convertido = z.toJSONSchema(esquema) as Record<string, unknown>;
  delete convertido['$schema'];
  return normalizar(convertido);
}

function normalizar(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(normalizar);
  if (!nodo || typeof nodo !== 'object') return nodo;

  const entrada = nodo as Record<string, unknown>;
  const salida: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(entrada)) {
    if (clave === 'type' && Array.isArray(valor)) {
      // El resto de la definicion acompana a la rama que no es nula: decir
      // `enum` o `minimum` junto a `"null"` no significaria nada.
      const { type: _descartado, description, ...resto } = entrada;
      salida['anyOf'] = (valor as unknown[]).map((tipo) =>
        tipo === 'null' ? { type: 'null' } : normalizar({ type: tipo, ...resto }),
      );
      // La descripcion queda fuera de la union: describe el campo, no una rama.
      if (typeof description === 'string') salida['description'] = description;
      continue;
    }

    if (clave === 'description' && salida['anyOf']) continue;
    if (salida['anyOf'] && clave !== 'description') continue;

    salida[clave] = normalizar(valor);
  }

  return salida;
}

/**
 * Google Gemini.
 *
 * Las instrucciones van en `systemInstruction`. **No hay cacheado de prefijo
 * implicito como el de Anthropic**, asi que el mismo analisis cuesta mas aqui.
 *
 * La respuesta llega como texto JSON y se valida contra el mismo esquema Zod
 * que usan los otros dos: el SDK no trae un `parse` tipado equivalente, asi que
 * la validacion se hace aqui de forma explicita. El resultado es el mismo
 * `RawProposal`, y a partir de ahi el camino es identico para los tres.
 */
export function crearProveedorGemini(opciones: OpcionesDeProveedor): ProveedorDeInferencia {
  /**
   * A diferencia de los otros dos, **este SDK no admite un transporte propio**:
   * `GoogleGenAIOptions` no tiene `fetch` y `HttpOptions` tampoco. Usa el
   * `fetch` global. Por eso `opciones.fetch` se ignora aqui de forma explicita
   * —ignorarlo en silencio seria peor— y su prueba sustituye el global.
   */
  const client = new GoogleGenAI({ apiKey: opciones.apiKey });

  return {
    nombre: 'gemini',
    modelo: opciones.modelo,

    async pedir(instrucciones, mensaje) {
      const response = await client.models
        .generateContent({
          model: opciones.modelo,
          contents: mensaje,
          config: {
            systemInstruction: instrucciones,
            responseMimeType: 'application/json',
            responseJsonSchema: aEsquemaDeGemini(proposalSchema),
          },
        })
        .catch((error: unknown) => {
          throw traducir(error);
        });

      const texto = response.text;
      if (!texto) {
        throw AppError.unavailable(
          'El analisis automatico devolvio una respuesta que no pudimos leer.',
        );
      }

      const propuesta = leer(texto);
      const uso = response.usageMetadata;

      return {
        propuesta,
        consumo: {
          inputTokens: uso?.promptTokenCount ?? 0,
          outputTokens: uso?.candidatesTokenCount ?? 0,
          cachedInputTokens: uso?.cachedContentTokenCount ?? 0,
        },
      };
    },
  };
}

function leer(texto: string): RawProposal {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw AppError.unavailable('El analisis automatico devolvio algo que no era JSON.');
  }

  const resultado = proposalSchema.safeParse(crudo);
  if (!resultado.success) {
    throw AppError.unavailable(
      'El analisis automatico devolvio una respuesta que no pudimos leer.',
      resultado.error,
    );
  }

  return resultado.data;
}

/** Igual que en los otros dos: todo fallo externo es SERVICE_UNAVAILABLE. */
function traducir(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const mensaje = error instanceof Error ? error.message : '';
  if (/429|quota|rate/i.test(mensaje)) {
    return AppError.unavailable('El analisis automatico esta saturado ahora mismo.', error);
  }
  if (/401|403|API key/i.test(mensaje)) {
    return AppError.unavailable('El analisis automatico no esta configurado correctamente.', error);
  }
  return AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', error);
}
