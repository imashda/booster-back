'use strict';

const db = require('../config/database');
const { APP_TIMEZONE } = require('../shared/time');

// Начало месяца по местному времени учеников как TIMESTAMPTZ — чтобы сравнивать с users.created_at
const MONTH_START = (param) => `(${param}::date::timestamp AT TIME ZONE '${APP_TIMEZONE.replace(/'/g, '')}')`;

class LeaderboardRepository {
  /**
   * Точка отсчёта месяца: уровень каждого ученика на его начало. Кто
   * зарегистрировался уже в этом месяце, начинал с 1-го уровня. Существующие
   * строки не трогаем, поэтому вызов безопасно повторять.
   */
  async ensureMonthStart(client, month) {
    const { rowCount } = await client.query(
      `INSERT INTO leaderboard_month_start (user_id, month, level_start)
       SELECT u.id, $1::date, CASE WHEN u.created_at >= ${MONTH_START('$1')} THEN 1 ELSE u.level END
       FROM users u
       WHERE u.role = 'student'
       ON CONFLICT (user_id, month) DO NOTHING`,
      [month]
    );
    return rowCount;
  }

  async countMonthStart(client, month) {
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM leaderboard_month_start WHERE month = $1',
      [month]
    );
    return rows[0].n;
  }

  /** true — этот месяц ещё не подводили и мы его застолбили (в рамках транзакции) */
  async claimRun(client, month) {
    const { rowCount } = await client.query(
      'INSERT INTO leaderboard_runs (month) VALUES ($1) ON CONFLICT (month) DO NOTHING',
      [month]
    );
    return rowCount === 1;
  }

  async setRunParticipants(client, month, participants) {
    await client.query('UPDATE leaderboard_runs SET participants = $2 WHERE month = $1', [month, participants]);
  }

  /**
   * Снимок рейтинга за месяц: сколько уровней набрал каждый (уровень сейчас минус
   * уровень на начало месяца). Место получают ВСЕ ученики — даже с +0, чтобы каждый
   * видел, где он; в Топ-100 на экране показываются только выросшие (findBoard).
   * Без строки отсчёта (зарегистрировался в том месяце) — считаем от 1-го уровня.
   */
  async insertSnapshot(client, month, nextMonth) {
    const { rows } = await client.query(
      `WITH progress AS (
         SELECT u.id AS user_id, u.level AS level_end,
                COALESCE(s.level_start, 1) AS level_start,
                GREATEST(0, u.level - COALESCE(s.level_start, 1)) AS gained
         FROM users u
         LEFT JOIN leaderboard_month_start s ON s.user_id = u.id AND s.month = $1
         WHERE u.status = 'active' AND u.role = 'student'
           AND u.created_at < ${MONTH_START('$2')}
       )
       INSERT INTO leaderboard_snapshots (user_id, month, rank, exp_earned, levels_gained, level_start, level_end)
       SELECT user_id, $1, RANK() OVER (ORDER BY gained DESC), 0, gained, level_start, level_end
       FROM progress
       ON CONFLICT (user_id, month) DO NOTHING
       RETURNING user_id, rank, levels_gained`,
      [month, nextMonth]
    );
    return rows;
  }

  async setReward(client, userId, month, { levels = 0, foxes = 0, skinId = null }) {
    await client.query(
      `UPDATE leaderboard_snapshots SET reward_levels = $3, reward_foxes = $4, reward_skin_id = $5
       WHERE user_id = $1 AND month = $2`,
      [userId, month, levels, foxes, skinId]
    );
  }

  /** Последний подведённый месяц (у которого есть рейтинг) */
  async findLatestMonth() {
    const { rows } = await db.query(
      `SELECT to_char(month, 'YYYY-MM-DD') AS month FROM leaderboard_runs ORDER BY month DESC LIMIT 1`
    );
    return rows[0]?.month ?? null;
  }

  async findBoard(month) {
    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.grade, u.avatar_url,
              ls.rank, ls.levels_gained, ls.level_start, ls.level_end, ls.reward_levels, ls.reward_foxes,
              (ls.reward_skin_id IS NOT NULL) AS reward_skin
       FROM leaderboard_snapshots ls
       JOIN users u ON u.id = ls.user_id
       WHERE ls.month = $1 AND ls.levels_gained > 0
       ORDER BY ls.rank, ls.level_end DESC, u.full_name
       LIMIT 100`,
      [month]
    );
    return rows;
  }

  /** Сколько учеников в рейтинге за месяц (для «место N из M») */
  async countBoard(month) {
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM leaderboard_snapshots WHERE month = $1', [month]);
    return rows[0].n;
  }

  async findMine(month, userId) {
    const { rows } = await db.query(
      `SELECT rank, levels_gained, level_start, level_end, reward_levels, reward_foxes,
              (reward_skin_id IS NOT NULL) AS reward_skin
       FROM leaderboard_snapshots WHERE month = $1 AND user_id = $2`,
      [month, userId]
    );
    return rows[0] ?? null;
  }

  /** Уровень на начало месяца (для «в этом месяце ты набрал +N») */
  async findMonthStart(userId, month) {
    const { rows } = await db.query(
      'SELECT level_start FROM leaderboard_month_start WHERE user_id = $1 AND month = $2',
      [userId, month]
    );
    return rows[0]?.level_start ?? null;
  }
}

module.exports = new LeaderboardRepository();
