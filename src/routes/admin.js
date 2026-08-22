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
  scheduleQuizSchema,
  createShopItemSchema,
  updateShopItemSchema,
  createSkinSchema,
  updateSkinSchema,
  updateHouseLevelPriceSchema,
} = require('../validators/admin');

const router = Router();
router.use(authenticate, requireAdmin);

const h = (fn) => asyncHandler(fn.bind(adminCtrl));

// Dashboard
router.get('/dashboard', h(adminCtrl.getDashboardStats));

// Registrations
router.get('/registrations',                         h(adminCtrl.getRegistrationRequests));
router.post('/registrations/:id/approve', approveRegistrationSchema, validate, h(adminCtrl.approveRegistration));
router.post('/registrations/:id/reject',  rejectRegistrationSchema,  validate, h(adminCtrl.rejectRegistration));

// Users
router.get('/users',                        h(adminCtrl.getUsers));
router.post('/users',            createUserSchema,       validate, h(adminCtrl.createUser));
router.patch('/users/:id/status', updateUserStatusSchema, validate, h(adminCtrl.updateUserStatus));
router.post('/users/:id/grant-foxes', grantFoxesSchema, validate, h(adminCtrl.grantFoxes));
router.post('/users/:id/grant-exp',   grantExpSchema,   validate, h(adminCtrl.grantExp));
router.post('/users/:id/reset-password', resetPasswordSchema, validate, h(adminCtrl.resetPassword));

// Quiz
router.get('/quiz/questions',   h(adminCtrl.getQuestions));
router.post('/quiz/questions',  createQuestionSchema, validate, h(adminCtrl.createQuestion));
router.post('/quiz/schedule',   scheduleQuizSchema,   validate, h(adminCtrl.scheduleQuiz));

// Shop
router.post('/shop/items',      createShopItemSchema, validate, h(adminCtrl.createShopItem));
router.put('/shop/items/:id',   updateShopItemSchema, validate, h(adminCtrl.updateShopItem));

// Skins
router.post('/skins',     createSkinSchema, validate, h(adminCtrl.createSkin));
router.put('/skins/:id',  updateSkinSchema, validate, h(adminCtrl.updateSkin));

// House levels
router.patch('/house-levels/:level/price', updateHouseLevelPriceSchema, validate, h(adminCtrl.updateHouseLevelPrice));

module.exports = router;
