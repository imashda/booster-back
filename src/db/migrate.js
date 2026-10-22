require('dotenv').config();
const { pool } = require('../config/database');

const migrations = `

-- ============================================================
-- BOOSTER APP — DATABASE SCHEMA
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  login         VARCHAR(20)  UNIQUE NOT NULL, -- сгенерированный логин (НЕ телефон — у детей своего телефона нет)
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,        -- ФИО ребёнка
  grade         VARCHAR(20)  NOT NULL,        -- класс: "10A", "11B" и т.д.
  role          VARCHAR(20)  NOT NULL DEFAULT 'student', -- 'student' | 'admin'
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'blocked'
  avatar_url    TEXT,

  -- Контакты родителя — куда куратор пересылает логин/пароль
  parent_name   VARCHAR(255),
  parent_phone  VARCHAR(20),

  -- Gamification
  foxes         INTEGER NOT NULL DEFAULT 0,   -- валюта FOX
  exp           INTEGER NOT NULL DEFAULT 0,   -- опыт (для лидерборда и уровня персонажа)
  level         INTEGER NOT NULL DEFAULT 1,   -- уровень ПЕРСОНАЖА (лиса) = уровень по exp (resolveLevelForExp) + bonus_levels
  house_level   INTEGER NOT NULL DEFAULT 1,   -- уровень ДОМА на карте (1–50) — отдельный счётчик, растёт покупками за Фоксы

  -- Alpha CRM (не используется приложением — интеграция отключена, foxes заводятся в БД напрямую)
  alpha_crm_id  VARCHAR(100),

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Существующие БД созданы до перехода на сгенерированный логин (была колонка phone) — переносим.
-- EXCEPTION ловит гонку, если два процесса мигрируют одну БД параллельно и второй приходит
-- к RENAME уже после первого — тогда просто нечего переименовывать, это не ошибка.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users RENAME COLUMN phone TO login;
  END IF;
EXCEPTION WHEN undefined_column THEN
  NULL;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_exp ON users(exp DESC);

-- ============================================================
-- REGISTRATION REQUESTS (не используется приложением — регистрация теперь без модерации,
-- пользователь сам придумывает login/password и сразу создаётся users-запись; таблица оставлена
-- как legacy ради уже существующих данных, новым кодом не читается и не пишется)
-- ============================================================
CREATE TABLE IF NOT EXISTS registration_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     VARCHAR(255) NOT NULL,  -- ФИО ребёнка
  grade         VARCHAR(20)  NOT NULL,
  parent_name   VARCHAR(255),
  parent_phone  VARCHAR(20),
  phone         VARCHAR(20),  -- legacy-поле, новым кодом не заполняется
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20);
ALTER TABLE registration_requests ALTER COLUMN phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_reg_requests_parent_phone ON registration_requests(parent_phone);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE, -- SHA-256 hex hash of the refresh JWT, not the raw token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================================
-- DAILY QUIZ
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question      TEXT NOT NULL,
  option_a      TEXT NOT NULL,
  option_b      TEXT NOT NULL,
  option_c      TEXT NOT NULL,
  option_d      TEXT NOT NULL,
  correct       CHAR(1) NOT NULL CHECK (correct IN ('a','b','c','d')),
  category      VARCHAR(100),
  difficulty    VARCHAR(20) DEFAULT 'medium',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Квиз дня — до 5 вопросов на дату, показываются пользователю по порядку (position)
CREATE TABLE IF NOT EXISTS daily_quiz_schedule (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES quiz_questions(id),
  quiz_date   DATE NOT NULL,
  position    SMALLINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Существующие БД созданы до перехода на 5 вопросов/день (было UNIQUE(quiz_date), 1 вопрос) — приводим к новой схеме
ALTER TABLE daily_quiz_schedule DROP CONSTRAINT IF EXISTS daily_quiz_schedule_quiz_date_key;
ALTER TABLE daily_quiz_schedule ADD COLUMN IF NOT EXISTS position SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_daily_quiz_date ON daily_quiz_schedule(quiz_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_quiz_date_position ON daily_quiz_schedule(quiz_date, position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_quiz_date_question ON daily_quiz_schedule(quiz_date, question_id);

-- Ответы пользователей на квиз — уникальность теперь на (user_id, question_id), а не на (user_id, quiz_date),
-- т.к. в день до 5 вопросов и на каждый нужен свой ответ.
CREATE TABLE IF NOT EXISTS quiz_answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id),
  quiz_date   DATE NOT NULL,
  answer      CHAR(1) NOT NULL CHECK (answer IN ('a','b','c','d')),
  is_correct  BOOLEAN NOT NULL,
  foxes_earned INTEGER NOT NULL DEFAULT 0,
  exp_earned  INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quiz_answers DROP CONSTRAINT IF EXISTS quiz_answers_user_id_quiz_date_key;

CREATE INDEX IF NOT EXISTS idx_quiz_answers_user ON quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_date ON quiz_answers(quiz_date);
-- Уникальность ответа — в пределах ДНЯ квиза: (user_id, question_id, quiz_date).
-- Раньше было (user_id, question_id) навсегда, а банк вопросов маленький и
-- расписание повторяет вопросы: со второго дня на повторившийся вопрос
-- ответить было нельзя вообще (вечный 409). Двойное начисление за один день
-- по-прежнему исключено этим индексом.
DROP INDEX IF EXISTS uq_quiz_answers_user_question;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_answers_user_question_date ON quiz_answers(user_id, question_id, quiz_date);

-- ============================================================
-- MINI GAMES
-- ============================================================
CREATE TABLE IF NOT EXISTS mini_games (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        VARCHAR(100) UNIQUE NOT NULL, -- 'fox-collector', 'office-escape', etc.
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  fox_reward  INTEGER NOT NULL DEFAULT 20,  -- фоксы за одну игру
  exp_reward  INTEGER NOT NULL DEFAULT 10,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Сессии игр (история)
CREATE TABLE IF NOT EXISTS game_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id      UUID NOT NULL REFERENCES mini_games(id),
  score        INTEGER NOT NULL DEFAULT 0,
  foxes_earned INTEGER NOT NULL DEFAULT 0,
  exp_earned   INTEGER NOT NULL DEFAULT 0,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  played_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id);

-- Идемпотентность результата игры: клиент присылает свой id партии, и
-- повторная отправка (двойной тап, повтор после таймаута) не начисляет
-- награду второй раз.
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS client_session_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_sessions_client ON game_sessions(user_id, client_session_id)
  WHERE client_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_sessions_date ON game_sessions(session_date);

-- Дневной лимит фоксов за игры (100 FOX в день за все игры)
CREATE TABLE IF NOT EXISTS daily_game_limits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  limit_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  foxes_earned INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, limit_date)
);

-- ============================================================
-- ОБРАЗЫ (целиком надеваемые скины — не по категориям, один надет за раз)
-- ============================================================
-- Legacy-таблица от старой per-category модели (top/pants/shoes/...) — новым кодом не используется,
-- оставлена нетронутой ради уже существующих данных. Образ ("skins" ниже) больше не привязан к категории.
CREATE TABLE IF NOT EXISTS skin_categories (
  id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skins (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id  UUID REFERENCES skin_categories(id), -- legacy, необязателен в новой модели "один образ целиком"
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  image_url    TEXT,
  price_foxes  INTEGER NOT NULL DEFAULT 0,
  level_req    INTEGER NOT NULL DEFAULT 1,  -- требуемый уровень для покупки
  exp_bonus    INTEGER NOT NULL DEFAULT 0,  -- EXP, начисляемый при покупке (двигает уровень через ту же формулу, что квизы/игры)
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE skins ADD COLUMN IF NOT EXISTS exp_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skins ALTER COLUMN category_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skins_category ON skins(category_id);
CREATE INDEX IF NOT EXISTS idx_skins_active ON skins(is_active);

-- Купленные скины пользователей
CREATE TABLE IF NOT EXISTS user_skins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_id     UUID NOT NULL REFERENCES skins(id),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skin_id)
);

-- Legacy-таблица от старой per-category модели — новым кодом не используется
-- (надетый образ теперь хранится в одном поле users.equipped_skin_id, см. ниже).
CREATE TABLE IF NOT EXISTS user_equipped_skins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES skin_categories(id),
  skin_id     UUID REFERENCES skins(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_skin_id UUID REFERENCES skins(id);

-- Стабильный ключ картинки образа: 'set_1'...'set_30'. Картинки лежат в
-- бандле приложения (assets/outfits/set_N.png), сервер хранит только этот
-- ключ. Раньше колонки не было в миграциях вовсе — на рабочей базе её
-- заводили вручную, и образ без slug клиент рисовал базовым Фоксом, который
-- побайтово совпадает с set_1: «первый образ показывается два раза».
ALTER TABLE skins ADD COLUMN IF NOT EXISTS slug VARCHAR(50);

-- Дубли образа: активная строка с тем же slug, что у более ранней, ЛИБО
-- активная строка без slug с тем же названием, что у образа со slug
-- (наследие ручного заведения — у неё нет картинки). Разные образы с
-- похожей картинкой, но разными slug, не трогаем.
-- Строки не удаляем: покупки переносим на оригинал, надетый — тоже, дубль
-- лишь гасим (is_active = false), история user_skins остаётся.
CREATE TEMP TABLE IF NOT EXISTS tmp_skin_dups (dup_id UUID PRIMARY KEY, keep_id UUID NOT NULL);
TRUNCATE tmp_skin_dups;
INSERT INTO tmp_skin_dups (dup_id, keep_id)
SELECT dup.id, keep.id
FROM skins dup
JOIN LATERAL (
  SELECT k.id FROM skins k
  WHERE k.is_active = true AND k.id <> dup.id
    AND (
      (dup.slug IS NOT NULL AND k.slug = dup.slug AND (k.created_at, k.id) < (dup.created_at, dup.id))
      OR (dup.slug IS NULL AND k.slug IS NOT NULL AND k.name = dup.name)
    )
  ORDER BY k.created_at, k.id
  LIMIT 1
) keep ON true
WHERE dup.is_active = true;

INSERT INTO user_skins (user_id, skin_id, purchased_at)
SELECT us.user_id, d.keep_id, us.purchased_at
FROM user_skins us JOIN tmp_skin_dups d ON d.dup_id = us.skin_id
ON CONFLICT (user_id, skin_id) DO NOTHING;

UPDATE users u SET equipped_skin_id = d.keep_id
FROM tmp_skin_dups d WHERE u.equipped_skin_id = d.dup_id;

UPDATE skins SET is_active = false WHERE id IN (SELECT dup_id FROM tmp_skin_dups);
DROP TABLE tmp_skin_dups;

CREATE UNIQUE INDEX IF NOT EXISTS uq_skins_active_slug ON skins(slug) WHERE is_active = true AND slug IS NOT NULL;

-- ============================================================
-- SHOP (Магазин товаров за FOX)
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  price_foxes   INTEGER NOT NULL,
  whatsapp_link TEXT,   -- ссылка на WhatsApp для оформления
  category      VARCHAR(100),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Заявки на товары из магазина
CREATE TABLE IF NOT EXISTS shop_orders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES shop_items(id),
  foxes_spent INTEGER NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'delivered'|'rejected'
  notes       TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);

-- ============================================================
-- TRANSACTION HISTORY (история транзакций фоксов и EXP)
-- ============================================================
CREATE TABLE IF NOT EXISTS fox_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,             -- + начисление, - списание
  balance_after INTEGER NOT NULL,
  type        VARCHAR(50) NOT NULL,         -- 'quiz'|'game'|'shop_purchase'|'admin_grant'|'skin_purchase'|'house_level_purchase'|'entry_bonus'
  description TEXT,
  reference_id UUID,                        -- ID связанной сущности (quiz_answer, game_session, shop_order, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fox_tx_user ON fox_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_fox_tx_created ON fox_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS exp_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type        VARCHAR(50) NOT NULL,
  description TEXT,
  reference_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_tx_user ON exp_transactions(user_id);

-- ============================================================
-- LEADERBOARD (Ежемесячный, сбрасывается 1-го числа)
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      DATE NOT NULL,               -- первый день месяца: 2025-01-01
  rank       INTEGER NOT NULL,
  exp_earned INTEGER NOT NULL DEFAULT 0,  -- EXP за месяц
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_month ON leaderboard_snapshots(month, rank);

-- ============================================================
-- HOUSE LEVELS (Уровни домов 1–50)
-- ============================================================
CREATE TABLE IF NOT EXISTS house_levels (
  level       INTEGER PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  exp_required INTEGER NOT NULL,    -- EXP для достижения этого уровня
  image_url   TEXT,
  description TEXT,
  price_foxes INTEGER    -- цена покупки следующего уровня за FOX; NULL = уровень нельзя купить, только заработать EXP
);

ALTER TABLE house_levels ADD COLUMN IF NOT EXISTS price_foxes INTEGER;

-- Уровень дома отделён от уровня персонажа (лиса): раньше это было одно и то же
-- поле level, из-за чего они всегда совпадали. house_level — отдельный счётчик,
-- растущий только покупками (house-levels/buy-next), а level остаётся производным
-- от exp (resolveLevelForExp) плюс bonus_levels — см. блок «Прибавка к уровню» ниже.
ALTER TABLE users ADD COLUMN IF NOT EXISTS house_level INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- «ПРИБАВКА К УРОВНЮ» ИЗ ТАБЛИЦЫ ЦЕН (гардероб и дом)
-- ============================================================
-- Покупка образа или дома даёт фиксированное число УРОВНЕЙ персонажа из
-- таблицы, а не EXP. Уровень = уровень по EXP-порогам (квизы, игры) + bonus_levels
-- (сумма прибавок за покупки). Так прибавка всегда ровно та, что в таблице,
-- и уровень не упирается в 50 порогов house_levels (по смете можно дойти до ~229).
ALTER TABLE skins ADD COLUMN IF NOT EXISTS level_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE house_levels ADD COLUMN IF NOT EXISTS level_bonus INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_levels INTEGER NOT NULL DEFAULT 0;

-- Уже накопленный уровень сохраняем: всё, что выше уровня по EXP (ручная правка
-- админом и т.п.), переносим в bonus_levels. Повторный запуск ничего не меняет:
-- после переноса level - уровень_по_exp как раз и равен bonus_levels.
UPDATE users u
SET bonus_levels = GREATEST(0, u.level - COALESCE(
  (SELECT MAX(h.level) FROM house_levels h WHERE h.exp_required <= u.exp), 1))
WHERE u.bonus_levels <> GREATEST(0, u.level - COALESCE(
  (SELECT MAX(h.level) FROM house_levels h WHERE h.exp_required <= u.exp), 1));

-- Гардероб: № образа (slug set_N) -> цена, прибавка к уровню
UPDATE skins s SET price_foxes = v.price, level_bonus = v.bonus
FROM (VALUES
  ('set_1', 0, 1),
  ('set_2', 100, 1),
  ('set_3', 150, 1),
  ('set_4', 150, 1),
  ('set_5', 150, 1),
  ('set_6', 200, 1),
  ('set_7', 200, 1),
  ('set_8', 250, 1),
  ('set_9', 250, 1),
  ('set_10', 300, 2),
  ('set_11', 350, 2),
  ('set_12', 400, 2),
  ('set_13', 450, 2),
  ('set_14', 500, 2),
  ('set_15', 550, 2),
  ('set_16', 650, 2),
  ('set_17', 700, 2),
  ('set_18', 800, 3),
  ('set_19', 900, 3),
  ('set_20', 1050, 3),
  ('set_21', 1200, 3),
  ('set_22', 1350, 3),
  ('set_23', 1500, 3),
  ('set_24', 1700, 4),
  ('set_25', 1900, 4),
  ('set_26', 2150, 4),
  ('set_27', 2450, 4),
  ('set_28', 2800, 4),
  ('set_29', 3250, 5),
  ('set_30', 3600, 6)
) AS v(slug, price, bonus)
WHERE s.slug = v.slug AND (s.price_foxes IS DISTINCT FROM v.price OR s.level_bonus IS DISTINCT FROM v.bonus);

-- Дом: № уровня -> цена, прибавка к уровню персонажа
UPDATE house_levels h SET price_foxes = v.price, level_bonus = v.bonus
FROM (VALUES
  (1, 0, 1),
  (2, 100, 1),
  (3, 150, 1),
  (4, 150, 1),
  (5, 150, 1),
  (6, 150, 1),
  (7, 200, 1),
  (8, 200, 1),
  (9, 200, 1),
  (10, 200, 2),
  (11, 250, 2),
  (12, 250, 2),
  (13, 300, 2),
  (14, 300, 2),
  (15, 350, 2),
  (16, 350, 2),
  (17, 400, 2),
  (18, 450, 2),
  (19, 450, 2),
  (20, 500, 3),
  (21, 550, 3),
  (22, 600, 3),
  (23, 650, 3),
  (24, 700, 3),
  (25, 750, 3),
  (26, 800, 3),
  (27, 850, 3),
  (28, 950, 3),
  (29, 1000, 3),
  (30, 1100, 4),
  (31, 1200, 4),
  (32, 1300, 4),
  (33, 1400, 4),
  (34, 1550, 4),
  (35, 1650, 4),
  (36, 1800, 4),
  (37, 1950, 4),
  (38, 2100, 4),
  (39, 2250, 4),
  (40, 2450, 5),
  (41, 2650, 5),
  (42, 2900, 5),
  (43, 3150, 5),
  (44, 3400, 5),
  (45, 3650, 5),
  (46, 4000, 5),
  (47, 4300, 5),
  (48, 4750, 5),
  (49, 5050, 5),
  (50, 5450, 6)
) AS v(level, price, bonus)
WHERE h.level = v.level AND (h.price_foxes IS DISTINCT FROM v.price OR h.level_bonus IS DISTINCT FROM v.bonus);

-- ============================================================
-- ALPHA CRM SYNC LOG (не используется приложением — интеграция отключена)
-- ============================================================
CREATE TABLE IF NOT EXISTS alpha_crm_sync_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id),
  alpha_crm_id VARCHAR(100),
  action       VARCHAR(100),         -- 'fox_credited', 'student_sync', etc.
  payload      JSONB,
  status       VARCHAR(20) DEFAULT 'success',
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,
  type       VARCHAR(50),    -- 'quiz', 'shop', 'level_up', 'admin', 'registration'
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_skins_updated_at ON skins;
CREATE TRIGGER trg_skins_updated_at
  BEFORE UPDATE ON skins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_shop_items_updated_at ON shop_items;
CREATE TRIGGER trg_shop_items_updated_at
  BEFORE UPDATE ON shop_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Running migrations...');
    await client.query(migrations);
    console.log('✅ Migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
