import pino from 'pino';
import type { Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    // Never log raw customer contact details or ID numbers.
    redact: {
      paths: ['req.body.customer', 'customer', '*.customerEmail', '*.customerPhone', '*.customerIdNumber'],
      censor: '[redacted]',
    },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  });
}
