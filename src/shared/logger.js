'use strict';

const isProduction = process.env.NODE_ENV === 'production';

const formatEntry = (level, message, meta) => {
  if (isProduction) {
    return JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  }
  const suffix = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
};

const logger = {
  info:  (message, meta = {}) => console.info(formatEntry('info', message, meta)),
  warn:  (message, meta = {}) => console.warn(formatEntry('warn', message, meta)),
  error: (message, meta = {}) => console.error(formatEntry('error', message, meta)),
  debug: (message, meta = {}) => {
    if (!isProduction) console.debug(formatEntry('debug', message, meta));
  },
};

module.exports = logger;
