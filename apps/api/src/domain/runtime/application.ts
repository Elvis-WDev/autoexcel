import type { StoredBlueprint } from '../../application/ports/blueprint-repository.js';
import type { FieldType } from '../blueprint/types.js';
import { AppError } from '../errors.js';
import { assertSafeIdentifier } from '../identifiers.js';

/**
 * Descriptor de una aplicacion ya construida.
 *
 * Es la traduccion del blueprint a lo que el CRUD generico necesita para
 * trabajar: que tabla, que columnas y que tipos. Se construye a partir de los
 * nombres fisicos que F5 persistio, nunca derivando nada de texto escrito por
 * una persona (ADR 0001).
 *
 * La separacion entre `name` y `columnName` es deliberada y recorre toda la
 * fase: `name` es la direccion publica, legible y estable; `columnName` es el
 * identificador fisico y no sale nunca de la capa de datos.
 */

export interface RuntimeField {
  /** Direccion publica del campo. */
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[] | null;
  /** Identificador fisico. No se expone al cliente. */
  columnName: string;
  /** Entidad apuntada, por su `name`, cuando el tipo es `relation`. */
  relatedEntity: string | null;
}

export interface RuntimeEntity {
  name: string;
  label: string;
  tableName: string;
  /** Campo que representa al registro en listas y selectores (RF-17). */
  displayField: string;
  fields: RuntimeField[];
}

export interface RuntimeApplication {
  applicationName: string;
  schemaName: string;
  entities: RuntimeEntity[];
}

/**
 * Construye el descriptor, o explica por que no se puede.
 *
 * Que falte `tableName` significa que la aplicacion no se ha construido: es un
 * estado legitimo, no un error interno, y merece un mensaje que lo diga.
 */
export function buildRuntimeApplication(
  schemaName: string,
  blueprint: StoredBlueprint,
): RuntimeApplication {
  assertSafeIdentifier(schemaName, 'nombre de schema');

  const entities: RuntimeEntity[] = blueprint.entities.map((entity) => {
    if (!entity.tableName) {
      throw AppError.invalidState('Tu aplicacion todavia no se ha creado.');
    }

    const fields: RuntimeField[] = entity.fields.map((field) => {
      if (!field.columnName) {
        throw AppError.invalidState('Tu aplicacion todavia no se ha creado.');
      }

      return {
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        // Se valida al construir el descriptor y otra vez al componer el SQL.
        columnName: assertSafeIdentifier(field.columnName, 'nombre de columna'),
        relatedEntity: field.targetEntityName,
      };
    });

    const displayField = entity.displayFieldName ?? fields[0]?.name;
    if (!displayField) {
      throw AppError.internal(
        'Algo salio mal al abrir tu aplicacion.',
        new Error(`Entidad sin campo mostrado: ${entity.name}`),
      );
    }

    return {
      name: entity.name,
      label: entity.label,
      tableName: assertSafeIdentifier(entity.tableName, 'nombre de tabla'),
      displayField,
      fields,
    };
  });

  return { applicationName: blueprint.applicationName, schemaName, entities };
}

/**
 * Resuelve el nombre que llego por la URL contra el descriptor.
 *
 * Es la unica via para llegar a una tabla: el valor de la URL se BUSCA, nunca se
 * usa para componer SQL. Aunque alguien pida `/app/x";DROP/records`, lo unico
 * que ocurre es que no encuentra nada.
 */
export function findEntity(application: RuntimeApplication, entityName: string): RuntimeEntity {
  const entity = application.entities.find((candidate) => candidate.name === entityName);
  if (!entity) throw AppError.notFound('No encontramos ese modulo.');
  return entity;
}

export function findField(entity: RuntimeEntity, fieldName: string): RuntimeField {
  const field = entity.fields.find((candidate) => candidate.name === fieldName);
  if (!field) throw AppError.notFound('No encontramos ese campo.');
  return field;
}

/** Campos por los que tiene sentido ordenar una lista. */
export function isSortable(field: RuntimeField): boolean {
  return field.type !== 'relation';
}

/**
 * Texto mostrable de un valor leido de la base.
 *
 * Una columna puede devolver texto, numero, fecha o nulo segun su tipo, y la
 * etiqueta de un registro tiene que salir legible en todos los casos. Un objeto
 * no tiene representacion util, asi que se descarta en vez de imprimir
 * `[object Object]` en un selector.
 */
export function toLabelText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}
