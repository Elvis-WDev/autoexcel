import { Router } from 'express';
import { checkConnection, type DatabasePools } from '../../database/pool.js';
import { failure, success } from '../envelope.js';
import { getRequestId } from '../request-context.js';

export interface HealthDependencies {
  pools: DatabasePools;
  version: string;
  /** Inyectable para que los tests no dependan del reloj real. */
  now?: () => number;
  startedAt?: number;
}

/**
 * `GET /health` — sonda de vida usada por el contenedor y por despliegue.
 *
 * Verifica los dos pools por separado: el proceso puede arrancar con el rol
 * duenno sano y el de runtime mal configurado, y eso debe verse.
 *
 * Es publico a proposito (el healthcheck de Docker no autentica). Solo revela
 * si cada comprobacion pasa; ni host, ni credenciales, ni version de motor.
 */
export function createHealthRouter(dependencies: HealthDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => Date.now());
  const startedAt = dependencies.startedAt ?? now();

  router.get('/health', async (request, response) => {
    const [control, runtime] = await Promise.all([
      checkConnection(dependencies.pools.control),
      checkConnection(dependencies.pools.runtime),
    ]);

    const checks = {
      control: control ? ('up' as const) : ('down' as const),
      runtime: runtime ? ('up' as const) : ('down' as const),
    };

    const healthy = control && runtime;
    const body = {
      status: healthy ? ('ok' as const) : ('degraded' as const),
      version: dependencies.version,
      uptimeSeconds: Math.floor((now() - startedAt) / 1000),
      checks,
    };

    if (healthy) {
      response.status(200).json(success(body));
      return;
    }

    const requestId = getRequestId(request);
    response.status(503).json(
      failure('SERVICE_UNAVAILABLE', 'El servicio no esta disponible en este momento.', {
        details: body,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

  return router;
}
