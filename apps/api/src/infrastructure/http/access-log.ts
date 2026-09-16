import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '../../application/ports/logger.js';
import { getRequestId } from './request-context.js';

/** Peticiones que no merecen una linea de log en cada latido. */
const QUIET_PATHS = new Set(['/health']);

/**
 * Registro de peticiones.
 *
 * El plan pide correlacion por `requestId` y `projectId`: sin ella, diagnosticar
 * una importacion que fallo obliga a adivinar que lineas del log pertenecen a la
 * misma peticion.
 *
 * El `projectId` se extrae de la ruta y no del cuerpo, que a estas alturas ya
 * podria estar consumido. Nunca se registran valores de negocio: ni el cuerpo,
 * ni la cadena de busqueda, ni los nombres de los archivos.
 */
export function accessLog(logger: Logger): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (QUIET_PATHS.has(request.originalUrl)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info('Peticion atendida', {
        requestId: getRequestId(request),
        method: request.method,
        // La ruta con marcadores, no la concreta: asi las lineas se agrupan por
        // operacion en vez de generar una serie distinta por proyecto.
        route: routeOf(request),
        projectId: projectIdFrom(request.originalUrl),
        status: response.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  };
}

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * La ruta con marcadores (`/api/projects/:id/app`), no la concreta.
 *
 * Asi las lineas se agrupan por operacion en vez de generar una serie distinta
 * por proyecto, que es lo que hace inservible un panel de metricas.
 *
 * Se normaliza `originalUrl`, que es la unica fuente estable. Ni `request.route`
 * ni `request.path` sirven: Express reescribe la URL dentro de un router montado
 * y restablece `baseUrl` al salir de el, asi que la misma operacion se
 * registraba como `/projects` al atenderse y como `/api/projects/:id/file` al
 * rechazarse. Dos series para lo mismo hacen inservible un panel de metricas.
 */
function routeOf(request: Request): string {
  const [path] = request.originalUrl.split('?');
  return (path ?? '/').replace(UUID_SEGMENT, '/:id');
}

const PROJECT_IN_PATH = /\/projects\/([0-9a-f-]{36})/i;

function projectIdFrom(path: string): string | undefined {
  return PROJECT_IN_PATH.exec(path)?.[1];
}
