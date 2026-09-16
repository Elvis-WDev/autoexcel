import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { AppError } from '../../../domain/errors.js';
import { proposalSchema } from '../prompt.js';
import type { OpcionesDeProveedor, ProveedorDeInferencia } from './tipos.js';

/** Sobreescribible por entorno: los nombres de modelo caducan. */
export const MODELO_OPENAI = 'gpt-5.5';

/**
 * OpenAI, por la API de respuestas.
 *
 * Las instrucciones van en `instructions` y no como un mensaje mas: es el sitio
 * que la API reserva para el prefijo de sistema. **No hay cacheado explicito
 * como el de Anthropic**, asi que el mismo analisis cuesta mas aqui. Se dice en
 * vez de fingir que los tres proveedores son intercambiables tambien en precio.
 *
 * `responses.parse` con `zodTextFormat` pide el JSON en modo estricto y lo
 * valida contra el mismo esquema que usan los otros dos. La garantia final
 * sigue siendo el validador del dominio.
 */
export function crearProveedorOpenAI(opciones: OpcionesDeProveedor): ProveedorDeInferencia {
  const client = new OpenAI({
    apiKey: opciones.apiKey,
    ...(opciones.fetch ? { fetch: opciones.fetch } : {}),
  });

  return {
    nombre: 'openai',
    modelo: opciones.modelo,

    async pedir(instrucciones, mensaje) {
      const response = await client.responses
        .parse({
          model: opciones.modelo,
          instructions: instrucciones,
          input: mensaje,
          text: { format: zodTextFormat(proposalSchema, 'propuesta') },
        })
        .catch((error: unknown) => {
          throw traducir(error);
        });

      const propuesta = response.output_parsed;
      if (!propuesta) {
        throw AppError.unavailable(
          'El analisis automatico devolvio una respuesta que no pudimos leer.',
        );
      }

      const usage = response.usage;

      return {
        propuesta,
        consumo: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
        },
      };
    },
  };
}

/** Igual que en los otros dos: todo fallo externo es SERVICE_UNAVAILABLE. */
function traducir(error: unknown): AppError {
  if (error instanceof OpenAI.RateLimitError) {
    return AppError.unavailable('El analisis automatico esta saturado ahora mismo.', error);
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return AppError.unavailable('El analisis automatico no esta configurado correctamente.', error);
  }
  return AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', error);
}
