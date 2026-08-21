'use strict';

const cron = require('node-cron');
const quizRepo = require('../repositories/QuizRepository');
const config = require('../config');
const logger = require('../shared/logger');

const QUESTIONS_PER_DAY = 5;

const schedule = () =>
  cron.schedule('0 8 * * *', async () => {
    logger.info('[Job] Auto-picking daily quiz questions');
    try {
      const today = new Date().toISOString().split('T')[0];

      if (await quizRepo.hasScheduleForDate(today)) {
        logger.info('[Job] Quiz already scheduled for today');
        return;
      }

      const questionIds = await quizRepo.findUnusedQuestions(30, QUESTIONS_PER_DAY);
      if (questionIds.length === 0) {
        logger.warn('[Job] No quiz questions available');
        return;
      }
      if (questionIds.length < QUESTIONS_PER_DAY) {
        logger.warn('[Job] Not enough quiz questions for a full daily quiz', {
          picked: questionIds.length, wanted: QUESTIONS_PER_DAY,
        });
      }

      await quizRepo.replaceSchedule(today, questionIds);
      logger.info('[Job] Daily quiz auto-scheduled', { date: today, count: questionIds.length });
    } catch (err) {
      logger.error('[Job] Daily quiz auto-pick failed', { error: err.message });
    }
  }, { timezone: config.cron.timezone });

module.exports = { schedule };
