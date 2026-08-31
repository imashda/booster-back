'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const userRepo = require('../repositories/UserRepository');
const tokenRepo = require('../repositories/TokenRepository');
const walletService = require('./WalletService');
const {
  NotFoundError,
  UnauthorizedError,
  ConflictError,
  BadRequestError,
} = require('../domain/errors');
const { USER_STATUSES, TRANSACTION_TYPES } = require('../constants');

const BCRYPT_ROUNDS = 12;
const LOGIN_GENERATION_ATTEMPTS = 5;

const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// 8-значное число — визуально не похоже на пароль (hex), легко читать/диктовать по WhatsApp.
const generateLoginCandidate = () => String(crypto.randomInt(10_000_000, 100_000_000));

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
  // Регистрация теперь без модерации — пользователь сам придумывает login/password
  // при регистрации и сразу может войти. Уникальность логина проверяется явно здесь
  // (для понятного 409 вместо голой ошибки БД), UNIQUE на users.login — финальный рубеж.
  async register({ fullName, grade, parentName, parentPhone, login, password }) {
    const existingLogin = await userRepo.findByLogin(login);
    if (existingLogin) throw new ConflictError('Этот логин уже занят, выберите другой');

    const normalizedParentPhone = parentPhone.replace(/\D/g, '');
    const passwordHash = await this.hashPassword(password);
    const id = uuidv4();

    try {
      await userRepo.create({
        id, login, passwordHash, fullName, grade,
        parentName, parentPhone: normalizedParentPhone,
      });
    } catch (err) {
      // Пре-чек выше не гарантирует уникальность под конкурентной нагрузкой (TOCTOU) —
      // UNIQUE на login (констрейнт исторически называется users_phone_key после переименования
      // колонки phone -> login) финальный рубеж. Ловим здесь, чтобы "проигравший" гонку запрос
      // получил то же понятное сообщение, а не голую ошибку БД из общего errorHandler.
      if (err.code === '23505') throw new ConflictError('Этот логин уже занят, выберите другой');
      throw err;
    }

    return {
      message: 'Регистрация завершена. Теперь можно войти с этим логином и паролем.',
      userId: id,
      login,
    };
  }

  async login(login, password) {
    const user = await userRepo.findByLogin(login.trim());

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

  // Ретраит на случай коллизии со сгенерированным ранее логином (UNIQUE на users.login) —
  // с 8-значным числом коллизия почти невозможна, но проверяем явно, а не полагаемся только
  // на то, что INSERT упадёт с 23505.
  async generateUniqueLogin() {
    for (let attempt = 0; attempt < LOGIN_GENERATION_ATTEMPTS; attempt++) {
      const candidate = generateLoginCandidate();
      const existing = await userRepo.findByLogin(candidate);
      if (!existing) return candidate;
    }
    throw new Error('Не удалось сгенерировать уникальный логин');
  }

  async hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }
}

module.exports = new AuthService();
