'use strict';

const { getClient } = require('../config/database');
const userRepo = require('../repositories/UserRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const { NotFoundError, BadRequestError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

// Курс перевода «прибавки к уровню» из таблицы в EXP. Тот же, что для скинов
// в seed.js — уровень персонажа везде остаётся производной от опыта.
const EXP_PER_LEVEL_BONUS = 500;

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

  // Покупка всегда бьёт по СЛЕДУЮЩЕМУ уровню от текущего — нельзя перепрыгнуть вперёд.
  // "Купить уровень" = получить ровно тот EXP, которого не хватает до порога следующего
  // уровня (а не установить level напрямую) — level всегда остаётся производным от exp
  // (см. тот же принцип у exp_bonus скинов), иначе следующий квиз/игра могли бы отменить покупку.
  async buyNextHouseLevel(userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const user = await walletRepo.lockUser(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');

      const nextLevel = await walletRepo.findLevel(user.house_level + 1);
      if (!nextLevel) throw new BadRequestError('Вы уже на максимальном уровне дома');
      if (nextLevel.price_foxes == null) {
        throw new BadRequestError('Этот уровень нельзя купить за Фоксы — только заработать');
      }
      if (user.foxes < nextLevel.price_foxes) {
        throw new BadRequestError(
          `Недостаточно Фоксов. Нужно: ${nextLevel.price_foxes}, у вас: ${user.foxes}`
        );
      }

      const description = `Покупка уровня дома: ${nextLevel.name}`;

      const foxResult = await walletService.changeFoxes(
        userId, -nextLevel.price_foxes, TRANSACTION_TYPES.HOUSE_LEVEL_PURCHASE, description, null, client
      );

      // Дом двигаем напрямую — он больше не производная от EXP.
      await walletRepo.setHouseLevel(client, userId, nextLevel.level);

      // Столбец «Прибавка к уровню» листа «Дом»: покупка дома даёт ещё и уровни
      // ПЕРСОНАЖА. Уровень персонажа считается из EXP, поэтому переводим бонус в
      // опыт тем же курсом, что и у скинов (1 уровень ≈ 500 EXP).
      const expBonus = (nextLevel.level_bonus ?? 1) * EXP_PER_LEVEL_BONUS;
      const expResult = await walletService.changeExp(
        userId, expBonus, TRANSACTION_TYPES.HOUSE_LEVEL_PURCHASE, description, null, client
      );

      await client.query('COMMIT');

      return {
        houseName: nextLevel.name,
        foxesSpent: nextLevel.price_foxes,
        newFoxesBalance: foxResult.newBalance,
        newHouseLevel: nextLevel.level,
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
