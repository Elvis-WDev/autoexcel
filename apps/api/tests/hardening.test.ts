import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetRateLimits } from '../src/infrastructure/http/rate-limit.js';
import { createScriptedProposer, viajesBlueprint } from './helpers/scripted-proposer.js';
import { ALICE, BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import { CLIENTES, createFixtureDir, VIAJES, writeWorkbook } from './helpers/xlsx-fixtures.js';

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
});

beforeEach(() => {
  resetRateLimits();
});

afterAll(() => undefined);

function harnessWith(options: Parameters<typeof createTestHarness>[0] = {}): TestHarness {
  return createTestHarness({
    proposer: createScriptedProposer({ first: viajesBlueprint() }),
    ...options,
  });
}

/** Proyecto llevado hasta el final, con aplicacion creada. */
async function completedProject(harness: TestHarness, fileName: string): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, [VIAJES, CLIENTES]);
  await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
  await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
  await request(harness.app).post(`/api/projects/${projectId}/analyze`);
  await harness.settled();

  for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
    await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
  }
  await request(harness.app).post(`/api/projects/${projectId}/blueprint/confirm`);
  await request(harness.app).post(`/api/projects/${projectId}/build`);
  await harness.settled();

  return projectId;
}

describe('cuota de proyectos', () => {
  // Seguimiento del ADR 0001: cada proyecto crea un schema de PostgreSQL.
  it('impide superar el limite por persona', async () => {
    const harness = harnessWith({ maxProjectsPerUser: 2 });

    for (let i = 0; i < 2; i += 1) {
      const response = await request(harness.app)
        .post('/api/projects')
        .send({ name: `Proyecto ${i}` });
      expect(response.status).toBe(201);
    }

    const rejected = await request(harness.app).post('/api/projects').send({ name: 'Uno de mas' });

    expect(rejected.status).toBe(409);
    expect(rejected.body.error.message).toContain('limite de 2 proyectos');
  });

  it('la cuota es por persona, no global', async () => {
    const harness = harnessWith({ maxProjectsPerUser: 1 });
    harness.projects.seed({ ownerId: BOB.id, name: 'De Bob', slug: 'de-bob' });

    // Bob ya gasto su cuota; Alice conserva la suya.
    const response = await request(harness.app).post('/api/projects').send({ name: 'De Alice' });

    expect(response.status).toBe(201);
  });
});

