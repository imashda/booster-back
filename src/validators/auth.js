'use strict';

const { body, param } = require('express-validator');

const registerSchema = [
  body('full_name').trim().notEmpty().withMessage('ФИО ребёнка обязательно'),
  body('grade').trim().notEmpty().withMessage('Класс обучения обязателен'),
  body('parent_name').trim().notEmpty().withMessage('Имя родителя обязательно'),
  body('parent_phone').trim().notEmpty().isMobilePhone().withMessage('Неверный номер телефона родителя'),
  // Ответ на экран "Вы ученик Booster?" — просто помечает заявку для куратора,
  // заявка уходит на модерацию в любом случае (см. AuthService.register).
  body('is_booster_student').isBoolean().withMessage('is_booster_student должен быть true/false'),
];

const registrationStatusSchema = [
  param('id').isUUID().withMessage('Неверный ID заявки'),
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

module.exports = { registerSchema, registrationStatusSchema, loginSchema, refreshTokenSchema, changePasswordSchema };
