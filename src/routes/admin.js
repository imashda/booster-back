'use strict';

const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const validate = require('../middleware/validate');
const adminCtrl = require('../controllers/adminController');
const {
  approveRegistrationSchema,
  rejectRegistrationSchema,
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
} = require('../validators/admin');

const router = Router();

// authenticate/requireAdmin — per-route, не router.use(...) на весь роутер: этот роутер смонтирован
// на '/admin' и ловит вообще любой путь под ним, не только реально существующие эндпоинты. Блочная
// проверка отрабатывала бы даже для несуществующих путей ДО того, как Express проверит, есть ли
// такой роут — неавторизованный запрос на опечатку в URL получал бы 401 вместо честного 404.
const auth = [authenticate, requireAdmin];
const h = (fn) => asyncHandler(fn.bind(adminCtrl));

// Dashboard
router.get('/dashboard', ...auth, h(adminCtrl.getDashboardStats));

// Registrations
router.get('/registrations',                         ...auth, h(adminCtrl.getRegistrationRequests));
router.post('/registrations/:id/approve', ...auth, approveRegistrationSchema, validate, h(adminCtrl.approveRegistration));
router.post('/registrations/:id/reject',  ...auth, rejectRegistrationSchema,  validate, h(adminCtrl.rejectRegistration));

// Users
router.get('/users',                        ...auth, h(adminCtrl.getUsers));
router.post('/users',            ...auth, createUserSchema,       validate, h(adminCtrl.createUser));
router.patch('/users/:id/status', ...auth, updateUserStatusSchema, validate, h(adminCtrl.updateUserStatus));
router.post('/users/:id/grant-foxes', ...auth, grantFoxesSchema, validate, h(adminCtrl.grantFoxes));
router.post('/users/:id/grant-exp',   ...auth, grantExpSchema,   validate, h(adminCtrl.grantExp));
router.post('/users/:id/reset-password', ...auth, resetPasswordSchema, validate, h(adminCtrl.resetPassword));

// Quiz
router.get('/quiz/questions',        ...auth, h(adminCtrl.getQuestions));
router.post('/quiz/questions',       ...auth, createQuestionSchema, validate, h(adminCtrl.createQuestion));
router.put('/quiz/questions/:id',    ...auth, updateQuestionSchema, validate, h(adminCtrl.updateQuestion));
router.delete('/quiz/questions/:id', ...auth, deleteQuestionSchema, validate, h(adminCtrl.deleteQuestion));
router.post('/quiz/schedule',        ...auth, scheduleQuizSchema,   validate, h(adminCtrl.scheduleQuiz));

// Shop
router.post('/shop/items',      ...auth, createShopItemSchema, validate, h(adminCtrl.createShopItem));
router.put('/shop/items/:id',   ...auth, updateShopItemSchema, validate, h(adminCtrl.updateShopItem));
router.delete('/shop/items/:id', ...auth, deleteShopItemSchema, validate, h(adminCtrl.deleteShopItem));

// Skins
router.post('/skins',     ...auth, createSkinSchema, validate, h(adminCtrl.createSkin));
router.put('/skins/:id',  ...auth, updateSkinSchema, validate, h(adminCtrl.updateSkin));

// House levels
router.patch('/house-levels/:level/price', ...auth, updateHouseLevelPriceSchema, validate, h(adminCtrl.updateHouseLevelPrice));

module.exports = router;
