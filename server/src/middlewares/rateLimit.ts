import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env';

const jsonMessage = (message: string) => ({
  success: false,
  error: { code: 'DEMASIADAS_SOLICITUDES', message },
});

function build(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // En pruebas el límite se relaja para no interferir con la suite.
    skip: () => env.isTest,
    ...options,
  });
}

/** Límite global de la API. */
export const apiLimiter = build({
  windowMs: 60_000,
  limit: 300,
  message: jsonMessage('Demasiadas solicitudes. Espere un momento e intente nuevamente.'),
});

/** Límite estricto para autenticación (mitiga fuerza bruta). */
export const authLimiter = build({
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: jsonMessage('Demasiados intentos de acceso. Intente nuevamente en unos minutos.'),
});

/** Límite para operaciones costosas (exportaciones, reportes, PDF). */
export const heavyLimiter = build({
  windowMs: 60_000,
  limit: 30,
  message: jsonMessage('Demasiadas exportaciones seguidas. Espere un momento.'),
});
