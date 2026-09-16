import { assertSafeIdentifier, RESERVED_COLUMN_NAMES, toIdentifier } from '../identifiers.js';
import { AppError } from '../errors.js';
import type { FieldType, ProposedBlueprint, ProposedEntity } from './types.js';

/**
 * Plan fisico: la traduccion del blueprint a tablas y columnas reales.
 *
 * Es una funcion pura, sin base de datos ni SQL. Eso permite comprobar el
 * resultado —sobre todo los identificadores— con tests rapidos, y deja al
 * constructor de SQL sin ninguna decision que tomar: recibe nombres ya
 * generados, validados y unicos, y solo los compone.
 *
 * El orden de las tablas es topologico: primero las que no dependen de nadie.
 * Es lo que permite crear las claves foraneas sin diferirlas y, en F6, insertar
 * los registros sin resolver referencias a algo que aun no existe.
 */

/** Columnas que el sistema anade a toda tabla generada. */
export const SYSTEM_COLUMNS = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  /** Clave normalizada de deduplicacion (decision 3 del plan). */
  dedupeKey: '__dedupe_key',
  /** Hoja y fila de origen, para RNF-02. */
  source: '__source',
} as const;

export type SqlType =
  'TEXT' | 'BIGINT' | 'NUMERIC(18,4)' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ' | 'UUID';

/**
 * Tipo del ERS -> tipo de PostgreSQL.
 *
 * `email` y `phone` son TEXT: su forma se valida en la aplicacion, donde se
 * puede explicar el problema, y no con una restriccion que rechazaria una fila
 * entera del Excel por un telefono mal escrito.
 */
const SQL_TYPES: Record<Exclude<FieldType, 'relation'>, SqlType> = {
  text: 'TEXT',
  integer: 'BIGINT',
  decimal: 'NUMERIC(18,4)',
  boolean: 'BOOLEAN',
  date: 'DATE',
  datetime: 'TIMESTAMPTZ',
  email: 'TEXT',
  phone: 'TEXT',
  select: 'TEXT',
};

export interface PlannedColumn {
  /** Nombre del campo en el blueprint. */
  fieldName: string;
  /** Identificador fisico. Generado por maquina, nunca por el usuario. */
  columnName: string;
  type: FieldType;
  sqlType: SqlType;
  required: boolean;
  /** Valores permitidos cuando el tipo es `select`. */
  options: string[] | null;
  /** Tabla apuntada cuando el tipo es `relation`. */
  referencesTable: string | null;
  /** Columna del archivo de la que sale, para la importacion de F6. */
  source: { sheetIndex: number; columnIndex: number } | null;
}

export interface PlannedIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface PlannedTable {
  entityName: string;
  tableName: string;
  label: string;
  columns: PlannedColumn[];
  /**
   * Indices de la tabla, con sus nombres ya generados.
   *
   * Se deciden aqui y no al componer el SQL porque un nombre de indice tambien
   * es un identificador: concatenar `tabla + columna + _idx` puede pasarse de
   * los 63 bytes en cuanto los nombres son largos, y los nombres de indice son
   * unicos por schema, no por tabla.
   */
  indexes: PlannedIndex[];
  /** Columna que representa al registro en un selector (RF-17). */
  displayColumn: string;
  /** Columna cuya clave normalizada deduplica registros, si la hay. */
  dedupeColumn: string | null;
  /** `true` si la tabla necesita `__dedupe_key` y su indice unico. */
  deduplicated: boolean;
}

export interface PhysicalPlan {
  schemaName: string;
  /** Orden topologico: una tabla siempre aparece despues de sus referencias. */
  tables: PlannedTable[];
}

export function buildPhysicalPlan(schemaName: string, blueprint: ProposedBlueprint): PhysicalPlan {
  assertSafeIdentifier(schemaName, 'nombre de schema');

  const ordered = topologicalOrder(blueprint);
  const takenTables = new Set<string>();
  const tableNames = new Map<string, string>();

  // Primera pasada: nombre de tabla de cada entidad. Hace falta completa antes
  // de resolver las referencias, porque una tabla puede apuntar a otra posterior.
  for (const entity of ordered) {
    tableNames.set(
      entity.name,
      toIdentifier(entity.label, { taken: takenTables, fallback: entity.name }),
    );
  }

  // Los nombres de indice compiten entre si en todo el schema.
  const takenIndexes = new Set<string>();
  const tables = ordered.map((entity) => planTable(entity, tableNames, takenIndexes));

  return { schemaName, tables };
}

