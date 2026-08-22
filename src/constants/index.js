'use strict';

const USER_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
});

const USER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
});

const REGISTRATION_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const TRANSACTION_TYPES = Object.freeze({
  QUIZ: 'quiz',
  GAME: 'game',
  SHOP_PURCHASE: 'shop_purchase',
  SKIN_PURCHASE: 'skin_purchase',
  HOUSE_LEVEL_PURCHASE: 'house_level_purchase',
  ADMIN_GRANT: 'admin_grant',
  ENTRY_BONUS: 'entry_bonus',
});

const SHOP_ORDER_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DELIVERED: 'delivered',
  REJECTED: 'rejected',
});

const QUIZ_VALID_ANSWERS = Object.freeze(['a', 'b', 'c', 'd']);

module.exports = {
  USER_STATUSES,
  USER_ROLES,
  REGISTRATION_STATUSES,
  TRANSACTION_TYPES,
  SHOP_ORDER_STATUSES,
  QUIZ_VALID_ANSWERS,
};
