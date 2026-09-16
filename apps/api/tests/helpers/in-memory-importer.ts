import { randomUUID } from 'node:crypto';
import type {
  DataPlaneImporter,
  FailedImportRow,
  ImportBatch,
  ImportLookup,
} from '../../src/application/ports/data-plane.js';
import { SYSTEM_COLUMNS } from '../../src/domain/blueprint/physical-plan.js';

export interface StoredRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface InMemoryImporter extends DataPlaneImporter {
  /** Registros por `schema.tabla`. */
  tables: Map<string, StoredRecord[]>;
  /** Simula un rechazo de la base de datos para filas concretas. */
  rejectRow?: (tableName: string, values: Record<string, unknown>) => string | null;
  recordsOf(tableName: string): StoredRecord[];
}

/**
 * Importador en memoria.
 *
 * Reproduce las dos propiedades del plano de datos de las que depende la
 * importacion: el indice unico sobre `__dedupe_key` —que es RF-20— y el rechazo
 * de filas concretas, que es lo que dispara el reintento fila a fila de RE-06.
 *
 * Permite probar la logica de las dos pasadas y la resolucion de relaciones sin
 * PostgreSQL, y deja las pruebas contra la base real para el ciclo completo.
 */
export function createInMemoryImporter(): InMemoryImporter {
  const tables = new Map<string, StoredRecord[]>();

  const key = (schemaName: string, tableName: string): string => `${schemaName}.${tableName}`;

  const importer: InMemoryImporter = {
    tables,

    recordsOf(tableName: string): StoredRecord[] {
      for (const [name, records] of tables) {
        if (name.endsWith(`.${tableName}`)) return records;
      }
      return [];
    },

    insertBatch(batch: ImportBatch): Promise<{ inserted: number; failed: FailedImportRow[] }> {
      const target = key(batch.schemaName, batch.tableName);
      const records = tables.get(target) ?? [];
      tables.set(target, records);

      const failed: FailedImportRow[] = [];
      let inserted = 0;

      for (const row of batch.rows) {
        const values: Record<string, unknown> = {};
        batch.columns.forEach((column, index) => {
          values[column] = row.values[index];
        });

        const rejection = importer.rejectRow?.(batch.tableName, values) ?? null;
        if (rejection !== null) {
          failed.push({ rowNumber: row.rowNumber, reason: rejection, raw: row.raw });
          continue;
        }

        // El indice unico de deduplicacion, reproducido.
        if (batch.deduplicated) {
          const dedupeKey = values[SYSTEM_COLUMNS.dedupeKey];
          if (
            typeof dedupeKey === 'string' &&
            records.some((record) => record.values[SYSTEM_COLUMNS.dedupeKey] === dedupeKey)
          ) {
            continue;
          }
        }

        records.push({ id: randomUUID(), values });
        inserted += 1;
      }

      return Promise.resolve({ inserted, failed });
    },

    lookupByDedupeKey(schemaName: string, tableName: string): Promise<ImportLookup> {
      const records = tables.get(key(schemaName, tableName)) ?? [];
      const lookup = new Map<string, string>();

      for (const record of records) {
        const dedupeKey = record.values[SYSTEM_COLUMNS.dedupeKey];
        if (typeof dedupeKey === 'string') lookup.set(dedupeKey, record.id);
      }

      return Promise.resolve(lookup);
    },

    lookupByColumn(
      schemaName: string,
      tableName: string,
      columnName: string,
      normalize: (value: string) => string,
    ): Promise<ImportLookup> {
      const records = tables.get(key(schemaName, tableName)) ?? [];
      const lookup = new Map<string, string>();

      for (const record of records) {
        const value = record.values[columnName];
        // Solo los valores escalares sirven para enlazar; un objeto no tiene
        // representacion textual util.
        if (typeof value !== 'string' && typeof value !== 'number') continue;

        const normalized = normalize(String(value));
        if (normalized.length > 0 && !lookup.has(normalized)) lookup.set(normalized, record.id);
      }

      return Promise.resolve(lookup);
    },

    countRows(schemaName: string, tableName: string): Promise<number> {
      return Promise.resolve((tables.get(key(schemaName, tableName)) ?? []).length);
    },
  };

  return importer;
}
