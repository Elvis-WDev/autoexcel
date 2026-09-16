import type { ColumnProfile } from '../spreadsheet/column-profile.js';
import { isFieldType, type ProposedBlueprint, type ProposedEntity } from './types.js';

/**
 * Validador determinista de la propuesta.
 *
 * Es la garantia del sistema, no los structured outputs. Un esquema reduce la
 * probabilidad de que el modelo devuelva algo invalido; no la elimina, y no
 * puede expresar las reglas que de verdad importan aqui: que una relacion no
 * cierre un ciclo, que toda referencia resuelva, que una columna que identifica
 * cada fila no se haya convertido en entidad.
 *
 * Todo lo de este archivo se cumple sea cual sea el origen de la propuesta.
 */

export type Severity = 'error' | 'repair';

export interface ValidationIssue {
  /** `error` invalida la propuesta; `repair` se corrige sin preguntar. */
  severity: Severity;
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Propuesta con las correcciones automaticas ya aplicadas. */
  blueprint: ProposedBlueprint;
}

export interface ValidationContext {
  /** Perfil de cada columna incluida, indexado por `hoja:columna`. */
  profiles: ReadonlyMap<string, ColumnProfile>;
  /** Hojas incluidas en el modelo. */
  includedSheetIndexes: ReadonlySet<number>;
}

export function profileKey(sheetIndex: number, columnIndex: number): string {
  return `${sheetIndex}:${columnIndex}`;
}

const MAX_ENTITIES = 30;
const MAX_FIELDS_PER_ENTITY = 60;
const MAX_SELECT_OPTIONS = 50;

/**
 * Por encima de esta cardinalidad, una columna identifica filas y no puede
 * originar una entidad derivada (RI-01). Es el mismo umbral del perfilado.
 */
const ENTITY_CARDINALITY_CEILING = 0.95;

export function validateBlueprint(
  candidate: ProposedBlueprint,
  context: ValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const blueprint = structuredClone(candidate);

  validateShape(blueprint, issues);
  const entitiesByName = indexEntities(blueprint, issues);
  validateFields(blueprint, entitiesByName, context, issues);
  validateRelations(blueprint, entitiesByName, issues);
  validateTraceability(blueprint, context, issues);
  validateInferenceRules(blueprint, context, issues);

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    blueprint,
  };
}

// ---------------------------------------------------------------------------

function validateShape(blueprint: ProposedBlueprint, issues: ValidationIssue[]): void {
  if (!blueprint.applicationName || blueprint.applicationName.trim().length === 0) {
    issues.push({
      severity: 'repair',
      code: 'APPLICATION_NAME_MISSING',
      message: 'La aplicacion no tenia nombre.',
    });
    blueprint.applicationName = 'Mi aplicacion';
  }

  if (blueprint.entities.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_ENTITIES',
      message: 'La propuesta no contiene ninguna entidad.',
    });
  }

  if (blueprint.entities.length > MAX_ENTITIES) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_ENTITIES',
      message: `La propuesta contiene ${blueprint.entities.length} entidades; el maximo es ${MAX_ENTITIES}.`,
    });
  }
}

function indexEntities(
  blueprint: ProposedBlueprint,
  issues: ValidationIssue[],
): Map<string, ProposedEntity> {
  const byName = new Map<string, ProposedEntity>();

  for (const entity of blueprint.entities) {
    if (!entity.name || entity.name.trim().length === 0) {
      issues.push({
        severity: 'error',
        code: 'ENTITY_NAME_MISSING',
        message: 'Una entidad llego sin nombre.',
      });
      continue;
    }

    if (byName.has(entity.name)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ENTITY',
        message: `Hay dos entidades llamadas "${entity.name}".`,
        path: entity.name,
      });
      continue;
    }

    byName.set(entity.name, entity);
  }

  return byName;
}

