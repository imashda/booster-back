'use strict';

const cron = require('node-cron');
const { getClient } = require('../config/database');
const config = require('../config');
const logger = require('../shared/logger');
const { localMonth, shiftMonth } = require('../shared/time');
const leaderboardRepo = require('../repositories/LeaderboardRepository');
const walletService = require('../services/WalletService');

/**
 * МЕСЯЧНЫЙ ЛИДЕРБОРД.
 *
 * 1-го числа (00:01 по времени учеников) подводим прошлый месяц:
 *   1. рейтинг — сколько уровней каждый набрал за месяц (не общий уровень);
 *   2. точка отсчёта нового месяца — уровни на этот момент, ДО наград;
 *   3. награды за места (config.leaderboard.rewardLevels) — прибавка к уровню.
 *      Начислены после отсчёта, значит засчитаются в рейтинг следующего месяца.
 * Весь месяц рейтинг не меняется — GET /leaderboard отдаёт этот снимок.
 *
 * Всё в одной транзакции со строкой leaderboard_runs: повторный запуск или
 * догоняющий запуск при старте сервера (если в 00:01 1-го он лежал) месяц
 * второй раз не подведёт и награды не задвоит.
 */
async function closeMonth(now = new Date()) {
  const currentMonth = localMonth(now);
  const month = shiftMonth(currentMonth, -1); // подводим прошлый месяц

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Если прошлый месяц уже подведён — только убеждаемся, что у текущего есть точка отсчёта
    if (!(await leaderboardRepo.claimRun(client, month))) {
      await leaderboardRepo.ensureMonthStart(client, currentMonth);
      await client.query('COMMIT');
      return { month, skipped: 'already_done' };
    }

    // Нет точки отсчёта за прошлый месяц — значит, функцию только что включили:
    // честно посчитать прогресс за тот месяц нельзя, рейтинг за него не строим.
    const hasBaseline = (await leaderboardRepo.countMonthStart(client, month)) > 0;
    const standings = hasBaseline
      ? await leaderboardRepo.insertSnapshot(client, month, currentMonth)
      : [];
    await leaderboardRepo.setRunParticipants(client, month, standings.length);

    await leaderboardRepo.ensureMonthStart(client, currentMonth);

    const rewards = config.leaderboard.rewardLevels;
    let rewarded = 0;
    for (const row of standings) {
      const levels = rewards[row.rank - 1];
      if (!levels) continue;
      await walletService.grantLevels(row.user_id, levels, client);
      await leaderboardRepo.setReward(client, row.user_id, month, levels);
      rewarded += 1;
    }

    await client.query('COMMIT');
    return { month, participants: standings.length, rewarded, baseline: hasBaseline };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run(reason) {
  try {
    const res = await closeMonth();
    if (res.skipped) return;
    logger.info('[Job] Monthly leaderboard closed', { reason, ...res });
  } catch (err) {
    logger.error('[Job] Monthly leaderboard failed', { reason, error: err.message });
  }
}

const schedule = () => {
  run('startup');
  return cron.schedule('1 0 1 * *', () => run('cron'), { timezone: config.cron.timezone });
};

module.exports = { schedule, closeMonth };
