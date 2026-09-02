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
  // - level остаётся производным от exp (resolveLevelForExp), как и раньше —
  //   покупка дома лишь ДОПОЛНИТЕЛЬНО грантит EXP ровно до порога level + 1,
  //   то есть даёт +1 к уровню персонажа, где бы он сейчас ни был. Грант EXP
  //   (а не прямая запись level) — тот же приём, что и раньше: level неуязвим
  //   к откату следующим квизом/игрой, потому что всегда пересчитывается из exp.
  async buyNextHouseLevel(userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const user = await walletRepo.lockUser(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');

      const nextHouse = await walletRepo.findLevel(user.house_level + 1);
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

      // +1 к уровню персонажа — если он уже на максимуме, оставляем как есть.
      const nextFoxLevel = await walletRepo.findLevel(user.level + 1);
      let expResult = { newExp: user.exp, newLevel: user.level };
      if (nextFoxLevel) {
        const expNeeded = Math.max(0, nextFoxLevel.exp_required - user.exp);
        expResult = await walletService.changeExp(
          userId, expNeeded, TRANSACTION_TYPES.HOUSE_LEVEL_PURCHASE, description, null, client
        );
      }

      await client.query('COMMIT');

      return {
        houseName: nextHouse.name,
        foxesSpent: nextHouse.price_foxes,
        newFoxesBalance: foxResult.newBalance,
        newHouseLevel,
        newExp: expResult.newExp,
        newLevel: expResult.newLevel,
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
