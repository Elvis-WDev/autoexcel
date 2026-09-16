import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError, type ErrorCode, type ErrorDetails } from '../../domain/errors.js';
import type { Logger } from '../logging/logger.js';
import { failure } from './envelope.js';
import { HTTP_STATUS_BY_ERROR_CODE } from './error-mapping.js';
import { getRequestId } from './request-context.js';

/** Error de body-parser de Express, que llega con `status` y `type` propios. */
interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return error instanceof Error && 'type' in error && typeof error.type === 'string';
}

interface Normalized {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
  /** Error original, solo para el log. Nunca sale al cliente. */
  internal?: unknown;
}

function normalize(error: unknown): Normalized {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      internal: error.cause ?? error,
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_FAILED',
      message: 'Revisa los datos enviados.',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return { code: 'PAYLOAD_TOO_LARGE', message: 'El contenido enviado es demasiado grande.' };
    }
    return {
      code: 'VALIDATION_FAILED',
      message: 'No pudimos leer el contenido enviado.',
      internal: error,
    };
  }

  // Todo lo demas se enmascara: ni mensaje original, ni stack, ni detalles.
  return {
    code: 'INTERNAL_ERROR',
    message: 'Algo salio mal de nuestro lado. Intentalo nuevamente.',
    internal: error,
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const normalized = normalize(error);
    const status = HTTP_STATUS_BY_ERROR_CODE[normalized.code];
    const requestId = getRequestId(request);

    const unexpected = status >= 500;

    const logContext = {
      requestId,
      method: request.method,
      path: request.path,
      status,
      code: normalized.code,
      error:
        normalized.internal instanceof Error
          ? { name: normalized.internal.name, message: normalized.internal.message }
          : normalized.internal,
      // El stack solo aporta cuando el fallo es nuestro. Un 404 o un 400 son
      // resultados esperados: guardar su traza solo ensucia el log.
      ...(unexpected && normalized.internal instanceof Error
        ? { stack: normalized.internal.stack }
        : {}),
    };

    if (unexpected) {
      logger.error('Peticion fallida', logContext);
    } else {
      logger.warn('Peticion rechazada', logContext);
    }

    response.status(status).json(
      failure(normalized.code, normalized.message, {
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  };
}

export function notFoundHandler(): RequestHandler {
  return (request, _response, next) => {
    next(AppError.notFound(`No existe la ruta ${request.method} ${request.path}.`));
  };
}