function validateFields(
  blueprint: ProposedBlueprint,
  entitiesByName: ReadonlyMap<string, ProposedEntity>,
  context: ValidationContext,
  issues: ValidationIssue[],
): void {
  for (const entity of blueprint.entities) {
    if (entity.fields.length === 0) {
      issues.push({
        severity: 'error',
        code: 'ENTITY_WITHOUT_FIELDS',
        message: `La entidad "${entity.label}" no tiene ningun campo.`,
        path: entity.name,
      });
      continue;
    }

    if (entity.fields.length > MAX_FIELDS_PER_ENTITY) {
      issues.push({
        severity: 'error',
        code: 'TOO_MANY_FIELDS',
        message: `La entidad "${entity.label}" tiene ${entity.fields.length} campos; el maximo es ${MAX_FIELDS_PER_ENTITY}.`,
        path: entity.name,
      });
    }

    const seen = new Set<string>();

    for (const field of entity.fields) {
      const path = `${entity.name}.${field.name}`;

      if (!field.name || seen.has(field.name)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_FIELD',
          message: `La entidad "${entity.label}" repite el campo "${field.name}".`,
          path,
        });
        continue;
      }
      seen.add(field.name);

      // P-02: nada fuera del vocabulario cerrado.
      if (!isFieldType(field.type)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_FIELD_TYPE',
          message: `El campo "${field.label}" usa un tipo que el sistema no soporta.`,
          path,
        });
        continue;
      }

      if (field.type === 'relation') {
        if (!field.targetEntity || !entitiesByName.has(field.targetEntity)) {
          issues.push({
            severity: 'error',
            code: 'RELATION_TARGET_MISSING',
            message: `El campo "${field.label}" apunta a una entidad que no existe.`,
            path,
          });
        }
      } else if (field.targetEntity !== undefined) {
        issues.push({
          severity: 'repair',
          code: 'TARGET_ON_NON_RELATION',
          message: `El campo "${field.label}" declaraba destino sin ser una relacion.`,
          path,
        });
        delete field.targetEntity;
      }

      if (field.type === 'select') {
        validateSelectOptions(entity, field.name, field.label, field, context, issues, path);
      } else if (field.options !== undefined) {
        issues.push({
          severity: 'repair',
          code: 'OPTIONS_ON_NON_SELECT',
          message: `El campo "${field.label}" traia opciones sin ser una seleccion.`,
          path,
        });
        delete field.options;
      }
    }

    validateDisplayField(entity, issues);
    validateDedupeField(entity, issues);
  }
}

function validateSelectOptions(
  entity: ProposedEntity,
  fieldName: string,
  label: string,
  field: { options?: string[]; source?: { sheetIndex: number; columnIndex: number } },
  context: ValidationContext,
  issues: ValidationIssue[],
  path: string,
): void {
  // Un `select` sin opciones se puede reparar: sus valores estan en el perfil de
  // la columna de origen, que es de donde deberian haber salido.
  if (!field.options || field.options.length === 0) {
    const profile = field.source
      ? context.profiles.get(profileKey(field.source.sheetIndex, field.source.columnIndex))
      : undefined;

    if (profile && profile.distinct > 0 && profile.distinct <= MAX_SELECT_OPTIONS) {
      field.options = [...profile.samples];
      issues.push({
        severity: 'repair',
        code: 'SELECT_OPTIONS_RECOVERED',
        message: `Las opciones de "${label}" se tomaron de los valores del archivo.`,
        path,
      });
      return;
    }

    issues.push({
      severity: 'error',
      code: 'SELECT_WITHOUT_OPTIONS',
      message: `El campo "${label}" es una seleccion pero no tiene opciones.`,
      path,
    });
    return;
  }

  if (field.options.length > MAX_SELECT_OPTIONS) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_OPTIONS',
      message: `El campo "${label}" tiene demasiadas opciones para ser una seleccion.`,
      path,
    });
  }

  void entity;
  void fieldName;
}

/** RF-17 es imposible sin un campo que represente al registro. */
function validateDisplayField(entity: ProposedEntity, issues: ValidationIssue[]): void {
  const usable = entity.fields.filter(
    (field) => field.type !== 'relation' && field.type !== 'boolean',
  );

  if (entity.displayField && entity.fields.some((field) => field.name === entity.displayField)) {
    return;
  }

  const replacement = usable.find((field) => field.type === 'text') ?? usable[0];

  if (!replacement) {
    issues.push({
      severity: 'error',
      code: 'NO_DISPLAY_FIELD',
      message: `La entidad "${entity.label}" no tiene ningun campo que sirva para identificarla en un selector.`,
      path: entity.name,
    });
    return;
  }

  issues.push({
    severity: 'repair',
    code: 'DISPLAY_FIELD_REPLACED',
    message: `Se eligio "${replacement.label}" para representar a "${entity.label}".`,
    path: entity.name,
  });
  entity.displayField = replacement.name;
}

