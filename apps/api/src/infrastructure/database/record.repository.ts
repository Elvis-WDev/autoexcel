import type pg from 'pg';
import type {
  AppRecord,
  ListRecordsQuery,
  RecordOption,
  RecordRepository,
} from '../../application/ports/record-repository.js';
import { SYSTEM_COLUMNS } from '../../domain/blueprint/physical-plan.js';
import { AppError } from '../../domain/errors.js';
import type { RuntimeApplication, RuntimeEntity } from '../../domain/runtime/application.js';
import { findField, isSortable, toLabelText } from '../../domain/runtime/application.js';
import {
  buildCountStatement,
  buildDeleteStatement,
  buildFindStatement,
  buildInsertStatement,
  buildListStatement,
  buildOptionsStatement,
  buildUpdateStatement,
  relationJoins,
  searchableColumns,
  RELATION_LABEL_PREFIX,
  type RelationJoin,
} from './sql/query.js';

/**
 * CRUD generico sobre las aplicaciones generadas (RF-14 a RF-17, RF-23, RF-24).
 *
 * Usa el pool de RUNTIME. Es el momento en que la separacion de roles del
 * ADR 0001 deja de ser teoria: todo lo que ocurre a partir de aqui lo ejecuta un
 * rol que no puede crear, alterar ni borrar estructura. Si este codigo tuviera
 * un fallo, el peor caso es perder datos de un proyecto, no su esquema.
 */
export function createRecordRepository(pool: pg.Pool): RecordRepository {
  /** Como llegar de una entidad a su tabla y su columna mostrada. */
  const resolver = (application: RuntimeApplication) => (entityName: string) => {
    const entity = application.entities.find((candidate) => candidate.name === entityName);
    if (!entity) return null;

    const display = entity.fields.find((field) => field.name === entity.displayField);
    if (!display) return null;

    return { tableName: entity.tableName, displayColumn: display.columnName };
  };

  function toRecord(
    entity: RuntimeEntity,
    joins: readonly RelationJoin[],
    row: Record<string, unknown>,
  ): AppRecord {
    const values: Record<string, unknown> = {};
    for (const field of entity.fields) {
      values[field.name] = row[field.columnName] ?? null;
    }

    const relatedLabels: Record<string, string | null> = {};
    for (const join of joins) {
      const fieldName = join.alias.slice(RELATION_LABEL_PREFIX.length);
      const label = row[join.alias];
      relatedLabels[fieldName] = typeof label === 'string' ? label : null;
    }

    return { id: String(row[SYSTEM_COLUMNS.id]), values, relatedLabels };
  }

  /** Campos publicos -> columnas fisicas y valores, en el mismo orden. */
  function toColumns(
    entity: RuntimeEntity,
    values: Record<string, unknown>,
  ): { columns: string[]; values: unknown[] } {
    const columns: string[] = [];
    const ordered: unknown[] = [];

    for (const field of entity.fields) {
      if (!(field.name in values)) continue;
      columns.push(field.columnName);
      ordered.push(values[field.name] ?? null);
    }

    return { columns, values: ordered };
  }

  return {
    async list(query: ListRecordsQuery): Promise<{ items: AppRecord[]; total: number }> {
      const { application, entity } = query;
      const joins = relationJoins(entity, resolver(application));

      const sortField = findField(entity, query.sortField);
      // Ordenar por una relacion ordenaria por identificador, que no significa
      // nada para quien mira la lista.
      const sortColumn = isSortable(sortField)
        ? sortField.columnName
        : findField(entity, entity.displayField).columnName;

      const searchColumns = searchableColumns(entity);

      const list = buildListStatement({
        schemaName: application.schemaName,
        entity,
        joins,
        sortColumn,
        direction: query.direction === 'desc' ? 'DESC' : 'ASC',
        searchColumns,
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      });

      const count = buildCountStatement({
        schemaName: application.schemaName,
        entity,
        searchColumns,
        search: query.search,
      });

      const [rows, totals] = await Promise.all([
        pool.query<Record<string, unknown>>(list.text, list.values),
        pool.query<{ total: number }>(count.text, count.values),
      ]);

      return {
        items: rows.rows.map((row) => toRecord(entity, joins, row)),
        total: totals.rows[0]?.total ?? 0,
      };
    },

    async find(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      id: string,
    ): Promise<AppRecord | null> {
      const joins = relationJoins(entity, resolver(application));
      const find = buildFindStatement({
        schemaName: application.schemaName,
        entity,
        joins,
        id,
      });

      const result = await pool.query<Record<string, unknown>>(find.text, find.values);
      const row = result.rows[0];

      return row ? toRecord(entity, joins, row) : null;
    },

    async create(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      values: Record<string, unknown>,
    ): Promise<string> {
      const prepared = toColumns(entity, values);

      const insert = buildInsertStatement({
        schemaName: application.schemaName,
        entity,
        columns: prepared.columns,
        values: prepared.values,
      });

      try {
        const result = await pool.query<{ id: string }>(insert.text, insert.values);
        const id = result.rows[0]?.id;
        if (!id) throw AppError.internal();
        return id;
      } catch (error) {
        throw translate(error, application, entity);
      }
    },

    async update(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      id: string,
      values: Record<string, unknown>,
    ): Promise<boolean> {
      const prepared = toColumns(entity, values);
      if (prepared.columns.length === 0) return true;

      const update = buildUpdateStatement({
        schemaName: application.schemaName,
        entity,
        columns: prepared.columns,
        values: prepared.values,
        id,
      });

      try {
        const result = await pool.query(update.text, update.values);
        return (result.rowCount ?? 0) > 0;
      } catch (error) {
        throw translate(error, application, entity);
      }
    },

    async remove(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      id: string,
    ): Promise<boolean> {
      const remove = buildDeleteStatement(application.schemaName, entity, id);

      try {
        const result = await pool.query(remove.text, remove.values);
        return (result.rowCount ?? 0) > 0;
      } catch (error) {
        throw translate(error, application, entity);
      }
    },

    async options(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      search: string | null,
      limit: number,
    ): Promise<RecordOption[]> {
      const display = findField(entity, entity.displayField);

      const query = buildOptionsStatement({
        schemaName: application.schemaName,
        entity,
        displayColumn: display.columnName,
        search,
        limit,
      });

      const result = await pool.query<{ id: string; label: unknown }>(query.text, query.values);

      return result.rows.map((row) => ({
        id: row.id,
        label: toLabelText(row.label) ?? '(sin nombre)',
      }));
    },
  };
}

