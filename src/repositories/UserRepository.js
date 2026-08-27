'use strict';

const db = require('../config/database');

class UserRepository {
  async findById(id) {
    const { rows } = await db.query(
      `SELECT id, login, full_name, grade, role, status, foxes, exp, level, house_level
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findByLogin(login) {
    const { rows } = await db.query(
      `SELECT id, login, password_hash, full_name, grade, role, status, foxes, exp, level, house_level, avatar_url
       FROM users WHERE login = $1`,
      [login]
    );
    return rows[0] ?? null;
  }

  // client defaults to the pool wrapper (same .query(text, params) interface as a transaction
  // client) — pass an explicit transaction client when this must commit atomically with other writes.
  async create({ id, login, passwordHash, fullName, grade, parentName, parentPhone }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO users (id, login, password_hash, full_name, grade, parent_name, parent_phone, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'student', 'active') RETURNING id`,
      [id, login, passwordHash, fullName, grade, parentName ?? null, parentPhone ?? null]
    );
    return rows[0];
  }

  async findProfile(id) {
    const { rows } = await db.query(
      `SELECT u.id, u.login, u.full_name, u.grade, u.foxes, u.exp, u.level, u.house_level,
              u.avatar_url, u.created_at, u.last_login_at,
              hl.name AS house_name, hl.image_url AS house_image_url,
              hl2.exp_required AS next_level_exp,
              (SELECT COUNT(*) FROM user_skins us WHERE us.user_id = u.id) AS skins_count
       FROM users u
       -- дом берём по house_level (что куплено), а порог следующего уровня —
       -- по level (сколько EXP до следующего уровня ПЕРСОНАЖА)
       LEFT JOIN house_levels hl  ON hl.level  = u.house_level
       LEFT JOIN house_levels hl2 ON hl2.level = u.level + 1
       WHERE u.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findHouseProgress(id) {
    const { rows } = await db.query(
      `SELECT u.house_level AS level, u.exp,
              hl.name, hl.image_url, hl.description, hl.exp_required,
              hl2.level AS next_level, hl2.exp_required AS next_level_exp, hl2.name AS next_level_name,
              hl2.price_foxes AS next_level_price_foxes
       FROM users u
       JOIN house_levels hl ON hl.level = u.house_level
       LEFT JOIN house_levels hl2 ON hl2.level = u.house_level + 1
       WHERE u.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findForLeaderboard() {
    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.grade, u.level, u.exp, u.avatar_url,
              RANK() OVER (ORDER BY u.exp DESC) AS rank
       FROM users u
       WHERE u.status = 'active' AND u.role = 'student'
       ORDER BY u.exp DESC
       LIMIT 100`
    );
    return rows;
  }

  async findRank(id) {
    const { rows } = await db.query(
      `SELECT rank FROM (
         SELECT id, RANK() OVER (ORDER BY exp DESC) AS rank
         FROM users WHERE status = 'active' AND role = 'student'
       ) r WHERE id = $1`,
      [id]
    );
    return rows[0]?.rank ?? null;
  }

  async findPublicById(id) {
    const { rows } = await db.query(
      'SELECT id, full_name, grade, level, exp, avatar_url FROM users WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  async search({ search, status, role, limit, offset }) {
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (full_name ILIKE $${params.length} OR login ILIKE $${params.length} OR parent_phone ILIKE $${params.length})`;
    }
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    if (role)   { params.push(role);   where += ` AND role   = $${params.length}`; }

    const { rows: [{ count }] } = await db.query(
      `SELECT COUNT(*) FROM users ${where}`,
      params
    );

    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT id, login, full_name, grade, role, status, foxes, exp, level, house_level,
              parent_name, parent_phone, created_at, last_login_at
       FROM users ${where}
       ORDER BY created_at DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return { users: rows, total: parseInt(count, 10) };
  }

  async updateStatus(id, status) {
    const { rows } = await db.query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, login, full_name, status`,
      [status, id]
    );
    return rows[0] ?? null;
  }

  async updatePassword(id, passwordHash) {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );
  }

  async updateLastLogin(id) {
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
  }

  // Атомарно помечает первый вход (WHERE last_login_at IS NULL) и сообщает, застолбил ли
  // именно этот вызов "первый вход" — так конкурентные повторные логины не начислят бонус дважды.
  async claimFirstLogin(id) {
    const { rows } = await db.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1 AND last_login_at IS NULL RETURNING id',
      [id]
    );
    return rows.length > 0;
  }

  async countStudents() {
    const { rows } = await db.query("SELECT COUNT(*) FROM users WHERE role = 'student'");
    return parseInt(rows[0].count, 10);
  }

  async countActiveStudents() {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active'"
    );
    return parseInt(rows[0].count, 10);
  }

  async sumFoxes() {
    const { rows } = await db.query('SELECT COALESCE(SUM(foxes), 0) AS total FROM users');
    return parseInt(rows[0].total, 10);
  }
}

module.exports = new UserRepository();
