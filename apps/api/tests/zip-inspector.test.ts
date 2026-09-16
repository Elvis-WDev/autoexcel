import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  inspectZip,
  looksLikeWorkbook,
  NotAZipError,
} from '../src/infrastructure/storage/zip-inspector.js';
import { createFixtureDir, VIAJES, writeWorkbook } from './helpers/xlsx-fixtures.js';

let dir: string;

beforeAll(async () => {
  dir = await createFixtureDir();
});

afterAll(() => undefined);

describe('inspeccion del ZIP', () => {
  it('lee el directorio central de un xlsx real', async () => {
    const path = await writeWorkbook(dir, 'real.xlsx', [VIAJES]);
    const report = await inspectZip(path);

    expect(report.entryCount).toBeGreaterThan(0);
    expect(report.uncompressedBytes).toBeGreaterThan(0);
    expect(report.zip64).toBe(false);
    expect(report.entryNames).toContain('xl/workbook.xml');
  });

  // La firma de los primeros bytes no distingue un xlsx de cualquier otro ZIP.
  it('reconoce la estructura de un libro de trabajo', async () => {
    const path = await writeWorkbook(dir, 'libro.xlsx', [VIAJES]);
    expect(looksLikeWorkbook(await inspectZip(path))).toBe(true);
  });

  it('rechaza lo que no es un ZIP', async () => {
    const path = join(dir, 'texto.xlsx');
    await writeFile(path, 'esto no es un zip, solo texto plano');

    await expect(inspectZip(path)).rejects.toBeInstanceOf(NotAZipError);
  });

  it('rechaza un archivo demasiado corto para tener cabecera', async () => {
    const path = join(dir, 'corto.xlsx');
    await writeFile(path, Buffer.from([0x50, 0x4b]));

    await expect(inspectZip(path)).rejects.toBeInstanceOf(NotAZipError);
  });

  // Esta es la razon de ser del inspector: un xlsx muy comprimido declara en su
  // directorio central cuanto va a ocupar, y eso se puede mirar antes de abrirlo.
  it('declara una expansion mucho mayor que el tamano en disco', async () => {
    const rows: (string | number)[][] = [['Cliente', 'Nota']];
    for (let i = 0; i < 4000; i += 1) {
      // Texto muy repetitivo: comprime much0 y delata la desproporcion.
      rows.push([`Cliente ${i % 10}`, 'x'.repeat(200)]);
    }

    const path = await writeWorkbook(dir, 'comprimible.xlsx', [{ name: 'Datos', rows }]);
    const report = await inspectZip(path);

    expect(report.uncompressedBytes).toBeGreaterThan(report.compressedBytes * 3);
  });
});
