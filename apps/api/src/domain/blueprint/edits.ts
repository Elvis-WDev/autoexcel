import { AppError } from '../errors.js';
import type { ColumnProfile } from '../spreadsheet/column-profile.js';
import { singularize } from '../spanish.js';
import { normalizeHeader } from '../spreadsheet/normalization.js';
import { profileKey } from './validator.js';
import type { FieldType, ProposedBlueprint, ProposedEntity, ProposedField } from './types.js';

/**
 * Ediciones del blueprint (RF-06, RF-09, RF-11).
 *
 * Todas son funciones puras: reciben una propuesta y devuelven otra. No tocan la
 * base de datos ni validan; quien llama valida despues, con el validador que ya
 * existe. Eso permite comprobar el resultado ANTES de escribirlo, que es lo que
 * exige RNF-04.
 *
 * El principio que gobierna este archivo es RI-06: "El usuario tiene la decision
 * final". Ninguna de estas operaciones discute con la persona usuaria; como
 * mucho, explica que consecuencia tuvo lo que pidio.
 */

export interface EditContext {
  /** Perfil de cada columna, para reconstruir tipos al deshacer una relacion. */
  profiles: ReadonlyMap<string, ColumnProfile>;
}

export interface EditResult {
  blueprint: ProposedBlueprint;
  /** Consecuencias que la persona usuaria debe conocer (RX-06). */
  notes: string[];
}

function clone(blueprint: ProposedBlueprint): ProposedBlueprint {
  return structuredClone(blueprint);
}

function requireEntity(blueprint: ProposedBlueprint, entityName: string): ProposedEntity {
  const entity = blueprint.entities.find((candidate) => candidate.name === entityName);
  if (!entity) throw AppError.notFound('No encontramos ese grupo de informacion.');
  return entity;
}

function requireField(entity: ProposedEntity, fieldName: string): ProposedField {
  const field = entity.fields.find((candidate) => candidate.name === fieldName);
  if (!field) throw AppError.notFound('No encontramos ese campo.');
  return field;
}

// ---------------------------------------------------------------------------

export function setApplicationName(
  blueprint: ProposedBlueprint,
  applicationName: string,
): EditResult {
  const next = clone(blueprint);
  next.applicationName = applicationName.trim();
  return { blueprint: next, notes: [] };
}

/**
 * Cambia la etiqueta visible de una entidad.
 *
 * El identificador interno (`name`) no cambia. Es lo que hace que la direccion de
 * la entidad sea estable aunque se la renombre diez veces, y lo que impide que
 * un renombrado invalide las referencias de las relaciones.
 */
export function renameEntity(
  blueprint: ProposedBlueprint,
  entityName: string,
  label: string,
): EditResult {
  const next = clone(blueprint);
  requireEntity(next, entityName).label = label.trim();
  return { blueprint: next, notes: [] };
}

/**
 * Elimina una entidad de la propuesta.
 *
 * Los campos de otras entidades que apuntaban a ella NO se borran: se convierten
 * en campos simples que conservan su columna de origen. Es la diferencia entre
 * perder informacion y dejar de normalizarla.
 *
 * Es literalmente el ejemplo de RI-06: si la inferencia propone `Productos`,
 * `Clientes` y `Ventas`, y el usuario decide mantener `Producto` dentro de
 * `Ventas`, su decision prevalece y el dato sigue ahi.
 */
export function removeEntity(
  blueprint: ProposedBlueprint,
  entityName: string,
  context: EditContext,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);
  const notes: string[] = [];

  if (next.entities.length === 1) {
    throw AppError.validation('Tu aplicacion necesita al menos un grupo de informacion.');
  }

  for (const other of next.entities) {
    if (other.name === entityName) continue;

    for (const field of other.fields) {
      if (field.type !== 'relation' || field.targetEntity !== entityName) continue;

      field.type = plainTypeFor(field, context);
      delete field.targetEntity;
      notes.push(
        `"${field.label}" de ${other.label} deja de vincularse a ${entity.label} y pasa a guardar el texto directamente.`,
      );
    }
  }

  next.entities = next.entities.filter((candidate) => candidate.name !== entityName);
  next.relations = next.relations.filter(
    (relation) => relation.fromEntity !== entityName && relation.toEntity !== entityName,
  );

  notes.unshift(`Se elimino ${entity.label} de la propuesta.`);
  return { blueprint: next, notes };
}

