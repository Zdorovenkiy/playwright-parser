const { createLogger, format, transports } = require('winston');

// Логгер для ошибок
const errorLogger = createLogger({
  format: format.json(),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' })
  ]
});

// Логгер для предупреждений
const warnLogger = createLogger({
  format: format.json(),
  transports: [
    new transports.File({ filename: 'logs/warn.log', level: 'warn' })
  ]
});

// Логгер для информации
const infoLogger = createLogger({
    format: format.combine(
        format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.metadata(),
        format.printf(
        ({ level, message, metadata }) => `${metadata.timestamp} [${level}]: ${message}`
        )
    ),
    transports: [
        new transports.File({ filename: 'logs/info.log', level: 'info' })
    ]
});

// Объединяем в один интерфейс
const logger = {
  error: (...args) => errorLogger.error(...args),
  warn: (...args) => warnLogger.warn(...args),
  info: (...args) => infoLogger.info(...args)
};

module.exports = {logger};
