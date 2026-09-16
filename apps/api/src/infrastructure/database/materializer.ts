import type pg from 'pg';
import type { DataPlaneMaterializer } from '../../application/ports/data-plane.js';
import type { Logger } from '../../application/ports/logger.js';
import type { PhysicalPlan } from '../../domain/blueprint/physical-plan.js';
import { AppError } from '../../domain/errors.js';
import { assertSafeIdentifier } from '../../domain/identifiers.js';
import {
  buildCreateSchemaStatements,
  buildDropSchemaStatement,
  buildGrantStatements,
} from './sql/ddl.js';

export interface MaterializerOptions {
  /** Rol que usara el CRUD generado. Recibe DML y nada mas. */
  runtimeRole: string;
  logger: Logger;
}

/**
 * Materializador del plano de datos (ADR 0001, RF-13).
 *
 * Crea el schema de un proyecto con tablas, claves foraneas e indices reales.
 *
 * Todo ocurre dentro de UNA transaccion. PostgreSQL soporta DDL transaccional, y
 * eso resuelve RNF-05 y RE-05 sin una linea de codigo compensatorio: si algo
 * falla a mitad, la base de datos queda exactamente como estaba y no hay ninguna
 * aplicacion a medio crear que alguien pueda confundir con una terminada.
 *
 * Usa el pool de CONTROL, que es el unico con permisos de DDL.
 */
export function createMaterializer(
  pool: pg.Pool,
  options: MaterializerOptions,
): DataPlaneMaterializer {
  // El rol sale de la URL de conexion, asi que se valida como cualquier otro
  // identificador antes de que llegue a una sentencia.
  const runtimeRole = assertSafeIdentifier(options.runtimeRole, 'rol de runtime');

  return {
    async dropSchema(schemaName: string): Promise<void> {
      const drop = buildDropSchemaStatement(schemaName);
      await pool.query(drop.text, drop.values);
      options.logger.info('Schema del plano de datos eliminado', { schemaName });
    },

    async createSchema(plan: PhysicalPlan): Promise<void> {
      const statements = [
        ...buildCreateSchemaStatements(plan),
        ...buildGrantStatements(plan, runtimeRole),
      ];

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        for (const item of statements) {
          await client.query(item.text, item.values);
        }

        await client.query('COMMIT');

        options.logger.info('Estructura creada', {
          schemaName: plan.schemaName,
          tables: plan.tables.length,
          statements: statements.length,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);

        throw AppError.internal(
          'No pudimos crear la estructura de tu aplicacion. No se guardo nada a medias.',
          error,
        );
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Extrae el nombre del rol de una URL de conexion.
 *
 * `postgres://app_runtime:pw@host/db` -> `app_runtime`
 */
export function roleFromConnectionString(url: string): string {
  try {
    const username = new URL(url).username;
    if (username.length === 0) throw new Error('sin usuario');
    return decodeURIComponent(username);
  } catch (error) {
    throw AppError.internal(
      'Configuracion de base de datos invalida.',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
