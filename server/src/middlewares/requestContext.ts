import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { requestId?: string }).requestId ?? crypto.randomUUID(),
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
