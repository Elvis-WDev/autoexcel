/**
 * Imprime la medicion de contraste de la paleta, para leerla de un vistazo.
 *
 * El umbral lo comprueba `tests/contraste.test.ts` en cada `verify`; esto es la
 * version legible, util al retocar colores.
 *
 *   corepack pnpm contraste
 */
import { medirPaleta } from '../tests/helpers/contraste.js';

const mediciones = medirPaleta();
let tema = '';

for (const m of mediciones) {
  if (m.tema !== tema) {
    tema = m.tema;
    process.stdout.write(`\n  ${tema.toUpperCase()}\n`);
  }
  process.stdout.write(
    `    ${m.pasa ? ' ok ' : 'FALL'}  ${m.ratio.toFixed(2).padStart(5)}:1  (min ${m.minimo})  ${m.etiqueta}\n`,
  );
}

const fallos = mediciones.filter((m) => !m.pasa).length;
process.stdout.write(
  fallos === 0 ? '\n  Todo cumple WCAG 2.1 AA.\n\n' : `\n  ${fallos} pares por debajo.\n\n`,
);
process.exit(fallos === 0 ? 0 : 1);
