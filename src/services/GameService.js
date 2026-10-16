'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getClient } = require('../config/database');
const gameRepo = require('../repositories/GameRepository');
const walletService = require('./WalletService');
const { NotFoundError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');
const { localDate } = require('../shared/time');

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

  /**
   * @param clientSessionId id партии, сгенерированный клиентом. Повторная
   *   отправка той же партии (двойной тап, повтор после таймаута) возвращает
   *   уже начисленный результат с duplicate: true и ничего не начисляет.
   */
  async submitResult(userId, gameId, score, clientSessionId = null) {
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

      // Проверка повтора — ПОСЛЕ блокировки строки лимита: два одновременных
      // запроса одной партии выстраиваются в очередь, и второй уже видит первый.
      if (clientSessionId) {
        const existing = await gameRepo.findByClientSession(client, userId, clientSessionId);
        if (existing) {
          await client.query('COMMIT');
          return this._replayResult(userId, existing, foxesEarnedToday, dailyLimit);
        }
      }

      const remaining = Math.max(0, dailyLimit - foxesEarnedToday);
      const foxesToAward = Math.min(game.fox_reward, remaining);
      const expToAward = game.exp_reward;

      await gameRepo.saveSession(client, {
        id: sessionId, userId, gameId,
        score: score ?? 0, foxesEarned: foxesToAward, expEarned: expToAward, date: today,
        clientSessionId,
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

  async _replayResult(userId, session, foxesEarnedToday, dailyLimit) {
    const user = await require('../repositories/UserRepository').findById(userId);
    return {
      duplicate: true,
      foxesEarned: session.foxes_earned,
      expEarned: session.exp_earned,
      limitReached: session.foxes_earned < session.fox_reward,
      newFoxesBalance: user?.foxes,
      newExp: user?.exp,
      leveledUp: false,
      newLevel: user?.level,
      dailyFoxesEarned: foxesEarnedToday,
      dailyFoxesLimit: dailyLimit,
    };
  }

  // Дневной лимит FOX считается по календарю учеников, а не UTC
  _today() {
    return localDate();
  }
}

module.exports = new GameService();
