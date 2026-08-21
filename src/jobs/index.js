'use strict';

const leaderboardSnapshot = require('./leaderboardSnapshot');
const dailyQuizPicker     = require('./dailyQuizPicker');
const tokenCleanup        = require('./tokenCleanup');
const logger              = require('../shared/logger');

const startAllJobs = () => {
  leaderboardSnapshot.schedule();
  dailyQuizPicker.schedule();
  tokenCleanup.schedule();
  logger.info('Scheduled jobs started');
};

module.exports = { startAllJobs };
