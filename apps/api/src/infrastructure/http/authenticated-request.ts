import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser, SessionReader } from '../../application/ports/session.js';
import { AppError } from '../../domain/errors.js';

/**
 * Identidad de la peticion. Igual que con `requestId`, se guarda fuera del
 * objeto de Express para no depender de un `Record<string, any>`.
 */
const actors = new WeakMap<Request, AuthenticatedUser>();

/**
 * Devuelve el usuario autenticado. Lanza si se llama en una ruta que no pasa por
 * `requireAuth`: es un error de programacion, no una situacion del usuario.
 */
export function getActor(request: Request): AuthenticatedUser {
  const actor = actors.get(request);

  if (!actor) {
    throw AppError.internal(
      'Algo salio mal de nuestro lado.',
      new Error('getActor() en una ruta sin requireAuth()'),
    );
  }

  return actor;
}

/** Exige sesion valida. Toda ruta de proyectos pasa por aqui. */
export function requireAuth(sessions: SessionReader): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await sessions.getUser(fromNodeHeaders(request.headers));

      if (!user) {
        next(AppError.unauthenticated());
        return;
      }

      actors.set(request, user);
      next();
    } catch (error) {
      next(error);
    }
  };
}
