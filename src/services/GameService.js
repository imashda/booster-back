'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getClient } = require('../config/database');
const gameRepo = require('../repositories/GameRepository');
const walletService = require('./WalletService');
const { NotFoundError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class GameService {
  async listGames(userId) {
    const today = this._today();
    const [games, foxesEarnedToday] = await Promise.all([
      gameRepo.findAllActive(),
      gameRepo.getDailyFoxesEarned(userId, today),
    ]);

    const dailyLimit = config.game.dailyGameFoxLimit;

    return {
      games,
      dailyFoxesEarned: foxesEarnedToday,
      dailyFoxesLimit: dailyLimit,
      dailyFoxesRemaining: Math.max(0, dailyLimit - foxesEarnedToday),
    };
  }

  async submitResult(userId, gameId, score) {
    const today = this._today();
    const game = await gameRepo.findById(gameId);
    if (!game) throw new NotFoundError('Игра не найдена');

    const dailyLimit = config.game.dailyGameFoxLimit;
    const sessionId = uuidv4();

    // Everything below runs in one transaction: FOR UPDATE on daily_game_limits serializes
    // concurrent submissions for the same user+day so the daily FOX cap can't be exceeded
    // by parallel requests, and the wallet update is folded into the same commit.
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await gameRepo.ensureDailyLimitRow(client, userId, today);
      const limitRow = await gameRepo.lockDailyLimit(client, userId, today);
      const foxesEarnedToday = limitRow?.foxes_earned ?? 0;

      const remaining = Math.max(0, dailyLimit - foxesEarnedToday);
      const foxesToAward = Math.min(game.fox_reward, remaining);
      const expToAward = game.exp_reward;

      await gameRepo.saveSession(client, {
        id: sessionId, userId, gameId,
        score: score ?? 0, foxesEarned: foxesToAward, expEarned: expToAward, date: today,
      });

      let foxResult = null;
      if (foxesToAward > 0) {
        await gameRepo.incrementDailyFoxes(client, userId, today, foxesToAward);
        foxResult = await walletService.changeFoxes(
          userId, foxesToAward, TRANSACTION_TYPES.GAME, `Игра: ${game.name}`, sessionId, client
        );
      }
      const expResult = await walletService.changeExp(
        userId, expToAward, TRANSACTION_TYPES.GAME, `Игра: ${game.name}`, sessionId, client
      );

      await client.query('COMMIT');

      return {
        foxesEarned: foxesToAward,
        expEarned: expToAward,
        limitReached: foxesToAward < game.fox_reward,
        newFoxesBalance: foxResult?.newBalance,
        newExp: expResult?.newExp,
        leveledUp: expResult?.leveledUp,
        newLevel: expResult?.newLevel,
        dailyFoxesEarned: foxesEarnedToday + foxesToAward,
        dailyFoxesLimit: dailyLimit,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  _today() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = new GameService();
