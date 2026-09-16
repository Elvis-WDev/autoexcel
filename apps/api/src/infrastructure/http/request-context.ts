import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Identificador de peticion, para correlacionar log y respuesta de error.
 *
 * Se guarda en un WeakMap en vez de en `res.locals` para no depender de un
 * `Record<string, any>` y mantener el tipado estricto.
 */
const requestIds = new WeakMap<Request, string>();

export function getRequestId(request: Request): string | undefined {
  return requestIds.get(request);
}

export function requestContext(): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const incoming = request.get('x-request-id');
    const requestId = incoming !== undefined && incoming.length <= 128 ? incoming : randomUUID();

    requestIds.set(request, requestId);
    response.setHeader('x-request-id', requestId);
    next();
  };
}
