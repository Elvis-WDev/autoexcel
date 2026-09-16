import {
  buildRuntimeApplication,
  type RuntimeApplication,
} from '../../src/domain/runtime/application.js';
import type { TestHarness } from './test-app.js';

/**
 * Une los dos dobles del plano de datos.
 *
 * En produccion hay UNA base: el importador escribe en `proj_<hex>.clientes` y
 * el CRUD lee de esa misma tabla. En la suite son dos dobles distintos —uno
 * reproduce el indice unico de deduplicacion, el otro la clave foranea y el
 * borrado restringido— y hasta ahora ningun test necesitaba cruzarlos, porque
 * cada uno probaba su mitad.
 *
 * La aceptacion si lo necesita: afirmar que se puede editar un registro
 * importado (CA-17) exige que el CRUD vea lo que la importacion escribio. Esta
 * funcion hace esa traduccion —de nombres fisicos de columna a nombres publicos
 * de campo, conservando los identificadores para que las relaciones sigan
 * apuntando a donde apuntaban— y es exactamente el trabajo que en produccion no
 * hay que hacer porque es la misma tabla.
 *
 * Que tenga que existir es una limitacion de los dobles, no del sistema, y por
 * eso la aceptacion se corre TAMBIEN contra PostgreSQL real con
 * `scripts/acceptance-live.mjs`, donde este puente no interviene.
 */
export function adoptImportedRecords(harness: TestHarness, projectId: string): RuntimeApplication {
  const project = harness.projects.rows.find((row) => row.id === projectId);
  if (!project) throw new Error(`Proyecto inexistente: ${projectId}`);

  const blueprint = harness.blueprints.stored.get(projectId);
  if (!blueprint) throw new Error(`Proyecto sin blueprint: ${projectId}`);

  const application = buildRuntimeApplication(project.schemaName, blueprint);

  for (const entity of application.entities) {
    const imported = harness.importer.recordsOf(entity.tableName);

    harness.records.rows.set(
      entity.name,
      imported.map((record) => {
        const values: Record<string, unknown> = {};
        for (const field of entity.fields) values[field.name] = record.values[field.columnName];

        // Se conserva el id del importador: es a el a quien apuntan las claves
        // foraneas ya escritas, y renumerarlo romperia todas las relaciones.
        return { id: record.id, values };
      }),
    );
  }

  return application;
}
