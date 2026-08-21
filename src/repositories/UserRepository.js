'use strict';

const db = require('../config/database');

class UserRepository {
  async findById(id) {
    const { rows } = await db.query(
      `SELECT id, phone, full_name, grade, role, status, foxes, exp, level
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findByPhone(phone) {
    const { rows } = await db.query(
      `SELECT id, phone, password_hash, full_name, grade, role, status, foxes, exp, level, avatar_url
       FROM users WHERE phone = $1`,
      [phone]
    );
    return rows[0] ?? null;
  }

  async create({ id, phone, passwordHash, fullName, grade }) {
    const { rows } = await db.query(
      `INSERT INTO users (id, phone, password_hash, full_name, grade, role, status)
       VALUES ($1, $2, $3, $4, $5, 'student', 'active') RETURNING id`,
      [id, phone, passwordHash, fullName, grade]
    );
    return rows[0];
  }

  async findProfile(id) {
    const { rows } = await db.query(
      `SELECT u.id, u.phone, u.full_name, u.grade, u.foxes, u.exp, u.level,
              u.avatar_url, u.created_at, u.last_login_at,
              hl.name AS house_name, hl.image_url AS house_image_url,
              hl2.exp_required AS next_level_exp,
              (SELECT COUNT(*) FROM user_skins us WHERE us.user_id = u.id) AS skins_count
       FROM users u
       LEFT JOIN house_levels hl  ON hl.level  = u.level
       LEFT JOIN house_levels hl2 ON hl2.level = u.level + 1
       WHERE u.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findHouseProgress(id) {
    const { rows } = await db.query(
      `SELECT u.level, u.exp,
              hl.name, hl.image_url, hl.description, hl.exp_required,
              hl2.level AS next_level, hl2.exp_required AS next_level_exp, hl2.name AS next_level_name
       FROM users u
       JOIN house_levels hl ON hl.level = u.level
       LEFT JOIN house_levels hl2 ON hl2.level = u.level + 1
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
    let sql = `SELECT id, phone, full_name, grade, role, status, foxes, exp, level, created_at, last_login_at
               FROM users WHERE 1=1`;

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (full_name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }
    if (status) { params.push(status);  sql += ` AND status = $${params.length}`; }
    if (role)   { params.push(role);    sql += ` AND role   = $${params.length}`; }

    const { rows: [{ count }] } = await db.query(
      sql.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) FROM'),
      params
    );

    params.push(limit, offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await db.query(sql, params);

    return { users: rows, total: parseInt(count, 10) };
  }

  async updateStatus(id, status) {
    const { rows } = await db.query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, phone, full_name, status`,
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
