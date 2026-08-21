'use strict';

const { ForbiddenError } = require('../domain/errors');
const { USER_ROLES } = require('../constants');

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== USER_ROLES.ADMIN) {
    return next(new ForbiddenError('Нет прав администратора'));
  }
  next();
};

module.exports = requireAdmin;
