import type { RuntimeApplication, RuntimeEntity } from '../../domain/runtime/application.js';

/** Un registro tal como sale de la base: valores por nombre de campo. */
export interface AppRecord {
  id: string;
  values: Record<string, unknown>;
  /** Etiqueta del registro relacionado, por nombre de campo (RF-17). */
  relatedLabels: Record<string, string | null>;
}

export interface ListRecordsQuery {
  application: RuntimeApplication;
  entity: RuntimeEntity;
  /** Campo por el que se ordena, por su nombre publico. */
  sortField: string;
  direction: 'asc' | 'desc';
  search: string | null;
  limit: number;
  offset: number;
}

export interface RecordOption {
  id: string;
  label: string;
}

/**
 * Acceso a los registros de una aplicacion generada.
 *
 * Lo implementa el plano de datos con el rol de RUNTIME, que solo tiene DML
 * (ADR 0001). Un fallo aqui no puede alterar estructura ni siquiera por
 * accidente: la base lo impide.
 */
export interface RecordRepository {
  list(query: ListRecordsQuery): Promise<{ items: AppRecord[]; total: number }>;
  find(
    application: RuntimeApplication,
    entity: RuntimeEntity,
    id: string,
  ): Promise<AppRecord | null>;
  create(
    application: RuntimeApplication,
    entity: RuntimeEntity,
    values: Record<string, unknown>,
  ): Promise<string>;
  update(
    application: RuntimeApplication,
    entity: RuntimeEntity,
    id: string,
    values: Record<string, unknown>,
  ): Promise<boolean>;
  remove(application: RuntimeApplication, entity: RuntimeEntity, id: string): Promise<boolean>;
  /** Opciones para un selector de relacion (RF-17). */
  options(
    application: RuntimeApplication,
    entity: RuntimeEntity,
    search: string | null,
    limit: number,
  ): Promise<RecordOption[]>;
}
