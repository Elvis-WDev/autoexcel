import type pg from 'pg';
import type { Logger } from '../../application/ports/logger.js';
import type {
  DataPlaneImporter,
  FailedImportRow,
  ImportBatch,
  ImportLookup,
} from '../../application/ports/data-plane.js';
import {
  batchSize,
  buildColumnLookupStatement,
  buildCountStatement,
  buildDedupeLookupStatement,
  buildInsertStatement,
} from './sql/dml.js';

/**
 * Insercion de registros en el plano de datos.
 *
 * Usa el pool de CONTROL y no el de runtime: los `GRANT` al rol de runtime se
 * emiten al crear el schema, pero la importacion forma parte de la construccion
 * y corre con el mismo rol que la creo.
 *
 * Aqui esta la estrategia de RE-06 hecha codigo. Un lote que falla no tumba la
 * importacion: se reintenta fila por fila para aislar a la culpable, se anota, y
 * el resto sigue. Esa es la decision 4 del plan, y es la que permite que un
 * Excel real —con una celda mala entre cincuenta mil— produzca una aplicacion
 * utilizable en vez de un mensaje de error.
 */
export function createImporter(pool: pg.Pool, logger: Logger): DataPlaneImporter {
  return {
    async insertBatch(
      batch: ImportBatch,
    ): Promise<{ inserted: number; failed: FailedImportRow[] }> {
      if (batch.rows.length === 0) return { inserted: 0, failed: [] };

      const size = batchSize(batch.columns.length);
      const failed: FailedImportRow[] = [];
      let inserted = 0;

      for (let offset = 0; offset < batch.rows.length; offset += size) {
        const slice = batch.rows.slice(offset, offset + size);

        try {
          const result = await pool.query(
            ...toArgs(
              buildInsertStatement({
                schemaName: batch.schemaName,
                tableName: batch.tableName,
                columns: batch.columns,
                rows: slice.map((row) => row.values),
                deduplicated: batch.deduplicated,
              }),
            ),
          );
          inserted += result.rowCount ?? 0;
        } catch (error) {
          // El lote entero se pierde por una sola fila mala, asi que hay que
          // averiguar cual es. Reintentar de una en una es lento, pero solo
          // ocurre en los lotes que fallan.
          const isolated = await insertOneByOne(pool, batch, slice);
          inserted += isolated.inserted;
          failed.push(...isolated.failed);

          logger.warn('Lote rechazado; se reintento fila a fila', {
            tableName: batch.tableName,
            size: slice.length,
            failed: isolated.failed.length,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { inserted, failed };
    },

    async lookupByDedupeKey(schemaName: string, tableName: string): Promise<ImportLookup> {
      const result = await pool.query<{ id: string; __dedupe_key: string }>(
        ...toArgs(buildDedupeLookupStatement(schemaName, tableName)),
      );

      const lookup = new Map<string, string>();
      for (const row of result.rows) lookup.set(row.__dedupe_key, row.id);
      return lookup;
    },

    async lookupByColumn(
      schemaName: string,
      tableName: string,
      columnName: string,
      normalize: (value: string) => string,
    ): Promise<ImportLookup> {
      const result = await pool.query<{ id: string; value: unknown }>(
        ...toArgs(buildColumnLookupStatement(schemaName, tableName, columnName)),
      );

      const lookup = new Map<string, string>();
      for (const row of result.rows) {
        const key = normalize(String(row.value));
        // El primero gana: si dos registros comparten valor, apuntar siempre al
        // mismo es preferible a repartir las filas entre ambos.
        if (key.length > 0 && !lookup.has(key)) lookup.set(key, row.id);
      }
      return lookup;
    },

    async countRows(schemaName: string, tableName: string): Promise<number> {
      const result = await pool.query<{ total: number }>(
        ...toArgs(buildCountStatement(schemaName, tableName)),
      );
      return result.rows[0]?.total ?? 0;
    },
  };
}

async function insertOneByOne(
  pool: pg.Pool,
  batch: ImportBatch,
  rows: ImportBatch['rows'],
): Promise<{ inserted: number; failed: FailedImportRow[] }> {
  const failed: FailedImportRow[] = [];
  let inserted = 0;

  for (const row of rows) {
    try {
      const result = await pool.query(
        ...toArgs(
          buildInsertStatement({
            schemaName: batch.schemaName,
            tableName: batch.tableName,
            columns: batch.columns,
            rows: [row.values],
            deduplicated: batch.deduplicated,
          }),
        ),
      );
      inserted += result.rowCount ?? 0;
    } catch (error) {
      failed.push({
        rowNumber: row.rowNumber,
        reason: explain(error),
        raw: row.raw,
      });
    }
  }

  return { inserted, failed };
}

/**
 * Traduce el error de PostgreSQL a algo accionable sobre el archivo.
 *
 * RX-03: la persona usuaria no tiene por que saber que es una restriccion de
 * verificacion ni una clave foranea.
 */
function explain(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  switch (code) {
    case '23514':
      return 'Uno de los valores de esta fila no esta entre los permitidos.';
    case '23503':
      return 'Esta fila apunta a un registro que no existe.';
    case '23502':
      return 'Falta un dato obligatorio en esta fila.';
    case '22P02':
    case '22007':
      return 'Uno de los valores de esta fila no tiene el formato esperado.';
    case '22001':
      return 'Uno de los valores de esta fila es demasiado largo.';
    default:
      return 'No pudimos guardar esta fila.';
  }
}

/** `pg` recibe texto y valores por separado. */
function toArgs(item: { text: string; values: unknown[] }): [string, unknown[]] {
  return [item.text, item.values];
}
