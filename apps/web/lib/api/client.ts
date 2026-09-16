import { ApiError } from './errors';

/**
 * El unico sitio desde el que se llama a la API.
 *
 * Siempre rutas relativas: el navegador habla con este mismo origen y Next
 * reescribe hacia Express. Asi la cookie de sesion viaja sin configuracion
 * especial y el backend no necesita CORS.
 *
 * Desenvuelve `{ data, meta }` y convierte `{ error }` en un `ApiError`. Ningun
 * componente deberia ver nunca la forma del sobre.
 */

export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Lo entrega TanStack Query para abortar lo que ya no interesa. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, signal, headers = {} } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(path, {
    method,
    signal,
    // La sesion viaja en una cookie HttpOnly que pone Better Auth.
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 sin cuerpo: un borrado correcto, por ejemplo.
  if (response.status === 204) return { data: undefined as T, meta: {} };

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) throw ApiError.fromEnvelope(payload, response.status);

  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw ApiError.opaque(response.status);
  }

  const { data, meta } = payload as { data: T; meta?: Record<string, unknown> };
  return { data, meta: meta ?? {} };
}
