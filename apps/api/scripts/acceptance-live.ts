/**
 * Los criterios de aceptacion contra PostgreSQL de verdad.
 *
 * `tests/acceptance.test.ts` recorre los 18 criterios sobre dobles del plano de
 * datos: son fieles —reproducen el indice unico, la clave foranea y el borrado
 * restringido— pero son dobles. Este script recorre el mismo archivo de demo
 * contra la base real, con DDL real, importacion real y el rol `app_runtime`
 * real, y ademas mira dentro del schema creado para comprobar que las tablas y
 * las filas existen donde tienen que existir.
 *
 * Lo unico que se sustituye es la propuesta, fijada al modelo del ERS 18: sin
 * eso la verificacion dependeria de lo que conteste un modelo, que es
 * justamente lo que aqui no se esta probando.
 *
 *   corepack pnpm acceptance:live
 *
 * Necesita el contenedor de PostgreSQL levantado, las migraciones aplicadas y
 * al menos una cuenta creada (`corepack pnpm db:seed`). Al terminar borra el
 * proyecto que creo, asi que se puede repetir.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { Response } from 'supertest';
import { createApp } from '../src/app.js';
import { compose } from '../src/composition-root.js';
import { parseEnv } from '../src/config/env.js';
import type { AuthenticatedUser } from '../src/application/ports/session.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { demoBlueprint, demoWorkbook } from '../tests/helpers/demo-fixture.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();
const logger = createLogger('warn');

// ---------------------------------------------------------------------------
// Comprobaciones
// ---------------------------------------------------------------------------

const results: { name: string; ok: boolean; detail: string }[] = [];

async function check(name: string, assertion: () => Promise<string> | string): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await assertion() });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: se esperaba ${b} y se obtuvo ${a}`);
}

function data<T>(response: Response): T {
  return (response.body as { data: T }).data;
}

// ---------------------------------------------------------------------------

async function writeDemoFile(directory: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of demoWorkbook()) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }

  const path = join(directory, 'viajes.xlsx');
  await workbook.xlsx.writeFile(path);
  return path;
}

/** Espera a que un trabajo en segundo plano termine, o se rinde. */
async function waitForJob(
  api: request.Agent,
  projectId: string,
  jobId: string,
): Promise<{ status: string; message: string; result: Record<string, number> }> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await api.get(`/api/projects/${projectId}/jobs/${jobId}`);
    const job = data<{ status: string; message: string; result: Record<string, number> }>(response);

    if (job.status !== 'queued' && job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`El trabajo ${jobId} no termino en 30 segundos.`);
}

