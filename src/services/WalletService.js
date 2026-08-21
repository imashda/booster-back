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

  async rewardUser(userId, foxAmount, expAmount, type, description, referenceId = null) {
    return this._withTransaction(async (client) => {
      const foxResult = foxAmount > 0
        ? await this.changeFoxes(userId, foxAmount, type, description, referenceId, client)
        : null;
      const expResult = expAmount > 0
        ? await this.changeExp(userId, expAmount, type, description, referenceId, client)
        : null;
      return { success: true, foxes: foxResult, exp: expResult };
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
