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
      const newLevel = await walletRepo.resolveLevelForExp(client, newExp);
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

  /**
   * Начислить EXP, которого ровно хватит на +N уровней ОТ ТЕКУЩЕГО.
   *
   * Столбец «Прибавка к уровню» в таблице — это именно уровни, а не опыт.
   * Фиксированный курс (например 500 EXP за уровень) работает только внизу
   * шкалы: порог растёт с 500 EXP на 1-м уровне до 10100 на 49-м, поэтому
   * на высоких уровнях такой грант не давал вообще ничего.
   *
   * Уровень остаётся производной от EXP — мы не выставляем его напрямую,
   * а доначисляем опыт до порога нужного уровня.
   */
  async grantLevels(userId, levels, type, description, referenceId = null, externalClient = null) {
    return this._withClient(externalClient, async (client) => {
      const current = await walletRepo.lockUserExp(client, userId);
      if (!current) throw new NotFoundError('Пользователь не найден');

      const target = await walletRepo.findLevel(current.level + levels);
      // Цели нет — упёрлись в максимальный уровень, начислять нечего
      const expNeeded = target ? Math.max(0, target.exp_required - current.exp) : 0;

      return this.changeExp(userId, expNeeded, type, description, referenceId, client);
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
