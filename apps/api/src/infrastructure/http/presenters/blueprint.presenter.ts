import type { StoredBlueprint } from '../../../application/ports/blueprint-repository.js';
import type { JobRecord } from '../../../application/ports/job-repository.js';
import { indefiniteArticle, severalOf, singularize } from '../../../domain/spanish.js';

export interface BlueprintView {
  applicationName: string;
  status: string;
  /** RX-05: la persona usuaria debe distinguir que se propuso automaticamente. */
  wasInferred: boolean;
  /** Avisos en lenguaje de negocio sobre lo que se ajusto (RX-06). */
  notes: string[];
  entities: EntityView[];
  relations: RelationView[];
}

export interface EntityView {
  /** Direccion estable de la entidad. Los UUID internos no salen de aqui. */
  name: string;
  label: string;
  /** `true` si salio de los valores repetidos de una columna. */
  derived: boolean;
  displayField: string | null;
  dedupeField: string | null;
  fields: FieldView[];
}

export interface FieldView {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  relatedTo: string | null;
}

export interface RelationView {
  /** RF-11 y P-05: la relacion se explica, no se dibuja con jerga. */
  description: string;
  from: string;
  to: string;
  fromName: string;
  through: string;
}

/**
 * Convierte el blueprint en lo que ve el cliente.
 *
 * Lo que sale de aqui no menciona claves foraneas, ni indices, ni identificadores
 * de columna del archivo. RX-03 es explicito: la interfaz no puede exigir
 * conocimientos de bases de datos.
 */
export function toBlueprintView(blueprint: StoredBlueprint): BlueprintView {
  const labels = new Map(blueprint.entities.map((entity) => [entity.name, entity.label]));

  return {
    applicationName: blueprint.applicationName,
    status: blueprint.status,
    wasInferred: blueprint.origin === 'inferred',
    notes: blueprint.notes.filter((note) => note.severity === 'repair').map((note) => note.message),
    entities: blueprint.entities.map((entity) => ({
      name: entity.name,
      label: entity.label,
      derived: entity.origin === 'derived',
      displayField: entity.displayFieldName,
      dedupeField: entity.dedupeFieldName,
      fields: entity.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        relatedTo: field.targetEntityName ? (labels.get(field.targetEntityName) ?? null) : null,
      })),
    })),
    relations: blueprint.relations.map((relation) => ({
      description: describeRelation(
        labels.get(relation.fromEntityName) ?? relation.fromEntityName,
        labels.get(relation.toEntityName) ?? relation.toEntityName,
      ),
      from: labels.get(relation.fromEntityName) ?? relation.fromEntityName,
      to: labels.get(relation.toEntityName) ?? relation.toEntityName,
      // Direccion de la relacion: la entidad que la lleva y el campo que la
      // sostiene. Es lo que se usa para rechazarla.
      fromName: relation.fromEntityName,
      through: relation.fieldName,
    })),
  };
}

/**
 * P-05, literalmente: en lugar de
 * `FOREIGN KEY cliente_id REFERENCES clientes(id)`, se dice
 * "Cada viaje pertenece a un cliente. Un cliente puede tener varios viajes."
 *
 * Es determinista y se construye con las etiquetas que el usuario ya ve. Sin IA:
 * una frase mal generada aqui destruiria la confianza en todo el paso.
 */
function describeRelation(fromPlural: string, toPlural: string): string {
  const from = singularize(fromPlural).toLowerCase();
  const to = singularize(toPlural).toLowerCase();

  const un = indefiniteArticle(to);
  const varios = severalOf(from);

  /*
   * El plural se toma de la etiqueta, no se reconstruye.
   *
   * Antes se escribia `${from}s`, que convertia "conductores" en "conductors":
   * volver a pluralizar un singular ya adivinado multiplica el error. La
   * etiqueta original ya viene en plural y es la que la persona ve en el resto
   * de la pantalla.
   */
  const varias = fromPlural.toLowerCase();

  return `Cada ${from} pertenece a ${un} ${to}. ${un === 'una' ? 'Una' : 'Un'} ${to} puede tener ${varios} ${varias}.`;
}

export interface JobView {
  id: string;
  status: string;
  message: string | null;
  progress: number;
  failureReason: string | null;
  /** Resumen final: modulos, registros, relaciones, filas fuera (RF-21). */
  result: JobRecord['result'];
}

export function toJobView(job: JobRecord): JobView {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    progress: job.progress,
    failureReason: job.failureReason,
    result: job.result,
  };
}

// ---------------------------------------------------------------------------
// Resumen previo a crear (RF-12)
// ---------------------------------------------------------------------------

export interface SummaryView {
  applicationName: string;
  /** Lo que se creara, en numeros: "4 modulos, 9 campos, 3 relaciones". */
  totals: { entities: number; fields: number; relations: number };
  entities: { label: string; fields: string[] }[];
  relations: string[];
  /** `true` si la estructura ya fue confirmada y no admite mas cambios. */
  confirmed: boolean;
}

/**
 * El resumen del ERS 12, tal cual: que entidades, con que campos, y que
 * relaciones, antes de tocar nada.
 *
 * Lo importante de esta vista es lo que no tiene. Ni tipos de campo, ni claves,
 * ni nombres internos: en el ultimo paso antes de crear, la persona tiene que
 * poder leer de un vistazo lo que va a existir, no auditar un esquema.
 */
export function toSummaryView(blueprint: StoredBlueprint): SummaryView {
  const labels = new Map(blueprint.entities.map((entity) => [entity.name, entity.label]));

  return {
    applicationName: blueprint.applicationName,
    totals: {
      entities: blueprint.entities.length,
      fields: blueprint.entities.reduce((total, entity) => total + entity.fields.length, 0),
      relations: blueprint.relations.length,
    },
    entities: blueprint.entities.map((entity) => ({
      label: entity.label,
      fields: entity.fields.map((field) => field.label),
    })),
    relations: blueprint.relations.map((relation) =>
      describeRelation(
        labels.get(relation.fromEntityName) ?? relation.fromEntityName,
        labels.get(relation.toEntityName) ?? relation.toEntityName,
      ),
    ),
    confirmed: blueprint.status === 'confirmed',
  };
}