async function main(): Promise<number> {
  const scratch = await mkdtemp(join(tmpdir(), 'ets-live-'));
  const file = await writeDemoFile(scratch);

  // Se necesita una cuenta real: `project.ownerId` es una clave foranea a
  // `user`, asi que un identificador inventado no pasaria de la primera
  // insercion.
  const bootstrap = compose(env, logger);
  const owner = await bootstrap.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  await bootstrap.close();

  if (!owner) {
    process.stderr.write(
      '\nNo hay ninguna cuenta en la base.\n\n' +
        '  SEED_EMAIL=tu@correo SEED_PASSWORD="una contrasena larga" corepack pnpm db:seed\n\n',
    );
    return 1;
  }

  const user: AuthenticatedUser = { id: owner.id, email: owner.email, name: owner.name };

  const composition = compose(env, logger, {
    // La propuesta del ERS 18, fijada. Ver la cabecera de este archivo.
    proposer: {
      propose: () => Promise.resolve({ blueprint: demoBlueprint() }),
      repair: () => Promise.resolve({ blueprint: demoBlueprint() }),
    },
    sessions: { getUser: () => Promise.resolve(user) },
  });

  await composition.prepare();
  const api = request(createApp(composition.dependencies));
  const control = composition.pools.control;

  let projectId = '';
  let schemaName = '';

  try {
    // -- El recorrido -------------------------------------------------------
    const name = `Aceptacion ${randomUUID().slice(0, 8)}`;
    const created = await api.post('/api/projects').send({ name });
    projectId = data<{ id: string }>(created).id;

    await check('CA-01 se carga el Excel', async () => {
      const uploaded = await api.post(`/api/projects/${projectId}/file`).attach('file', file);
      expect(uploaded.status === 201, `la subida respondio ${uploaded.status}`);
      return 'viajes.xlsx aceptado';
    });

    const sheets = await api.get(`/api/projects/${projectId}/sheets`);

    await check('CA-02 se identifican las columnas de las tres hojas', () => {
      const view = data<{ sheets: { name: string; columns: { header: string }[] }[] }>(sheets);
      equal(
        view.sheets.map((sheet) => sheet.name),
        ['Viajes', 'Clientes', 'Notas'],
        'hojas leidas',
      );
      equal(
        view.sheets[0]!.columns.map((column) => column.header),
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        'columnas de Viajes',
      );
      return `${view.sheets[0]!.columns.length} + ${view.sheets[1]!.columns.length} columnas`;
    });

    await api.patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

    const analysis = await api.post(`/api/projects/${projectId}/analyze`);
    await waitForJob(api, projectId, data<{ id: string }>(analysis).id);

    const blueprint = await api.get(`/api/projects/${projectId}/blueprint`);

    await check('CA-03 y CA-04 se proponen entidades relacionadas', () => {
      const view = data<{
        entities: { label: string }[];
        relations: { from: string; to: string }[];
      }>(blueprint);

      equal(
        [...view.entities.map((entity) => entity.label)].sort(),
        ['Clientes', 'Conductores', 'Vehiculos', 'Viajes'],
        'entidades propuestas',
      );
      expect(view.relations.length === 3, `se propusieron ${view.relations.length} relaciones`);
      return '4 entidades, 3 relaciones';
    });

    for (const to of ['reviewing_fields', 'reviewing_relations']) {
      await api.post(`/api/projects/${projectId}/step`).send({ to });
    }

    await check('CA-05 y CA-06 se puede revisar y decidir sobre lo propuesto', async () => {
      const renamed = await api
        .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
        .send({ label: 'Empresas' });
      expect(renamed.status === 200, `renombrar respondio ${renamed.status}`);

      await api
        .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
        .send({ label: 'Clientes' });

      for (const field of ['cliente', 'vehiculo', 'conductor']) {
        const accepted = await api
          .patch(`/api/projects/${projectId}/blueprint/relations/viajes/${field}`)
          .send({ accepted: true });
        expect(accepted.status === 200, `aceptar ${field} respondio ${accepted.status}`);
      }

      return 'renombrar, deshacer y aceptar las 3 relaciones';
    });

    await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_summary' });

    await check('CA-07 hay un resumen antes de crear', async () => {
      const summary = await api.get(`/api/projects/${projectId}/blueprint/summary`);
      const view = data<{
        totals: { entities: number; fields: number; relations: number };
        confirmed: boolean;
      }>(summary);

      equal(view.totals, { entities: 4, fields: 13, relations: 3 }, 'totales del resumen');
      expect(!view.confirmed, 'el resumen se muestra ya confirmado');
      return '4 modulos, 13 campos, 3 relaciones';
    });

    await api.post(`/api/projects/${projectId}/blueprint/confirm`);

    const build = await api.post(`/api/projects/${projectId}/build`);
    const job = await waitForJob(api, projectId, data<{ id: string }>(build).id);

    // Prisma mapea los nombres de tabla pero no los de columna, asi que la
    // columna se llama "schemaName" y hay que citarla.
    const project = await control.query<{ schemaName: string }>(
      'select "schemaName" from project where id = $1',
      [projectId],
    );
    schemaName = project.rows[0]!.schemaName;

    await check('CA-08 el schema y sus tablas existen en PostgreSQL', async () => {
      const tables = await control.query<{ table_name: string }>(
        'select table_name from information_schema.tables where table_schema = $1 order by table_name',
        [schemaName],
      );

      equal(
        tables.rows.map((row) => row.table_name),
        ['clientes', 'conductores', 'vehiculos', 'viajes'],
        `tablas de ${schemaName}`,
      );
      return `${schemaName}: 4 tablas`;
    });

    await check('CA-13 los datos del Excel estan en la base', async () => {
      expect(job.status === 'partial', `el trabajo termino como "${job.status}"`);
      equal(job.result, { modules: 4, records: 132, relations: 3, failedRows: 2 }, 'resumen');

      const failures = await api.get(
        `/api/projects/${projectId}/jobs/${data<{ id: string }>(build).id}/errors`,
      );
      const rows = data<{ rowNumber: number }[]>(failures);
      equal(
        rows.map((row) => row.rowNumber),
        [122, 123],
        'filas rechazadas',
      );

      return '132 registros, 2 filas reportadas';
    });

    await check('CA-14 la deduplicacion ocurrio en la base', async () => {
      for (const [table, expected] of [
        ['clientes', 4],
        ['vehiculos', 4],
        ['conductores', 4],
        ['viajes', 120],
      ] as const) {
        const count = await control.query<{ total: string }>(
          `select count(*)::text as total from "${schemaName}"."${table}"`,
        );
        equal(Number(count.rows[0]!.total), expected, `filas en ${table}`);
      }
      return '122 filas de Excel -> 4 clientes, 4 vehiculos, 4 conductores';
    });

    await check('CA-15 las relaciones son claves foraneas reales', async () => {
      const orphans = await control.query<{ total: string }>(
        `select count(*)::text as total from "${schemaName}"."viajes" v
           left join "${schemaName}"."clientes" c on c.id = v.cliente
          where c.id is null`,
      );
      equal(Number(orphans.rows[0]!.total), 0, 'viajes sin cliente');

      const distintos = await control.query<{ total: string }>(
        `select count(distinct v.cliente)::text as total from "${schemaName}"."viajes" v`,
      );
      equal(Number(distintos.rows[0]!.total), 4, 'clientes distintos referenciados');

      // Y la restriccion existe de verdad, no es una convencion.
      const fks = await control.query<{ total: string }>(
        `select count(*)::text as total
           from information_schema.table_constraints
          where table_schema = $1 and constraint_type = 'FOREIGN KEY'`,
        [schemaName],
      );
      expect(Number(fks.rows[0]!.total) >= 3, 'faltan claves foraneas');

      return '0 huerfanos, 4 clientes referenciados, 3 claves foraneas';
    });

    const manifest = await api.get(`/api/projects/${projectId}/app`);

    await check('CA-09 y CA-10 cada modulo tiene tabla y formulario', async () => {
      const view = data<{
        entities: { name: string; label: string; fields: { name: string; type: string }[] }[];
      }>(manifest);

      for (const entity of view.entities) {
        const listed = await api.get(
          `/api/projects/${projectId}/app/${entity.name}/records?limit=5`,
        );
        expect(listed.status === 200, `${entity.name} respondio ${listed.status}`);
        expect(entity.fields.length > 0, `${entity.name} no declara campos`);
      }
      return `${view.entities.length} modulos consultables`;
    });

    await check('CA-12 las relaciones se ofrecen como seleccion', async () => {
      const options = await api.get(`/api/projects/${projectId}/app/clientes/options?limit=50`);
      const items = data<{ id: string; label: string }[]>(options);

      equal(items.length, 4, 'opciones de Clientes');
      expect(
        items.some((item) => item.label === 'Comercial Andes'),
        'no aparece "Comercial Andes" entre las opciones',
      );
      return '4 opciones con etiqueta legible';
    });

    await check('CA-11 y CA-17 se edita un registro importado', async () => {
      const listed = await api.get(`/api/projects/${projectId}/app/viajes/records?limit=1`);
      const viaje = data<{ id: string }[]>(listed)[0]!;

      const edited = await api
        .patch(`/api/projects/${projectId}/app/viajes/records/${viaje.id}`)
        .send({ estado: 'Cerrado', valor: 1234.56 });

      expect(edited.status === 200, `la edicion respondio ${edited.status}`);

      const stored = await control.query<{ valor: string; estado: string }>(
        `select valor::text, estado from "${schemaName}"."viajes" where id = $1`,
        [viaje.id],
      );
      equal(stored.rows[0]!.estado, 'Cerrado', 'estado guardado');
      equal(Number(stored.rows[0]!.valor), 1234.56, 'valor guardado');

      return 'el cambio llego a la tabla';
    });

    await check('CA-16 se crea un registro nuevo despues de importar', async () => {
      const pick = async (entity: string): Promise<string> => {
        const options = await api.get(`/api/projects/${projectId}/app/${entity}/options?limit=1`);
        return data<{ id: string }[]>(options)[0]!.id;
      };

      const created = await api.post(`/api/projects/${projectId}/app/viajes/records`).send({
        fecha: '2026-09-30',
        cliente: await pick('clientes'),
        vehiculo: await pick('vehiculos'),
        conductor: await pick('conductores'),
        valor: 999.5,
        estado: 'Abierto',
      });

      expect(created.status === 201, `la creacion respondio ${created.status}`);

      const count = await control.query<{ total: string }>(
        `select count(*)::text as total from "${schemaName}"."viajes"`,
      );
      equal(Number(count.rows[0]!.total), 121, 'viajes despues de crear uno');

      return '121 viajes: 120 importados y 1 escrito a mano';
    });

    await check('CA-18 nada del recorrido exigio escribir codigo', () => {
      const visto = JSON.stringify([sheets.body, blueprint.body, manifest.body]);

      expect(!visto.includes(schemaName), 'el nombre del schema sale en las respuestas');
      expect(!visto.includes('tableName'), 'los nombres de tabla salen en las respuestas');
      expect(!visto.includes('columnName'), 'los nombres de columna salen en las respuestas');
      expect(!visto.includes('__dedupe_key'), 'las columnas de sistema salen en las respuestas');

      return 'ninguna respuesta expone el plano de datos';
    });

    // -- Limpieza -----------------------------------------------------------
    await check('el borrado del proyecto elimina su schema', async () => {
      const deleted = await api.delete(`/api/projects/${projectId}`).send({ confirmName: name });
      expect(deleted.status === 204, `el borrado respondio ${deleted.status}`);

      const left = await control.query<{ total: string }>(
        'select count(*)::text as total from information_schema.schemata where schema_name = $1',
        [schemaName],
      );
      equal(Number(left.rows[0]!.total), 0, `schemas llamados ${schemaName}`);

      projectId = '';
      return `${schemaName} eliminado`;
    });
  } finally {
    // Si algo reviento a mitad, no dejar el proyecto ni el schema por ahi.
    if (projectId) {
      await control.query('delete from project where id = $1', [projectId]).catch(() => undefined);
    }
    if (schemaName) {
      await control.query(`drop schema if exists "${schemaName}" cascade`).catch(() => undefined);
    }

    await composition.close();
    await rm(scratch, { recursive: true, force: true });
  }

  // -- Informe --------------------------------------------------------------
  const width = Math.max(...results.map((result) => result.name.length));
  process.stdout.write('\n');

  for (const result of results) {
    process.stdout.write(
      `  ${result.ok ? 'OK  ' : 'FALL'}  ${result.name.padEnd(width)}  ${result.detail}\n`,
    );
  }

  const failed = results.filter((result) => !result.ok).length;
  process.stdout.write(
    `\n  ${results.length - failed}/${results.length} comprobaciones pasaron contra PostgreSQL real.\n\n`,
  );

  return failed === 0 ? 0 : 1;
}

process.exit(await main());
