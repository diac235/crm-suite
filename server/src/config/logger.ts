import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  // Nunca registrar credenciales ni tokens.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'refreshToken',
      '*.refreshToken',
    ],
    censor: '[REDACTADO]',
  },
  transport:
    env.isProduction || env.isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
