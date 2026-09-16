import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Normaliza la direccion del cliente antes de que nadie la crea.
 *
 * `x-forwarded-for` lo escribe quien envia la peticion. Sin un proxy de
 * confianza delante, lo que diga es una **afirmacion suya**, no un dato, y
 * tratarla como dato es exactamente lo que rompe cualquier limite por IP: basta
 * con cambiarla en cada intento para estrenar contador.
 *
 * Reglas, en este orden:
 *
 *   1. Sin proxies de confianza configurados, la cabecera se **sustituye** por
 *      la direccion del socket. No se completa ni se anade: se tira lo que vino.
 *   2. Con proxies configurados, se deja intacta para que Better Auth la
 *      recorra con esa misma lista y descarte los saltos de confianza.
 *
 * Lo que esto **no** arregla, y conviene tenerlo escrito: detras del proxy de
 * Next la direccion del socket es siempre la de Next. Medido: Next reenvia
 * `x-forwarded-host` pero **no** `x-forwarded-for`, asi que la API no puede
 * conocer la direccion de la persona. Por eso el limite de intentos de acceso no
 * se apoya en la IP, sino en la cuenta; ver `login-throttle.ts`.
 */
export function normalizeClientAddress(trustedProxies: readonly string[]): RequestHandler {
  const confiaEnAlguien = trustedProxies.length > 0;

  return (request: Request, _response: Response, next: NextFunction): void => {
    if (confiaEnAlguien) {
      next();
      return;
    }

    const socket = request.socket.remoteAddress;

    if (socket) {
      request.headers['x-forwarded-for'] = socket;
    } else {
      delete request.headers['x-forwarded-for'];
    }

    next();
  };
}