/** Decision 3 del plan: la clave de deduplicacion debe existir. */
function validateDedupeField(entity: ProposedEntity, issues: ValidationIssue[]): void {
  if (entity.dedupeField === undefined) {
    if (entity.origin === 'derived') entity.dedupeField = entity.displayField;
    return;
  }

  if (entity.fields.some((field) => field.name === entity.dedupeField)) return;

  issues.push({
    severity: 'repair',
    code: 'DEDUPE_FIELD_REPLACED',
    message: `La clave de "${entity.label}" apuntaba a un campo inexistente; se uso "${entity.displayField}".`,
    path: entity.name,
  });
  entity.dedupeField = entity.displayField;
}

function validateRelations(
  blueprint: ProposedBlueprint,
  entitiesByName: ReadonlyMap<string, ProposedEntity>,
  issues: ValidationIssue[],
): void {
  const kept: typeof blueprint.relations = [];

  for (const relation of blueprint.relations) {
    const path = `${relation.fromEntity}.${relation.fieldName}`;
    const from = entitiesByName.get(relation.fromEntity);
    const to = entitiesByName.get(relation.toEntity);

    if (!from || !to) {
      issues.push({
        severity: 'error',
        code: 'RELATION_ENTITY_MISSING',
        message: 'Una relacion apunta a una entidad que no existe.',
        path,
      });
      continue;
    }

    // ERS 16, restriccion 6: nada de entidades jerarquicas en el MVP.
    if (from.name === to.name) {
      issues.push({
        severity: 'error',
        code: 'SELF_RELATION',
        message: `La entidad "${from.label}" no puede relacionarse consigo misma.`,
        path,
      });
      continue;
    }

    const field = from.fields.find((candidate) => candidate.name === relation.fieldName);

    if (!field) {
      issues.push({
        severity: 'error',
        code: 'RELATION_FIELD_MISSING',
        message: `La relacion entre "${from.label}" y "${to.label}" no tiene campo que la sostenga.`,
        path,
      });
      continue;
    }

    if (field.type !== 'relation' || field.targetEntity !== to.name) {
      issues.push({
        severity: 'error',
        code: 'RELATION_FIELD_MISMATCH',
        message: `El campo "${field.label}" no coincide con la relacion declarada.`,
        path,
      });
      continue;
    }

    // ERS 16, restriccion 5: nada de muchos-a-muchos.
    if (relation.type !== 'many_to_one' && relation.type !== 'one_to_many') {
      issues.push({
        severity: 'error',
        code: 'UNSUPPORTED_RELATION_TYPE',
        message: 'Solo se soportan relaciones de uno a muchos.',
        path,
      });
      continue;
    }

    kept.push({ ...relation, type: 'many_to_one' });
  }

  blueprint.relations = kept;
  detectCycles(blueprint, issues);
  detectMissingRelations(blueprint, entitiesByName, issues);
}

/**
 * Un ciclo de relaciones hace imposible ordenar la creacion de tablas y la
 * importacion: no habria por donde empezar.
 */
function detectCycles(blueprint: ProposedBlueprint, issues: ValidationIssue[]): void {
  const edges = new Map<string, string[]>();
  for (const relation of blueprint.relations) {
    const list = edges.get(relation.fromEntity) ?? [];
    list.push(relation.toEntity);
    edges.set(relation.fromEntity, list);
  }

  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (done.has(node)) return false;

    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    done.add(node);
    return false;
  };

  for (const entity of blueprint.entities) {
    if (walk(entity.name)) {
      issues.push({
        severity: 'error',
        code: 'RELATION_CYCLE',
        message: 'Las relaciones propuestas forman un ciclo y no se pueden construir.',
      });
      return;
    }
  }
}

