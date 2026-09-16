/**
 * El vocabulario cerrado del sistema (ERS RF-08 y P-02).
 *
 * "La IA no puede generar componentes arbitrarios. Solo podra proponer elementos
 * soportados por el sistema." Esta lista ES ese limite. Nada fuera de aqui puede
 * llegar a persistirse, pase lo que pase aguas arriba.
 */
export const FIELD_TYPES = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
  'select',
  'relation',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * ERS 12.4. Una relacion es una sola arista; `many_to_one` y `one_to_many` son
 * la misma vista desde cada extremo. Internamente se declara siempre desde el
 * lado "muchos" (el viaje que pertenece a un cliente), porque es el lado que
 * lleva el campo.
 */
export const RELATION_TYPES = ['one_to_many', 'many_to_one'] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** De donde sale una entidad. */
export type EntityOrigin =
  /** Una hoja completa se convirtio en entidad. */
  | 'sheet'
  /** Salio de los valores repetidos de una columna (RI-02). */
  | 'derived';

export interface ProposedField {
  /** Identificador logico dentro de la entidad. F5 derivara de aqui la columna. */
  name: string;
  /** Lo que ve la persona usuaria. */
  label: string;
  type: FieldType;
  required: boolean;
  /** Opciones cerradas cuando `type` es `select`. */
  options?: string[];
  /** Entidad apuntada cuando `type` es `relation`. */
  targetEntity?: string;
  /** Trazabilidad RNF-02: de que columna del archivo sale este campo. */
  source?: { sheetIndex: number; columnIndex: number };
}

export interface ProposedEntity {
  name: string;
  label: string;
  origin: EntityOrigin;
  /** Hoja de la que procede, cuando `origin` es `sheet` o la columna origen. */
  sourceSheetIndex?: number;
  /**
   * Campo que representa al registro en un selector.
   *
   * El ERS no lo define, pero RF-17 es imposible sin el: un formulario de viaje
   * tiene que ofrecer "Comercial Andes", no un identificador interno.
   */
  displayField: string;
  /**
   * Campo que decide si dos filas son el mismo registro (decision 3 del plan).
   * Solo tiene sentido en entidades derivadas.
   */
  dedupeField?: string;
  fields: ProposedField[];
}

export interface ProposedRelation {
  /** Lado "muchos": la entidad que lleva el campo. */
  fromEntity: string;
  /** Lado "uno". */
  toEntity: string;
  /** Campo de `fromEntity`, de tipo `relation`, que materializa la relacion. */
  fieldName: string;
  type: RelationType;
}

export interface ProposedBlueprint {
  applicationName: string;
  entities: ProposedEntity[];
  relations: ProposedRelation[];
}

/** Como se obtuvo la propuesta. Importa para RX-05 y para diagnosticar. */
export type BlueprintOrigin =
  /** Propuesta por el motor de inferencia. */
  | 'inferred'
  /** Camino determinista de RE-04: una entidad por hoja. */
  | 'fallback';

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value);
}
