'use strict';

const { getClient } = require('../config/database');
const walletRepo = require('../repositories/WalletRepository');
const { NotFoundError, InsufficientFundsError } = require('../domain/errors');

class WalletService {
  async changeFoxes(userId, amount, type, description, referenceId = null, externalClient = null) {
    return this._withClient(externalClient, async (client) => {
      const user = await walletRepo.lockUserFoxes(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');

      const newBalance = user.foxes + amount;
      if (newBalance < 0) {
        throw new InsufficientFundsError(
          `Недостаточно Фоксов. Баланс: ${user.foxes}, нужно: ${Math.abs(amount)}`
        );
      }

      await walletRepo.setFoxBalance(client, userId, newBalance);
      await walletRepo.recordFoxTransaction(client, {
        userId, amount, balanceAfter: newBalance, type, description, referenceId,
      });

      return { success: true, newBalance, previousBalance: user.foxes, change: amount };
    });
  }

  async changeExp(userId, amount, type, description, referenceId = null, externalClient = null) {
    return this._withClient(externalClient, async (client) => {
      const user = await walletRepo.lockUserExp(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');

      const newExp = Math.max(0, user.exp + amount);
      // Уровень = уровень по EXP-порогам + прибавки за покупки (bonus_levels)
      const newLevel = (await walletRepo.resolveLevelForExp(client, newExp)) + (user.bonus_levels ?? 0);
      const leveledUp = newLevel > user.level;

      await walletRepo.setExpAndLevel(client, userId, newExp, newLevel);
      await walletRepo.recordExpTransaction(client, {
        userId, amount, balanceAfter: newExp, type, description, referenceId,
      });

      return {
        success: true,
        newExp,
        previousExp: user.exp,
        newLevel,
        previousLevel: user.level,
        leveledUp,
      };
    });
  }

  // «Прибавка к уровню» за покупку образа/дома — фиксированное число уровней из таблицы
  async grantLevels(userId, levels, externalClient = null) {
    return this._withClient(externalClient, async (client) => {
      const user = await walletRepo.lockUserExp(client, userId);
      if (!user) throw new NotFoundError('Пользователь не найден');
      const gain = Math.max(0, levels | 0);
      if (gain === 0) return { newLevel: user.level, previousLevel: user.level, leveledUp: false, newExp: user.exp };

      const updated = await walletRepo.addBonusLevels(client, userId, gain);
      return {
        newLevel: updated.level,
        previousLevel: user.level,
        leveledUp: updated.level > user.level,
        newExp: user.exp,
      };
    });
  }

  async getTransactionHistory(userId, type, limit, offset) {
    return walletRepo.findTransactions(userId, type, limit, offset);
  }

  _withClient(externalClient, fn) {
    return externalClient ? fn(externalClient) : this._withTransaction(fn);
  }

  async _withTransaction(fn) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new WalletService();
