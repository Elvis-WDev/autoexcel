import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AppError } from '../../../domain/errors.js';
import { proposalSchema } from '../prompt.js';
import type { OpcionesDeProveedor, ProveedorDeInferencia } from './tipos.js';

/** Sobreescribible por entorno: los nombres de modelo caducan. */
export const MODELO_ANTHROPIC = 'claude-opus-5';
const MAX_TOKENS = 16_000;

/**
 * Anthropic.
 *
 * Es el unico de los tres que puede cachear el prefijo de instrucciones: son
 * identicas en cada peticion, asi que a partir de la segunda se cobran a una
 * fraccion. Los otros dos no tienen equivalente y su coste por analisis es
 * mayor; se dice aqui en vez de fingir que los tres cuestan lo mismo.
 */
export function crearProveedorAnthropic(opciones: OpcionesDeProveedor): ProveedorDeInferencia {
  const client = new Anthropic({
    apiKey: opciones.apiKey,
    ...(opciones.fetch ? { fetch: opciones.fetch } : {}),
  });

  return {
    nombre: 'anthropic',
    modelo: opciones.modelo,

    async pedir(instrucciones, mensaje) {
      const response = await client.messages
        .parse({
          model: opciones.modelo,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'high',
            format: zodOutputFormat(proposalSchema),
          },
          system: [
            {
              type: 'text',
              text: instrucciones,
              // Prefijo estable: el perfil del archivo va despues, en el mensaje.
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: mensaje }],
        })
        .catch((error: unknown) => {
          throw traducir(error);
        });

      if (response.stop_reason === 'refusal') {
        throw AppError.unavailable(
          'No pudimos analizar este archivo automaticamente. Puedes continuar con una estructura simple.',
        );
      }

      const propuesta = response.parsed_output;
      if (!propuesta) {
        throw AppError.unavailable(
          'El analisis automatico devolvio una respuesta que no pudimos leer.',
        );
      }

      return {
        propuesta,
        consumo: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

/**
 * Cualquier fallo del proveedor se traduce a SERVICE_UNAVAILABLE, que es la
 * senal que hace pasar al proveedor siguiente y, si no queda ninguno, caer al
 * camino determinista de RE-04. El analisis nunca deja el proyecto bloqueado
 * por un problema externo.
 */
function traducir(error: unknown): AppError {
  if (error instanceof Anthropic.RateLimitError) {
    return AppError.unavailable('El analisis automatico esta saturado ahora mismo.', error);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return AppError.unavailable('El analisis automatico no esta configurado correctamente.', error);
  }
  return AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', error);
}
