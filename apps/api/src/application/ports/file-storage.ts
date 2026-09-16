export interface StoredFile {
  /** Ruta relativa al directorio de almacenamiento. Nunca se sirve al cliente. */
  storagePath: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Puerto de almacenamiento de los archivos subidos.
 *
 * La implementacion local guarda en disco; una futura en S3 implementaria lo
 * mismo sin que la aplicacion se entere.
 */
export interface FileStorage {
  /** Ruta absoluta para leer un archivo ya guardado. */
  resolve(storagePath: string): string;
  /** Idempotente: borrar algo que no existe no es un error. */
  remove(storagePath: string): Promise<void>;
}
