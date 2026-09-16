import type { AppRecord } from '../../../application/ports/record-repository.js';
import type { RuntimeApplication, RuntimeEntity } from '../../../domain/runtime/application.js';

/**
 * Lo que ve el cliente de una aplicacion generada.
 *
 * El filtro aqui es especialmente estricto: `tableName` y `columnName` no salen
 * nunca. Una interfaz que conociera los nombres fisicos podria construir
 * peticiones contra ellos, y ademas expondria a la persona usuaria un detalle
 * del motor de base de datos que no le sirve para nada (RX-03 y la *Technical
 * Information Boundary* de `docs/architecture/frontend.md`).
 */

export interface ManifestFieldView {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  /** Modulo apuntado, por su nombre publico, cuando el campo es una relacion. */
  relatedTo: string | null;
}

export interface ManifestEntityView {
  name: string;
  label: string;
  displayField: string;
  fields: ManifestFieldView[];
}

export interface ManifestView {
  applicationName: string;
  /** RF-22: las opciones de navegacion de la aplicacion. */
  navigation: { name: string; label: string }[];
  entities: ManifestEntityView[];
}

export function toManifestView(application: RuntimeApplication): ManifestView {
  return {
    applicationName: application.applicationName,
    navigation: application.entities.map((entity) => ({
      name: entity.name,
      label: entity.label,
    })),
    entities: application.entities.map(toEntityView),
  };
}

function toEntityView(entity: RuntimeEntity): ManifestEntityView {
  return {
    name: entity.name,
    label: entity.label,
    displayField: entity.displayField,
    fields: entity.fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options,
      relatedTo: field.relatedEntity,
    })),
  };
}

export interface RecordView {
  id: string;
  values: Record<string, unknown>;
  /**
   * Etiqueta del registro relacionado, por campo.
   *
   * El identificador sigue en `values` porque el formulario lo necesita para
   * guardar, pero la lista muestra esto: "Comercial Andes", no un UUID (RF-17).
   */
  related: Record<string, string | null>;
}

export function toRecordView(record: AppRecord): RecordView {
  return { id: record.id, values: record.values, related: record.relatedLabels };
}
