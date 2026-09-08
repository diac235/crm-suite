import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { httpLogger, requestId } from './middlewares/requestContext';
import { apiLimiter } from './middlewares/rateLimit';
import { ForbiddenError } from './core/errors';
import './core/types';

export function createApp(): Express {
  const app = express();

  // Necesario para obtener la IP real detrás de un proxy inverso (nginx, etc.).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", ...env.corsOrigins],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  /**
   * Reglas de origen permitido:
   *  1. Los orígenes configurados en CORS_ORIGIN.
   *  2. El propio origen de la petición. Cuando la interfaz se sirve desde el
   *     mismo proceso (SERVE_STATIC) o a través de un proxy, túnel o dominio
   *     propio, no es una petición de terceros y debe permitirse sin tener que
   *     reconfigurar la lista blanca.
   *  3. En desarrollo, localhost y 127.0.0.1 en cualquier puerto.
   */
  const isSameOrigin = (origin: string, host: string | undefined): boolean => {
    if (!host) return false;
    try {
      return new URL(origin).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  };

  const isAllowedOrigin = (origin: string, host: string | undefined): boolean => {
    if (env.corsOrigins.includes(origin)) return true;
    if (isSameOrigin(origin, host)) return true;
    if (env.isProduction) return false;
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  };

  const corsBaseOptions: CorsOptions = {
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 86_400,
  };

  // Se usa la forma delegada de `cors` para poder comparar el origen con el
  // host real de la petición y así reconocer las peticiones del mismo origen.
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      // Herramientas sin origen (curl, health checks) y orígenes permitidos.
      if (!origin || isAllowedOrigin(origin, req.headers.host)) {
        callback(null, { ...corsBaseOptions, origin: true });
        return;
      }
      // Se responde 403 (y no 500) para que el cliente reciba un error claro.
      callback(new ForbiddenError('Origen no permitido por la política CORS'));
    }),
  );

  app.use(compression());
  app.use(requestId);
  app.use(httpLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime(), env: env.NODE_ENV } });
  });

  app.use('/api', apiLimiter, apiRouter);

  // En producción se puede servir el frontend compilado desde el mismo proceso.
  if (env.isProduction && process.env.SERVE_STATIC === 'true') {
    const webDist = path.resolve(process.cwd(), '../web/dist');
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
