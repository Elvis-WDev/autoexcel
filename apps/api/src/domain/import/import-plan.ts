import type { PhysicalPlan, PlannedColumn, PlannedTable } from '../blueprint/physical-plan.js';

/**
 * Plan de importacion: de que hoja sale cada tabla y en que orden se llenan.
 *
 * El orden es el mismo orden topologico del plan fisico, y por el mismo motivo:
 * una fila de Viajes no puede apuntar a un Cliente que todavia no existe. Esa
 * secuencia es lo que hace posible RF-19 sin una segunda pasada de correccion.
 *
 * Las tablas deduplicadas van primero por construccion, porque son el destino de
 * las relaciones y nunca el origen.
 */

export interface ImportStep {
  table: PlannedTable;
  /** Hoja de la que salen sus filas. */
  sheetIndex: number;
  /** Columnas con origen en el archivo. El resto quedan vacias. */
  mapped: PlannedColumn[];
  /** Columnas de relacion, que se resuelven contra una tabla ya importada. */
  relations: PlannedColumn[];
  /**
   * Columna cuyo valor normalizado deduplica. `null` si la tabla admite
   * repetidos: una fila del Excel, un registro.
   */
  dedupeColumn: PlannedColumn | null;
}

export interface ImportPlan {
  steps: ImportStep[];
}

export function buildImportPlan(plan: PhysicalPlan): ImportPlan {
  const steps: ImportStep[] = [];

  for (const table of plan.tables) {
    const mapped = table.columns.filter((column) => column.source !== null);
    if (mapped.length === 0) continue;

    const sheetIndex = dominantSheet(mapped);
    if (sheetIndex === null) continue;

    steps.push({
      table,
      sheetIndex,
      // Solo las columnas de ESA hoja: si la inferencia mezclo origenes, las de
      // otra hoja se ignoran en vez de desalinear las filas.
      mapped: mapped.filter((column) => column.source?.sheetIndex === sheetIndex),
      relations: table.columns.filter((column) => column.referencesTable !== null),
      dedupeColumn:
        table.columns.find((column) => column.columnName === table.dedupeColumn) ?? null,
    });
  }

  return { steps };
}

/**
 * Hoja de la que procede la mayoria de las columnas.
 *
 * Una entidad deberia salir de una sola hoja, pero la inferencia puede mezclar.
 * Elegir la dominante y descartar el resto es preferible a intentar cruzar filas
 * de dos hojas por posicion, que produciria datos incorrectos en silencio.
 */
function dominantSheet(columns: readonly PlannedColumn[]): number | null {
  const counts = new Map<number, number>();

  for (const column of columns) {
    if (!column.source) continue;
    counts.set(column.source.sheetIndex, (counts.get(column.source.sheetIndex) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;

  for (const [sheetIndex, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && sheetIndex < best)) {
      best = sheetIndex;
      bestCount = count;
    }
  }

  return best;
}
