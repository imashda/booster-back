'use strict';

const db = require('../config/database');

class SkinRepository {
  async findAll({ userId, categorySlug }) {
    const params = [userId];
    let sql = `
      SELECT s.*, sc.slug AS category_slug, sc.name AS category_name,
             us.id  AS owned,
             ues.id AS equipped
      FROM skins s
      JOIN skin_categories sc ON sc.id = s.category_id
      LEFT JOIN user_skins us         ON us.skin_id  = s.id AND us.user_id  = $1
      LEFT JOIN user_equipped_skins ues ON ues.skin_id = s.id AND ues.user_id = $1
      WHERE s.is_active = true`;
    if (categorySlug) {
      params.push(categorySlug);
      sql += ` AND sc.slug = $${params.length}`;
    }
    sql += ' ORDER BY sc.sort_order, s.price_foxes';
    const { rows } = await db.query(sql, params);
    return rows;
  }

  async findCategories() {
    const { rows } = await db.query('SELECT * FROM skin_categories ORDER BY sort_order');
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(
      'SELECT * FROM skins WHERE id = $1 AND is_active = true',
      [id]
    );
    return rows[0] ?? null;
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

  async equip({ userId, categoryId, skinId }) {
    await db.query(
      `INSERT INTO user_equipped_skins (user_id, category_id, skin_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, category_id) DO UPDATE SET skin_id = $3, updated_at = NOW()`,
      [userId, categoryId, skinId ?? null]
    );
  }

  async findEquipped(userId) {
    const { rows } = await db.query(
      `SELECT ues.category_id, sc.slug AS category_slug, sc.name AS category_name,
              s.id AS skin_id, s.name AS skin_name, s.image_url
       FROM user_equipped_skins ues
       JOIN skin_categories sc ON sc.id = ues.category_id
       LEFT JOIN skins s ON s.id = ues.skin_id
       WHERE ues.user_id = $1`,
      [userId]
    );
    return rows;
  }

  async createSkin({ id, categoryId, name, description, imageUrl, priceFoxes, levelReq, expBonus }) {
    const { rows } = await db.query(
      `INSERT INTO skins (id, category_id, name, description, image_url, price_foxes, level_req, exp_bonus)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, categoryId, name, description, imageUrl, priceFoxes, levelReq, expBonus ?? 0]
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
