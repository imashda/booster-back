'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startAllJobs } = require('./jobs');
const logger = require('./shared/logger');
const { pool } = require('./config/database');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason?.message ?? String(reason), stack: reason?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

const app = express();

// Required behind a reverse proxy / load balancer (Railway, Render, Heroku, nginx, etc.)
// so req.ip and X-Forwarded-For are trusted — otherwise express-rate-limit keys every
// request by the proxy's IP instead of the real client.
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.server.env === 'production'
    ? (config.server.allowedOrigins.length ? config.server.allowedOrigins : false)
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.server.env === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Ключ лимита — ПОЛЬЗОВАТЕЛЬ (по проверенному access-токену), а для запросов
// без токена — IP. Раньше ключом был только IP, а ученики сидят за одним
// школьным/домашним NAT: 200 запросов на 15 минут делились на весь класс, и
// «Слишком много запросов» прилетало детям, которые сделали пару переходов.
// Сам лимит не увеличен — он по-прежнему 200 на 15 минут, но на одного
// человека. Поддельный токен в ключ не попадает: без валидной подписи
// запрос считается по IP.
const rateLimitKey = (req) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const { userId } = jwt.verify(auth.slice(7), config.jwt.secret);
      if (userId) return `user:${userId}`;
    } catch {
      /* невалидный/просроченный токен — считаем по IP */
    }
  }
  return `ip:${req.ip}`;
};

const rateLimitHandler = (message) => (req, res, next, options) => {
  res.status(options.statusCode).json({ success: false, code: 'RATE_LIMITED', message });
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  handler: rateLimitHandler('Слишком много запросов. Попробуйте позже.'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Слишком много попыток входа. Подождите 15 минут.'),
});

app.use('/api', generalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = config.server.port;

const server = app.listen(PORT, () => {
  logger.info(`Booster Backend running on port ${PORT}`, { env: config.server.env });
  if (config.server.env !== 'test') {
    startAllJobs();
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Stop accepting new connections, let in-flight requests finish, then close the
// DB pool — avoids dropped requests and connection leaks on deploy/restart.
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
