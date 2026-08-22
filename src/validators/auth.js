'use strict';

const { body, param } = require('express-validator');

const registerSchema = [
  body('full_name').trim().notEmpty().withMessage('ФИО обязательно'),
  body('phone').trim().notEmpty().isMobilePhone().withMessage('Неверный номер телефона'),
  body('grade').trim().notEmpty().withMessage('Класс обязателен'),
];

const registrationStatusSchema = [
  param('id').isUUID().withMessage('Неверный ID заявки'),
];

const loginSchema = [
  body('phone').trim().notEmpty().withMessage('Телефон обязателен'),
  body('password').notEmpty().withMessage('Пароль обязателен'),
];

const refreshTokenSchema = [
  body('refreshToken').notEmpty().withMessage('Refresh token обязателен'),
];

const changePasswordSchema = [
  body('currentPassword').notEmpty().withMessage('Текущий пароль обязателен'),
  body('newPassword').isLength({ min: 6 }).withMessage('Минимум 6 символов'),
];

module.exports = { registerSchema, registrationStatusSchema, loginSchema, refreshTokenSchema, changePasswordSchema };
