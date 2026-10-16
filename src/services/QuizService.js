'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getClient } = require('../config/database');
const quizRepo = require('../repositories/QuizRepository');
const walletService = require('./WalletService');
const { AppError, NotFoundError, ConflictError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');
const { localDate } = require('../shared/time');

const QUESTIONS_PER_DAY = 5;

class QuizService {
  /** Гарантирует, что на сегодня (по часовому поясу учеников) есть расписание. */
  async ensureTodaySchedule() {
    const date = this._today();
    const res = await quizRepo.ensureScheduleForDate(date, QUESTIONS_PER_DAY);
    return { date, ...res };
  }

  async getTodayQuiz(userId) {
    const today = this._today();

    let questions = await quizRepo.findScheduledQuestionsForDate(today);
    if (questions.length === 0) {
      // Расписания на сегодня нет (cron не отработал, сервер спал) — создаём
      // его прямо сейчас, а не отдаём 404 до завтра.
      await quizRepo.ensureScheduleForDate(today, QUESTIONS_PER_DAY);
      questions = await quizRepo.findScheduledQuestionsForDate(today);
    }
    // Отдельный code, чтобы клиент отличал «квиз не назначен» (в базе нет ни
    // одного активного вопроса) от опечатки в маршруте или сетевой ошибки.
    if (questions.length === 0) {
      throw new AppError('Квиз на сегодня не запланирован', 404, 'QUIZ_NOT_SCHEDULED');
    }

    const answers = await quizRepo.findUserAnswersForDate(userId, today);

    const answersByQuestion = new Map(answers.map((a) => [a.question_id, a]));

    const items = questions.map((q) => {
      const answer = answersByQuestion.get(q.id);
      return {
        id: q.id,
        position: q.position,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        category: q.category,
        answered: Boolean(answer),
        userAnswer: answer?.answer ?? null,
        isCorrect: answer?.is_correct ?? null,
        foxesEarned: answer?.foxes_earned ?? null,
        expEarned: answer?.exp_earned ?? null,
      };
    });

    const answeredCount = items.filter((i) => i.answered).length;

    return {
      quizDate: today,
      totalQuestions: items.length,
      answeredCount,
      completed: answeredCount === items.length,
      questions: items,
    };
  }

  async answerQuiz(userId, questionId, answer) {
    const today = this._today();

    const [existingAnswer, question] = await Promise.all([
      quizRepo.findUserAnswerForQuestion(userId, questionId, today),
      quizRepo.findScheduledQuestion(today, questionId),
    ]);

    if (!question) throw new NotFoundError('Вопрос не найден в сегодняшнем квизе');
    if (existingAnswer) throw new ConflictError('Вы уже ответили на этот вопрос');

    const isCorrect = answer.toLowerCase() === question.correct;
    // 5 вопросов/день × quizCorrectFoxReward (20 по умолчанию) = максимум 100 FOX за квиз дня.
    const foxesEarned = isCorrect ? config.game.quizCorrectFoxReward : config.game.quizWrongFoxReward;
    const expEarned = isCorrect ? config.game.quizCorrectExpReward : config.game.quizWrongExpReward;
    const description = `Daily Quiz ${today} — ${isCorrect ? 'верный' : 'неверный'} ответ`;

    const answerId = uuidv4();

    // Ответ и начисление FOX/EXP — одна транзакция: quiz_answers уникален на (user_id, question_id),
    // так что при сбое между записью ответа и начислением награды пользователь не смог бы повторить
    // попытку и терял бы награду безвозвратно.
    const client = await getClient();
    let foxResult = null;
    let expResult;
    try {
      await client.query('BEGIN');

      await quizRepo.saveAnswer(client, {
        id: answerId,
        userId,
        questionId: question.id,
        date: today,
        answer: answer.toLowerCase(),
        isCorrect,
        foxesEarned,
        expEarned,
      });

      if (foxesEarned > 0) {
        foxResult = await walletService.changeFoxes(
          userId, foxesEarned, TRANSACTION_TYPES.QUIZ, description, answerId, client
        );
      }
      expResult = await walletService.changeExp(
        userId, expEarned, TRANSACTION_TYPES.QUIZ, description, answerId, client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Два одновременных ответа на один вопрос (двойной тап, повтор после
      // обрыва сети): второй упирается в уникальный индекс. Награда начислена
      // ровно один раз — первым запросом, второй честно получает 409.
      if (err.code === '23505') throw new ConflictError('Вы уже ответили на этот вопрос');
      throw err;
    } finally {
      client.release();
    }

    const [answeredSoFar, scheduledToday] = await Promise.all([
      quizRepo.findUserAnswersForDate(userId, today),
      quizRepo.findScheduledQuestionsForDate(today),
    ]);
    const totalQuestions = scheduledToday.length;

    return {
      questionId: question.id,
      // Правильный вариант клиенту не отдаём — ни до, ни после ответа.
      isCorrect,
      foxesEarned,
      expEarned,
      newFoxesBalance: foxResult?.newBalance,
      newExp: expResult.newExp,
      leveledUp: expResult.leveledUp,
      newLevel: expResult.newLevel,
      answeredCount: answeredSoFar.length,
      totalQuestions,
      completed: answeredSoFar.length === totalQuestions,
    };
  }

  async createQuestion({ question, optionA, optionB, optionC, optionD, correct, category, difficulty, createdBy }) {
    return quizRepo.createQuestion({
      id: uuidv4(), question, optionA, optionB, optionC, optionD,
      correct, category, difficulty: difficulty || 'medium', createdBy,
    });
  }

  async listQuestions({ category, limit = 20, offset = 0 }) {
    return quizRepo.listQuestions({ category, limit, offset });
  }

  async updateQuestion(id, data) {
    const question = await quizRepo.updateQuestion(id, data);
    if (!question) throw new NotFoundError('Вопрос не найден');
    return question;
  }

  // Запрещаем удаление, если вопрос где-то используется — иначе либо БД заблокирует запрос
  // FK-ошибкой (для истории ответов), либо, для расписания, была бы возможность оставить
  // "висячую" ссылку на дату будущего квиза. Деактивация (is_active: false) — безопасная
  // альтернатива, которая ничего не ломает и не трогает уже существующие связи.
  async deleteQuestion(id) {
    const [answerCount, scheduleCount] = await Promise.all([
      quizRepo.countAnswerUsage(id),
      quizRepo.countScheduleUsage(id),
    ]);

    if (answerCount > 0) {
      throw new ConflictError(
        'Нельзя удалить вопрос: на него уже есть ответы учеников. Используйте PUT с { "is_active": false }, чтобы скрыть его без потери истории.'
      );
    }
    if (scheduleCount > 0) {
      throw new ConflictError(
        'Нельзя удалить вопрос: он запланирован в квизе на одну или несколько дат. Сначала замените его в расписании через POST /api/admin/quiz/schedule, либо используйте { "is_active": false }.'
      );
    }

    const deleted = await quizRepo.deleteQuestion(id);
    if (!deleted) throw new NotFoundError('Вопрос не найден');
  }

  async scheduleQuestions(date, questionIds) {
    return quizRepo.replaceSchedule(date, questionIds);
  }

  _today() {
    return localDate();
  }
}

module.exports = new QuizService();
