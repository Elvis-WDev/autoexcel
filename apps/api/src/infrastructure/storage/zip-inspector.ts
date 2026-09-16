import { open } from 'node:fs/promises';

/**
 * Inspector del directorio central de un ZIP.
 *
 * Un xlsx es un ZIP, y un ZIP declara en su directorio central cuanto ocupa cada
 * entrada YA descomprimida. Leer eso cuesta unos kilobytes y responde, antes de
 * parsear nada, la unica pregunta que importa: cuanto va a crecer este archivo.
 *
 * Es la defensa contra el zip bomb. El limite de subida acota lo que llega por
 * la red; este acota lo que ocupa una vez abierto, que es entre diez y mil veces
 * mas y es lo que de verdad tumba un proceso.
 *
 * De paso confirma que el archivo tiene dentro la estructura de un libro OOXML,
 * cosa que la firma de los primeros bytes no puede distinguir de un ZIP
 * cualquiera.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;

/** Tamano maximo del comentario final del ZIP, mas la cabecera EOCD. */
const MAX_EOCD_SEARCH = 65_557;

/** Marca de ZIP64: el tamano real no cabe en 32 bits. */
const ZIP64_SENTINEL = 0xffffffff;

export interface ZipReport {
  entryCount: number;
  /** Suma de los tamanos descomprimidos declarados. */
  uncompressedBytes: number;
  compressedBytes: number;
  /** `true` si alguna entrada declara su tamano en formato ZIP64. */
  zip64: boolean;
  entryNames: string[];
}

export class NotAZipError extends Error {
  constructor() {
    super('El archivo no tiene la estructura de un ZIP.');
    this.name = 'NotAZipError';
  }
}

export async function inspectZip(absolutePath: string): Promise<ZipReport> {
  const handle = await open(absolutePath, 'r');

  try {
    const { size } = await handle.stat();
    if (size < 22) throw new NotAZipError();

    // El EOCD esta al final, pero puede llevar detras un comentario de hasta
    // 64 KB, asi que hay que buscarlo hacia atras.
    const tailLength = Math.min(size, MAX_EOCD_SEARCH);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);

    const eocd = findEndOfCentralDirectory(tail);
    if (eocd < 0) throw new NotAZipError();

    const entryCount = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);

    if (directoryOffset === ZIP64_SENTINEL || directorySize === ZIP64_SENTINEL) {
      // ZIP64 a nivel de archivo: mas grande de lo que este MVP acepta.
      return {
        entryCount,
        uncompressedBytes: Number.POSITIVE_INFINITY,
        compressedBytes: size,
        zip64: true,
        entryNames: [],
      };
    }

    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);

    return readCentralDirectory(directory, entryCount, size);
  } finally {
    await handle.close();
  }
}

function findEndOfCentralDirectory(tail: Buffer): number {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function readCentralDirectory(
  directory: Buffer,
  entryCount: number,
  fileSize: number,
): ZipReport {
  let uncompressedBytes = 0;
  let compressedBytes = 0;
  let zip64 = false;
  const entryNames: string[] = [];

  let offset = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directory.length) break;
    if (directory.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) break;

    const compressed = directory.readUInt32LE(offset + 20);
    const uncompressed = directory.readUInt32LE(offset + 24);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);

    if (uncompressed === ZIP64_SENTINEL || compressed === ZIP64_SENTINEL) {
      zip64 = true;
      uncompressedBytes = Number.POSITIVE_INFINITY;
    } else {
      uncompressedBytes += uncompressed;
      compressedBytes += compressed;
    }

    entryNames.push(directory.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entryCount: entryNames.length,
    uncompressedBytes,
    compressedBytes: compressedBytes || fileSize,
    zip64,
    entryNames,
  };
}

/** Marcas de que el ZIP es realmente un libro de trabajo OOXML. */
export function looksLikeWorkbook(report: ZipReport): boolean {
  return (
    report.entryNames.includes('xl/workbook.xml') &&
    report.entryNames.some((name) => name.startsWith('xl/worksheets/'))
  );
}
