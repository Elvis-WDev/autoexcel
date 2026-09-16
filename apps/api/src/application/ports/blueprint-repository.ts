import type {
  BlueprintOrigin,
  FieldType,
  ProposedBlueprint,
  RelationType,
} from '../../domain/blueprint/types.js';
import type { PhysicalPlan } from '../../domain/blueprint/physical-plan.js';
import type { ValidationIssue } from '../../domain/blueprint/validator.js';

export interface SaveBlueprintInput {
  projectId: string;
  applicationName: string;
  origin: BlueprintOrigin;
  notes: ValidationIssue[];
  blueprint: ProposedBlueprint;
}

export interface StoredField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[] | null;
  targetEntityName: string | null;
  sourceSheetIndex: number | null;
  sourceColumnIndex: number | null;
  isInferred: boolean;
  /** Identificador fisico, solo despues de construir la aplicacion. */
  columnName: string | null;
}

export interface StoredEntity {
  id: string;
  name: string;
  label: string;
  origin: 'sheet' | 'derived';
  sourceSheetIndex: number | null;
  displayFieldName: string | null;
  dedupeFieldName: string | null;
  /** Identificador fisico, solo despues de construir la aplicacion. */
  tableName: string | null;
  fields: StoredField[];
}

export interface StoredRelation {
  id: string;
  fromEntityName: string;
  toEntityName: string;
  fieldName: string;
  type: RelationType;
}

export interface StoredBlueprint {
  id: string;
  applicationName: string;
  status: 'draft' | 'confirmed';
  origin: BlueprintOrigin;
  notes: ValidationIssue[];
  entities: StoredEntity[];
  relations: StoredRelation[];
}

export interface BlueprintRepository {
  /** Sustituye el blueprint del proyecto por completo, en una transaccion. */
  replace(input: SaveBlueprintInput): Promise<void>;
  findByProject(projectId: string): Promise<StoredBlueprint | null>;
  /** Congela el blueprint: deja de ser editable (RX-07). */
  confirm(projectId: string): Promise<void>;
  /**
   * Guarda los identificadores fisicos generados al construir.
   *
   * Es lo que permite que F7 sepa a que tabla y a que columna corresponde cada
   * campo sin volver a derivar nada de texto escrito por una persona.
   */
  savePhysicalNames(projectId: string, plan: PhysicalPlan): Promise<void>;
}
