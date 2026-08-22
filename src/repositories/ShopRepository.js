'use strict';

const db = require('../config/database');

class ShopRepository {
  async findActiveItems(category) {
    const params = [];
    let sql = 'SELECT * FROM shop_items WHERE is_active = true';
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY sort_order, created_at DESC';
    const { rows } = await db.query(sql, params);
    return rows;
  }

  async findItemById(id) {
    const { rows } = await db.query(
      'SELECT * FROM shop_items WHERE id = $1 AND is_active = true',
      [id]
    );
    return rows[0] ?? null;
  }

  async createOrder(client, { id, userId, itemId, foxesSpent }) {
    await client.query(
      'INSERT INTO shop_orders (id, user_id, item_id, foxes_spent) VALUES ($1, $2, $3, $4)',
      [id, userId, itemId, foxesSpent]
    );
  }

  async createItem({ id, name, description, imageUrl, priceFoxes, whatsappLink, category }) {
    const { rows } = await db.query(
      `INSERT INTO shop_items (id, name, description, image_url, price_foxes, whatsapp_link, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, name, description, imageUrl, priceFoxes, whatsappLink, category]
    );
    return rows[0];
  }

  // Partial update: any field omitted (undefined -> NULL param) keeps its current DB value via COALESCE.
  async updateItem(id, { name, description, imageUrl, priceFoxes, whatsappLink, category, isActive, sortOrder }) {
    const { rows } = await db.query(
      `UPDATE shop_items
       SET name=COALESCE($1, name), description=COALESCE($2, description),
           image_url=COALESCE($3, image_url), price_foxes=COALESCE($4, price_foxes),
           whatsapp_link=COALESCE($5, whatsapp_link), category=COALESCE($6, category),
           is_active=COALESCE($7, is_active), sort_order=COALESCE($8, sort_order),
           updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, description, imageUrl, priceFoxes, whatsappLink, category, isActive, sortOrder, id]
    );
    return rows[0] ?? null;
  }

  async countPendingOrders() {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM shop_orders WHERE status = 'pending'"
    );
    return parseInt(rows[0].count, 10);
  }
}

module.exports = new ShopRepository();
