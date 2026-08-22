'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const userRepo = require('../repositories/UserRepository');
const tokenRepo = require('../repositories/TokenRepository');
const registrationRepo = require('../repositories/RegistrationRepository');
const walletService = require('./WalletService');
const {
  NotFoundError,
  UnauthorizedError,
  ConflictError,
  BadRequestError,
} = require('../domain/errors');
const { USER_STATUSES, REGISTRATION_STATUSES, TRANSACTION_TYPES } = require('../constants');

const BCRYPT_ROUNDS = 12;

const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateTokenPair = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
  const refreshToken = jwt.sign(
    { userId, role },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
  return { accessToken, refreshToken };
};

class AuthService {
  async register({ fullName, phone, grade }) {
    const normalizedPhone = phone.replace(/\D/g, '');

    const existingUser = await userRepo.findByPhone(normalizedPhone);
    if (existingUser) {
      throw new ConflictError('Номер телефона уже зарегистрирован');
    }

    const latestRequest = await registrationRepo.findLatestByPhone(normalizedPhone);
    if (latestRequest?.status === REGISTRATION_STATUSES.PENDING) {
      throw new ConflictError('Заявка уже отправлена. Ожидайте подтверждения.');
    }

    const id = uuidv4();
    await registrationRepo.create({ id, fullName, phone: normalizedPhone, grade });

    return {
      message: 'Заявка отправлена. Администратор рассмотрит её и передаст логин и пароль куратору.',
      requestId: id,
    };
  }

  async getRegistrationStatus(requestId) {
    const request = await registrationRepo.findStatusById(requestId);
    if (!request) throw new NotFoundError('Заявка не найдена');
    return {
      status: request.status,
      rejectReason: request.status === REGISTRATION_STATUSES.REJECTED ? request.reject_reason : null,
    };
  }

  async login(phone, password) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const user = await userRepo.findByPhone(normalizedPhone);

    if (!user) throw new UnauthorizedError('Неверный логин или пароль');

    if (user.status === USER_STATUSES.PENDING) {
      throw new UnauthorizedError('Аккаунт ожидает подтверждения администратора');
    }
    if (user.status === USER_STATUSES.BLOCKED) {
      throw new UnauthorizedError('Аккаунт заблокирован');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) throw new UnauthorizedError('Неверный логин или пароль');

    const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);

    // claimFirstLogin атомарно (UPDATE ... WHERE last_login_at IS NULL) решает, кто именно
    // застолбил "первый вход" — так параллельные повторные логины не начислят бонус дважды.
    const isFirstLogin = await userRepo.claimFirstLogin(user.id);

    const expiresAt = new Date(Date.now() + config.jwt.refreshTtlMs);
    const [, foxResult] = await Promise.all([
      tokenRepo.create({ id: uuidv4(), userId: user.id, tokenHash: hashToken(refreshToken), expiresAt }),
      isFirstLogin
        ? walletService.changeFoxes(
            user.id, config.game.entryBonusFox, TRANSACTION_TYPES.ENTRY_BONUS, 'Бонус за первый вход в приложение'
          )
        : Promise.resolve(null),
      isFirstLogin ? Promise.resolve() : userRepo.updateLastLogin(user.id),
    ]);

    const { password_hash, ...safeUser } = user;
    if (foxResult) safeUser.foxes = foxResult.newBalance;
    return { user: safeUser, accessToken, refreshToken };
  }

  async refreshTokens(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.refreshSecret);
    } catch {
      throw new UnauthorizedError('Неверный refresh token');
    }

    const tokenHash = hashToken(token);
    const storedToken = await tokenRepo.findByTokenHash(tokenHash);
    if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token недействителен или истёк');
    }

    const user = await userRepo.findById(decoded.userId);
    if (!user) throw new UnauthorizedError('Пользователь не найден');

    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user.id, user.role);
    const expiresAt = new Date(Date.now() + config.jwt.refreshTtlMs);

    await tokenRepo.deleteByTokenHash(tokenHash);
    await tokenRepo.create({ id: uuidv4(), userId: user.id, tokenHash: hashToken(newRefreshToken), expiresAt });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(token) {
    if (token) await tokenRepo.deleteByTokenHash(hashToken(token));
  }

  async changePassword(userId, currentPassword, newPassword) {
    const { rows } = await require('../config/database').query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    if (!rows[0]) throw new NotFoundError('Пользователь не найден');

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) throw new BadRequestError('Неверный текущий пароль');

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await Promise.all([
      userRepo.updatePassword(userId, newHash),
      tokenRepo.deleteByUserId(userId),
    ]);
  }

  generatePassword() {
    return generatePassword();
  }

  async hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }
}

module.exports = new AuthService();
