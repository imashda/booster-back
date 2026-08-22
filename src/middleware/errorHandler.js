'use strict';

const { AppError } = require('../domain/errors');
const logger = require('../shared/logger');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Запись уже существует' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Ссылка на несуществующую запись' });
  }

  logger.error('Unhandled server error', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Маршрут ${req.method} ${req.path} не найден`,
  });
};

module.exports = { errorHandler, notFound };