function planTable(
  entity: ProposedEntity,
  tableNames: ReadonlyMap<string, string>,
  takenIndexes: Set<string>,
): PlannedTable {
  const tableName = tableNames.get(entity.name);
  if (!tableName) throw AppError.internal();

  const takenColumns = new Set<string>();
  const columns: PlannedColumn[] = entity.fields.map((field) => {
    const columnName = toIdentifier(field.label, {
      taken: takenColumns,
      fallback: field.name,
      reserved: RESERVED_COLUMN_NAMES,
    });

    const referencesTable =
      field.type === 'relation' && field.targetEntity
        ? (tableNames.get(field.targetEntity) ?? null)
        : null;

    if (field.type === 'relation' && !referencesTable) {
      throw AppError.internal(
        'Algo salio mal al preparar la estructura.',
        new Error(`Relacion sin destino: ${entity.name}.${field.name}`),
      );
    }

    return {
      fieldName: field.name,
      columnName,
      type: field.type,
      sqlType: field.type === 'relation' ? 'UUID' : SQL_TYPES[field.type],
      required: field.required,
      options: field.type === 'select' ? (field.options ?? null) : null,
      referencesTable,
      source: field.source ?? null,
    };
  });

  const byFieldName = new Map(columns.map((column) => [column.fieldName, column]));

  const displayColumn = byFieldName.get(entity.displayField)?.columnName;
  if (!displayColumn) {
    throw AppError.internal(
      'Algo salio mal al preparar la estructura.',
      new Error(`Entidad sin campo mostrado: ${entity.name}`),
    );
  }

  const dedupeColumn = entity.dedupeField
    ? (byFieldName.get(entity.dedupeField)?.columnName ?? null)
    : null;

  const indexes = planIndexes(tableName, columns, displayColumn, dedupeColumn, takenIndexes);

  return {
    entityName: entity.name,
    tableName,
    label: entity.label,
    columns,
    indexes,
    displayColumn,
    dedupeColumn,
    deduplicated: dedupeColumn !== null,
  };
}

function planIndexes(
  tableName: string,
  columns: readonly PlannedColumn[],
  displayColumn: string,
  dedupeColumn: string | null,
  taken: Set<string>,
): PlannedIndex[] {
  const indexes: PlannedIndex[] = [];

  const name = (suffix: string): string =>
    toIdentifier(`${tableName}_${suffix}_idx`, { taken, fallback: `idx_${suffix}` });

  // El indice unico ES la deduplicacion de RF-20.
  if (dedupeColumn !== null) {
    indexes.push({ name: name('dedupe'), columns: [SYSTEM_COLUMNS.dedupeKey], unique: true });
  }

  // Toda relacion se recorre al listar: sin indice, cada pagina seria un
  // recorrido completo de la tabla apuntada.
  for (const column of columns) {
    if (!column.referencesTable) continue;
    indexes.push({ name: name(column.columnName), columns: [column.columnName], unique: false });
  }

  // La columna mostrada es por la que se busca y se ordena (RF-14).
  indexes.push({ name: name('display'), columns: [displayColumn], unique: false });

  return indexes;
}

/**
 * Ordena las entidades para que ninguna aparezca antes que aquellas a las que
 * apunta.
 *
 * El validador ya garantiza que no hay ciclos, asi que este recorrido siempre
 * termina. Aun asi se comprueba: si alguna vez se llegara aqui con un ciclo, es
 * preferible un error claro a una recursion infinita en produccion.
 */
function topologicalOrder(blueprint: ProposedBlueprint): ProposedEntity[] {
  const byName = new Map(blueprint.entities.map((entity) => [entity.name, entity]));
  const ordered: ProposedEntity[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();

  const visit = (entity: ProposedEntity): void => {
    if (done.has(entity.name)) return;

    if (visiting.has(entity.name)) {
      throw AppError.internal(
        'Algo salio mal al preparar la estructura.',
        new Error(`Ciclo de relaciones en ${entity.name}`),
      );
    }

    visiting.add(entity.name);

    for (const field of entity.fields) {
      if (field.type !== 'relation' || !field.targetEntity) continue;
      const target = byName.get(field.targetEntity);
      if (target) visit(target);
    }

    visiting.delete(entity.name);
    done.add(entity.name);
    ordered.push(entity);
  };

  for (const entity of blueprint.entities) visit(entity);
  return ordered;
}
