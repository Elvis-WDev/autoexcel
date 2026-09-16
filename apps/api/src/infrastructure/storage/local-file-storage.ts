import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { FileStorage, StoredFile } from '../../application/ports/file-storage.js';
import { AppError } from '../../domain/errors.js';

/**
 * Almacenamiento local de los archivos subidos.
 *
 * Tres reglas:
 *
 *   1. El nombre en disco lo genera el sistema. El nombre que trae el archivo se
 *      guarda solo como etiqueta; usarlo como ruta es como se llega a un
 *      recorrido de directorios.
 *   2. Nada de este directorio se sirve estaticamente.
 *   3. Toda ruta que entre se comprueba contra la raiz antes de tocar el disco,
 *      aunque la haya generado el propio sistema.
 */
export interface LocalFileStorage extends FileStorage {
  /** Ruta absoluta de la raiz. */
  readonly root: string;
  /** Directorio absoluto donde aterrizan los archivos subidos. */
  readonly uploadsDir: string;
  /** Nombre en disco para un archivo nuevo, relativo a la raiz. */
  generateStoragePath(): string;
  ensureReady(): Promise<void>;
  /** Tamano y hash de un archivo ya escrito. */
  describe(storagePath: string): Promise<StoredFile>;
}

export function createLocalFileStorage(storageDir: string): LocalFileStorage {
  const root = isAbsolute(storageDir) ? storageDir : resolve(process.cwd(), storageDir);
  const uploadsDir = join(root, 'uploads');

  /** Impide que una ruta manipulada se escape de la raiz. */
  function resolveWithin(storagePath: string): string {
    const absolute = resolve(root, storagePath);

    if (absolute !== root && !absolute.startsWith(root + sep)) {
      throw AppError.internal(
        'Algo salio mal de nuestro lado.',
        new Error(`Ruta fuera del directorio de almacenamiento: ${storagePath}`),
      );
    }

    return absolute;
  }

  return {
    root,
    uploadsDir,

    async ensureReady(): Promise<void> {
      await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
    },

    generateStoragePath(): string {
      return join('uploads', `${randomBytes(16).toString('hex')}.xlsx`);
    },

    resolve(storagePath: string): string {
      return resolveWithin(storagePath);
    },

    async describe(storagePath: string): Promise<StoredFile> {
      const absolute = resolveWithin(storagePath);
      const [info, sha256] = await Promise.all([stat(absolute), hashFile(absolute)]);

      return { storagePath, sizeBytes: info.size, sha256 };
    },

    async remove(storagePath: string): Promise<void> {
      await rm(resolveWithin(storagePath), { force: true });
    },
  };
}

function hashFile(absolutePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absolutePath);

    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}
