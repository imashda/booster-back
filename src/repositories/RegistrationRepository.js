'use strict';

const db = require('../config/database');

class RegistrationRepository {
  async findById(id) {
    const { rows } = await db.query('SELECT * FROM registration_requests WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  // Только статус, без ФИО/телефона — эндпоинт публичный (неавторизованный), ключ — непредсказуемый UUID заявки.
  async findStatusById(id) {
    const { rows } = await db.query(
      'SELECT status, reject_reason FROM registration_requests WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  // Анти-спам дедуп по (телефон родителя + ФИО ребёнка) — не по одному телефону, т.к. у одного
  // родителя может быть несколько детей, каждый со своей заявкой.
  async findLatestPendingForChild(parentPhone, fullName) {
    const { rows } = await db.query(
      `SELECT id, status FROM registration_requests
       WHERE parent_phone = $1 AND full_name = $2 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [parentPhone, fullName]
    );
    return rows[0] ?? null;
  }

  async create({ id, fullName, grade, parentName, parentPhone }) {
    await db.query(
      `INSERT INTO registration_requests (id, full_name, grade, parent_name, parent_phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, fullName, grade, parentName, parentPhone]
    );
  }

  // client defaults to the pool wrapper — pass an explicit transaction client when this must
  // commit atomically with other writes (e.g. creating the approved user).
  async approve(id, reviewedBy, client = db) {
    await client.query(
      `UPDATE registration_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewedBy, id]
    );
  }

  async reject(id, reviewedBy, reason) {
    await db.query(
      `UPDATE registration_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reject_reason = $2
       WHERE id = $3`,
      [reviewedBy, reason ?? null, id]
    );
  }

  async list({ status, limit, offset }) {
    const [{ rows }, { rows: [{ count }] }] = await Promise.all([
      db.query(
        `SELECT * FROM registration_requests WHERE status = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      ),
      db.query(
        'SELECT COUNT(*) FROM registration_requests WHERE status = $1',
        [status]
      ),
    ]);
    return { requests: rows, total: parseInt(count, 10) };
  }

  async countPending() {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM registration_requests WHERE status = 'pending'"
    );
    return parseInt(rows[0].count, 10);
  }
}

module.exports = new RegistrationRepository();
