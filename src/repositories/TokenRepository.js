'use strict';

const db = require('../config/database');

class TokenRepository {
  async create({ id, userId, tokenHash, expiresAt }) {
    await db.query(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [id, userId, tokenHash, expiresAt]
    );
  }

  async findByTokenHash(tokenHash) {
    const { rows } = await db.query(
      'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = $1',
      [tokenHash]
    );
    return rows[0] ?? null;
  }

  async deleteByTokenHash(tokenHash) {
    await db.query('DELETE FROM refresh_tokens WHERE token = $1', [tokenHash]);
  }

  async deleteByUserId(userId) {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }

  async deleteExpired() {
    const { rowCount } = await db.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    return rowCount;
  }
}

module.exports = new TokenRepository();
