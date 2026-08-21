'use strict';

const db = require('../config/database');

class GameRepository {
  async findAllActive() {
    const { rows } = await db.query(
      'SELECT * FROM mini_games WHERE is_active = true ORDER BY created_at'
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(
      'SELECT * FROM mini_games WHERE id = $1 AND is_active = true',
      [id]
    );
    return rows[0] ?? null;
  }

  async getDailyFoxesEarned(userId, date) {
    const { rows } = await db.query(
      'SELECT foxes_earned FROM daily_game_limits WHERE user_id = $1 AND limit_date = $2',
      [userId, date]
    );
    return rows[0]?.foxes_earned ?? 0;
  }

  // Row-lock variant used inside submitResult's transaction to serialize concurrent
  // submissions for the same user+day, preventing the daily FOX cap from being bypassed.
  async lockDailyLimit(client, userId, date) {
    const { rows } = await client.query(
      'SELECT foxes_earned FROM daily_game_limits WHERE user_id = $1 AND limit_date = $2 FOR UPDATE',
      [userId, date]
    );
    return rows[0] ?? null;
  }

  async ensureDailyLimitRow(client, userId, date) {
    await client.query(
      `INSERT INTO daily_game_limits (user_id, limit_date, foxes_earned)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id, limit_date) DO NOTHING`,
      [userId, date]
    );
  }

  async incrementDailyFoxes(client, userId, date, amount) {
    await client.query(
      `UPDATE daily_game_limits
       SET foxes_earned = foxes_earned + $1
       WHERE user_id = $2 AND limit_date = $3`,
      [amount, userId, date]
    );
  }

  async saveSession(client, { id, userId, gameId, score, foxesEarned, expEarned, date }) {
    await client.query(
      `INSERT INTO game_sessions (id, user_id, game_id, score, foxes_earned, exp_earned, session_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, gameId, score, foxesEarned, expEarned, date]
    );
  }
}

module.exports = new GameRepository();
