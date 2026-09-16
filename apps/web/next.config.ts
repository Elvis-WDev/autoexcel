import type { NextConfig } from 'next';

/**
 * Un solo origen para el navegador.
 *
 * El navegador habla siempre con este servidor; `/api/*` se reescribe hacia la
 * API de Express por detras. Dos consecuencias que son la razon de hacerlo asi:
 * la cookie de sesion de Better Auth es *same-site*, sin necesidad de
 * `SameSite=None` ni de HTTPS en desarrollo; y el backend no necesita CORS, que
 * hoy no tiene.
 *
 * Es ademas el despliegue que describe `docs/architecture/deployment.md`: un
 * dominio publico, `/` y `/api`.
 */
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El nombre del framework y su version no son asunto de quien visita.
  poweredByHeader: false,
  rewrites: () =>
    Promise.resolve([
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      // La sonda no cuelga de /api en la API, y tiene que ser alcanzable desde
      // el mismo dominio publico que todo lo demas.
      { source: '/health', destination: `${apiOrigin}/health` },
    ]),
};

export default nextConfig;
