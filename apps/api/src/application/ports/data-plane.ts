import type { PhysicalPlan } from '../../domain/blueprint/physical-plan.js';

/**
 * Puerto del plano de datos (ADR 0001).
 *
 * Es la unica via por la que la aplicacion puede tocar la estructura de los
 * schemas `proj_*`. F6 lo ampliara con la insercion de registros.
 */
export interface DataPlaneSchemaManager {
  /** Idempotente: borrar un schema que no existe no es un error. */
  dropSchema(schemaName: string): Promise<void>;
}

export interface DataPlaneMaterializer extends DataPlaneSchemaManager {
  /**
   * Crea el schema completo en una sola transaccion.
   *
   * O queda todo, o no queda nada: no existe un estado intermedio que alguien
   * pueda confundir con una aplicacion terminada (RNF-05).
   */
  createSchema(plan: PhysicalPlan): Promise<void>;
}

/** Un valor normalizado apuntando al identificador de su registro. */
export type ImportLookup = ReadonlyMap<string, string>;

export interface ImportRow {
  /** Fila dentro de la hoja, tal como la ve la persona en Excel. */
  rowNumber: number;
  /** Valores ya coercionados, en el orden de `columns`. */
  values: unknown[];
  /** La fila tal cual venia, para poder reportarla si falla. */
  raw: unknown[];
}

export interface ImportBatch {
  schemaName: string;
  tableName: string;
  columns: string[];
  rows: ImportRow[];
  deduplicated: boolean;
}

export interface FailedImportRow {
  rowNumber: number;
  reason: string;
  raw: unknown[];
}

/**
 * Insercion de registros (RF-18 a RF-20).
 *
 * Ninguna de estas operaciones interpreta datos: recibe valores ya convertidos
 * por el dominio y los escribe. P-04 exige que la transferencia de registros sea
 * un proceso controlado y determinista, y esta separacion es lo que lo asegura.
 */
export interface DataPlaneImporter {
  insertBatch(batch: ImportBatch): Promise<{ inserted: number; failed: FailedImportRow[] }>;
  /** Indice `clave de deduplicacion -> id`, para resolver relaciones (RF-19). */
  lookupByDedupeKey(schemaName: string, tableName: string): Promise<ImportLookup>;
  /** Indice `valor normalizado -> id` sobre una columna cualquiera. */
  lookupByColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    normalize: (value: string) => string,
  ): Promise<ImportLookup>;
  countRows(schemaName: string, tableName: string): Promise<number>;
}
