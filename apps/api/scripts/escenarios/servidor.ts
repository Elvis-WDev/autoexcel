/**
 * La API con las propuestas de los tres escenarios.
 *
 * Igual que `dev:demo`, sustituye **una sola pieza**: el motor de inferencia.
 * Todo lo demas es el sistema real —PostgreSQL, DDL, importacion, sesiones,
 * panel— y es lo que se quiere poner a prueba.
 *
 * `gastos.xlsx` es la excepcion a proposito: para ese archivo el proponedor
 * lanza, y el sistema cae en el camino determinista de RE-04. Asi ese escenario
 * no lleva ninguna pieza sustituida y sirve para comprobar que la inferencia de
 * tipos funciona de verdad.
 */
import { createApp } from '../../src/app.js';
import { compose } from '../../src/composition-root.js';
import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { planoAcademia, planoPedidos } from './fixtures.js';
import type { AnalysisInput } from '../../src/domain/blueprint/analysis-input.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);

function propuestaPara(input: AnalysisInput) {
  const nombre = input.fileName.toLowerCase();

  if (nombre.includes('pedidos')) return planoPedidos();
  if (nombre.includes('academia')) return planoAcademia();

  // E1: sin propuesta. El sistema toma el camino determinista de verdad.
  throw new Error('escenario sin propuesta: se usa el camino determinista');
}

const composition = compose(env, logger, {
  proposer: {
    propose: (input) => Promise.resolve({ blueprint: propuestaPara(input) }),
    repair: (request) => Promise.resolve({ blueprint: propuestaPara(request.input) }),
  },
});

await composition.prepare();

createApp(composition.dependencies).listen(env.PORT, env.HOST, () => {
  logger.warn('API con las propuestas de los escenarios. No uses esto en produccion.', {
    port: env.PORT,
  });
});
