import { extname } from 'node:path';
import multer, { MulterError } from 'multer';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../../domain/errors.js';
import type { LocalFileStorage } from '../storage/local-file-storage.js';

/** Lo que declara el navegador al subir un xlsx. No se confia en ello. */
const ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
]);

export interface UploadedSpreadsheet {
  originalName: string;
  storagePath: string;
}

const uploads = new WeakMap<Request, UploadedSpreadsheet>();

export function getUpload(request: Request): UploadedSpreadsheet {
  const upload = uploads.get(request);

  if (!upload) {
    throw AppError.validation('Adjunta un archivo Excel para continuar.');
  }

  return upload;
}

/**
 * Recepcion del archivo subido (RF-01).
 *
 * El archivo aterriza en disco con un nombre generado por el sistema. El nombre
 * que trae se guarda aparte, solo como etiqueta: usarlo para construir una ruta
 * es como se llega a un recorrido de directorios.
 *
 * La extension y el `content-type` los elige quien sube, asi que aqui solo
 * sirven para rechazar pronto lo evidente. La comprobacion que cuenta es la de
 * los bytes del archivo, y ocurre despues, en el caso de uso.
 */
export function spreadsheetUpload(storage: LocalFileStorage, maxBytes: number): RequestHandler {
  const handler = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => callback(null, storage.uploadsDir),
      filename: (_request, _file, callback) => {
        // `generateStoragePath` devuelve `uploads/<hex>.xlsx`; a multer solo le
        // toca el nombre, porque el directorio ya se fijo arriba.
        const relative = storage.generateStoragePath();
        callback(null, relative.slice(relative.lastIndexOf('/') + 1));
      },
    }),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 4,
      parts: 6,
    },
    fileFilter: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();

      if (extension !== '.xlsx') {
        callback(
          new AppError('UNSUPPORTED_FILE', 'Solo aceptamos archivos Excel con extension .xlsx.'),
        );
        return;
      }

      if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
        callback(new AppError('UNSUPPORTED_FILE', 'Ese archivo no parece una hoja de calculo.'));
        return;
      }

      callback(null, true);
    },
  }).single('file');

  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response, (error: unknown) => {
      if (error) {
        next(translateMulterError(error, maxBytes));
        return;
      }

      const file = request.file;
      if (!file) {
        next(AppError.validation('Adjunta un archivo Excel para continuar.'));
        return;
      }

      uploads.set(request, {
        originalName: file.originalname,
        storagePath: `uploads/${file.filename}`,
      });

      next();
    });
  };
}

function translateMulterError(error: unknown, maxBytes: number): unknown {
  if (!(error instanceof MulterError)) return error;

  const megabytes = Math.floor(maxBytes / (1024 * 1024));

  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new AppError('PAYLOAD_TOO_LARGE', `El archivo supera el limite de ${megabytes} MB.`);
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return AppError.validation('Sube un solo archivo Excel.');
    default:
      return AppError.validation('No pudimos recibir el archivo. Intentalo nuevamente.');
  }
}
