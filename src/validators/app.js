'use strict';

const { body } = require('express-validator');
const { QUIZ_VALID_ANSWERS } = require('../constants');

const answerQuizSchema = [
  body('question_id').isUUID().withMessage('Неверный ID вопроса'),
  body('answer')
    .isIn(QUIZ_VALID_ANSWERS)
    .withMessage('Ответ должен быть a, b, c или d'),
];

const submitGameResultSchema = [
  body('game_id').isUUID().withMessage('Неверный ID игры'),
  body('score').optional().isInt({ min: 0 }).withMessage('score должен быть неотрицательным'),
];

const orderShopItemSchema = [
  body('item_id').isUUID().withMessage('Неверный ID товара'),
];

const buySkinSchema = [
  body('skin_id').isUUID().withMessage('Неверный ID скина'),
];

// skin_id указан — надеть этот образ; опущен/null — снять текущий (один образ на пользователя,
// категорий больше нет).
const equipSkinSchema = [
  body('skin_id').optional({ values: 'null' }).isUUID().withMessage('Неверный ID образа'),
];

module.exports = {
  answerQuizSchema,
  submitGameResultSchema,
  orderShopItemSchema,
  buySkinSchema,
  equipSkinSchema,
};
