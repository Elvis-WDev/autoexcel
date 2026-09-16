import { AppError } from '../../../domain/errors.js';
import type { RuntimeApplication } from '../../../domain/runtime/application.js';
import { buildRecordSchema } from '../../../domain/runtime/record-schema.js';
import type { AppRecord, RecordRepository } from '../../ports/record-repository.js';
import { openApplication, openEntity, type AppAccessDependencies } from './app-access.js';

export interface AppUseCasesDependencies extends AppAccessDependencies {
  records: RecordRepository;
}

export interface ProjectScope {
  projectId: string;
  actorId: string;
}

export interface EntityScope extends ProjectScope {
  entityName: string;
}

/** RF-22: la navegacion entre modulos de la aplicacion generada. */
export type GetManifest = (scope: ProjectScope) => Promise<RuntimeApplication>;

export function getManifestUseCase(dependencies: AppAccessDependencies): GetManifest {
  return ({ projectId, actorId }) => openApplication(dependencies, projectId, actorId);
}

// ---------------------------------------------------------------------------

export interface ListRecordsInput extends EntityScope {
  sort: string | null;
  direction: 'asc' | 'desc';
  search: string | null;
  limit: number;
  offset: number;
}

export type ListRecords = (
  input: ListRecordsInput,
) => Promise<{ items: AppRecord[]; total: number; entityLabel: string }>;

/** RF-14: la tabla de registros de cada modulo. */
export function listRecordsUseCase(dependencies: AppUseCasesDependencies): ListRecords {
  return async (input) => {
    const { application, entity } = await openEntity(
      dependencies,
      input.projectId,
      input.actorId,
      input.entityName,
    );

    const result = await dependencies.records.list({
      application,
      entity,
      sortField: input.sort ?? entity.displayField,
      direction: input.direction,
      search: input.search,
      limit: input.limit,
      offset: input.offset,
    });

    return { ...result, entityLabel: entity.label };
  };
}

// ---------------------------------------------------------------------------

export interface RecordScope extends EntityScope {
  recordId: string;
}

export type GetRecord = (scope: RecordScope) => Promise<AppRecord>;

/** RF-16: abrir un registro para editarlo. */
export function getRecordUseCase(dependencies: AppUseCasesDependencies): GetRecord {
  return async (scope) => {
    const { application, entity } = await openEntity(
      dependencies,
      scope.projectId,
      scope.actorId,
      scope.entityName,
    );

    const record = await dependencies.records.find(application, entity, scope.recordId);
    if (!record) throw AppError.notFound('No encontramos ese registro.');

    return record;
  };
}

// ---------------------------------------------------------------------------

export interface WriteRecordInput extends EntityScope {
  values: unknown;
}

export type CreateRecord = (input: WriteRecordInput) => Promise<AppRecord>;

/**
 * RF-15 y RF-23: crear un registro desde la aplicacion generada.
 *
 * El esquema de validacion se construye en el momento a partir del blueprint, no
 * esta escrito a mano en ningun sitio. Asi no puede divergir de las tablas que
 * se crearon con esa misma definicion.
 */
export function createRecordUseCase(dependencies: AppUseCasesDependencies): CreateRecord {
  return async (input) => {
    const { application, entity } = await openEntity(
      dependencies,
      input.projectId,
      input.actorId,
      input.entityName,
    );

    const values = buildRecordSchema(entity).parse(input.values);
    const id = await dependencies.records.create(application, entity, values);

    const created = await dependencies.records.find(application, entity, id);
    if (!created) throw AppError.internal();

    return created;
  };
}

// ---------------------------------------------------------------------------

export interface UpdateRecordInput extends RecordScope {
  values: unknown;
}

export type UpdateRecord = (input: UpdateRecordInput) => Promise<AppRecord>;

/**
 * RF-24: modificar un registro, incluidos los que vinieron del Excel.
 *
 * La validacion es parcial: un campo que no llega significa "no lo toques", no
 * "borralo". Enviar el registro entero en cada edicion seria pedirle a la
 * interfaz que no pierda nada por el camino.
 */
export function updateRecordUseCase(dependencies: AppUseCasesDependencies): UpdateRecord {
  return async (input) => {
    const { application, entity } = await openEntity(
      dependencies,
      input.projectId,
      input.actorId,
      input.entityName,
    );

    const values = buildRecordSchema(entity, { partial: true }).parse(input.values);
    const updated = await dependencies.records.update(application, entity, input.recordId, values);

    if (!updated) throw AppError.notFound('No encontramos ese registro.');

    const record = await dependencies.records.find(application, entity, input.recordId);
    if (!record) throw AppError.notFound('No encontramos ese registro.');

    return record;
  };
}

// ---------------------------------------------------------------------------

export type DeleteRecord = (scope: RecordScope) => Promise<void>;

export function deleteRecordUseCase(dependencies: AppUseCasesDependencies): DeleteRecord {
  return async (scope) => {
    const { application, entity } = await openEntity(
      dependencies,
      scope.projectId,
      scope.actorId,
      scope.entityName,
    );

    const removed = await dependencies.records.remove(application, entity, scope.recordId);
    if (!removed) throw AppError.notFound('No encontramos ese registro.');
  };
}

// ---------------------------------------------------------------------------

export interface ListOptionsInput extends EntityScope {
  search: string | null;
  limit: number;
}

export type ListOptions = (input: ListOptionsInput) => Promise<{ id: string; label: string }[]>;

/**
 * RF-17: las opciones de un selector de relacion.
 *
 * "El usuario no debera escribir manualmente identificadores internos." Esto es
 * lo que se lo evita: el formulario pide un cliente y recibe nombres.
 */
export function listOptionsUseCase(dependencies: AppUseCasesDependencies): ListOptions {
  return async (input) => {
    const { application, entity } = await openEntity(
      dependencies,
      input.projectId,
      input.actorId,
      input.entityName,
    );

    return dependencies.records.options(application, entity, input.search, input.limit);
  };
}