export interface FieldPatch {
  label?: string;
  type?: FieldType;
  required?: boolean;
  options?: string[];
}

/**
 * Modifica un campo (RF-09).
 *
 * No permite convertir un campo normal en relacion ni al reves. Convertir un
 * texto en relacion no es cambiar un tipo: es decidir que existe otra entidad,
 * con que clave se agrupa y que pasa con los valores que no encajen. Eso se hace
 * volviendo a analizar o eliminando la entidad, que son operaciones que si
 * expresan esa intencion. Deshacer una relacion tiene su propia via, en
 * `rejectRelation`.
 */
export function updateField(
  blueprint: ProposedBlueprint,
  entityName: string,
  fieldName: string,
  patch: FieldPatch,
  context: EditContext,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);
  const field = requireField(entity, fieldName);
  const notes: string[] = [];

  if (patch.type !== undefined && patch.type !== field.type) {
    if (field.type === 'relation') {
      throw AppError.validation(
        `"${field.label}" esta vinculado a otro grupo de informacion. Para convertirlo en un campo normal, rechaza primero esa relacion.`,
      );
    }
    if (patch.type === 'relation') {
      throw AppError.validation(
        'Para vincular un campo a otro grupo de informacion hay que volver a analizar el archivo.',
      );
    }

    field.type = patch.type;

    // Un `select` sin opciones no es utilizable; se recuperan del archivo.
    if (patch.type === 'select' && !patch.options) {
      const recovered = optionsFromProfile(field, context);
      if (recovered) {
        field.options = recovered;
        notes.push(`Las opciones de "${field.label}" se tomaron de los valores del archivo.`);
      }
    }

    if (patch.type !== 'select') delete field.options;
  }

  if (patch.label !== undefined) field.label = patch.label.trim();
  if (patch.required !== undefined) field.required = patch.required;
  if (patch.options !== undefined && field.type === 'select') field.options = patch.options;

  return { blueprint: next, notes };
}

export function removeField(
  blueprint: ProposedBlueprint,
  entityName: string,
  fieldName: string,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);
  const field = requireField(entity, fieldName);

  if (entity.fields.length === 1) {
    throw AppError.validation(`${entity.label} necesita conservar al menos un campo.`);
  }

  entity.fields = entity.fields.filter((candidate) => candidate.name !== fieldName);

  // Quitar el campo que sostenia una relacion quita tambien la relacion.
  const notes: string[] = [];
  if (field.type === 'relation') {
    next.relations = next.relations.filter(
      (relation) => !(relation.fromEntity === entityName && relation.fieldName === fieldName),
    );
    notes.push(`${entity.label} deja de estar vinculado a ${field.targetEntity ?? 'otro grupo'}.`);
  }

  // El validador repondra el campo mostrado si era este; se avisa igualmente.
  if (entity.displayField === fieldName) {
    notes.push(
      `Elegiremos otro campo para identificar cada ${singularize(entity.label).toLowerCase()}.`,
    );
  }

  return { blueprint: next, notes };
}

export interface NewField {
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

/**
 * Anade un campo que no venia del archivo (RF-09, parte opcional).
 *
 * Nace sin columna de origen, asi que la importacion lo dejara vacio en los
 * registros existentes: no hay de donde sacar ese dato. Por eso no puede ser
 * obligatorio, o la importacion rechazaria todas las filas.
 */
export function addField(
  blueprint: ProposedBlueprint,
  entityName: string,
  input: NewField,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);

  if (input.type === 'relation') {
    throw AppError.validation(
      'Para vincular un campo a otro grupo de informacion hay que volver a analizar el archivo.',
    );
  }

  const name = uniqueFieldName(entity, input.label);
  const notes: string[] = [];

  if (input.required) {
    notes.push(
      `"${input.label}" no puede ser obligatorio: los registros que ya existen en el archivo no traen ese dato.`,
    );
  }

  entity.fields.push({
    name,
    label: input.label.trim(),
    type: input.type,
    required: false,
    ...(input.options ? { options: input.options } : {}),
  });

  return { blueprint: next, notes };
}

