'use strict';

const cron = require('node-cron');
const tokenRepo = require('../repositories/TokenRepository');
const config = require('../config');
const logger = require('../shared/logger');

const schedule = () =>
  cron.schedule('5 0 * * *', async () => {
    try {
      const deleted = await tokenRepo.deleteExpired();
      logger.info('[Job] Expired refresh tokens cleaned up', { count: deleted });
    } catch (err) {
      logger.error('[Job] Token cleanup failed', { error: err.message });
    }
  }, { timezone: config.cron.timezone });

module.exports = { schedule };
