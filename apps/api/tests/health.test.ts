import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';
import { createFakePools } from './helpers/fake-pools.js';
import { createFakeSessions, TEST_ENV } from './helpers/test-app.js';

function appWith(pools: ReturnType<typeof createFakePools>) {
  return createApp({
    env: TEST_ENV,
    pools,
    logger: createSilentLogger(),
    authHandler: () => Promise.resolve(new Response(null, { status: 501 })),
    sessions: createFakeSessions(null),
    useCases: {
      createProject: () => Promise.reject(new Error('no usado')),
      listProjects: () => Promise.reject(new Error('no usado')),
      getProject: () => Promise.reject(new Error('no usado')),
      deleteProject: () => Promise.reject(new Error('no usado')),
      ingestSpreadsheet: () => Promise.reject(new Error('no usado')),
      listSheets: () => Promise.reject(new Error('no usado')),
      updateSheetSelection: () => Promise.reject(new Error('no usado')),
      startAnalysis: () => Promise.reject(new Error('no usado')),
      getBlueprint: () => Promise.reject(new Error('no usado')),
      getJob: () => Promise.reject(new Error('no usado')),
      getJobFailures: () => Promise.reject(new Error('no usado')),
      startBuild: () => Promise.reject(new Error('no usado')),
      applyEdit: () => Promise.reject(new Error('no usado')),
      confirmBlueprint: () => Promise.reject(new Error('no usado')),
      advanceStep: () => Promise.reject(new Error('no usado')),
      getManifest: () => Promise.reject(new Error('no usado')),
      listRecords: () => Promise.reject(new Error('no usado')),
      getRecord: () => Promise.reject(new Error('no usado')),
      createRecord: () => Promise.reject(new Error('no usado')),
      updateRecord: () => Promise.reject(new Error('no usado')),
      deleteRecord: () => Promise.reject(new Error('no usado')),
      listOptions: () => Promise.reject(new Error('no usado')),
      uploadMiddleware: (_request, _response, next) => next(),
      limits: { analysesPerHour: 100, uploadsPerHour: 100 },
    },
    version: '0.1.0',
  });
}

describe('GET /health', () => {
  it('responde 200 cuando los dos planos estan sanos', async () => {
    const response = await request(appWith(createFakePools())).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.checks).toEqual({ control: 'up', runtime: 'up' });
    expect(response.body.data.version).toBe('0.1.0');
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('responde 503 cuando el plano de control esta caido', async () => {
    const response = await request(appWith(createFakePools({ control: false }))).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.error.details.checks).toEqual({ control: 'down', runtime: 'up' });
  });

  // El proceso puede arrancar con el rol duenno sano y el de runtime mal
  // configurado. Esa asimetria es exactamente lo que debe detectar la sonda.
  it('responde 503 cuando solo el plano de runtime esta caido', async () => {
    const response = await request(appWith(createFakePools({ runtime: false }))).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.error.details.checks).toEqual({ control: 'up', runtime: 'down' });
  });

  it('devuelve un identificador de peticion en la cabecera', async () => {
    const response = await request(appWith(createFakePools())).get('/health');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('conserva el identificador de peticion que llega del cliente', async () => {
    const response = await request(appWith(createFakePools()))
      .get('/health')
      .set('x-request-id', 'trace-123');

    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it('no anuncia el framework', async () => {
    const response = await request(appWith(createFakePools())).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
