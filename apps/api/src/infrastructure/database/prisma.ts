import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';
import { PrismaClient } from './generated/client.js';

export type { PrismaClient };

/**
 * Cliente de Prisma sobre el pool de CONTROL.
 *
 * Prisma 7 se conecta mediante driver adapter, asi que reutiliza el mismo pool
 * de `pg` que ya creamos en vez de abrir uno propio. Una sola fuente de
 * conexiones, un solo sitio donde ajustar limites.
 *
 * Este cliente solo conoce el schema `public`. El plano de datos (`proj_*`) no
 * pasa por aqui: ADR 0001.
 */
export function createPrismaClient(pool: pg.Pool): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}
