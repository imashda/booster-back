'use strict';

const cron = require('node-cron');
const db = require('../config/database');
const config = require('../config');
const logger = require('../shared/logger');

const schedule = () =>
  cron.schedule('1 0 1 * *', async () => {
    logger.info('[Job] Monthly leaderboard snapshot started');
    try {
      const today = new Date();
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const monthStr = firstDayOfLastMonth.toISOString().split('T')[0];

      await db.query(`
        INSERT INTO leaderboard_snapshots (id, user_id, month, rank, exp_earned)
        SELECT uuid_generate_v4(), id, $1, RANK() OVER (ORDER BY exp DESC), exp
        FROM users
        WHERE status = 'active' AND role = 'student'
        ORDER BY exp DESC
        LIMIT 100
        ON CONFLICT (user_id, month) DO NOTHING
      `, [monthStr]);

      logger.info('[Job] Leaderboard snapshot saved', { month: monthStr });
    } catch (err) {
      logger.error('[Job] Leaderboard snapshot failed', { error: err.message });
    }
  }, { timezone: config.cron.timezone });

module.exports = { schedule };
