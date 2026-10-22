'use strict';

const { getClient } = require('../config/database');
const userRepo = require('../repositories/UserRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const { NotFoundError, BadRequestError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');
const leaderboardRepo = require('../repositories/LeaderboardRepository');
const config = require('../config');
const { localMonth, shiftMonth } = require('../shared/time');

class LeaderboardService {
  /**
   * Месячный рейтинг: снимок, построенный 1-го числа по уровням, набранным за
   * прошлый месяц (см. jobs/leaderboardSnapshot.js). До следующего 1-го не меняется.
   * Плюс личный прогресс в текущем месяце — «в этом месяце +N», чтобы было видно,
   * что идёт в следующий рейтинг.
   */
  async getLeaderboard(userId) {
    const currentMonth = localMonth();
    const [month, me, monthStart] = await Promise.all([
      leaderboardRepo.findLatestMonth(),
      userRepo.findPublicById(userId),
      leaderboardRepo.findMonthStart(userId, currentMonth),
    ]);
    const [leaderboard, mine] = month
      ? await Promise.all([leaderboardRepo.findBoard(month), leaderboardRepo.findMine(month, userId)])
      : [[], null];

    return {
      month,                                   // за какой месяц рейтинг ('2026-10-01'), null — ещё не было
      nextUpdate: shiftMonth(currentMonth, 1), // когда выйдет следующий
      leaderboard,
      myRank: mine?.rank ?? null,
      mine,
      me,
      currentMonthGained: me ? Math.max(0, me.level - (monthStart ?? 1)) : 0,
      rewardLevels: config.leaderboard.rewardLevels,
    };
  }

  async getAllHouseLevels() {
    return walletRepo.findAllHouseLevels();
  }

  // Уровень ДОМА (house_level) и уровень ПЕРСОНАЖА (level) — независимые счётчики:
  // - house_level растёт только покупками, ровно на 1 за раз, свою цену берёт из
  //   house_levels.price_foxes по СВОЕМУ следующему номеру (house_level + 1);
  // - level персонажа получает «прибавку к уровню» этого дома из таблицы
  //   (house_levels.level_bonus, 1..6) — см. WalletService.grantLevels.
  async buyNextHouseLevel(userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const user = await walletRepo.lockUser(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');

      const nextHouse = await walletRepo.findLevel(user.house_level + 1, client);
      if (!nextHouse) throw new BadRequestError('Вы уже на максимальном уровне дома');
      if (nextHouse.price_foxes == null) {
        throw new BadRequestError('Этот уровень нельзя купить за Фоксы — только заработать');
      }
      if (user.foxes < nextHouse.price_foxes) {
        throw new BadRequestError(
          `Недостаточно Фоксов. Нужно: ${nextHouse.price_foxes}, у вас: ${user.foxes}`
        );
      }

      const description = `Покупка уровня дома: ${nextHouse.name}`;

      const foxResult = await walletService.changeFoxes(
        userId, -nextHouse.price_foxes, TRANSACTION_TYPES.HOUSE_LEVEL_PURCHASE, description, null, client
      );

      const newHouseLevel = user.house_level + 1;
      await walletRepo.setHouseLevel(client, userId, newHouseLevel);

      const levelResult = await walletService.grantLevels(userId, nextHouse.level_bonus ?? 1, client);

      await client.query('COMMIT');

      return {
        houseName: nextHouse.name,
        foxesSpent: nextHouse.price_foxes,
        newFoxesBalance: foxResult.newBalance,
        newHouseLevel,
        levelBonus: nextHouse.level_bonus ?? 1,
        newExp: user.exp,
        newLevel: levelResult.newLevel,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new LeaderboardService();
