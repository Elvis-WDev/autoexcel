import { AppError } from './errors.js';

/**
 * Maquina de estados del proceso de creacion (ERS 20).
 *
 * "El usuario solo debera poder acceder a estados validos segun el avance
 * realizado." Aqui eso deja de ser una recomendacion y pasa a ser una tabla:
 * ningun endpoint puede mover un proyecto por un camino que no este declarado.
 *
 * `draft` es un anadido nuestro. El ERS empieza en `uploaded` porque asume una
 * sola aplicacion; esta plataforma es multiproyecto, asi que existe un momento
 * en que el proyecto ya existe pero todavia no tiene archivo.
 */
export const PROJECT_STATUSES = [
  'draft',
  'uploaded',
  'sheet_selected',
  'analyzing',
  'reviewing_entities',
  'reviewing_fields',
  'reviewing_relations',
  'reviewing_summary',
  'creating',
  'importing',
  'completed',
  'failed',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Transiciones permitidas.
 *
 * Los saltos hacia atras entre pasos de revision son deliberados: RX-04 exige
 * que el usuario pueda volver a pasos anteriores **antes** de crear. A partir de
 * `creating` ya no hay vuelta atras, porque a partir de ahi se toca la base de
 * datos.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  draft: ['uploaded', 'failed'],
  // Volver a subir un archivo reinicia el proyecto al estado de recien subido.
  uploaded: ['uploaded', 'sheet_selected', 'failed'],
  sheet_selected: ['uploaded', 'sheet_selected', 'analyzing', 'failed'],
  analyzing: ['reviewing_entities', 'failed'],
  reviewing_entities: ['reviewing_fields', 'failed'],
  reviewing_fields: ['reviewing_entities', 'reviewing_relations', 'failed'],
  reviewing_relations: ['reviewing_fields', 'reviewing_summary', 'failed'],
  reviewing_summary: ['reviewing_relations', 'creating', 'failed'],
  // Sin retorno: de aqui en adelante se emite DDL y se insertan filas.
  creating: ['importing', 'failed'],
  importing: ['completed', 'failed'],
  completed: [],
  // RNF-05: tras un fallo el archivo sigue ahi, asi que se puede reintentar el
  // analisis sin volver a subirlo; o subir uno corregido.
  failed: ['uploaded', 'sheet_selected'],
};

/** Estados en los que la estructura todavia no se ha materializado. */
const BEFORE_MATERIALIZATION: ReadonlySet<ProjectStatus> = new Set([
  'draft',
  'uploaded',
  'sheet_selected',
  'analyzing',
  'reviewing_entities',
  'reviewing_fields',
  'reviewing_relations',
  'reviewing_summary',
]);

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitionsFrom(from: ProjectStatus): readonly ProjectStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/** `true` si el proyecto todavia no ha creado su schema de datos. */
export function isBeforeMaterialization(status: ProjectStatus): boolean {
  return BEFORE_MATERIALIZATION.has(status);
}

/** `true` si el proceso termino, con exito o sin el. */
export function isTerminal(status: ProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/**
 * Exige una transicion concreta. Lanza INVALID_STATE (409) si no esta permitida.
 *
 * El mensaje esta escrito para una persona, no para un log: RX-03 prohibe exigir
 * vocabulario tecnico en el flujo principal.
 */
export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (canTransition(from, to)) return;

  throw AppError.invalidState(
    'Este paso no esta disponible todavia. Vuelve al asistente para continuar desde donde lo dejaste.',
    { from, to, allowed: ALLOWED_TRANSITIONS[from] },
  );
}

/**
 * Exige que el proyecto este en uno de los estados dados, para poder ejecutar
 * una accion. A diferencia de `assertTransition`, no mueve el estado.
 */
export function assertStatusIn(current: ProjectStatus, expected: readonly ProjectStatus[]): void {
  if (expected.includes(current)) return;

  throw AppError.invalidState('Esta accion no corresponde al punto en el que esta tu proyecto.', {
    current,
    expected,
  });
}
