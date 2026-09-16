import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { isSafeIdentifier } from '../src/domain/identifiers.js';
import { ALICE, BOB, createTestHarness } from './helpers/test-app.js';

describe('POST /api/projects', () => {
  it('crea el proyecto y lo devuelve con 201', async () => {
    const { app, projects } = createTestHarness();

    const response = await request(app)
      .post('/api/projects')
      .send({ name: '  Gestión de Viajes  ' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Gestión de Viajes',
      slug: 'gestion-de-viajes',
      status: 'draft',
      failureReason: null,
    });
    expect(projects.rows).toHaveLength(1);
    expect(projects.rows[0]?.ownerId).toBe(ALICE.id);
  });

  // ADR 0001 + Technical Information Boundary: el nombre del schema es un
  // detalle del motor de base de datos y no tiene por que salir de aqui.
  it('no expone el nombre del schema ni el propietario', async () => {
    const { app } = createTestHarness();

    const response = await request(app).post('/api/projects').send({ name: 'Viajes' });

    expect(response.body.data).not.toHaveProperty('schemaName');
    expect(response.body.data).not.toHaveProperty('ownerId');
    expect(JSON.stringify(response.body)).not.toContain('proj_');
  });

  // El nombre del schema nunca se deriva del texto que escribe el usuario.
  it('genera un schema seguro aunque el nombre sea hostil', async () => {
    const { app, projects } = createTestHarness();

    await request(app).post('/api/projects').send({ name: '"; DROP SCHEMA public CASCADE; --' });

    const created = projects.rows[0];
    expect(created).toBeDefined();
    expect(isSafeIdentifier(created!.schemaName)).toBe(true);
    expect(created!.schemaName).not.toContain('DROP');
  });

  it('desambigua el slug cuando el mismo usuario repite el nombre', async () => {
    const { app } = createTestHarness();

    await request(app).post('/api/projects').send({ name: 'Viajes' });
    const second = await request(app).post('/api/projects').send({ name: 'Viajes' });
    const third = await request(app).post('/api/projects').send({ name: 'Viajes' });

    expect(second.body.data.slug).toBe('viajes-2');
    expect(third.body.data.slug).toBe('viajes-3');
  });

  it('rechaza un nombre vacio con 400', async () => {
    const { app } = createTestHarness();

    const response = await request(app).post('/api/projects').send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rechaza un nombre demasiado largo', async () => {
    const { app } = createTestHarness();

    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'x'.repeat(121) });

    expect(response.status).toBe(400);
  });

  it('exige sesion', async () => {
    const { app } = createTestHarness({ user: null });

    const response = await request(app).post('/api/projects').send({ name: 'Viajes' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /api/projects', () => {
  it('lista solo los proyectos del usuario en sesion', async () => {
    const { app, projects } = createTestHarness();
    projects.seed({ ownerId: ALICE.id, name: 'Mio', slug: 'mio' });
    projects.seed({ ownerId: BOB.id, name: 'Ajeno', slug: 'ajeno' });

    const response = await request(app).get('/api/projects');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Mio');
    expect(response.body.meta).toMatchObject({ total: 1, limit: 20, offset: 0 });
  });

  it('devuelve los mas recientes primero', async () => {
    const { app, projects } = createTestHarness();
    projects.seed({ ownerId: ALICE.id, name: 'Viejo', createdAt: new Date('2026-01-01') });
    projects.seed({ ownerId: ALICE.id, name: 'Nuevo', createdAt: new Date('2026-09-01') });

    const response = await request(app).get('/api/projects');

    const names = (response.body.data as { name: string }[]).map((project) => project.name);
    expect(names).toEqual(['Nuevo', 'Viejo']);
  });

  it('pagina', async () => {
    const { app, projects } = createTestHarness();
    for (let i = 0; i < 5; i += 1) {
      projects.seed({ ownerId: ALICE.id, name: `P${i}`, createdAt: new Date(2026, 0, i + 1) });
    }

    const response = await request(app).get('/api/projects?limit=2&offset=1');

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ total: 5, limit: 2, offset: 1 });
  });

  it('rechaza una paginacion fuera de rango', async () => {
    const { app } = createTestHarness();
    expect((await request(app).get('/api/projects?limit=500')).status).toBe(400);
    expect((await request(app).get('/api/projects?offset=-1')).status).toBe(400);
  });

  it('exige sesion', async () => {
    const { app } = createTestHarness({ user: null });
    expect((await request(app).get('/api/projects')).status).toBe(401);
  });
});

