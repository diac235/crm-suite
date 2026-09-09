import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { BadRequestError } from '../core/errors';

/** Tipos MIME permitidos para documentos adjuntos. */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
};

export function ensureStorageDir(): void {
  fs.mkdirSync('/tmp', { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Un subdirectorio por año/mes evita millones de archivos en una sola carpeta.
    const now = new Date();
    const dir = path.join(
      env.storageDir,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    );
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename: (_req, file, cb) => {
    // Nombre generado por el servidor: el nombre original nunca toca el sistema de archivos.
    const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadDocument = multer({
  storage,
  limits: {
    fileSize: env.maxUploadBytes,
    files: 1,
    fields: 20,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      cb(new BadRequestError(`Tipo de archivo no permitido: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

/** Traduce los errores de multer a errores de aplicación legibles. */
export function translateMulterError(err: unknown): Error {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new BadRequestError(`El archivo supera el máximo de ${env.MAX_UPLOAD_MB} MB`);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return new BadRequestError('Solo se permite un archivo por carga');
    }
    return new BadRequestError(`Error al subir el archivo: ${err.message}`);
  }
  return err as Error;
}
