'use strict';

const { body } = require('express-validator');

const registerSchema = [
  body('full_name').trim().notEmpty().withMessage('ФИО ребёнка обязательно'),
  body('grade').trim().notEmpty().withMessage('Класс обучения обязателен'),
  body('parent_name').trim().notEmpty().withMessage('Имя родителя обязательно'),
  body('parent_phone').trim().notEmpty().isMobilePhone().withMessage('Неверный номер телефона родителя'),
  body('login')
    .trim()
    .isLength({ min: 3, max: 20 }).withMessage('Логин: от 3 до 20 символов')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Логин может содержать только латинские буквы, цифры и подчёркивание'),
  body('password').isLength({ min: 6 }).withMessage('Пароль: минимум 6 символов'),
];

const loginSchema = [
  body('login').trim().notEmpty().withMessage('Логин обязателен'),
  body('password').notEmpty().withMessage('Пароль обязателен'),
];

const refreshTokenSchema = [
  body('refreshToken').notEmpty().withMessage('Refresh token обязателен'),
];

const changePasswordSchema = [
  body('currentPassword').notEmpty().withMessage('Текущий пароль обязателен'),
  body('newPassword').isLength({ min: 6 }).withMessage('Минимум 6 символов'),
];

module.exports = { registerSchema, loginSchema, refreshTokenSchema, changePasswordSchema };
