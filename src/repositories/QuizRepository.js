'use strict';

const db = require('../config/database');
const { getClient } = db;

class QuizRepository {
  async findScheduledQuestionsForDate(date) {
    const { rows } = await db.query(
      `SELECT dqs.quiz_date, dqs.position, qq.id, qq.question,
              qq.option_a, qq.option_b, qq.option_c, qq.option_d, qq.category
       FROM daily_quiz_schedule dqs
       JOIN quiz_questions qq ON qq.id = dqs.question_id
       WHERE dqs.quiz_date = $1
       ORDER BY dqs.position`,
      [date]
    );
    return rows;
  }

  async findScheduledQuestion(date, questionId) {
    const { rows } = await db.query(
      `SELECT qq.id, qq.correct
       FROM daily_quiz_schedule dqs
       JOIN quiz_questions qq ON qq.id = dqs.question_id
       WHERE dqs.quiz_date = $1 AND dqs.question_id = $2`,
      [date, questionId]
    );
    return rows[0] ?? null;
  }

  async findUserAnswersForDate(userId, date) {
    const { rows } = await db.query(
      'SELECT * FROM quiz_answers WHERE user_id = $1 AND quiz_date = $2',
      [userId, date]
    );
    return rows;
  }

  // Ответ ищем в рамках ДАТЫ квиза: вопрос может вернуться в расписание
  // через несколько дней (банк вопросов небольшой), и вчерашний ответ не
  // должен навсегда закрывать его — раньше это давало вечный 409.
  async findUserAnswerForQuestion(userId, questionId, date) {
    const { rows } = await db.query(
      'SELECT * FROM quiz_answers WHERE user_id = $1 AND question_id = $2 AND quiz_date = $3',
      [userId, questionId, date]
    );
    return rows[0] ?? null;
  }

  async saveAnswer(client, { id, userId, questionId, date, answer, isCorrect, foxesEarned, expEarned }) {
    await client.query(
      `INSERT INTO quiz_answers
         (id, user_id, question_id, quiz_date, answer, is_correct, foxes_earned, exp_earned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, questionId, date, answer, isCorrect, foxesEarned, expEarned]
    );
  }

  async createQuestion({ id, question, optionA, optionB, optionC, optionD, correct, category, difficulty, createdBy }) {
    const { rows } = await db.query(
      `INSERT INTO quiz_questions
         (id, question, option_a, option_b, option_c, option_d, correct, category, difficulty, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, question, optionA, optionB, optionC, optionD, correct, category, difficulty, createdBy]
    );
    return rows[0];
  }

  async listQuestions({ category, limit, offset }) {
    const params = [];
    let sql = 'SELECT * FROM quiz_questions WHERE is_active = true';
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    params.push(limit, offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await db.query(sql, params);
    return rows;
  }

  // Partial update: any field omitted (undefined -> NULL param) keeps its current DB value via COALESCE.
  async updateQuestion(id, { question, optionA, optionB, optionC, optionD, correct, category, difficulty, isActive }) {
    const { rows } = await db.query(
      `UPDATE quiz_questions
       SET question=COALESCE($1, question), option_a=COALESCE($2, option_a), option_b=COALESCE($3, option_b),
           option_c=COALESCE($4, option_c), option_d=COALESCE($5, option_d), correct=COALESCE($6, correct),
           category=COALESCE($7, category), difficulty=COALESCE($8, difficulty), is_active=COALESCE($9, is_active)
       WHERE id=$10 RETURNING *`,
      [question, optionA, optionB, optionC, optionD, correct, category, difficulty, isActive, id]
    );
    return rows[0] ?? null;
  }

  async countScheduleUsage(id) {
    const { rows } = await db.query('SELECT COUNT(*) FROM daily_quiz_schedule WHERE question_id = $1', [id]);
    return parseInt(rows[0].count, 10);
  }

  async countAnswerUsage(id) {
    const { rows } = await db.query('SELECT COUNT(*) FROM quiz_answers WHERE question_id = $1', [id]);
    return parseInt(rows[0].count, 10);
  }

  async deleteQuestion(id) {
    const { rowCount } = await db.query('DELETE FROM quiz_questions WHERE id = $1', [id]);
    return rowCount > 0;
  }

  // Заменяет весь квиз дня целиком (до 5 вопросов, по порядку position=1..n).
  async replaceSchedule(date, questionIds) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM daily_quiz_schedule WHERE quiz_date = $1', [date]);

      const rows = [];
      for (let i = 0; i < questionIds.length; i++) {
        const { rows: [row] } = await client.query(
          `INSERT INTO daily_quiz_schedule (question_id, quiz_date, position)
           VALUES ($1, $2, $3) RETURNING *`,
          [questionIds[i], date, i + 1]
        );
        rows.push(row);
      }

      await client.query('COMMIT');
      return rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async hasScheduleForDate(date) {
    const { rows } = await db.query(
      'SELECT id FROM daily_quiz_schedule WHERE quiz_date = $1',
      [date]
    );
    return rows.length > 0;
  }

  /**
   * Создаёт расписание на дату, если его ещё нет, и возвращает число вопросов в нём.
   *
   * Безопасно при гонке: несколько одновременных GET /quiz/today в первую
   * секунду дня (или cron + запрос) берут одну advisory-блокировку на дату,
   * второй дождётся первого и увидит готовое расписание.
   */
  async ensureScheduleForDate(date, count, excludeDays = 30) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('daily_quiz:' || $1::text))", [date]);

      const { rows: existing } = await client.query(
        'SELECT COUNT(*)::int AS n FROM daily_quiz_schedule WHERE quiz_date = $1',
        [date]
      );
      if (existing[0].n > 0) {
        await client.query('COMMIT');
        return { created: false, count: existing[0].n };
      }

      const questionIds = await this._pickQuestions(client, date, count, excludeDays);
      for (let i = 0; i < questionIds.length; i++) {
        await client.query(
          'INSERT INTO daily_quiz_schedule (question_id, quiz_date, position) VALUES ($1, $2, $3)',
          [questionIds[i], date, i + 1]
        );
      }
      await client.query('COMMIT');
      return { created: questionIds.length > 0, count: questionIds.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Сначала вопросы, которых не было последние excludeDays дней (от ДАТЫ квиза,
  // а не CURRENT_DATE базы — у базы может быть другой часовой пояс), затем
  // добор любыми активными, если свежих не хватает.
  async _pickQuestions(client, date, count, excludeDays) {
    const { rows } = await client.query(
      `SELECT id FROM quiz_questions
       WHERE is_active = true
         AND id NOT IN (
           SELECT question_id FROM daily_quiz_schedule
           WHERE quiz_date > $1::date - $2::int AND quiz_date < $1::date
         )
       ORDER BY RANDOM() LIMIT $3`,
      [date, excludeDays, count]
    );
    const picked = rows.map((r) => r.id);
    if (picked.length >= count) return picked;

    const { rows: fallback } = await client.query(
      `SELECT id FROM quiz_questions
       WHERE is_active = true AND id <> ALL($1::uuid[])
       ORDER BY RANDOM() LIMIT $2`,
      [picked, count - picked.length]
    );
    return [...picked, ...fallback.map((r) => r.id)];
  }
}

module.exports = new QuizRepository();
