import type { Logger } from 'pino';
import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const logLevel = process.env['LOG_LEVEL'] || (isProduction ? 'info' : 'debug');

export const logger: Logger = pino({
  level: logLevel,
  transport: isProduction
    ? undefined // Use default JSON in production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
          singleLine: false,
        },
      },
  base: {
    env: process.env['NODE_ENV'],
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.apiKey', '*.token'],
    censor: '[REDACTED]',
  },
});

// Create child loggers for different modules
export const createLogger = (module: string): Logger => {
  return logger.child({ module });
};

// Export specialized loggers
export const dbLogger = createLogger('database');
export const apiLogger = createLogger('api');
export const securityLogger = createLogger('security');
export const mcpLogger = createLogger('mcp');
