import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/**
 * El cliente de la API.
 *
 * Es la pieza por la que pasa cada peticion del panel, asi que su contrato se
 * fija aqui desde el primer dia: desenvolver el sobre de exito, convertir el de
 * error en algo tipado, y no inventarse un mensaje cuando el backend ya escribio
 * uno.
 */

function mockFetch(status: number, body: unknown, init: { json?: boolean } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () =>
          init.json === false ? Promise.reject(new Error('sin cuerpo')) : Promise.resolve(body),
      } as Response),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('desenvuelve data y meta', async () => {
    mockFetch(200, { data: [{ id: 'a' }], meta: { total: 1 } });

    const response = await request<{ id: string }[]>('/api/projects');

    expect(response.data).toEqual([{ id: 'a' }]);
    expect(response.meta).toEqual({ total: 1 });
  });

  it('devuelve meta vacio cuando el backend no lo manda', async () => {
    mockFetch(200, { data: { id: 'a' } });

    expect((await request('/api/projects/a')).meta).toEqual({});
  });

  it('no intenta leer cuerpo en un 204', async () => {
    mockFetch(204, null, { json: false });

    await expect(request('/api/projects/a', { method: 'DELETE' })).resolves.toEqual({
      data: undefined,
      meta: {},
    });
  });

  it('convierte el sobre de error en ApiError y conserva el mensaje del backend', async () => {
    mockFetch(409, {
      error: { code: 'CONFLICT', message: 'Has alcanzado el limite de 3 proyectos.' },
    });

    const error = await request('/api/projects', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('CONFLICT');
    expect((error as ApiError).status).toBe(409);
    // El texto es del servidor: aqui no se traduce nada.
    expect((error as ApiError).message).toBe('Has alcanzado el limite de 3 proyectos.');
  });

  it('no confia en un codigo que no reconoce', async () => {
    mockFetch(418, { error: { code: 'INVENTADO', message: 'lo que sea' } });

    const error = (await request('/api/x').catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Algo salio mal. Intentalo de nuevo.');
  });

  it('tampoco confia en un 200 sin sobre', async () => {
    mockFetch(200, { cualquier: 'cosa' });

    await expect(request('/api/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('manda la cookie de sesion y no pone Content-Type sin cuerpo', async () => {
    mockFetch(200, { data: null });
    await request('/api/projects');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.credentials).toBe('include');
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });
});
