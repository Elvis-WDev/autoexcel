import { SYSTEM_COLUMNS } from '../../../domain/blueprint/physical-plan.js';
import type { RuntimeEntity } from '../../../domain/runtime/application.js';
import { ident, qualified, statement, type Statement } from './builder.js';

/**
 * Consultas del CRUD generico.
 *
 * Misma regla que el resto de `sql/`: los identificadores llegan ya generados y
 * validados —vienen del descriptor, que los leyo de la base— y los valores van
 * siempre como parametros. El nombre que llega por la URL nunca aparece aqui:
 * se resolvio antes contra el descriptor.
 *
 * Las relaciones se resuelven con `LEFT JOIN` en la propia consulta. Devolver el
 * identificador y que el cliente pida el nombre despues seria una consulta por
 * fila, y ademas obligaria a la interfaz a manejar identificadores internos, que
 * es justo lo que RF-17 quiere evitar.
 */

/** Prefijo de las columnas que traen la etiqueta de un registro relacionado. */
export const RELATION_LABEL_PREFIX = '__rel_';

export interface RelationJoin {
  /** Columna de la tabla principal que guarda la referencia. */
  columnName: string;
  /** Tabla apuntada. */
  targetTable: string;
  /** Columna de la tabla apuntada que se muestra. */
  targetDisplayColumn: string;
  /** Alias con el que vuelve la etiqueta. */
  alias: string;
}

export function relationJoins(
  entity: RuntimeEntity,
  tableOf: (entityName: string) => { tableName: string; displayColumn: string } | null,
): RelationJoin[] {
  const joins: RelationJoin[] = [];

  for (const field of entity.fields) {
    if (field.type !== 'relation' || !field.relatedEntity) continue;

    const target = tableOf(field.relatedEntity);
    if (!target) continue;

    joins.push({
      columnName: field.columnName,
      targetTable: target.tableName,
      targetDisplayColumn: target.displayColumn,
      alias: `${RELATION_LABEL_PREFIX}${field.name}`,
    });
  }

  return joins;
}

function selectList(entity: RuntimeEntity, joins: readonly RelationJoin[]): string {
  const columns = [
    `t.${ident(SYSTEM_COLUMNS.id)}`,
    ...entity.fields.map((field) => `t.${ident(field.columnName)}`),
  ];

  joins.forEach((join, index) => {
    columns.push(`r${index}.${ident(join.targetDisplayColumn)} AS ${ident(join.alias)}`);
  });

  return columns.join(', ');
}

function joinClause(schemaName: string, joins: readonly RelationJoin[]): string {
  return joins
    .map(
      (join, index) =>
        ` LEFT JOIN ${qualified(schemaName, join.targetTable)} r${index}` +
        ` ON r${index}.${ident(SYSTEM_COLUMNS.id)} = t.${ident(join.columnName)}`,
    )
    .join('');
}

/**
 * Columnas sobre las que busca el cuadro "Buscar..." de RF-14.
 *
 * Buscar solo en la columna mostrada seria una trampa: en una tabla de Viajes
 * cuya etiqueta es el cliente, escribir una placa no encontraria nada y la
 * persona concluiria que ese viaje no existe. Se busca en todas las columnas de
 * texto, acotadas en numero para que la consulta no crezca sin control.
 */
const MAX_SEARCH_COLUMNS = 8;

export function searchableColumns(entity: RuntimeEntity): string[] {
  const searchable = entity.fields.filter(
    (field) => field.type === 'text' || field.type === 'email' || field.type === 'phone',
  );

  const display = entity.fields.find((field) => field.name === entity.displayField);
  const ordered = display && !searchable.includes(display) ? [display, ...searchable] : searchable;

  return ordered.slice(0, MAX_SEARCH_COLUMNS).map((field) => field.columnName);
}

/** `WHERE` del texto libre, o cadena vacia si no hay busqueda. */
function searchClause(
  columns: readonly string[],
  values: unknown[],
  search: string | null,
): string {
  if (search === null || search.length === 0 || columns.length === 0) return '';

  // Un solo parametro para todas las columnas: el patron va como valor, nunca
  // concatenado.
  values.push(`%${search}%`);
  const placeholder = `$${values.length}`;

  const conditions = columns.map((column) => `t.${ident(column)}::text ILIKE ${placeholder}`);

  return ` WHERE (${conditions.join(' OR ')})`;
}

export interface ListQueryOptions {
  schemaName: string;
  entity: RuntimeEntity;
  joins: RelationJoin[];
  /** Columna fisica por la que se ordena. */
  sortColumn: string;
  direction: 'ASC' | 'DESC';
  /** Columnas fisicas sobre las que busca el texto libre. */
  searchColumns: string[];
  search: string | null;
  limit: number;
  offset: number;
}

