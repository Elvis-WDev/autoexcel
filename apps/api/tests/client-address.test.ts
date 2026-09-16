import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { normalizeClientAddress } from '../src/infrastructure/http/client-address.js';

/**
 * Lo que un cliente dice sobre su propia direccion no es un dato: es una
 * afirmacion suya. Creerla es lo que rompe cualquier limite por IP, porque basta
 * con cambiarla en cada intento para estrenar contador.
 */
function appConProxies(trustedProxies: string[]) {
  const app = express();
  app.use(normalizeClientAddress(trustedProxies));
  app.get('/', (peticion, respuesta) => {
    respuesta.json({ recibido: peticion.headers['x-forwarded-for'] ?? null });
  });
  return app;
}

describe('normalizacion de la direccion del cliente', () => {
  it('sin proxies de confianza, tira la cabecera que vino y pone el socket', async () => {
    const respuesta = await request(appConProxies([]))
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99');

    expect(respuesta.body).toHaveProperty('recibido');
    expect(respuesta.body.recibido).not.toBe('203.0.113.99');
    expect(respuesta.body.recibido).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });

  it('tampoco cuela una cadena de saltos inventada', async () => {
    const respuesta = await request(appConProxies([]))
      .get('/')
      .set('X-Forwarded-For', '1.2.3.4, 5.6.7.8, 9.10.11.12');

    expect(String(respuesta.body.recibido)).not.toContain('1.2.3.4');
  });

  it('sin cabecera tambien queda puesta la del socket', async () => {
    const respuesta = await request(appConProxies([])).get('/');

    expect(respuesta.body.recibido).toBeTruthy();
  });

  /**
   * Con un balanceador real declarado, la cabecera se respeta: es el proxy quien
   * la escribe, y Better Auth la recorre con esa misma lista.
   */
  it('con proxies de confianza declarados, la cabecera se respeta', async () => {
    const respuesta = await request(appConProxies(['10.0.0.0/8']))
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99');

    expect(respuesta.body.recibido).toBe('203.0.113.99');
  });
});
