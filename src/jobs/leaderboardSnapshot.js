'use strict';

const cron = require('node-cron');
const { getClient } = require('../config/database');
const config = require('../config');
const logger = require('../shared/logger');
const { localMonth, shiftMonth } = require('../shared/time');
const leaderboardRepo = require('../repositories/LeaderboardRepository');
const walletService = require('../services/WalletService');
const skinRepo = require('../repositories/SkinRepository');
const { TRANSACTION_TYPES } = require('../constants');

/**
 * МЕСЯЧНЫЙ ЛИДЕРБОРД.
 *
 * 1-го числа (00:01 по времени учеников) подводим прошлый месяц:
 *   1. рейтинг — сколько уровней каждый набрал за месяц (не общий уровень);
 *   2. точка отсчёта нового месяца — уровни на этот момент, ДО наград;
 *   3. награды за места (config.leaderboard.rewards): редкий образ, Фоксы,
 *      прибавка к уровню. Начислены после отсчёта — уровни из награды
 *      засчитаются в рейтинг следующего месяца.
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
    const grew = standings.filter((r) => r.levels_gained > 0);
    await leaderboardRepo.setRunParticipants(client, month, grew.length);

    await leaderboardRepo.ensureMonthStart(client, currentMonth);

    const rewards = config.leaderboard.rewards;
    let rewarded = 0;
    // Награда — только тем, кто за месяц вырос (места с +0 есть у всех, но без подарков)
    for (const row of grew) {
      const reward = rewards.find((r) => r.place === row.rank);
      if (!reward) continue;
      const description = `Награда за ${row.rank} место в рейтинге за ${month.slice(0, 7)}`;
      let skinId = null;
      if (reward.skinSlug) {
        const skin = await skinRepo.findActiveBySlug(reward.skinSlug, client);
        if (skin) {
          // Уже куплен — образ не трогаем, остальная награда начисляется как обычно
          if (await skinRepo.grant(client, row.user_id, skin.id)) skinId = skin.id;
        } else {
          logger.warn('[Job] Leaderboard reward skin not found', { slug: reward.skinSlug });
        }
      }
      if (reward.foxes) {
        await walletService.changeFoxes(row.user_id, reward.foxes, TRANSACTION_TYPES.LEADERBOARD_REWARD, description, null, client);
      }
      if (reward.levels) await walletService.grantLevels(row.user_id, reward.levels, client);
      await leaderboardRepo.setReward(client, row.user_id, month, { levels: reward.levels || 0, foxes: reward.foxes || 0, skinId });
      rewarded += 1;
    }

    await client.query('COMMIT');
    return { month, ranked: standings.length, participants: grew.length, rewarded, baseline: hasBaseline };
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
