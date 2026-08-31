'use strict';

const { body, param } = require('express-validator');

const uuidParam = param('id').isUUID().withMessage('Неверный ID');

const createUserSchema = [
  body('full_name').trim().notEmpty().withMessage('ФИО ребёнка обязательно'),
  body('grade').trim().notEmpty().withMessage('Класс обязателен'),
  body('parent_name').trim().notEmpty().withMessage('Имя родителя обязательно'),
  body('parent_phone').trim().notEmpty().isMobilePhone().withMessage('Неверный номер телефона родителя'),
];

const updateUserStatusSchema = [
  uuidParam,
  body('status').isIn(['active', 'blocked']).withMessage('Статус: active или blocked'),
];

const grantFoxesSchema = [
  uuidParam,
  body('amount').isInt().withMessage('amount должен быть целым числом'),
];

const grantExpSchema = [
  uuidParam,
  body('amount').isInt({ min: 0 }).withMessage('amount должен быть неотрицательным'),
];

const resetPasswordSchema = [uuidParam];

const createQuestionSchema = [
  body('question').trim().notEmpty().withMessage('Вопрос обязателен'),
  body('option_a').trim().notEmpty(),
  body('option_b').trim().notEmpty(),
  body('option_c').trim().notEmpty(),
  body('option_d').trim().notEmpty(),
  body('correct').isIn(['a', 'b', 'c', 'd']).withMessage('Ответ должен быть a, b, c или d'),
];

const updateQuestionSchema = [
  uuidParam,
  body('question').optional().trim().notEmpty().withMessage('Вопрос не может быть пустым'),
  body('option_a').optional().trim().notEmpty().withMessage('option_a не может быть пустым'),
  body('option_b').optional().trim().notEmpty().withMessage('option_b не может быть пустым'),
  body('option_c').optional().trim().notEmpty().withMessage('option_c не может быть пустым'),
  body('option_d').optional().trim().notEmpty().withMessage('option_d не может быть пустым'),
  body('correct').optional().isIn(['a', 'b', 'c', 'd']).withMessage('Ответ должен быть a, b, c или d'),
  body('is_active').optional().isBoolean().withMessage('is_active должен быть true/false'),
];

const deleteQuestionSchema = [uuidParam];

const scheduleQuizSchema = [
  body('quiz_date').isDate().withMessage('Неверный формат даты'),
  body('question_ids').isArray({ min: 1, max: 5 }).withMessage('question_ids — массив от 1 до 5 ID вопросов'),
  body('question_ids.*').isUUID().withMessage('Неверный ID вопроса в question_ids'),
];

const createShopItemSchema = [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('price_foxes').isInt({ min: 1 }).withMessage('Цена должна быть положительной'),
];

const updateShopItemSchema = [
  uuidParam,
  body('name').optional().trim().notEmpty().withMessage('Название не может быть пустым'),
  body('price_foxes').optional().isInt({ min: 1 }).withMessage('Цена должна быть положительной'),
  body('is_active').optional().isBoolean().withMessage('is_active должен быть true/false'),
  body('sort_order').optional().isInt().withMessage('sort_order должен быть целым числом'),
];

const createSkinSchema = [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('price_foxes').isInt({ min: 0 }).withMessage('Цена должна быть неотрицательной'),
  body('exp_bonus').optional().isInt({ min: 0 }).withMessage('exp_bonus должен быть неотрицательным'),
];

const updateSkinSchema = [
  uuidParam,
  body('name').optional().trim().notEmpty().withMessage('Название не может быть пустым'),
  body('price_foxes').optional().isInt({ min: 0 }).withMessage('Цена должна быть неотрицательной'),
  body('level_req').optional().isInt({ min: 1 }).withMessage('level_req должен быть положительным'),
  body('exp_bonus').optional().isInt({ min: 0 }).withMessage('exp_bonus должен быть неотрицательным'),
  body('is_active').optional().isBoolean().withMessage('is_active должен быть true/false'),
];

const deleteShopItemSchema = [uuidParam];

const updateHouseLevelPriceSchema = [
  param('level').isInt({ min: 1, max: 50 }).withMessage('level: число от 1 до 50'),
  // null явно снимает цену (уровень становится непокупаемым, только через EXP)
  body('price_foxes').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('price_foxes должен быть неотрицательным или null'),
];

module.exports = {
  createUserSchema,
  updateUserStatusSchema,
  grantFoxesSchema,
  grantExpSchema,
  resetPasswordSchema,
  createQuestionSchema,
  updateQuestionSchema,
  deleteQuestionSchema,
  scheduleQuizSchema,
  createShopItemSchema,
  updateShopItemSchema,
  deleteShopItemSchema,
  createSkinSchema,
  updateSkinSchema,
  updateHouseLevelPriceSchema,
};
