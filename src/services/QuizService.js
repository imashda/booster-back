'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const quizRepo = require('../repositories/QuizRepository');
const walletService = require('./WalletService');
const { NotFoundError, ConflictError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class QuizService {
  async getTodayQuiz(userId) {
    const today = this._today();

    const [questions, answers] = await Promise.all([
      quizRepo.findScheduledQuestionsForDate(today),
      quizRepo.findUserAnswersForDate(userId, today),
    ]);

    if (questions.length === 0) throw new NotFoundError('Квиз на сегодня не запланирован');

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
      quizRepo.findUserAnswerForQuestion(userId, questionId),
      quizRepo.findScheduledQuestion(today, questionId),
    ]);

    if (!question) throw new NotFoundError('Вопрос не найден в сегодняшнем квизе');
    if (existingAnswer) throw new ConflictError('Вы уже ответили на этот вопрос');

    const isCorrect = answer.toLowerCase() === question.correct;
    const foxesEarned = isCorrect ? config.game.dailyQuizFoxReward : config.game.quizWrongFoxReward;
    const expEarned = isCorrect ? config.game.quizCorrectExpReward : config.game.quizWrongExpReward;

    const answerId = uuidv4();
    await quizRepo.saveAnswer({
      id: answerId,
      userId,
      questionId: question.id,
      date: today,
      answer: answer.toLowerCase(),
      isCorrect,
      foxesEarned,
      expEarned,
    });

    const [rewards, answeredSoFar, scheduledToday] = await Promise.all([
      walletService.rewardUser(
        userId, foxesEarned, expEarned,
        TRANSACTION_TYPES.QUIZ,
        `Daily Quiz ${today} — ${isCorrect ? 'верный' : 'неверный'} ответ`,
        answerId
      ),
      quizRepo.findUserAnswersForDate(userId, today),
      quizRepo.findScheduledQuestionsForDate(today),
    ]);
    const totalQuestions = scheduledToday.length;

    return {
      questionId: question.id,
      isCorrect,
      correctAnswer: question.correct,
      foxesEarned,
      expEarned,
      newFoxesBalance: rewards.foxes?.newBalance,
      newExp: rewards.exp?.newExp,
      leveledUp: rewards.exp?.leveledUp,
      newLevel: rewards.exp?.newLevel,
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

  async scheduleQuestions(date, questionIds) {
    return quizRepo.replaceSchedule(date, questionIds);
  }

  _today() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = new QuizService();
