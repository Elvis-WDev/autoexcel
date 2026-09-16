import { randomUUID } from 'node:crypto';
import type {
  AppRecord,
  ListRecordsQuery,
  RecordOption,
  RecordRepository,
} from '../../src/application/ports/record-repository.js';
import { AppError } from '../../src/domain/errors.js';
import {
  toLabelText,
  type RuntimeApplication,
  type RuntimeEntity,
} from '../../src/domain/runtime/application.js';
import { normalizeText } from '../../src/domain/spreadsheet/normalization.js';

interface Row {
  id: string;
  values: Record<string, unknown>;
}

export interface InMemoryRecordRepository extends RecordRepository {
  /** Registros por nombre de entidad. */
  rows: Map<string, Row[]>;
  seed(entityName: string, values: Record<string, unknown>): string;
}

/**
 * Registros en memoria.
 *
 * Reproduce las tres reglas de la base que el CRUD tiene que respetar:
 * resolucion de relaciones a su etiqueta, restriccion de borrado cuando alguien
 * depende del registro, y rechazo de una referencia inexistente. Sin esas tres,
 * los tests no dirian nada sobre el comportamiento real.
 */
export function createInMemoryRecordRepository(): InMemoryRecordRepository {
  const rows = new Map<string, Row[]>();

  const listOf = (entityName: string): Row[] => {
    const existing = rows.get(entityName);
    if (existing) return existing;

    const created: Row[] = [];
    rows.set(entityName, created);
    return created;
  };

  /** Etiqueta del registro apuntado, para cada campo de relacion. */
  function relatedLabels(
    application: RuntimeApplication,
    entity: RuntimeEntity,
    row: Row,
  ): Record<string, string | null> {
    const labels: Record<string, string | null> = {};

    for (const field of entity.fields) {
      if (field.type !== 'relation' || !field.relatedEntity) continue;

      const target = application.entities.find(
        (candidate) => candidate.name === field.relatedEntity,
      );
      const id = row.values[field.name];

      if (!target || typeof id !== 'string') {
        labels[field.name] = null;
        continue;
      }

      const referenced = listOf(target.name).find((candidate) => candidate.id === id);
      const label = referenced?.values[target.displayField];
      labels[field.name] = typeof label === 'string' ? label : null;
    }

    return labels;
  }

  function toRecord(application: RuntimeApplication, entity: RuntimeEntity, row: Row): AppRecord {
    const values: Record<string, unknown> = {};
    for (const field of entity.fields) values[field.name] = row.values[field.name] ?? null;

    return { id: row.id, values, relatedLabels: relatedLabels(application, entity, row) };
  }

  /** La clave foranea: apuntar a algo que no existe se rechaza. */
  function assertReferencesExist(entity: RuntimeEntity, values: Record<string, unknown>): void {
    for (const field of entity.fields) {
      if (field.type !== 'relation' || !field.relatedEntity) continue;

      const id = values[field.name];
      if (id === null || id === undefined) continue;

      const exists = listOf(field.relatedEntity).some((row) => row.id === id);
      if (!exists) {
        throw AppError.validation(
          'Este registro apunta a otro que ya no existe. Elige uno de la lista.',
        );
      }
    }
  }

  return {
    rows,

    seed(entityName: string, values: Record<string, unknown>): string {
      const id = randomUUID();
      listOf(entityName).push({ id, values });
      return id;
    },

    list(query: ListRecordsQuery): Promise<{ items: AppRecord[]; total: number }> {
      const { application, entity } = query;
      let items = [...listOf(entity.name)];

      if (query.search !== null && query.search.length > 0) {
        const needle = normalizeText(query.search);
        // Se busca en todas las columnas de texto, igual que la consulta real.
        const searchable = entity.fields.filter(
          (field) => field.type === 'text' || field.type === 'email' || field.type === 'phone',
        );

        items = items.filter((row) =>
          searchable.some((field) =>
            normalizeText(toLabelText(row.values[field.name]) ?? '').includes(needle),
          ),
        );
      }

      items.sort((left, right) => {
        const a = toLabelText(left.values[query.sortField]) ?? '';
        const b = toLabelText(right.values[query.sortField]) ?? '';
        return query.direction === 'desc' ? b.localeCompare(a) : a.localeCompare(b);
      });

      const total = items.length;
      const page = items.slice(query.offset, query.offset + query.limit);

      return Promise.resolve({
        items: page.map((row) => toRecord(application, entity, row)),
        total,
      });
    },

    find(
      application: RuntimeApplication,
      entity: RuntimeEntity,
      id: string,
    ): Promise<AppRecord | null> {
      const row = listOf(entity.name).find((candidate) => candidate.id === id);
      return Promise.resolve(row ? toRecord(application, entity, row) : null);
    },

    create(
      _application: RuntimeApplication,
      entity: RuntimeEntity,
      values: Record<string, unknown>,
    ): Promise<string> {
      assertReferencesExist(entity, values);

      const id = randomUUID();
      listOf(entity.name).push({ id, values: { ...values } });
      return Promise.resolve(id);
    },

    update(
      _application: RuntimeApplication,
      entity: RuntimeEntity,
      id: string,
      values: Record<string, unknown>,
    ): Promise<boolean> {
      const row = listOf(entity.name).find((candidate) => candidate.id === id);
      if (!row) return Promise.resolve(false);

      assertReferencesExist(entity, values);
      row.values = { ...row.values, ...values };
      return Promise.resolve(true);
    },

    remove(application: RuntimeApplication, entity: RuntimeEntity, id: string): Promise<boolean> {
      // ON DELETE RESTRICT: si alguien depende de este registro, no se borra.
      for (const other of application.entities) {
        for (const field of other.fields) {
          if (field.type !== 'relation' || field.relatedEntity !== entity.name) continue;

          const dependent = listOf(other.name).some((row) => row.values[field.name] === id);
          if (dependent) {
            throw AppError.conflict(
              `No se puede eliminar este registro porque ${other.label} depende de el.`,
              { module: other.label },
            );
          }
        }
      }

      const list = listOf(entity.name);
      const index = list.findIndex((candidate) => candidate.id === id);
      if (index < 0) return Promise.resolve(false);

      list.splice(index, 1);
      return Promise.resolve(true);
    },

    options(
      _application: RuntimeApplication,
      entity: RuntimeEntity,
      search: string | null,
      limit: number,
    ): Promise<RecordOption[]> {
      let items = listOf(entity.name);

      if (search !== null && search.length > 0) {
        const needle = normalizeText(search);
        items = items.filter((row) =>
          normalizeText(toLabelText(row.values[entity.displayField]) ?? '').includes(needle),
        );
      }

      return Promise.resolve(
        items
          .slice(0, limit)
          .map((row) => ({
            id: row.id,
            label: toLabelText(row.values[entity.displayField]) ?? '(sin nombre)',
          }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      );
    },
  };
}
