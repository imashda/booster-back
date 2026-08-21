'use strict';

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../shared/logger');

const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },
  ...config.db.pool,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  logger.debug('DB query', {
    query: text.substring(0, 100),
    duration: `${Date.now() - start}ms`,
    rows: result.rowCount,
  });
  return result;
};

const getClient = () => pool.connect();

module.exports = { query, pool, getClient };
