import pg from 'pg';
import type { Env } from '../../config/env.js';
import { configureTypeParsers } from './type-parsers.js';

const { Pool } = pg;

/**
 * Los dos planos del ADR 0001, cada uno con su propio rol de base de datos.
 *
 *   control  rol duenno. DDL sobre `public` (Prisma) y sobre `proj_*`
 *            (materializador, F5).
 *   runtime  rol sin permisos de creacion. CRUD generico de las aplicaciones
 *            generadas (F7). Un fallo aqui no puede alterar estructura.
 */
export interface DatabasePools {
  readonly control: pg.Pool;
  readonly runtime: pg.Pool;
  close(): Promise<void>;
}

export function createPools(env: Env): DatabasePools {
  // Antes de abrir ninguna conexion: los parsers son globales del driver.
  configureTypeParsers();

  const shared = {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'excel-to-software',
  } satisfies pg.PoolConfig;

  const control = new Pool({ ...shared, connectionString: env.DATABASE_URL });
  const runtime = new Pool({ ...shared, connectionString: env.DATABASE_URL_RUNTIME });

  // Un error en un cliente inactivo no debe tumbar el proceso.
  control.on('error', () => undefined);
  runtime.on('error', () => undefined);

  return {
    control,
    runtime,
    async close(): Promise<void> {
      await Promise.allSettled([control.end(), runtime.end()]);
    },
  };
}

/**
 * Comprueba que el pool responde. Acota con un temporizador propio porque
 * `connectionTimeoutMillis` solo cubre la fase de conexion, no la consulta.
 */
export async function checkConnection(pool: pg.Pool, timeoutMs = 2_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`La base de datos no respondio en ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
