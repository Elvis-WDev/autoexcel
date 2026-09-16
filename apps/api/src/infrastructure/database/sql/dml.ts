import { SYSTEM_COLUMNS } from '../../../domain/blueprint/physical-plan.js';
import { ident, qualified, statement, type Statement } from './builder.js';

/**
 * Sentencias de datos.
 *
 * Misma regla que el DDL: los identificadores vienen ya generados y validados, y
 * aqui solo se componen. Los VALORES no se componen nunca: van como parametros
 * `$1..$n`, sin excepcion. Es lo que hace que un cliente llamado
 * `'); DROP TABLE x; --` sea simplemente un cliente con un nombre raro.
 */

/**
 * Tope de parametros por sentencia.
 *
 * PostgreSQL admite 65535; se deja margen porque a las columnas de datos se les
 * suman las de sistema. El tamano del lote se calcula a partir de aqui: con
 * pocas columnas caben mas filas.
 */
const MAX_PARAMETERS = 60_000;

/** Filas por lote, segun cuantas columnas tenga la tabla. */
export function batchSize(columnCount: number): number {
  if (columnCount <= 0) return 1;
  return Math.max(1, Math.min(1000, Math.floor(MAX_PARAMETERS / columnCount)));
}

export interface InsertOptions {
  schemaName: string;
  tableName: string;
  /** Columnas de datos, en el mismo orden que los valores de cada fila. */
  columns: string[];
  /** Cada fila, ya coercionada. */
  rows: unknown[][];
  /** `true` si la tabla tiene indice unico de deduplicacion. */
  deduplicated: boolean;
}

/**
 * Insercion por lotes.
 *
 * `ON CONFLICT DO NOTHING` sobre la clave de deduplicacion es, literalmente,
 * RF-20: tres filas con "ACME" producen un registro. La aplicacion ademas
 * deduplica en memoria antes de llegar aqui, asi que esto es la red de
 * seguridad, no el mecanismo principal.
 */
export function buildInsertStatement(options: InsertOptions): Statement {
  const target = qualified(options.schemaName, options.tableName);
  const columns = options.columns.map(ident).join(', ');

  const values: unknown[] = [];
  const tuples = options.rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const conflict = options.deduplicated
    ? ` ON CONFLICT (${ident(SYSTEM_COLUMNS.dedupeKey)}) DO NOTHING`
    : '';

  return statement(
    `INSERT INTO ${target} (${columns}) VALUES ${tuples.join(', ')}${conflict}`,
    values,
  );
}

/**
 * Lee las claves de deduplicacion ya insertadas.
 *
 * Es lo que construye el indice `clave -> id` con el que la segunda pasada
 * resuelve las relaciones (RF-19). Se consulta despues de insertar en vez de
 * usar `RETURNING` porque `ON CONFLICT DO NOTHING` no devuelve las filas que ya
 * existian, y hacen falta todas.
 */
export function buildDedupeLookupStatement(schemaName: string, tableName: string): Statement {
  return statement(
    `SELECT ${ident(SYSTEM_COLUMNS.id)}, ${ident(SYSTEM_COLUMNS.dedupeKey)}` +
      ` FROM ${qualified(schemaName, tableName)}` +
      ` WHERE ${ident(SYSTEM_COLUMNS.dedupeKey)} IS NOT NULL`,
  );
}

/**
 * Lee los valores de una columna junto con el identificador de su fila.
 *
 * Se usa para resolver relaciones contra entidades que no se deduplican, o
 * cuando la columna de enlace no es la clave: por ejemplo una hoja `Clientes`
 * propia, donde el vinculo con `Viajes` es el nombre.
 */
export function buildColumnLookupStatement(
  schemaName: string,
  tableName: string,
  columnName: string,
): Statement {
  return statement(
    `SELECT ${ident(SYSTEM_COLUMNS.id)}, ${ident(columnName)} AS value` +
      ` FROM ${qualified(schemaName, tableName)}` +
      ` WHERE ${ident(columnName)} IS NOT NULL`,
  );
}

/** Cuenta las filas de una tabla, para el resumen de RF-21. */
export function buildCountStatement(schemaName: string, tableName: string): Statement {
  return statement(`SELECT count(*)::int AS total FROM ${qualified(schemaName, tableName)}`);
}
