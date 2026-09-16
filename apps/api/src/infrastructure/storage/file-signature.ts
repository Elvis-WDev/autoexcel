import { open } from 'node:fs/promises';

export type FileKind = 'ooxml' | 'legacy-xls' | 'unknown';

/** Cabecera local de un archivo ZIP. Un .xlsx es un ZIP. */
const ZIP_LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** ZIP vacio: valido como ZIP, inutil como libro de trabajo. */
const ZIP_EMPTY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
/** Documento OLE2: el .xls anterior a 2007. */
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Identifica el archivo por su contenido, no por su extension.
 *
 * La extension y el `content-type` los elige quien sube el archivo, asi que no
 * prueban nada. Distinguir el `.xls` antiguo del `.xlsx` permite ademas dar un
 * mensaje util en vez de un "no pudimos leerlo" generico.
 */
export async function detectFileKind(absolutePath: string): Promise<FileKind> {
  const handle = await open(absolutePath, 'r');

  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);

    if (bytesRead >= 8 && header.subarray(0, 8).equals(OLE2)) return 'legacy-xls';
    if (bytesRead >= 4 && header.subarray(0, 4).equals(ZIP_LOCAL)) return 'ooxml';
    if (bytesRead >= 4 && header.subarray(0, 4).equals(ZIP_EMPTY)) return 'unknown';

    return 'unknown';
  } finally {
    await handle.close();
  }
}
