/**
 * Escribe los tres libros de Excel en el directorio que se le pase.
 *
 *   corepack pnpm --filter @app/api tsx scripts/escenarios/generar.ts /tmp/x
 */
import { mkdir } from 'node:fs/promises';
import { writeWorkbook } from '../../tests/helpers/xlsx-fixtures.js';
import { libroAcademia, libroGastos, libroPedidos } from './fixtures.js';

const destino = process.argv[2];
if (!destino) {
  console.error('Falta el directorio de destino.');
  process.exit(1);
}

await mkdir(destino, { recursive: true });

for (const [nombre, hojas] of [
  ['gastos.xlsx', libroGastos()],
  ['pedidos.xlsx', libroPedidos()],
  ['academia.xlsx', libroAcademia()],
] as const) {
  const ruta = await writeWorkbook(destino, nombre, hojas);
  const filas = hojas.reduce((total, hoja) => total + Math.max(0, hoja.rows.length - 1), 0);
  // Es una herramienta de linea de comandos: su salida ES el resultado.
  // eslint-disable-next-line no-console
  console.log(`${ruta}  ${hojas.length} hoja(s), ${filas} filas de datos`);
}
