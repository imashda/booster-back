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
    accessExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
  },
  whatsapp: {
    instanceId: process.env.WHATSAPP_INSTANCE_ID,
    apiToken: process.env.WHATSAPP_API_TOKEN,
  },
  admin: {
    secretKey: process.env.ADMIN_SECRET_KEY,
  },
  game: {
    dailyQuizFoxReward: parseInt(process.env.DAILY_QUIZ_FOX_REWARD, 10) || 100,
    dailyGameFoxLimit: parseInt(process.env.DAILY_GAMES_FOX_LIMIT, 10) || 100,
    quizWrongFoxReward: 10,
    quizCorrectExpReward: 50,
    quizWrongExpReward: 10,
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
