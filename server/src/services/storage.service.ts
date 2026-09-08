import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { BadRequestError } from '../core/errors';

/** Firmas binarias mínimas para verificar que el archivo es lo que dice ser. */
const MAGIC_NUMBERS: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
];

/** Clave relativa al directorio de almacenamiento (nunca rutas absolutas del cliente). */
export function toStorageKey(absolutePath: string): string {
  return path.relative(env.storageDir, absolutePath).split(path.sep).join('/');
}

/** Resuelve la clave a una ruta absoluta impidiendo salir del directorio base. */
export function resolveStoragePath(storageKey: string): string {
  const base = path.resolve(env.storageDir);
  const target = path.resolve(base, storageKey);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new BadRequestError('Ruta de archivo inválida');
  }
  return target;
}

export function computeChecksum(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Verifica la firma binaria contra el MIME declarado cuando es conocida. */
export function verifyMagicNumber(filePath: string, mimeType: string): boolean {
  const signature = MAGIC_NUMBERS.find((m) => m.mime === mimeType);
  if (!signature) return true;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(signature.bytes.length);
    fs.readSync(fd, buffer, 0, signature.bytes.length, signature.offset);
    return signature.bytes.every((byte, i) => buffer[i] === byte);
  } finally {
    fs.closeSync(fd);
  }
}

export function deleteFileQuietly(storageKey: string): void {
  try {
    fs.unlinkSync(resolveStoragePath(storageKey));
  } catch (err) {
    logger.warn({ err, storageKey }, 'No se pudo eliminar el archivo del almacenamiento');
  }
}

/** Nombre seguro para la cabecera Content-Disposition. */
export function safeDownloadName(name: string): string {
  return name.replace(/[\r\n"\\]/g, '').slice(0, 150) || 'documento';
}
