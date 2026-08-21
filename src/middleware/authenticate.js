'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError, ForbiddenError } = require('../domain/errors');
const { USER_STATUSES } = require('../constants');

// Imported lazily to avoid circular deps at module load time
const getUserById = (id) => require('../repositories/UserRepository').findById(id);

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Токен не предоставлен'));
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new UnauthorizedError('Токен истёк', 'TOKEN_EXPIRED'));
      }
      return next(new UnauthorizedError('Неверный токен'));
    }

    const user = await getUserById(decoded.userId);
    if (!user) return next(new UnauthorizedError('Пользователь не найден'));

    if (user.status === USER_STATUSES.BLOCKED) {
      return next(new ForbiddenError('Аккаунт заблокирован'));
    }
    if (user.status === USER_STATUSES.PENDING) {
      return next(new ForbiddenError('Аккаунт ожидает подтверждения'));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
