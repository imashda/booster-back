'use strict';

const quizService = require('../services/QuizService');

class QuizController {
  async getTodayQuiz(req, res) {
    const data = await quizService.getTodayQuiz(req.user.id);
    res.json({ success: true, data });
  }

  async answerQuiz(req, res) {
    const data = await quizService.answerQuiz(req.user.id, req.body.question_id, req.body.answer);
    res.json({ success: true, data });
  }
}

module.exports = new QuizController();
