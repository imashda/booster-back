'use strict';

const db = require('../config/database');

class SkinRepository {
  async findAll(userId) {
    const { rows } = await db.query(
      `SELECT s.*, us.id AS owned,
              COALESCE(s.id = (SELECT equipped_skin_id FROM users WHERE id = $1), false) AS equipped
       FROM skins s
       LEFT JOIN user_skins us ON us.skin_id = s.id AND us.user_id = $1
       WHERE s.is_active = true
       ORDER BY s.price_foxes`,
      [userId]
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(
      'SELECT * FROM skins WHERE id = $1 AND is_active = true',
      [id]
    );
    return rows[0] ?? null;
  }

  async findOwned(userId) {
    const { rows } = await db.query(
      `SELECT s.*, us.purchased_at,
              COALESCE(s.id = (SELECT equipped_skin_id FROM users WHERE id = $1), false) AS equipped
       FROM user_skins us
       JOIN skins s ON s.id = us.skin_id
       WHERE us.user_id = $1
       ORDER BY us.purchased_at DESC`,
      [userId]
    );
    return rows;
  }

  async isOwned(userId, skinId) {
    const { rows } = await db.query(
      'SELECT id FROM user_skins WHERE user_id = $1 AND skin_id = $2',
      [userId, skinId]
    );
    return rows.length > 0;
  }

  async purchase(client, { id, userId, skinId }) {
    await client.query(
      'INSERT INTO user_skins (id, user_id, skin_id) VALUES ($1, $2, $3)',
      [id, userId, skinId]
    );
  }

  // skinId = null снимает текущий образ (ничего не надето).
  async equip(userId, skinId) {
    await db.query('UPDATE users SET equipped_skin_id = $1 WHERE id = $2', [skinId, userId]);
  }

  async findEquipped(userId) {
    const { rows } = await db.query(
      `SELECT s.*
       FROM users u
       JOIN skins s ON s.id = u.equipped_skin_id
       WHERE u.id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async createSkin({ id, name, description, imageUrl, priceFoxes, levelReq, expBonus }) {
    const { rows } = await db.query(
      `INSERT INTO skins (id, name, description, image_url, price_foxes, level_req, exp_bonus)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, name, description, imageUrl, priceFoxes, levelReq, expBonus ?? 0]
    );
    return rows[0];
  }

  // Partial update: any field omitted (undefined -> NULL param) keeps its current DB value via COALESCE.
  async updateSkin(id, { name, description, imageUrl, priceFoxes, levelReq, expBonus, isActive }) {
    const { rows } = await db.query(
      `UPDATE skins
       SET name=COALESCE($1, name), description=COALESCE($2, description),
           image_url=COALESCE($3, image_url), price_foxes=COALESCE($4, price_foxes),
           level_req=COALESCE($5, level_req), exp_bonus=COALESCE($6, exp_bonus),
           is_active=COALESCE($7, is_active),
           updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, description, imageUrl, priceFoxes, levelReq, expBonus, isActive, id]
    );
    return rows[0] ?? null;
  }
}

module.exports = new SkinRepository();
