/**
 * Los codigos de error del backend, tal cual los declara su dominio.
 *
 * La lista es cerrada a proposito: si el backend anade uno, el `switch` que lo
 * traduzca dejara de compilar aqui, que es justo lo que se quiere.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_FILE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Un fallo del backend, ya interpretado.
 *
 * `message` viene del servidor y **no se traduce**: el backend ya escribe en
 * lenguaje de negocio y en español. Traducirlo aqui seria mantener dos copias
 * del mismo texto, y acabarian diciendo cosas distintas. Lo que decide el
 * cliente es donde poner el mensaje, no cual es.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
  }

  /** Cuando la respuesta no trae un sobre de error reconocible. */
  static opaque(status: number): ApiError {
    return new ApiError({
      code: status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED',
      message: 'Algo salio mal. Intentalo de nuevo.',
      status,
    });
  }

  static fromEnvelope(body: unknown, status: number): ApiError {
    if (typeof body !== 'object' || body === null || !('error' in body)) {
      return ApiError.opaque(status);
    }

    const { error } = body;
    if (typeof error !== 'object' || error === null) return ApiError.opaque(status);

    const { code, message, details, requestId } = error as Record<string, unknown>;
    if (!isErrorCode(code) || typeof message !== 'string') return ApiError.opaque(status);

    return new ApiError({
      code,
      message,
      status,
      details,
      requestId: typeof requestId === 'string' ? requestId : null,
    });
  }
}