/**
 * Traduce el error de PostgreSQL a lenguaje de negocio.
 *
 * RX-03 otra vez, y aqui importa especialmente: quien borra un cliente que tiene
 * viajes necesita entender POR QUE no se puede, y con que modulo choca. Un
 * "violates foreign key constraint" no le sirve de nada.
 */
function translate(
  error: unknown,
  application: RuntimeApplication,
  entity: RuntimeEntity,
): AppError {
  const failure = error as { code?: string; table?: string; constraint?: string } | null;

  switch (failure?.code) {
    case '23503': {
      // `table` es la tabla que tiene la referencia, no la que se intento borrar.
      const dependent = application.entities.find(
        (candidate) => candidate.tableName === failure.table,
      );

      if (dependent && dependent.name !== entity.name) {
        return AppError.conflict(
          `No se puede eliminar este registro porque ${dependent.label} depende de el.`,
          { module: dependent.label },
        );
      }

      return AppError.validation(
        'Este registro apunta a otro que ya no existe. Elige uno de la lista.',
      );
    }

    case '23514':
      return AppError.validation('Uno de los valores no esta entre los permitidos.');

    case '23502':
      return AppError.validation('Falta un dato obligatorio.');

    case '23505':
      return AppError.conflict('Ya existe un registro con ese valor.');

    case '22P02':
    case '22007':
      return AppError.validation('Uno de los valores no tiene el formato esperado.');

    case '22001':
      return AppError.validation('Uno de los valores es demasiado largo.');

    default:
      return AppError.internal('No pudimos guardar el registro.', error);
  }
}
