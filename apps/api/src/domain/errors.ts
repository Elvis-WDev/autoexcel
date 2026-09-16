/**
 * Errores de dominio.
 *
 * Este modulo no conoce HTTP, ni Express, ni codigos de estado: la traduccion a
 * estado HTTP vive en `infrastructure/http/error-mapping.ts`. Es la frontera que
 * exige `docs/architecture/backend.md` ("Domain must not depend on frameworks").
 *
 * Contrato de exposicion: el `message` de un AppError esta escrito para que lo
 * lea una persona usuaria y puede salir al cliente. Cualquier otro error se
 * enmascara como INTERNAL_ERROR. Ver RX-03: nada de SQL ni de jerga tecnica.
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

export type ErrorDetails = Record<string, unknown> | unknown[];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetails; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
  }

  static validation(message: string, details?: ErrorDetails): AppError {
    return new AppError('VALIDATION_FAILED', message, { details });
  }

  static unauthenticated(message = 'Necesitas iniciar sesion para continuar.'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }

  static forbidden(message = 'No tienes acceso a este recurso.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'No encontramos lo que buscabas.'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string, details?: ErrorDetails): AppError {
    return new AppError('CONFLICT', message, { details });
  }

  /** Transicion de estado no permitida por la maquina de estados de ERS 20. */
  static invalidState(message: string, details?: ErrorDetails): AppError {
    return new AppError('INVALID_STATE', message, { details });
  }

  static unavailable(message: string, cause?: unknown): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message, { cause });
  }

  static internal(message = 'Algo salio mal de nuestro lado.', cause?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', message, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
