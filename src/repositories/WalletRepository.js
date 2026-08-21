'use strict';

const db = require('../config/database');

class WalletRepository {
  async lockUserFoxes(client, userId) {
    const { rows } = await client.query(
      'SELECT foxes FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    return rows[0] ?? null;
  }

  async lockUserExp(client, userId) {
    const { rows } = await client.query(
      'SELECT exp, level FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    return rows[0] ?? null;
  }

  async setFoxBalance(client, userId, newBalance) {
    await client.query(
      'UPDATE users SET foxes = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, userId]
    );
  }

  async setExpAndLevel(client, userId, newExp, newLevel) {
    await client.query(
      'UPDATE users SET exp = $1, level = $2, updated_at = NOW() WHERE id = $3',
      [newExp, newLevel, userId]
    );
  }

  async recordFoxTransaction(client, { userId, amount, balanceAfter, type, description, referenceId }) {
    await client.query(
      `INSERT INTO fox_transactions (user_id, amount, balance_after, type, description, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, amount, balanceAfter, type, description, referenceId]
    );
  }

  async recordExpTransaction(client, { userId, amount, balanceAfter, type, description, referenceId }) {
    await client.query(
      `INSERT INTO exp_transactions (user_id, amount, balance_after, type, description, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, amount, balanceAfter, type, description, referenceId]
    );
  }

  async resolveLevelForExp(client, exp) {
    const { rows } = await client.query(
      `SELECT level FROM house_levels WHERE exp_required <= $1 ORDER BY level DESC LIMIT 1`,
      [exp]
    );
    return rows[0]?.level ?? 1;
  }

  async findTransactions(userId, type, limit, offset) {
    const params = [userId];
    const typeFilter = type ? ` AND type = $2` : '';
    if (type) params.push(type);

    const combined = `
      (SELECT 'fox' AS currency, amount, balance_after, type, description, created_at
       FROM fox_transactions WHERE user_id = $1${typeFilter})
      UNION ALL
      (SELECT 'exp' AS currency, amount, balance_after, type, description, created_at
       FROM exp_transactions WHERE user_id = $1${typeFilter})
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const { rows } = await db.query(combined, [...params, limit, offset]);
    return rows;
  }

  async findAllHouseLevels() {
    const { rows } = await db.query('SELECT * FROM house_levels ORDER BY level');
    return rows;
  }
}

module.exports = new WalletRepository();
