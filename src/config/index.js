'use strict';

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) || [],
  },
  db: {
    url: process.env.DATABASE_URL,
    pool: {
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    // 30 дней — дети не помнят пароли и не переходят по силент-рефрешу вовремя, поэтому
    // сессия держится как можно дольше сама по себе (authenticate всё равно перепроверяет
    // статус пользователя в БД на каждый запрос, так что блокировка отработает мгновенно
    // независимо от срока токена).
    accessExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
  },
  admin: {
    secretKey: process.env.ADMIN_SECRET_KEY,
  },
  game: {
    entryBonusFox: parseInt(process.env.ENTRY_BONUS_FOX, 10) || 200,
    quizCorrectFoxReward: parseInt(process.env.QUIZ_CORRECT_FOX_REWARD, 10) || 20,
    quizWrongFoxReward: parseInt(process.env.QUIZ_WRONG_FOX_REWARD, 10) || 0,
    quizCorrectExpReward: parseInt(process.env.QUIZ_CORRECT_EXP_REWARD, 10) || 50,
    quizWrongExpReward: parseInt(process.env.QUIZ_WRONG_EXP_REWARD, 10) || 10,
    dailyGameFoxLimit: parseInt(process.env.DAILY_GAMES_FOX_LIMIT, 10) || 100,
  },
  cron: {
    timezone: 'Asia/Almaty',
  },
};

const REQUIRED = {
  'DATABASE_URL': config.db.url,
  'JWT_SECRET': config.jwt.secret,
  'ADMIN_SECRET_KEY': config.admin.secretKey,
};

const missing = Object.entries(REQUIRED)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = Object.freeze(config);
