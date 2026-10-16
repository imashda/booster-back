'use strict';

const cron = require('node-cron');
const quizService = require('../services/QuizService');
const config = require('../config');
const logger = require('../shared/logger');

/**
 * Страховка для расписания квиза дня. Основной путь — GET /quiz/today сам
 * создаёт расписание, если его нет (см. QuizService.ensureTodaySchedule).
 *
 * Раньше расписание появлялось ТОЛЬКО здесь, в 08:00: если сервер в это
 * время спал, перезапускался или деплоился, квиза не было весь день, а до
 * 08:00 его не было вообще — отсюда «Квиз пока недоступен».
 * Теперь job срабатывает сразу после полуночи и один раз при старте сервера.
 */
async function run(reason) {
  try {
    const res = await quizService.ensureTodaySchedule();
    if (res.created) logger.info('[Job] Daily quiz auto-scheduled', { reason, date: res.date, count: res.count });
    else if (res.count === 0) logger.warn('[Job] No active quiz questions — daily quiz cannot be scheduled', { reason });
  } catch (err) {
    logger.error('[Job] Daily quiz auto-pick failed', { reason, error: err.message });
  }
}

const schedule = () => {
  run('startup');
  return cron.schedule('1 0 * * *', () => run('cron'), { timezone: config.cron.timezone });
};

module.exports = { schedule };