/** Todo campo de tipo relacion necesita su relacion declarada, y al reves. */
function detectMissingRelations(
  blueprint: ProposedBlueprint,
  entitiesByName: ReadonlyMap<string, ProposedEntity>,
  issues: ValidationIssue[],
): void {
  const declared = new Set(
    blueprint.relations.map((relation) => `${relation.fromEntity}.${relation.fieldName}`),
  );

  for (const entity of entitiesByName.values()) {
    for (const field of entity.fields) {
      if (field.type !== 'relation') continue;

      const key = `${entity.name}.${field.name}`;
      if (declared.has(key)) continue;

      // Reparable: el campo ya dice todo lo necesario.
      if (field.targetEntity && entitiesByName.has(field.targetEntity)) {
        blueprint.relations.push({
          fromEntity: entity.name,
          toEntity: field.targetEntity,
          fieldName: field.name,
          type: 'many_to_one',
        });
        issues.push({
          severity: 'repair',
          code: 'RELATION_RECOVERED',
          message: `Se declaro la relacion entre "${entity.label}" y "${field.targetEntity}".`,
          path: key,
        });
      }
    }
  }
}

/**
 * RNF-02: toda columna del archivo tiene que acabar en algun sitio, o haberse
 * descartado a proposito. Sin esto la importacion de F6 no sabria de donde sale
 * cada valor.
 */
function validateTraceability(
  blueprint: ProposedBlueprint,
  context: ValidationContext,
  issues: ValidationIssue[],
): void {
  const mapped = new Set<string>();

  for (const entity of blueprint.entities) {
    for (const field of entity.fields) {
      if (!field.source) continue;

      const key = profileKey(field.source.sheetIndex, field.source.columnIndex);

      if (!context.profiles.has(key)) {
        issues.push({
          severity: 'error',
          code: 'SOURCE_COLUMN_UNKNOWN',
          message: `El campo "${field.label}" dice venir de una columna que no existe en el archivo.`,
          path: `${entity.name}.${field.name}`,
        });
        continue;
      }

      if (!context.includedSheetIndexes.has(field.source.sheetIndex)) {
        issues.push({
          severity: 'error',
          code: 'SOURCE_SHEET_EXCLUDED',
          message: `El campo "${field.label}" viene de una hoja que se excluyo del modelo.`,
          path: `${entity.name}.${field.name}`,
        });
        continue;
      }

      mapped.add(key);
    }
  }

  const unmapped = [...context.profiles.keys()].filter((key) => !mapped.has(key));

  // Que sobren columnas no invalida nada: el usuario puede querer ignorarlas.
  // Pero queda anotado, porque RX-06 pide no ocultar decisiones importantes.
  if (unmapped.length > 0) {
    issues.push({
      severity: 'repair',
      code: 'COLUMNS_NOT_MAPPED',
      message: `${unmapped.length} columna(s) del archivo no se usaron en el modelo.`,
    });
  }
}

/**
 * Reglas de inferencia funcional (ERS 11).
 *
 * El modelo tiende a normalizar de mas: convierte `Ciudad`, `Estado` o
 * `Categoria` en entidades porque "son conceptos". RI-05 lo prohibe sin
 * evidencia, y RI-04 pide preferir lo simple. Aqui se hace cumplir.
 */
function validateInferenceRules(
  blueprint: ProposedBlueprint,
  context: ValidationContext,
  issues: ValidationIssue[],
): void {
  for (const entity of blueprint.entities) {
    if (entity.origin !== 'derived') continue;

    const key = entity.dedupeField ?? entity.displayField;
    const field = entity.fields.find((candidate) => candidate.name === key);
    if (!field?.source) continue;

    const profile = context.profiles.get(
      profileKey(field.source.sheetIndex, field.source.columnIndex),
    );
    if (!profile) continue;

    // RI-01: una columna que identifica cada fila no agrupa nada. Convertirla en
    // entidad produciria una tabla con tantas filas como el origen y ninguna
    // relacion util.
    if (profile.cardinalityRatio >= ENTITY_CARDINALITY_CEILING) {
      issues.push({
        severity: 'error',
        code: 'ENTITY_FROM_IDENTIFYING_COLUMN',
        message: `"${entity.label}" sale de una columna cuyos valores casi no se repiten, asi que no agrupa nada.`,
        path: entity.name,
      });
    }
  }
}
