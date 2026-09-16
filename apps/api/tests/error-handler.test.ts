import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/domain/errors.js';
import { errorHandler, notFoundHandler } from '../src/infrastructure/http/error-handler.js';
import { requestContext } from '../src/infrastructure/http/request-context.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';
import { createCapturingLogger } from './helpers/capturing-logger.js';

const SECRET = 'postgres://ets_owner:hunter2@db-interna:5432/ets';

function appUnderTest(logger = createSilentLogger()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext());
  app.use(express.json({ limit: '1kb' }));

  app.get('/domain-error', () => {
    throw AppError.invalidState('Todavia no puedes crear la aplicacion.', { from: 'analyzing' });
  });

  app.get('/not-found', () => {
    throw AppError.notFound('No encontramos ese proyecto.');
  });

  // Express 5 reenvia el rechazo de una ruta asincrona al manejador de errores
  // sin envoltorio. Esta prueba fija esa garantia.
  app.get('/async-boom', async () => {
    await Promise.resolve();
    throw new Error(`fallo al conectar con ${SECRET}`);
  });

  app.get('/zod-error', () => {
    z.object({ nombre: z.string() }).parse({ nombre: 42 });
  });

  app.post('/echo', (_request, response) => {
    response.json({ data: 'ok' });
  });

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}

describe('errorHandler', () => {
  it('traduce el codigo de dominio a estado HTTP', async () => {
    const response = await request(appUnderTest()).get('/domain-error');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE');
    expect(response.body.error.message).toBe('Todavia no puedes crear la aplicacion.');
    expect(response.body.error.details).toEqual({ from: 'analyzing' });
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mapea NOT_FOUND a 404', async () => {
    const response = await request(appUnderTest()).get('/not-found');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('enmascara un error inesperado sin filtrar nada interno', async () => {
    const response = await request(appUnderTest()).get('/async-boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('db-interna');
    expect(serialized).not.toContain('at ');
  });

  it('convierte un ZodError en 400 con el detalle del campo', async () => {
    const response = await request(appUnderTest()).get('/zod-error');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details[0].path).toBe('nombre');
  });

  it('rechaza un JSON malformado con 400', async () => {
    const response = await request(appUnderTest())
      .post('/echo')
      .set('content-type', 'application/json')
      .send('{"roto":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rechaza un cuerpo mayor que el limite con 413', async () => {
    const response = await request(appUnderTest())
      .post('/echo')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(4096) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('devuelve el sobre de error tambien para una ruta inexistente', async () => {
    const response = await request(appUnderTest()).get('/no-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('/no-existe');
  });
});

describe('log de errores', () => {
  it('registra un fallo inesperado como error, con stack', async () => {
    const logger = createCapturingLogger();
    await request(appUnderTest(logger)).get('/async-boom');

    const entry = logger.entries.at(-1);
    expect(entry?.level).toBe('error');
    expect(entry?.context?.status).toBe(500);
    expect(entry?.context?.stack).toBeTypeOf('string');
  });

  // Un 404 o un 400 son resultados esperados: guardar su traza solo ensucia el log.
  it('registra un rechazo esperado como aviso, sin stack', async () => {
    const logger = createCapturingLogger();
    await request(appUnderTest(logger)).get('/no-existe');

    const entry = logger.entries.at(-1);
    expect(entry?.level).toBe('warn');
    expect(entry?.context?.status).toBe(404);
    expect(entry?.context).not.toHaveProperty('stack');
  });

  it('nunca escribe el mensaje original del error en la respuesta, pero si en el log', async () => {
    const logger = createCapturingLogger();
    const response = await request(appUnderTest(logger)).get('/async-boom');

    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(logger.entries.at(-1))).toContain('hunter2');
  });
});
