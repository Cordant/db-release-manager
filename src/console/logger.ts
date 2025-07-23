import winston from 'winston';

export const consoleTransport = new winston.transports.Console();


const defaultLoggerOptions: winston.LoggerOptions = {

  /**
   * @description The following is the priority order of each log level.
   * error: 0,
   * warn: 1,
   * info: 2,
   * http: 3,
   * verbose: 4,
   * debug: 5,
   * silly: 6
   */
  level: 'info',
  format: winston.format.cli(),
  transports: [consoleTransport],
};

export function createLogger(opts: winston.LoggerOptions = defaultLoggerOptions) {
  return winston.createLogger({
    ...defaultLoggerOptions,
    ...opts,
  });
}

export const logger = createLogger();