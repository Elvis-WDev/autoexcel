import type { PhysicalPlan, PlannedTable } from '../../../domain/blueprint/physical-plan.js';
import { SYSTEM_COLUMNS } from '../../../domain/blueprint/physical-plan.js';
import { ident, literal, qualified, statement, type Statement } from './builder.js';

/**
 * Genera el DDL de una aplicacion a partir del plan fisico.
 *
 * Funcion pura: devuelve sentencias, no las ejecuta. Se puede leer el SQL exacto
 * que se va a emitir en un test, que es la mejor forma de revisar algo asi.
 *
 * Las tablas llegan en orden topologico, de modo que las claves foraneas se
 * pueden declarar en el mismo `CREATE TABLE`: cuando una tabla se crea, aquellas
 * a las que apunta ya existen. No hacen falta restricciones diferidas.
 */
/** Borrado del schema de un proyecto. Idempotente. */
export function buildDropSchemaStatement(schemaName: string): Statement {
  return statement(`DROP SCHEMA IF EXISTS ${ident(schemaName)} CASCADE`);
}

export function buildCreateSchemaStatements(plan: PhysicalPlan): Statement[] {
  const statements: Statement[] = [
    // Reintentar una construccion fallida tiene que ser posible sin arrastrar
    // restos. No hay datos que perder: si se llega aqui, la anterior no termino.
    buildDropSchemaStatement(plan.schemaName),
    statement(`CREATE SCHEMA ${ident(plan.schemaName)}`),
  ];

  for (const table of plan.tables) {
    statements.push(createTable(plan.schemaName, table));
    statements.push(...createIndexes(plan.schemaName, table));
  }

  return statements;
}

function createTable(schemaName: string, table: PlannedTable): Statement {
  const lines: string[] = [
    // `gen_random_uuid()` es nativa desde PostgreSQL 13: no hace falta pgcrypto.
    `${ident(SYSTEM_COLUMNS.id)} UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  ];

  for (const column of table.columns) {
    const parts = [ident(column.columnName), column.sqlType];

    if (column.required) parts.push('NOT NULL');

    if (column.referencesTable) {
      // RESTRICT y no CASCADE: borrar un cliente no puede llevarse por delante
      // sus viajes sin avisar. F7 traduce el fallo a lenguaje de negocio.
      parts.push(
        `REFERENCES ${qualified(schemaName, column.referencesTable)}(${ident(SYSTEM_COLUMNS.id)}) ON DELETE RESTRICT`,
      );
    }

    if (column.type === 'select' && column.options && column.options.length > 0) {
      const values = column.options.map(literal).join(', ');
      parts.push(`CHECK (${ident(column.columnName)} IN (${values}))`);
    }

    lines.push(parts.join(' '));
  }

  if (table.deduplicated) {
    // Clave de deduplicacion normalizada. La calcula la aplicacion, no la base
    // de datos: asi la regla vive en un solo sitio (`normalizeValue`) y no en
    // dos expresiones que podrian divergir.
    lines.push(`${ident(SYSTEM_COLUMNS.dedupeKey)} TEXT`);
  }

  lines.push(
    `${ident(SYSTEM_COLUMNS.source)} JSONB`,
    `${ident(SYSTEM_COLUMNS.createdAt)} TIMESTAMPTZ NOT NULL DEFAULT now()`,
    `${ident(SYSTEM_COLUMNS.updatedAt)} TIMESTAMPTZ NOT NULL DEFAULT now()`,
  );

  return statement(
    `CREATE TABLE ${qualified(schemaName, table.tableName)} (\n  ${lines.join(',\n  ')}\n)`,
  );
}

/**
 * Los nombres de indice ya vienen generados y validados en el plan: aqui solo se
 * componen. Concatenarlos sobre la marcha es como se pasa uno de los 63 bytes
 * de PostgreSQL sin darse cuenta.
 */
function createIndexes(schemaName: string, table: PlannedTable): Statement[] {
  const target = qualified(schemaName, table.tableName);

  return table.indexes.map((index) =>
    statement(
      `CREATE ${index.unique ? 'UNIQUE INDEX' : 'INDEX'} ${ident(index.name)}` +
        ` ON ${target} (${index.columns.map(ident).join(', ')})`,
    ),
  );
}

/**
 * Permisos del rol de runtime sobre el schema recien creado.
 *
 * El ADR 0001 separa los dos roles, y aqui es donde esa separacion se concreta:
 * el runtime recibe DML sobre estas tablas y nada mas. No puede crear, ni
 * alterar, ni borrar estructura, asi que un fallo del CRUD generado no puede
 * tocar el esquema.
 */
export function buildGrantStatements(plan: PhysicalPlan, runtimeRole: string): Statement[] {
  const schema = ident(plan.schemaName);
  const role = ident(runtimeRole);

  return [
    statement(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`),
    statement(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`),
  ];
}
