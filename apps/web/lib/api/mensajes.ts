import { ApiError, type ErrorCode } from './errors';

/**
 * De un fallo a lo que lee la persona.
 *
 * La regla de fondo: **el backend ya escribio el mensaje**, en español y en
 * lenguaje de negocio, y ese texto gana. Aqui solo se decide que hacer cuando no
 * hay un texto util que mostrar.
 *
 * Las dos excepciones son deliberadas:
 *
 *   - `INTERNAL_ERROR`, porque el detalle de un fallo interno no le sirve a
 *     nadie y podria filtrar como esta hecho el sistema por dentro;
 *   - lo que no es un `ApiError` —red caida, respuesta ilegible—, que no trae
 *     mensaje ninguno.
 */
const GENERICO = 'Algo salio mal. Intentalo de nuevo.';

export function mensajeDeError(
  error: unknown,
  personalizados?: Partial<Record<ErrorCode, string>>,
): string {
  if (!(error instanceof ApiError)) {
    // `fetch` solo rechaza cuando la peticion no llego a completarse.
    return 'No pudimos conectar. Revisa tu conexion e intentalo de nuevo.';
  }

  const personalizado = personalizados?.[error.code];
  if (personalizado) return personalizado;

  if (error.code === 'INTERNAL_ERROR') return GENERICO;

  return error.message || GENERICO;
}

/**
 * Referencia para soporte, solo cuando soporte puede usarla.
 *
 * Un identificador de peticion junto a un error de validacion es ruido; junto a
 * un fallo interno es la unica forma de encontrar la traza en el servidor.
 */
export function referenciaDeSoporte(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.code !== 'INTERNAL_ERROR' && error.code !== 'SERVICE_UNAVAILABLE') return undefined;
  return error.requestId ?? undefined;
}
