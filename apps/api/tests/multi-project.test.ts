import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  BlueprintProposer,
  ProposalAttempt,
} from '../src/application/ports/blueprint-proposer.js';
import type { AnalysisInput } from '../src/domain/blueprint/analysis-input.js';
import { adoptImportedRecords } from './helpers/adopt-imported.js';
import {
  demoBlueprint,
  demoWorkbook,
  inventarioBlueprint,
  inventarioWorkbook,
} from './helpers/demo-fixture.js';
import { BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import { createFixtureDir, writeWorkbook, type FixtureSheet } from './helpers/xlsx-fixtures.js';

/**
 * La promesa que distingue a esta plataforma de un generador de un solo uso:
 * "si manana tengo otro Excel creo otro proyecto y genero otro software".
 *
 * Un test que solo probara el segundo proyecto no diria nada. Lo que hay que
 * demostrar es que los dos coexisten sin tocarse: cada uno con su schema, sus
 * modulos y sus registros, y sin que una peticion dirigida a uno pueda alcanzar
 * al otro. Es la garantia de ADR 0001 vista desde la puerta de entrada.
 */

interface Built {
  id: string;
  schemaName: string;
}

let harness: TestHarness;
let viajes: Built;
let inventario: Built;

/** Devuelve una propuesta u otra segun el archivo que se este analizando. */
function createDispatchingProposer(): BlueprintProposer {
  const answer = (input: AnalysisInput): ProposalAttempt => ({
    blueprint: input.fileName.startsWith('inventario') ? inventarioBlueprint() : demoBlueprint(),
  });

  return {
    propose: (input) => Promise.resolve(answer(input)),
    repair: (request) => Promise.resolve(answer(request.input)),
  };
}

beforeAll(async () => {
  const fixtures = await createFixtureDir();
  harness = createTestHarness({ proposer: createDispatchingProposer() });

  viajes = await build('Gestion de Viajes', 'viajes.xlsx', demoWorkbook());
  inventario = await build('Control de Inventario', 'inventario.xlsx', inventarioWorkbook());

  async function build(name: string, fileName: string, sheets: FixtureSheet[]): Promise<Built> {
    const api = request(harness.app);
    const file = await writeWorkbook(fixtures, fileName, sheets);

    const created = await api.post('/api/projects').send({ name });
    const id = (created.body as { data: { id: string } }).data.id;

    await api.post(`/api/projects/${id}/file`).attach('file', file);
    await api.patch(`/api/projects/${id}/sheets`).send({ sheets: [] });
    await api.post(`/api/projects/${id}/analyze`);
    await harness.settled();

    for (const to of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
      await api.post(`/api/projects/${id}/step`).send({ to });
    }

    await api.post(`/api/projects/${id}/blueprint/confirm`);
    await api.post(`/api/projects/${id}/build`);
    await harness.settled();

    adoptImportedRecords(harness, id);

    const schemaName = harness.projects.rows.find((row) => row.id === id)!.schemaName;
    return { id, schemaName };
  }
});

function api(): request.Agent {
  return request(harness.app);
}

interface ManifestView {
  applicationName: string;
  navigation: { name: string; label: string }[];
}

function manifestOf(response: request.Response): ManifestView {
  return (response.body as { data: ManifestView }).data;
}

describe('dos Excel, dos aplicaciones', () => {
  it('cada archivo produce una aplicacion distinta', async () => {
    const first = manifestOf(await api().get(`/api/projects/${viajes.id}/app`));
    const second = manifestOf(await api().get(`/api/projects/${inventario.id}/app`));

    expect(first.applicationName).toBe('Gestion de Viajes');
    expect(first.navigation.map((item) => item.name)).toEqual([
      'clientes',
      'vehiculos',
      'conductores',
      'viajes',
    ]);

    // No son los mismos modulos con otro nombre: son otros modulos, con otros
    // campos, salidos de otro archivo.
    expect(second.applicationName).toBe('Control de Inventario');
    expect(second.navigation.map((item) => item.name)).toEqual([
      'proveedores',
      'categorias',
      'productos',
    ]);
  });

  it('los dos proyectos conviven en la lista de la persona', async () => {
    const listed = await api().get('/api/projects');
    const projects = (listed.body as { data: { id: string; name: string; status: string }[] }).data;

    expect(projects.map((project) => project.name).sort()).toEqual([
      'Control de Inventario',
      'Gestion de Viajes',
    ]);
    expect(projects.every((project) => project.status === 'completed')).toBe(true);
  });

  it('cada proyecto vive en su propio schema, generado por maquina', () => {
    expect(viajes.schemaName).toMatch(/^proj_[0-9a-f]{16}$/);
    expect(inventario.schemaName).toMatch(/^proj_[0-9a-f]{16}$/);
    expect(viajes.schemaName).not.toBe(inventario.schemaName);

    // Y ninguno lleva rastro del nombre que escribio la persona (ADR 0001).
    expect(viajes.schemaName).not.toContain('viajes');
    expect(inventario.schemaName).not.toContain('inventario');
  });

  it('el DDL de cada proyecto solo nombra su propio schema', () => {
    const [primero, segundo] = harness.schemas.created;

    expect(primero!.schemaName).toBe(viajes.schemaName);
    expect(segundo!.schemaName).toBe(inventario.schemaName);

    expect(primero!.tables.map((table) => table.entityName)).toEqual([
      'clientes',
      'vehiculos',
      'conductores',
      'viajes',
    ]);
    expect(segundo!.tables.map((table) => table.entityName)).toEqual([
      'proveedores',
      'categorias',
      'productos',
    ]);
  });

  it('los datos de un proyecto no llegan al otro', async () => {
    const importer = harness.importer;

    // Las tablas viven bajo su schema: la clave del almacen lo incluye, igual
    // que el SQL real las cualifica.
    const claves = [...importer.tables.keys()];
    expect(claves).toContain(`${viajes.schemaName}.viajes`);
    expect(claves).toContain(`${inventario.schemaName}.productos`);
    expect(claves.filter((clave) => clave.startsWith(viajes.schemaName))).toHaveLength(4);
    expect(claves.filter((clave) => clave.startsWith(inventario.schemaName))).toHaveLength(3);

    const propios = await api().get(`/api/projects/${inventario.id}/app/productos/records`);
    expect((propios.body as { meta: { total: number } }).meta.total).toBe(60);
  });

  it('pedir un modulo del otro proyecto no encuentra nada', async () => {
    // El nombre del modulo llega por la URL, pero nunca compone SQL: se BUSCA
    // en el descriptor del proyecto pedido. Si no esta, no esta.
    const cruzado = await api().get(`/api/projects/${viajes.id}/app/productos/records`);
    expect(cruzado.status).toBe(404);

    const alreves = await api().get(`/api/projects/${inventario.id}/app/viajes/records`);
    expect(alreves.status).toBe(404);

    // Tampoco sirve un registro real del otro proyecto.
    const productos = await api().get(
      `/api/projects/${inventario.id}/app/productos/records?limit=1`,
    );
    const productoId = (productos.body as { data: { id: string }[] }).data[0]!.id;

    const robado = await api().get(`/api/projects/${viajes.id}/app/clientes/records/${productoId}`);
    expect(robado.status).toBe(404);
  });

  it('otra persona no ve ninguno de los dos', async () => {
    const bob = request(createTestHarnessSharing(BOB).app);

    for (const id of [viajes.id, inventario.id]) {
      // 404 y no 403: confirmar que un proyecto existe ya seria filtrar algo.
      expect((await bob.get(`/api/projects/${id}`)).status).toBe(404);
      expect((await bob.get(`/api/projects/${id}/app`)).status).toBe(404);

      // El borrado se pide bien formado, con el nombre exacto: asi lo que
      // devuelve 404 es la comprobacion de propiedad y no la validacion.
      const deleted = await bob.delete(`/api/projects/${id}`).send({ confirmName: nameOf(id) });
      expect(deleted.status).toBe(404);
    }

    // Y sus proyectos siguen ahi despues del intento.
    expect(harness.projects.rows).toHaveLength(2);
  });

  it('borrar un proyecto no toca al otro', async () => {
    const deleted = await api()
      .delete(`/api/projects/${viajes.id}`)
      .send({ confirmName: nameOf(viajes.id) });
    expect(deleted.status).toBe(204);

    // Se elimino un solo schema, y es el suyo.
    expect(harness.schemas.dropped).toEqual([viajes.schemaName]);

    // El otro sigue en pie y respondiendo.
    const superviviente = await api().get(`/api/projects/${inventario.id}/app/productos/records`);
    expect(superviviente.status).toBe(200);
    expect((superviviente.body as { meta: { total: number } }).meta.total).toBe(60);

    expect((await api().get(`/api/projects/${viajes.id}`)).status).toBe(404);
  });
});

/** El nombre exacto del proyecto, que es lo que pide la confirmacion de borrado. */
function nameOf(id: string): string {
  return harness.projects.rows.find((row) => row.id === id)!.name;
}

/** Un app de Express con la sesion de otra persona sobre los MISMOS datos. */
function createTestHarnessSharing(user: typeof BOB): TestHarness {
  const shared = createTestHarness({ user });

  // Se reemplazan los almacenes por los del harness principal: asi la peticion
  // de Bob recorre los datos reales de Alice y la unica defensa que queda en pie
  // es la comprobacion de propiedad del servidor, que es lo que se esta probando.
  shared.projects.rows.length = 0;
  shared.projects.rows.push(...harness.projects.rows);

  return shared;
}
