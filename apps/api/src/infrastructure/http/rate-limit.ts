import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../../domain/errors.js';
import { getActor } from './authenticated-request.js';

/**
 * Limitacion de tasa por persona y por operacion.
 *
 * Se implementa aqui en vez de anadir una dependencia por dos razones concretas:
 * el proceso es uno solo, asi que un contador en memoria es exactamente igual de
 * preciso que uno externo; y el rechazo tiene que salir con el mismo sobre de
 * error que todo lo demas, cosa que una libreria generica no hace.
 *
 * Limitacion conocida: al reiniciar el proceso los contadores se pierden, y con
 * varias instancias cada una llevaria los suyos. Para el MVP es aceptable; una
 * cuota compartida necesitaria Redis y un ADR.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Peticiones permitidas dentro de la ventana. */
  max: number;
  windowMs: number;
  /** Mensaje en lenguaje de negocio cuando se agota. */
  message: string;
  /** Etiqueta para separar contadores de operaciones distintas. */
  bucket: string;
}

/** Cada cuanto se barren las ventanas caducadas. */
const SWEEP_INTERVAL_MS = 60_000;

const windows = new Map<string, Window>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/** Vacia los contadores. Existe para que los tests no se contaminen entre si. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Limita por usuario autenticado.
 *
 * La clave es la persona, no la direccion IP: varias personas detras del mismo
 * router de oficina no tienen por que compartir cuota, y una sola persona con
 * varias direcciones no deberia multiplicarla.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);

    const key = `${options.bucket}:${getActor(request).id}`;
    const current = windows.get(key);

    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      const seconds = Math.ceil((current.resetAt - now) / 1000);
      response.setHeader('retry-after', String(seconds));

      next(new AppError('RATE_LIMITED', options.message, { details: { retryAfter: seconds } }));
      return;
    }

    current.count += 1;
    next();
  };
}
