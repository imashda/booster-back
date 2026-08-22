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

  async findUserAnswerForQuestion(userId, questionId) {
    const { rows } = await db.query(
      'SELECT * FROM quiz_answers WHERE user_id = $1 AND question_id = $2',
      [userId, questionId]
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

  async findUnusedQuestions(excludeDays = 30, count = 5) {
    const { rows } = await db.query(`
      SELECT id FROM quiz_questions
      WHERE is_active = true
        AND id NOT IN (
          SELECT question_id FROM daily_quiz_schedule
          WHERE quiz_date > CURRENT_DATE - INTERVAL '${excludeDays} days'
        )
      ORDER BY RANDOM() LIMIT $1
    `, [count]);

    if (rows.length >= count) return rows.map((r) => r.id);

    const alreadyPicked = rows.map((r) => r.id);
    const { rows: fallback } = await db.query(
      `SELECT id FROM quiz_questions
       WHERE is_active = true AND id <> ALL($1::uuid[])
       ORDER BY RANDOM() LIMIT $2`,
      [alreadyPicked, count - rows.length]
    );

    return [...alreadyPicked, ...fallback.map((r) => r.id)];
  }

  async isScheduledToday() {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM daily_quiz_schedule WHERE quiz_date = CURRENT_DATE"
    );
    return parseInt(rows[0].count, 10) > 0;
  }
}

module.exports = new QuizRepository();
