import { defineConfig, devices } from '@playwright/test';

/**
 * Las pruebas de navegador.
 *
 * Levantan **el sistema entero**: PostgreSQL ya en marcha, la API de Express y
 * el panel de Next. Nada de dobles. Es la unica forma de afirmar CA-18 —"todo el
 * flujo puede completarse sin escribir codigo"—, porque eso solo se sabe
 * conduciendo la interfaz como la conduciria una persona.
 *
 * La API arranca con `dev:demo`: sin clave de inferencia el camino determinista
 * no propone relaciones, y sin relaciones no hay CA-04, CA-06, CA-12 ni CA-15
 * que comprobar. Lo unico sustituido es la propuesta; lo demas es real.
 *
 *   corepack pnpm --filter @app/web e2e
 */
const PUERTO_WEB = 3100;
const PUERTO_API = 4000;
const BASE = `http://127.0.0.1:${PUERTO_WEB}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // El flujo completo toca disco y base de datos; con paralelismo los proyectos
  // de una prueba aparecerian en la lista de otra.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/informe' }]],

  use: {
    baseURL: BASE,
    // Las capturas y la traza solo cuando algo falla: son para diagnosticar.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'pnpm --filter @app/api dev:demo',
      cwd: '../..',
      url: `http://127.0.0.1:${PUERTO_API}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
    },
    {
      /**
       * Contra la construccion de produccion, no contra el servidor de
       * desarrollo. Por dos razones, y la segunda no es opcional:
       *
       *   - Es lo que se despliega. Probar otra cosa demuestra otra cosa.
       *   - **En desarrollo la pagina no llega a hidratar en este navegador.**
       *     Turbopack depende de un WebSocket de recarga en caliente que aqui
       *     falla el apreton de manos, y sin el React no toma el control: la
       *     pagina se queda como HTML muerto, sin un solo error en consola. Se
       *     descubrio porque la primera prueba encontro un boton que nunca se
       *     habilitaba.
       */
      command: 'pnpm build && pnpm start',
      url: BASE,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
    },
  ],
});
