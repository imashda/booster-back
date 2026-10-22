'use strict';

const { getClient } = require('../config/database');
const userRepo = require('../repositories/UserRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const { NotFoundError, BadRequestError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class LeaderboardService {
  async getLeaderboard(userId) {
    const [leaderboard, myRank, me] = await Promise.all([
      userRepo.findForLeaderboard(),
      userRepo.findRank(userId),
      userRepo.findPublicById(userId),
    ]);

    return { leaderboard, myRank, me };
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
