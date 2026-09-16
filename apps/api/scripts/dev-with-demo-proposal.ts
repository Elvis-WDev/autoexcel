/**
 * La API de desarrollo, con la propuesta del ERS 18 fijada.
 *
 * Sin `ANTHROPIC_API_KEY` el analisis toma el camino determinista de RE-04, que
 * **nunca propone relaciones**: una tabla por hoja y nada mas. Eso deja sin
 * poder ejercitar media aplicacion —aceptar o rechazar una relacion, ver como un
 * campo se degrada a texto, comprobar que la importacion enlaza— contra un
 * servidor de verdad.
 *
 * Este arranque sustituye una sola pieza, el motor de inferencia, por la
 * propuesta conocida del archivo de demo. Todo lo demas es el sistema real:
 * PostgreSQL, DDL, importacion y sesiones.
 *
 *   corepack pnpm dev:demo
 *
 * No es un doble de pruebas ni entra en `verify`: es una comodidad de
 * desarrollo, y por eso vive en `scripts/` y no en `src/`.
 */
import { createApp } from '../src/app.js';
import { compose } from '../src/composition-root.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { demoBlueprint, inventarioBlueprint } from '../tests/helpers/demo-fixture.js';
import type { AnalysisInput } from '../src/domain/blueprint/analysis-input.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);

/**
 * Se elige por el nombre del archivo.
 *
 * Los dos ficheros de demo describen negocios distintos —transporte e
 * inventario— y esa diferencia es el punto: sirve para comprobar que el panel
 * genera dos aplicaciones distintas sin que nadie toque una linea de codigo.
 */
function propuestaPara(input: AnalysisInput) {
  return input.fileName.toLowerCase().includes('inventario')
    ? inventarioBlueprint()
    : demoBlueprint();
}

const composition = compose(env, logger, {
  proposer: {
    propose: (input) => Promise.resolve({ blueprint: propuestaPara(input) }),
    repair: (request) => Promise.resolve({ blueprint: propuestaPara(request.input) }),
  },
});

await composition.prepare();

createApp(composition.dependencies).listen(env.PORT, env.HOST, () => {
  logger.warn('API con la propuesta de demo fijada. No uses esto en produccion.', {
    port: env.PORT,
  });
});
