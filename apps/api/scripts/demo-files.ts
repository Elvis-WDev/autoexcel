/**
 * Escribe los dos archivos de demo en disco.
 *
 * Son los mismos que usan los tests de aceptacion del backend, generados con la
 * misma libreria que luego los lee. Existen como script porque hacen falta fuera
 * de la suite: en las verificaciones a mano y en las pruebas de navegador del
 * panel, que viven en otro paquete y no pueden importar un ayudante de test.
 *
 *   corepack pnpm demo:files            # los deja en /tmp
 *   corepack pnpm demo:files ./salida
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { demoWorkbook, inventarioWorkbook } from '../tests/helpers/demo-fixture.js';

const destino = resolve(process.argv[2] ?? tmpdir());
await mkdir(destino, { recursive: true });

const ARCHIVOS = [
  { nombre: 'viajes.xlsx', hojas: demoWorkbook() },
  { nombre: 'inventario.xlsx', hojas: inventarioWorkbook() },
];

for (const { nombre, hojas } of ARCHIVOS) {
  const libro = new ExcelJS.Workbook();

  for (const hoja of hojas) {
    const pestana = libro.addWorksheet(hoja.name);
    for (const fila of hoja.rows) pestana.addRow(fila);
  }

  const ruta = join(destino, nombre);
  await libro.xlsx.writeFile(ruta);
  process.stdout.write(`  ${ruta}\n`);
}
