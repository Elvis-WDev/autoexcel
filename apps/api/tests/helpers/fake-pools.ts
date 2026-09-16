import type pg from 'pg';
import type { DatabasePools } from '../../src/infrastructure/database/pool.js';

/** Pool falso: responde o falla segun se le indique, sin tocar la base de datos. */
function fakePool(healthy: boolean): pg.Pool {
  return {
    query: () =>
      healthy
        ? Promise.resolve({ rows: [{ '?column?': 1 }] })
        : Promise.reject(new Error('conexion rechazada')),
    end: () => Promise.resolve(),
    on: () => undefined,
  } as unknown as pg.Pool;
}

export function createFakePools(
  options: { control?: boolean; runtime?: boolean } = {},
): DatabasePools {
  return {
    control: fakePool(options.control ?? true),
    runtime: fakePool(options.runtime ?? true),
    close: () => Promise.resolve(),
  };
}