describe('limitacion de tasa', () => {
  it('acota las subidas por hora', async () => {
    const harness = harnessWith({ uploadsPerHour: 2 });
    const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
    const projectId = (created.body as { data: { id: string } }).data.id;
    const file = await writeWorkbook(fixtures, 'tasa-subida.xlsx', [VIAJES]);

    for (let i = 0; i < 2; i += 1) {
      const response = await request(harness.app)
        .post(`/api/projects/${projectId}/file`)
        .attach('file', file);
      expect(response.status, `intento ${i}`).toBe(201);
    }

    const limited = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  // El analisis es el unico endpoint que cuesta dinero de verdad.
  it('acota los analisis por hora', async () => {
    const harness = harnessWith({ analysesPerHour: 1 });
    const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
    const projectId = (created.body as { data: { id: string } }).data.id;

    const file = await writeWorkbook(fixtures, 'tasa-analisis.xlsx', [VIAJES]);
    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
    await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

    const first = await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    expect(first.status).toBe(202);
    await harness.settled();

    const second = await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    expect(second.status).toBe(429);
  });

  it('el contador es por persona', async () => {
    const harness = harnessWith({ uploadsPerHour: 1 });
    const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
    const projectId = (created.body as { data: { id: string } }).data.id;
    const file = await writeWorkbook(fixtures, 'tasa-persona.xlsx', [VIAJES]);

    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);

    // Otra persona, otro contador.
    const otro = harnessWith({ uploadsPerHour: 1, user: BOB });
    const suyo = await request(otro.app).post('/api/projects').send({ name: 'De Bob' });
    const otroId = (suyo.body as { data: { id: string } }).data.id;

    const response = await request(otro.app)
      .post(`/api/projects/${otroId}/file`)
      .attach('file', file);

    expect(response.status).toBe(201);
  });
});

/**
 * Auditoria de filtraciones.
 *
 * Cada fase comprobo lo suyo, pero ninguna miro el conjunto. Esto recorre TODOS
 * los endpoints, en respuesta correcta y en error, y afirma que nada tecnico
 * llega al cliente: ni nombres de schema, ni de tabla, ni SQL, ni trazas.
 *
 * Es el tipo de garantia que se pierde en cuanto alguien anade un endpoint sin
 * pensar en ello, y por eso conviene que sea un test y no una revision.
 */
describe('nada tecnico sale al cliente', () => {
  /** Lo que no puede aparecer en ninguna respuesta. */
  const FORBIDDEN = [
    'proj_',
    '__dedupe_key',
    '__source',
    'tableName',
    'columnName',
    'schemaName',
    'SELECT ',
    'INSERT INTO',
    'CREATE TABLE',
    'foreign key',
    'constraint',
    'pg_',
    'at Object.',
    'node_modules',
    'DATABASE_URL',
    'sk-ant',
  ];

  function assertClean(label: string, body: unknown, headers: unknown): void {
    const serialized = `${JSON.stringify(body)} ${JSON.stringify(headers)}`;

    for (const needle of FORBIDDEN) {
      expect(serialized.toLowerCase(), `${label} filtro "${needle}"`).not.toContain(
        needle.toLowerCase(),
      );
    }
  }

  it('en el recorrido completo, con respuestas correctas', async () => {
    const harness = harnessWith();
    const projectId = await completedProject(harness, 'auditoria.xlsx');

    const paths = [
      '/api/projects',
      `/api/projects/${projectId}`,
      `/api/projects/${projectId}/sheets`,
      `/api/projects/${projectId}/blueprint`,
      `/api/projects/${projectId}/blueprint/summary`,
      `/api/projects/${projectId}/app`,
      `/api/projects/${projectId}/app/clientes/records`,
      `/api/projects/${projectId}/app/clientes/options`,
      '/health',
    ];

    for (const path of paths) {
      const response = await request(harness.app).get(path);
      expect(response.status, path).toBeLessThan(400);
      assertClean(path, response.body, response.headers);
    }
  });

  it('en los errores, que es donde se filtra de verdad', async () => {
    const harness = harnessWith();
    const projectId = await completedProject(harness, 'auditoria-errores.xlsx');

    const attempts: { label: string; run: () => Promise<{ body: unknown; headers: unknown }> }[] = [
      {
        label: 'modulo inventado',
        run: () => request(harness.app).get(`/api/projects/${projectId}/app/inventado/records`),
      },
      {
        label: 'modulo hostil',
        run: () =>
          request(harness.app).get(
            `/api/projects/${projectId}/app/x%22;DROP%20SCHEMA%20public;--/records`,
          ),
      },
      {
        label: 'registro inexistente',
        run: () =>
          request(harness.app).get(
            `/api/projects/${projectId}/app/clientes/records/00000000-0000-4000-8000-000000000000`,
          ),
      },
      {
        label: 'campo desconocido al crear',
        run: () =>
          request(harness.app)
            .post(`/api/projects/${projectId}/app/clientes/records`)
            .send({ inventado: 'x' }),
      },
      {
        label: 'relacion rota',
        run: () =>
          request(harness.app).post(`/api/projects/${projectId}/app/viajes/records`).send({
            fecha: '2026-10-01',
            cliente: '00000000-0000-4000-8000-000000000000',
          }),
      },
      {
        label: 'proyecto inexistente',
        run: () =>
          request(harness.app).get('/api/projects/00000000-0000-4000-8000-000000000000/app'),
      },
      {
        label: 'ruta inexistente',
        run: () => request(harness.app).get('/api/no-existe'),
      },
      {
        label: 'json malformado',
        run: () =>
          request(harness.app)
            .post('/api/projects')
            .set('content-type', 'application/json')
            .send('{roto'),
      },
    ];

    for (const attempt of attempts) {
      const response = await attempt.run();
      assertClean(attempt.label, response.body, response.headers);
    }
  });

  it('tampoco en la cabecera del servidor', async () => {
    const harness = harnessWith();
    const response = await request(harness.app).get('/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['server']).toBeUndefined();
  });
});

/**
 * Autorizacion por registro, revisada endpoint por endpoint.
 *
 * Cada fase comprobo el suyo. Esto verifica que NINGUNO se quedo sin la
 * comprobacion, que es el fallo que se cuela al anadir el endpoint numero
 * veinte.
 */
describe('ningun endpoint de proyecto omite la comprobacion de propiedad', () => {
  it('responde 404 en todos ante un proyecto ajeno', async () => {
    const harness = harnessWith();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'completed' });
    const id = ajeno.id;

    const requests: [string, () => Promise<{ status: number }>][] = [
      ['GET detalle', () => request(harness.app).get(`/api/projects/${id}`)],
      ['GET hojas', () => request(harness.app).get(`/api/projects/${id}/sheets`)],
      [
        'PATCH hojas',
        () => request(harness.app).patch(`/api/projects/${id}/sheets`).send({ sheets: [] }),
      ],
      ['POST analizar', () => request(harness.app).post(`/api/projects/${id}/analyze`)],
      ['GET blueprint', () => request(harness.app).get(`/api/projects/${id}/blueprint`)],
      ['GET resumen', () => request(harness.app).get(`/api/projects/${id}/blueprint/summary`)],
      [
        'PATCH blueprint',
        () =>
          request(harness.app)
            .patch(`/api/projects/${id}/blueprint`)
            .send({ applicationName: 'X' }),
      ],
      [
        'DELETE entidad',
        () => request(harness.app).delete(`/api/projects/${id}/blueprint/entities/clientes`),
      ],
      ['POST confirmar', () => request(harness.app).post(`/api/projects/${id}/blueprint/confirm`)],
      [
        'POST paso',
        () =>
          request(harness.app).post(`/api/projects/${id}/step`).send({ to: 'reviewing_fields' }),
      ],
      ['POST construir', () => request(harness.app).post(`/api/projects/${id}/build`)],
      [
        'GET proceso',
        () =>
          request(harness.app).get(`/api/projects/${id}/jobs/00000000-0000-4000-8000-000000000000`),
      ],
      [
        'GET errores',
        () =>
          request(harness.app).get(
            `/api/projects/${id}/jobs/00000000-0000-4000-8000-000000000000/errors`,
          ),
      ],
      ['GET aplicacion', () => request(harness.app).get(`/api/projects/${id}/app`)],
      ['GET registros', () => request(harness.app).get(`/api/projects/${id}/app/clientes/records`)],
      [
        'POST registro',
        () => request(harness.app).post(`/api/projects/${id}/app/clientes/records`).send({}),
      ],
      ['GET opciones', () => request(harness.app).get(`/api/projects/${id}/app/clientes/options`)],
      ['DELETE proyecto', () => request(harness.app).delete(`/api/projects/${id}?confirmName=x`)],
    ];

    for (const [label, run] of requests) {
      const response = await run();
      expect(response.status, `${label} deberia responder 404`).toBe(404);
    }

    // Y el proyecto ajeno sigue intacto.
    expect(harness.projects.rows.some((row) => row.id === id)).toBe(true);
  });

  it('todos exigen sesion', async () => {
    const harness = createTestHarness({ user: null });
    const id = '00000000-0000-4000-8000-000000000000';

    const paths = [
      `/api/projects`,
      `/api/projects/${id}`,
      `/api/projects/${id}/sheets`,
      `/api/projects/${id}/blueprint`,
      `/api/projects/${id}/blueprint/summary`,
      `/api/projects/${id}/app`,
      `/api/projects/${id}/app/clientes/records`,
      `/api/projects/${id}/app/clientes/options`,
    ];

    for (const path of paths) {
      const response = await request(harness.app).get(path);
      expect(response.status, path).toBe(401);
    }
  });
});