/**
 * Rechaza una relacion (RF-11).
 *
 * "El usuario debera poder rechazar la relacion." Rechazarla no borra nada: el
 * campo se queda, con su columna de origen, guardando el texto tal cual venia.
 * La entidad apuntada tampoco desaparece, porque puede seguir teniendo sentido
 * por su cuenta.
 */
export function rejectRelation(
  blueprint: ProposedBlueprint,
  fromEntityName: string,
  fieldName: string,
  context: EditContext,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, fromEntityName);
  const field = requireField(entity, fieldName);

  if (field.type !== 'relation') {
    throw AppError.validation('Ese campo no esta vinculado a ningun grupo de informacion.');
  }

  const target = field.targetEntity;
  field.type = plainTypeFor(field, context);
  delete field.targetEntity;

  next.relations = next.relations.filter(
    (relation) => !(relation.fromEntity === fromEntityName && relation.fieldName === fieldName),
  );

  return {
    blueprint: next,
    notes: [
      `"${field.label}" de ${entity.label} deja de vincularse${target ? ` a ${target}` : ''} y pasa a guardar el texto directamente.`,
    ],
  };
}

/** Elige que campo representa al registro en un selector (RF-17). */
export function setDisplayField(
  blueprint: ProposedBlueprint,
  entityName: string,
  fieldName: string,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);
  const field = requireField(entity, fieldName);

  if (field.type === 'relation' || field.type === 'boolean') {
    throw AppError.validation(
      `"${field.label}" no sirve para identificar un registro en una lista. Elige un nombre, un codigo o una descripcion.`,
    );
  }

  entity.displayField = fieldName;
  return { blueprint: next, notes: [] };
}

/**
 * Elige la clave de deduplicacion (decision 3 del plan).
 *
 * Es la decision con mas consecuencias de todo el asistente: determina cuantos
 * registros existiran. Con `nombre`, dos clientes homonimos se fusionan en uno;
 * con `ruc`, no. Por eso se ofrece y se explica, en vez de adivinarse.
 */
export function setDedupeField(
  blueprint: ProposedBlueprint,
  entityName: string,
  fieldName: string | null,
  context: EditContext,
): EditResult {
  const next = clone(blueprint);
  const entity = requireEntity(next, entityName);

  if (fieldName === null) {
    delete entity.dedupeField;
    return { blueprint: next, notes: [] };
  }

  const field = requireField(entity, fieldName);
  const notes: string[] = [];

  if (field.type === 'relation') {
    throw AppError.validation('Un campo vinculado no sirve para distinguir registros.');
  }

  const profile = field.source
    ? context.profiles.get(profileKey(field.source.sheetIndex, field.source.columnIndex))
    : undefined;

  // Si la columna elegida repite valores, la deduplicacion fusionara registros
  // que quiza sean distintos. No se impide: se avisa (RX-06).
  if (profile && profile.distinct > 0 && profile.cardinalityRatio < 0.99) {
    notes.push(
      `Ojo: "${field.label}" tiene valores repetidos en el archivo, asi que algunos registros se fusionaran en uno.`,
    );
  }

  entity.dedupeField = fieldName;
  return { blueprint: next, notes };
}

// ---------------------------------------------------------------------------

/** Tipo que tendra un campo de relacion al dejar de serlo. */
function plainTypeFor(field: ProposedField, context: EditContext): FieldType {
  if (!field.source) return 'text';

  const profile = context.profiles.get(
    profileKey(field.source.sheetIndex, field.source.columnIndex),
  );
  if (!profile) return 'text';

  // El perfilado no produce `select` ni `relation`, asi que lo que devuelva ya
  // pertenece al vocabulario de campos simples.
  return profile.inferredType;
}

function optionsFromProfile(field: ProposedField, context: EditContext): string[] | null {
  if (!field.source) return null;

  const profile = context.profiles.get(
    profileKey(field.source.sheetIndex, field.source.columnIndex),
  );
  if (!profile || profile.distinct === 0 || profile.distinct > 50) return null;

  return [...profile.samples];
}

function uniqueFieldName(entity: ProposedEntity, label: string): string {
  const base = normalizeHeader(label) || 'campo';
  const taken = new Set(entity.fields.map((field) => field.name));

  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}
