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

const equipSkinSchema = [
  // skin_id указан => категория выводится из скина на бэкенде.
  // skin_id не указан => это "снять скин", тогда обязателен category_id (какой слот очищать).
  body('skin_id').optional({ values: 'null' }).isUUID().withMessage('Неверный ID скина'),
  body('category_id').optional().isUUID().withMessage('Неверный ID категории'),
  body().custom((value) => {
    if (!value.skin_id && !value.category_id) {
      throw new Error('Укажите skin_id (чтобы надеть скин) или category_id (чтобы снять)');
    }
    return true;
  }),
];

module.exports = {
  answerQuizSchema,
  submitGameResultSchema,
  orderShopItemSchema,
  buySkinSchema,
  equipSkinSchema,
};
