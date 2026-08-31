'use strict';

const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const authController = require('../controllers/authController');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} = require('../validators/auth');

const router = Router();

router.post('/register', registerSchema, validate, asyncHandler(authController.register.bind(authController)));
router.post('/login',    loginSchema,    validate, asyncHandler(authController.login.bind(authController)));
router.post('/refresh',  refreshTokenSchema, validate, asyncHandler(authController.refreshToken.bind(authController)));
router.post('/logout',   asyncHandler(authController.logout.bind(authController)));

router.post(
  '/change-password',
  authenticate,
  changePasswordSchema,
  validate,
  asyncHandler(authController.changePassword.bind(authController))
);

module.exports = router;