export function buildListStatement(options: ListQueryOptions): Statement {
  const values: unknown[] = [];
  const where = searchClause(options.searchColumns, values, options.search);

  values.push(options.limit, options.offset);

  return statement(
    `SELECT ${selectList(options.entity, options.joins)}` +
      ` FROM ${qualified(options.schemaName, options.entity.tableName)} t` +
      joinClause(options.schemaName, options.joins) +
      where +
      ` ORDER BY t.${ident(options.sortColumn)} ${options.direction} NULLS LAST,` +
      ` t.${ident(SYSTEM_COLUMNS.id)} ASC` +
      ` LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
}

export function buildCountStatement(options: {
  schemaName: string;
  entity: RuntimeEntity;
  searchColumns: string[];
  search: string | null;
}): Statement {
  const values: unknown[] = [];
  const where = searchClause(options.searchColumns, values, options.search);

  return statement(
    `SELECT count(*)::int AS total` +
      ` FROM ${qualified(options.schemaName, options.entity.tableName)} t${where}`,
    values,
  );
}

export function buildFindStatement(options: {
  schemaName: string;
  entity: RuntimeEntity;
  joins: RelationJoin[];
  id: string;
}): Statement {
  return statement(
    `SELECT ${selectList(options.entity, options.joins)}` +
      ` FROM ${qualified(options.schemaName, options.entity.tableName)} t` +
      joinClause(options.schemaName, options.joins) +
      ` WHERE t.${ident(SYSTEM_COLUMNS.id)} = $1`,
    [options.id],
  );
}

export function buildInsertStatement(options: {
  schemaName: string;
  entity: RuntimeEntity;
  /** Columnas fisicas y sus valores, en el mismo orden. */
  columns: string[];
  values: unknown[];
}): Statement {
  const placeholders = options.values.map((_value, index) => `$${index + 1}`);

  return statement(
    `INSERT INTO ${qualified(options.schemaName, options.entity.tableName)}` +
      ` (${options.columns.map(ident).join(', ')})` +
      ` VALUES (${placeholders.join(', ')})` +
      ` RETURNING ${ident(SYSTEM_COLUMNS.id)}`,
    options.values,
  );
}

export function buildUpdateStatement(options: {
  schemaName: string;
  entity: RuntimeEntity;
  columns: string[];
  values: unknown[];
  id: string;
}): Statement {
  const assignments = options.columns.map((column, index) => `${ident(column)} = $${index + 1}`);

  // `updated_at` lo pone la base: no depende del reloj del proceso.
  assignments.push(`${ident(SYSTEM_COLUMNS.updatedAt)} = now()`);

  return statement(
    `UPDATE ${qualified(options.schemaName, options.entity.tableName)}` +
      ` SET ${assignments.join(', ')}` +
      ` WHERE ${ident(SYSTEM_COLUMNS.id)} = $${options.values.length + 1}` +
      ` RETURNING ${ident(SYSTEM_COLUMNS.id)}`,
    [...options.values, options.id],
  );
}

export function buildDeleteStatement(
  schemaName: string,
  entity: RuntimeEntity,
  id: string,
): Statement {
  return statement(
    `DELETE FROM ${qualified(schemaName, entity.tableName)}` +
      ` WHERE ${ident(SYSTEM_COLUMNS.id)} = $1`,
    [id],
  );
}

/**
 * Opciones para un selector de relacion (RF-17).
 *
 * Nunca devuelve la tabla entera: un `select` sobre diez mil clientes no se
 * carga de golpe. Busca por la columna mostrada y pagina.
 */
export function buildOptionsStatement(options: {
  schemaName: string;
  entity: RuntimeEntity;
  displayColumn: string;
  search: string | null;
  limit: number;
}): Statement {
  const values: unknown[] = [];
  let where = '';

  if (options.search !== null && options.search.length > 0) {
    values.push(`%${options.search}%`);
    where = ` WHERE ${ident(options.displayColumn)}::text ILIKE $${values.length}`;
  }

  values.push(options.limit);

  return statement(
    `SELECT ${ident(SYSTEM_COLUMNS.id)}, ${ident(options.displayColumn)} AS label` +
      ` FROM ${qualified(options.schemaName, options.entity.tableName)}${where}` +
      ` ORDER BY ${ident(options.displayColumn)} ASC NULLS LAST` +
      ` LIMIT $${values.length}`,
    values,
  );
}
