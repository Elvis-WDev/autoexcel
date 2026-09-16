import type { ErrorCode, ErrorDetails } from '../../domain/errors.js';

/**
 * Sobres de respuesta, segun `docs/architecture/backend.md`.
 *
 *   exito  { data, meta? }
 *   error  { error: { code, message, details? } }
 *
 * No hay una tercera forma. Todo endpoint responde con una de estas dos.
 */

export interface SuccessEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    requestId?: string;
  };
}

export function success<T>(data: T, meta?: Record<string, unknown>): SuccessEnvelope<T> {
  return meta === undefined ? { data } : { data, meta };
}

export function failure(
  code: ErrorCode,
  message: string,
  options: { details?: ErrorDetails; requestId?: string } = {},
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    },
  };
}