describe('GET /api/projects/:id', () => {
  it('devuelve el detalle con los pasos posibles', async () => {
    const { app, projects } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id, status: 'reviewing_fields' });

    const response = await request(app).get(`/api/projects/${project.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('reviewing_fields');
    expect(response.body.data.nextStatuses).toEqual([
      'reviewing_entities',
      'reviewing_relations',
      'failed',
    ]);
  });

  // Un 403 confirmaria que el proyecto existe y permitiria enumerarlos.
  it('responde 404, no 403, ante el proyecto de otra persona', async () => {
    const { app, projects } = createTestHarness();
    const ajeno = projects.seed({ ownerId: BOB.id });

    const response = await request(app).get(`/api/projects/${ajeno.id}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 400 ante un identificador con formato invalido', async () => {
    const { app } = createTestHarness();
    expect((await request(app).get('/api/projects/no-es-uuid')).status).toBe(400);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('borra el schema antes que la fila, y en ese orden', async () => {
    const { app, projects, schemas } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id, name: 'Gestión de Viajes' });

    const response = await request(app)
      .delete(`/api/projects/${project.id}`)
      .send({ confirmName: 'Gestión de Viajes' });

    expect(response.status).toBe(204);
    expect(schemas.dropped).toEqual([project.schemaName]);
    expect(projects.rows).toHaveLength(0);
  });

  // Confirmacion por escalera: irreversible exige teclear el nombre exacto.
  it('rechaza el borrado si el nombre confirmado no coincide', async () => {
    const { app, projects, schemas } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id, name: 'Gestión de Viajes' });

    const response = await request(app)
      .delete(`/api/projects/${project.id}`)
      .send({ confirmName: 'gestion de viajes' });

    expect(response.status).toBe(400);
    expect(schemas.dropped).toEqual([]);
    expect(projects.rows).toHaveLength(1);
  });

  it('exige la confirmacion, no basta con llamar al endpoint', async () => {
    const { app, projects } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id });

    const response = await request(app).delete(`/api/projects/${project.id}`).send({});

    expect(response.status).toBe(400);
    expect(projects.rows).toHaveLength(1);
  });

  it('acepta la confirmacion por query cuando el cuerpo no llega', async () => {
    const { app, projects } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id, name: 'Viajes' });

    const response = await request(app).delete(`/api/projects/${project.id}?confirmName=Viajes`);

    expect(response.status).toBe(204);
    expect(projects.rows).toHaveLength(0);
  });

  // Si el schema no se puede soltar, la fila se queda: reintentar vuelve a
  // funcionar porque DROP SCHEMA IF EXISTS es idempotente.
  it('no borra la fila si falla el borrado del schema', async () => {
    const { app, projects, schemas } = createTestHarness();
    const project = projects.seed({ ownerId: ALICE.id, name: 'Viajes' });
    schemas.failNext = new Error('la base de datos no respondio');

    const response = await request(app)
      .delete(`/api/projects/${project.id}`)
      .send({ confirmName: 'Viajes' });

    expect(response.status).toBe(500);
    expect(projects.rows).toHaveLength(1);
  });

  it('no deja borrar el proyecto de otra persona', async () => {
    const { app, projects, schemas } = createTestHarness();
    const ajeno = projects.seed({ ownerId: BOB.id, name: 'Ajeno' });

    const response = await request(app)
      .delete(`/api/projects/${ajeno.id}`)
      .send({ confirmName: 'Ajeno' });

    expect(response.status).toBe(404);
    expect(schemas.dropped).toEqual([]);
    expect(projects.rows).toHaveLength(1);
  });
});

describe('GET /api/projects?q=', () => {
  it('filtra por nombre sin distinguir mayusculas ni acentos del teclado', async () => {
    const harness = createTestHarness();
    for (const name of ['Gestion de Viajes', 'Control de Stock', 'VIAJES antiguos']) {
      await request(harness.app).post('/api/projects').send({ name });
    }

    const response = await request(harness.app).get('/api/projects?q=viajes');
    const body = response.body as { data: { name: string }[]; meta: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data.map((p) => p.name).sort()).toEqual(['Gestion de Viajes', 'VIAJES antiguos']);
  });

  /**
   * El total tiene que ser el de la busqueda, no el de la coleccion: si no, el
   * pie de la tabla prometeria paginas que no existen.
   */
  it('el total corresponde a lo filtrado', async () => {
    const harness = createTestHarness();
    for (const name of ['Uno', 'Dos', 'Tres']) {
      await request(harness.app).post('/api/projects').send({ name });
    }

    const response = await request(harness.app).get('/api/projects?q=uno&limit=1');

    expect((response.body as { meta: { total: number } }).meta.total).toBe(1);
  });

  it('sin coincidencias devuelve una lista vacia, no un error', async () => {
    const harness = createTestHarness();
    await request(harness.app).post('/api/projects').send({ name: 'Uno' });

    const response = await request(harness.app).get('/api/projects?q=nada-de-nada');

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown[] }).data).toEqual([]);
  });

  it('no deja buscar en los proyectos de otra persona', async () => {
    const deAlice = createTestHarness();
    await request(deAlice.app).post('/api/projects').send({ name: 'Secreto de Alice' });

    const deBob = createTestHarness({ user: BOB });
    deBob.projects.rows.push(...deAlice.projects.rows);

    const response = await request(deBob.app).get('/api/projects?q=secreto');

    expect((response.body as { data: unknown[] }).data).toEqual([]);
  });
});