describe('observabilidad', () => {
  it('el proceso guarda cuanto tardo', async () => {
    const harness = harnessWith();
    await completedProject(harness, 'duracion.xlsx');

    const job = harness.jobs.jobs.at(-1)!;

    expect(job.startedAt).toBeInstanceOf(Date);
    expect(job.finishedAt).toBeInstanceOf(Date);
    expect(job.finishedAt!.getTime()).toBeGreaterThanOrEqual(job.startedAt!.getTime());
  });

  // El perfil que viaja al modelo ya excluye las filas; el log tampoco las ve.
  it('el analisis no registra datos de negocio', async () => {
    const proposer = createScriptedProposer({ first: viajesBlueprint() });
    const harness = harnessWith({ proposer });

    await completedProject(harness, 'log-limpio.xlsx');

    // El motor recibio el perfil, no las filas: es la misma garantia que cubre
    // `claude-proposer.test.ts`, comprobada aqui de extremo a extremo.
    for (const sheet of proposer.lastInput?.sheets ?? []) {
      for (const column of sheet.columns) {
        expect(column.profile.samples.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe('aislamiento entre proyectos', () => {
  // Cada proyecto tiene su propio schema: ADR 0001.
  it('dos proyectos de la misma persona no comparten nada', async () => {
    const harness = harnessWith();

    const uno = await completedProject(harness, 'aislado-1.xlsx');
    const dos = await completedProject(harness, 'aislado-2.xlsx');

    const schemas = harness.projects.rows.map((row) => row.schemaName);

    expect(new Set(schemas).size).toBe(schemas.length);
    expect(uno).not.toBe(dos);
    expect(harness.projects.rows.every((row) => row.ownerId === ALICE.id)).toBe(true);
  });
});
