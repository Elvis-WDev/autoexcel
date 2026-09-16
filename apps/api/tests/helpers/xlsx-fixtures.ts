import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

/**
 * Corpus de archivos de prueba.
 *
 * Son xlsx de verdad, escritos con la misma libreria que luego los lee. Probar
 * la ingesta con un doble de prueba no demostraria nada: lo que rompe en
 * produccion son los archivos reales, con sus filas de titulo, sus celdas
 * combinadas y sus pestanas de leyenda.
 */
export interface FixtureSheet {
  name: string;
  rows: (string | number | boolean | Date | null)[][];
}

export async function createFixtureDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ets-fixtures-'));
}

export async function writeWorkbook(
  dir: string,
  fileName: string,
  sheets: FixtureSheet[],
): Promise<string> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  const path = join(dir, fileName);
  await workbook.xlsx.writeFile(path);
  return path;
}

/** Escribe bytes crudos: para los archivos que no son xlsx de verdad. */
export async function writeRaw(dir: string, fileName: string, content: Buffer): Promise<string> {
  const path = join(dir, fileName);
  await writeFile(path, content);
  return path;
}

/** Cabecera de un documento OLE2: el .xls anterior a 2007. */
export const LEGACY_XLS_BYTES = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(512),
]);

// --------------------------------------------------------------------------
// Hojas reutilizables
// --------------------------------------------------------------------------

/** El caso canonico del ERS 13, con repeticion suficiente para la demo. */
export const VIAJES: FixtureSheet = {
  name: 'Viajes',
  rows: [
    ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
    ['2026-09-01', 'Comercial Andes', '123', 'ABC-123', 'Juan Perez', 350, 'Cerrado'],
    ['2026-09-02', 'Comercial Andes', '123', 'XYZ-456', 'Ana Ruiz', 420, 'Cerrado'],
    ['2026-09-03', 'Cliente Norte', '456', 'ABC-123', 'Juan Perez', 290, 'Abierto'],
    ['2026-09-04', 'comercial andes', '123', 'ABC-123', 'Ana Ruiz', 310, 'Abierto'],
    ['2026-09-05', '  Cliente Norte  ', '456', 'XYZ-456', 'Juan Perez', 275, 'Cerrado'],
  ],
};

export const CLIENTES: FixtureSheet = {
  name: 'Clientes',
  rows: [
    ['Cliente', 'RUC', 'Correo', 'Telefono', 'Ciudad'],
    ['Comercial Andes', '123', 'ventas@andes.com', '+593 99 123 4567', 'Quito'],
    ['Cliente Norte', '456', 'compras@norte.com', '+593 98 765 4321', 'Guayaquil'],
  ],
};

/** Pestana de leyenda sin datos: muy comun en archivos reales. */
export const RESUMEN_VACIO: FixtureSheet = { name: 'Resumen', rows: [] };

/** Titulo y filas en blanco por encima del encabezado real. */
export const CON_TITULO: FixtureSheet = {
  name: 'Reporte',
  rows: [
    ['REPORTE MENSUAL DE OPERACIONES'],
    [],
    ['Generado el 2026-09-15'],
    ['Producto', 'Cantidad', 'Precio'],
    ['Tornillos', 100, 2.5],
    ['Tuercas', 250, 1.75],
    ['Arandelas', 80, 0.9],
  ],
};

/** Solo numeros: no hay nada que pueda pasar por encabezado. */
export const SIN_ENCABEZADOS: FixtureSheet = {
  name: 'Datos',
  rows: [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ],
};

/** Hueco en medio del encabezado, como deja una celda combinada. */
export const ENCABEZADO_CON_HUECO: FixtureSheet = {
  name: 'Huecos',
  rows: [
    ['Cliente', null, 'Total'],
    ['ACME', 'algo', 100],
    ['NORTE', 'otra cosa', 200],
  ],
};

/** Dos columnas con el mismo nombre. */
export const ENCABEZADOS_REPETIDOS: FixtureSheet = {
  name: 'Repetidos',
  rows: [
    ['Nombre', 'Nombre', 'Valor'],
    ['a', 'b', 1],
    ['c', 'd', 2],
  ],
};

export function sheetWithRows(name: string, dataRows: number): FixtureSheet {
  const rows: FixtureSheet['rows'] = [['Cliente', 'Monto']];

  for (let i = 0; i < dataRows; i += 1) {
    rows.push([`Cliente ${i % 25}`, i * 10]);
  }

  return { name, rows };
}
