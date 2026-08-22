# 🦊 Booster Backend API

Node.js + Express + PostgreSQL (Supabase) backend для мобильного приложения Booster — геймификация для школьников (FOX-валюта, EXP, квизы, мини-игры, магазин, скины, лидерборд).

Этот README — справочник для фронтенда: как авторизоваться и точный контракт (запрос/ответ, типы полей) каждого эндпоинта.

---

## Быстрый старт

```bash
npm install
cp .env.example .env       # заполни реальными значениями, см. таблицу переменных ниже
npm run migrate            # создаёт таблицы (идемпотентно, можно гонять повторно)
npm run seed                # админ + тестовые скины/игры/уровни/квизы/товары
npm run dev                 # http://localhost:3000, автоперезапуск
```

После `seed`: админ `phone=77000000000`, `pass=Admin2025!`.

### Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да | Строка подключения к Postgres (Supabase). Для нескольких инстансов используй connection pooler (порт `6543`, transaction mode) — иначе легко упереться в лимит подключений к БД. |
| `JWT_SECRET` | да | Секрет для access-токенов. Генерировать: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `ADMIN_SECRET_KEY` | да | Секрет для создания первого админа. |
| `REFRESH_TOKEN_SECRET` | нет (fallback → `JWT_SECRET`) | Отдельный секрет для refresh-токенов — рекомендуется задавать отдельно. |
| `JWT_EXPIRES_IN` | нет (`7d`) | TTL access-токена. |
| `REFRESH_TOKEN_EXPIRES_IN` | нет (`30d`) | TTL refresh-токена. |
| `PORT` | нет (`3000`) | Порт HTTP-сервера. |
| `NODE_ENV` | нет (`development`) | В `development` WhatsApp-сообщения только логируются, не отправляются. |
| `ALLOWED_ORIGINS` | нет | CSV доменов фронтенда. **В `production` без этой переменной CORS блокирует все запросы** — обязательно задать перед деплоем. |
| `WHATSAPP_INSTANCE_ID`, `WHATSAPP_API_TOKEN` | нет | UltraMsg — отправка логина/пароля и уведомлений. Без них в проде отправка молча падает (лог `WhatsApp send failed`). |
| `DAILY_QUIZ_FOX_REWARD` | нет (`100`) | FOX за верный ответ дня. |
| `DAILY_GAMES_FOX_LIMIT` | нет (`100`) | Дневной лимит FOX за мини-игры. |

---

## 🔑 Аутентификация

```
Authorization: Bearer <accessToken>
```

- **Access token** — 7 дней (`JWT_EXPIRES_IN`), кладётся в заголовок каждого защищённого запроса.
- **Refresh token** — 30 дней (`REFRESH_TOKEN_EXPIRES_IN`), хранится на клиенте отдельно, используется только для `/api/auth/refresh`. Ротируется на каждый refresh (старый инвалидируется).
- Роуты помечены 🔒 — требуют `Authorization`; 🔒👑 — требуют ещё и роль `admin` (`status: active`, `role: admin`).
- Просроченный access-токен вернёт `401` с `code: "TOKEN_EXPIRED"` — по этому коду фронт должен молча дёрнуть `/api/auth/refresh` и повторить запрос.

### Формат ответа

Успех:
```json
{ "success": true, "data": { /* ... */ } }
```
Некоторые эндпоинты вместо `data` возвращают несколько полей на верхнем уровне (`message`, `requestId`, `users`, `total` и т.п.) — это отмечено в описании каждого такого эндпоинта отдельно.

Ошибка:
```json
{ "success": false, "message": "Недостаточно Фоксов. Нужно: 500, у вас: 120", "code": "BAD_REQUEST" }
```
Ошибка валидации (422):
```json
{
  "success": false,
  "message": "Ошибка валидации",
  "errors": [{ "field": "phone", "message": "Неверный номер телефона" }]
}
```

| HTTP | `code` | Когда |
|---|---|---|
| 400 | `BAD_REQUEST` | Некорректные данные операции (например, "уровень скина ниже требуемого") |
| 400 | `INSUFFICIENT_FUNDS` | Не хватает FOX |
| 401 | `UNAUTHORIZED` | Нет токена / неверный логин-пароль / невалидный токен |
| 401 | `TOKEN_EXPIRED` | Access token истёк — обновить через `/api/auth/refresh` |
| 403 | `FORBIDDEN` | Аккаунт заблокирован/не подтверждён, либо нет прав админа |
| 404 | `NOT_FOUND` | Ресурс не найден |
| 409 | `CONFLICT` | Дубликат (телефон уже занят, скин уже куплен, уже отвечено сегодня) |
| 422 | `VALIDATION_ERROR` | Не прошла валидация тела/параметров запроса |
| 500 | — | Внутренняя ошибка сервера |

---

## 📡 Auth — `/api/auth` (публичные, если не указано иначе)

### `POST /api/auth/register`
Заявка на регистрацию — уходит в очередь на одобрение админом.

Body:
```json
{ "full_name": "Иванов Иван Иванович", "phone": "+77001234567", "grade": "10A" }
```
| Поле | Тип | Обязательно |
|---|---|---|
| full_name | string | да |
| phone | string (любой формат телефона) | да |
| grade | string | да |

201:
```json
{
  "success": true,
  "message": "Заявка отправлена. Администратор рассмотрит её и вышлет пароль на WhatsApp.",
  "requestId": "5e2a1e0a-1b1a-4c9e-9f0a-3a0f6c1e2b10"
}
```
Ошибки: `409` — телефон уже зарегистрирован / заявка уже на рассмотрении.

---

### `GET /api/auth/registration-status/:id`
Публичный (без токена) опрос статуса заявки — для экрана ожидания «одобрили меня?». `:id` — это `requestId` из ответа `POST /api/auth/register`. Пароль сюда не приходит (он уходит в WhatsApp при одобрении) — этот эндпоинт только сигнализирует, что можно переходить на экран входа.

200:
```json
{ "success": true, "data": { "status": "pending", "rejectReason": null } }
```
`status`: `"pending" | "approved" | "rejected"`. `rejectReason` заполнен только при `"rejected"`, иначе `null`.

Ошибки: `404` — заявки с таким ID не существует; `422` — `:id` не UUID.

---

### `POST /api/auth/login`
Body:
```json
{ "phone": "77001234567", "password": "Admin2025!" }
```
200:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b3f1...",
      "phone": "77001234567",
      "full_name": "Иванов Иван Иванович",
      "grade": "10A",
      "role": "student",
      "status": "active",
      "foxes": 1240,
      "exp": 3200,
      "level": 6,
      "avatar_url": null
    },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  }
}
```
Ошибки: `401` — неверный логин/пароль, аккаунт ожидает подтверждения, аккаунт заблокирован.

---

### `POST /api/auth/refresh`
Body:
```json
{ "refreshToken": "eyJhbGciOi..." }
```
200:
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```
Ошибки: `401` — токен невалиден/истёк/пользователь не найден.

---

### `POST /api/auth/logout`
Body (опционально):
```json
{ "refreshToken": "eyJhbGciOi..." }
```
200:
```json
{ "success": true, "message": "Выход выполнен" }
```

---

### `POST /api/auth/change-password` 🔒
Body:
```json
{ "currentPassword": "Admin2025!", "newPassword": "NewPass123!" }
```
`newPassword` — минимум 6 символов. Успешная смена инвалидирует все refresh-токены пользователя (разлогинивает остальные устройства).

200:
```json
{ "success": true, "message": "Пароль успешно изменён" }
```
Ошибки: `400` — неверный текущий пароль.

---

## 👤 Профиль — `/api` 🔒 (везде далее нужен `Authorization`, если не указано иное)

### `GET /api/me`
200:
```json
{
  "success": true,
  "data": {
    "id": "b3f1...",
    "phone": "77001234567",
    "full_name": "Иванов Иван Иванович",
    "grade": "10A",
    "foxes": 1240,
    "exp": 3200,
    "level": 6,
    "avatar_url": null,
    "created_at": "2026-01-10T08:00:00.000Z",
    "last_login_at": "2026-08-21T09:00:00.000Z",
    "house_name": "Коттедж",
    "house_image_url": "https://.../house-6.png",
    "next_level_exp": 6000,
    "skins_count": "3"
  }
}
```
> `skins_count` приходит строкой (`COUNT(*)` из Postgres) — приведи к числу на фронте.

### `GET /api/me/skins`
Все купленные (не обязательно надетые) скины пользователя — для экрана «мой гардероб/инвентарь», без лишних неприобретённых скинов и без клиентской фильтрации каталога.
```json
{
  "success": true,
  "data": [
    {
      "id": "s1...",
      "category_id": "c1...",
      "category_slug": "top",
      "category_name": "Верхняя одежда",
      "name": "Красная куртка",
      "description": null,
      "image_url": "https://.../skin1.png",
      "price_foxes": 500,
      "level_req": 3,
      "exp_bonus": 0,
      "is_active": true,
      "purchased_at": "2026-08-15T10:00:00.000Z",
      "equipped": true
    }
  ]
}
```
> В отличие от `GET /api/skins`, здесь `equipped` — настоящий boolean (не ID строки или `null`).

### `GET /api/me/skins/equipped`
200:
```json
{
  "success": true,
  "data": [
    {
      "category_id": "c1...",
      "category_slug": "top",
      "category_name": "Верхняя одежда",
      "skin_id": "s1...",
      "skin_name": "Красная куртка",
      "image_url": "https://.../skin1.png"
    }
  ]
}
```
Категория без надетого скина тоже может прийти в списке со `skin_id: null`.

### `GET /api/me/transactions?type=&limit=20&offset=0`
Query: `type` — один из `quiz|game|shop_purchase|skin_purchase|admin_grant` (опционально), `limit`/`offset` — пагинация.

200:
```json
{
  "success": true,
  "data": [
    {
      "currency": "fox",
      "amount": 100,
      "balance_after": 1240,
      "type": "quiz",
      "description": "Daily Quiz 2026-08-21 — верный ответ",
      "created_at": "2026-08-21T09:05:00.000Z"
    },
    {
      "currency": "exp",
      "amount": 50,
      "balance_after": 3200,
      "type": "quiz",
      "description": "Daily Quiz 2026-08-21 — верный ответ",
      "created_at": "2026-08-21T09:05:00.000Z"
    }
  ]
}
```
> FOX и EXP — это две отдельные ленты транзакций, объединённые по времени (поле `currency` различает их).

### `GET /api/me/house`
200:
```json
{
  "success": true,
  "data": {
    "level": 6,
    "exp": 3200,
    "name": "Коттедж",
    "image_url": "https://.../house-6.png",
    "description": "Уютный загородный дом",
    "exp_required": 4500,
    "next_level": 7,
    "next_level_exp": 6000,
    "next_level_name": "Таунхаус",
    "next_level_price_foxes": 800
  }
}
```
На максимальном уровне (50) `next_level`/`next_level_exp`/`next_level_name`/`next_level_price_foxes` будут `null`. `next_level_price_foxes` также `null`, если следующий уровень нельзя купить за FOX (только заработать EXP) — показывай кнопку «купить» лишь когда оно не `null`.

---

## 📅 Daily Quiz — `/api` 🔒

Квиз дня состоит из **до 5 вопросов** (`totalQuestions` может быть меньше 5, если админ запланировал не полный набор). Вопросы отвечаются по одному, в любом порядке — `position` только для отображения. Каждый вопрос даёт FOX/EXP независимо (см. «Игровая механика» ниже).

### `GET /api/quiz/today`
```json
{
  "success": true,
  "data": {
    "quizDate": "2026-08-21",
    "totalQuestions": 5,
    "answeredCount": 2,
    "completed": false,
    "questions": [
      {
        "id": "q1...",
        "position": 1,
        "question": "Что такое алгоритм?",
        "option_a": "Пошаговая инструкция для решения задачи",
        "option_b": "Язык программирования",
        "option_c": "Операционная система",
        "option_d": "База данных",
        "category": "IT",
        "answered": true,
        "userAnswer": "a",
        "isCorrect": true,
        "foxesEarned": 100,
        "expEarned": 50
      },
      {
        "id": "q2...",
        "position": 2,
        "question": "Сколько байт в одном килобайте (KB)?",
        "option_a": "100", "option_b": "1000", "option_c": "1024", "option_d": "512",
        "category": "IT",
        "answered": false,
        "userAnswer": null,
        "isCorrect": null,
        "foxesEarned": null,
        "expEarned": null
      }
    ]
  }
}
```
> Правильный ответ (`correct`) нигде не отдаётся, пока пользователь не ответит на конкретный вопрос — тогда он приходит в ответе `POST /api/quiz/answer` как `correctAnswer`, а при повторном `GET /api/quiz/today` для отвеченных вопросов приходит `isCorrect` (но не сам `correctAnswer`).

Ошибки: `404` — квиз на сегодня не запланирован (ни один вопрос).

### `POST /api/quiz/answer`
Body:
```json
{ "question_id": "q1...", "answer": "a" }
```
`question_id` — ID одного из вопросов сегодняшнего квиза (из `GET /api/quiz/today`). `answer` — один из `"a" | "b" | "c" | "d"`.

200:
```json
{
  "success": true,
  "data": {
    "questionId": "q1...",
    "isCorrect": true,
    "correctAnswer": "a",
    "foxesEarned": 100,
    "expEarned": 50,
    "newFoxesBalance": 1340,
    "newExp": 3250,
    "leveledUp": false,
    "newLevel": 6,
    "answeredCount": 3,
    "totalQuestions": 5,
    "completed": false
  }
}
```
Ошибки: `409` — на этот вопрос уже отвечено; `404` — вопрос не входит в квиз сегодняшнего дня; `422` — неверный `question_id`/`answer`.

---

## 🎮 Мини-игры — `/api` 🔒

### `GET /api/games`
200:
```json
{
  "success": true,
  "data": {
    "games": [
      {
        "id": "g1...",
        "slug": "fox-collector",
        "name": "Сбор Фоксов",
        "description": null,
        "icon_url": null,
        "is_active": true,
        "fox_reward": 30,
        "exp_reward": 15,
        "created_at": "2026-01-10T08:00:00.000Z"
      }
    ],
    "dailyFoxesEarned": 70,
    "dailyFoxesLimit": 100,
    "dailyFoxesRemaining": 30
  }
}
```

### `POST /api/games/result`
Body:
```json
{ "game_id": "g1...", "score": 340 }
```
| Поле | Тип | Обязательно |
|---|---|---|
| game_id | UUID | да |
| score | int ≥ 0 | нет |

200:
```json
{
  "success": true,
  "data": {
    "foxesEarned": 30,
    "expEarned": 15,
    "limitReached": false,
    "newFoxesBalance": 1370,
    "newExp": 3265,
    "leveledUp": false,
    "newLevel": 6,
    "dailyFoxesEarned": 100,
    "dailyFoxesLimit": 100
  }
}
```
> Если дневной лимит уже исчерпан или почти достигнут, `foxesEarned` может быть меньше `fox_reward` игры (или `0`) — `limitReached: true` сигнализирует об этом. `expEarned` начисляется всегда, лимит действует только на FOX. Начисление атомарно и защищено от гонок при параллельных запросах — превысить дневной лимит невозможно даже отправляя запросы одновременно.

Ошибки: `404` — игра не найдена; `422` — невалидный `game_id`/`score`.

---

## 🛍 Магазин — `/api` 🔒

### `GET /api/shop?category=`
200:
```json
{
  "success": true,
  "data": [
    {
      "id": "i1...",
      "name": "AirPods Pro",
      "description": "Беспроводные наушники Apple AirPods Pro 2",
      "image_url": null,
      "price_foxes": 50000,
      "whatsapp_link": null,
      "category": "Аксессуары",
      "is_active": true,
      "sort_order": 0,
      "created_at": "2026-01-10T08:00:00.000Z",
      "updated_at": "2026-01-10T08:00:00.000Z"
    }
  ]
}
```

### `POST /api/shop/order`
Body:
```json
{ "item_id": "i1..." }
```
201:
```json
{
  "success": true,
  "message": "Заявка создана. Администратор свяжется с вами.",
  "data": {
    "orderId": "o1...",
    "itemName": "AirPods Pro",
    "foxesSpent": 50000,
    "whatsappLink": null
  }
}
```
Ошибки: `404` — товар не найден; `400` — недостаточно FOX.

---

## 👕 Скины — `/api` 🔒

### `GET /api/skins?category_slug=`
200:
```json
{
  "success": true,
  "data": [
    {
      "id": "s1...",
      "category_id": "c1...",
      "name": "Красная куртка",
      "description": null,
      "image_url": "https://.../skin1.png",
      "price_foxes": 500,
      "level_req": 3,
      "exp_bonus": 0,
      "is_active": true,
      "created_at": "2026-01-10T08:00:00.000Z",
      "updated_at": "2026-01-10T08:00:00.000Z",
      "category_slug": "top",
      "category_name": "Верхняя одежда",
      "owned": "us1...",
      "equipped": null
    }
  ]
}
```
> `owned`/`equipped` — это ID строки в БД, если скин куплен/надет, иначе `null`. На фронте используй как boolean: `Boolean(item.owned)`.
> `exp_bonus` — сколько EXP начислится при покупке (обычно `0`; для «уровневых» скинов задаётся админом). Это именно EXP, а не мгновенная прибавка к уровню — уровень пересчитывается по той же формуле, что и от квизов/игр, так что прогресс никогда не рассинхронизируется.

### `GET /api/skins/categories`
200:
```json
{
  "success": true,
  "data": [
    { "id": "c1...", "slug": "top", "name": "Верхняя одежда", "sort_order": 1 },
    { "id": "c2...", "slug": "pants", "name": "Штаны", "sort_order": 2 }
  ]
}
```

### `POST /api/skins/buy`
Body:
```json
{ "skin_id": "s1..." }
```
200:
```json
{
  "success": true,
  "message": "Скин куплен!",
  "data": {
    "skinId": "s1...",
    "newFoxesBalance": 740,
    "expBonus": 300,
    "newExp": 3500,
    "leveledUp": true,
    "newLevel": 7
  }
}
```
> `expBonus`/`newExp`/`leveledUp`/`newLevel` присутствуют всегда; если у скина `exp_bonus: 0`, `newExp`/`leveledUp`/`newLevel` будут `null` (EXP не менялся).

Ошибки: `404` — скин не найден; `409` — уже куплен; `400` — не хватает уровня или FOX.

### `POST /api/skins/equip`
Категория выводится из самого скина на бэкенде — **не** нужно отдельно передавать `category_id`, чтобы что-то надеть, и невозможно надеть скин не в свой слот (например, головной убор в слот обуви), даже если по ошибке прислать чужой `category_id`.

Чтобы **надеть**:
```json
{ "skin_id": "s1..." }
```
Чтобы **снять** — `skin_id` не передаём, но тогда обязателен `category_id` (иначе непонятно, какой слот очищать):
```json
{ "category_id": "c1..." }
```

| Поле | Тип | Обязательно |
|---|---|---|
| skin_id | UUID | нет — обязателен, если не передан `category_id` |
| category_id | UUID | нет — обязателен, если не передан `skin_id` (случай «снять») |

200 (надели):
```json
{ "success": true, "message": "Скин надет", "data": { "categoryId": "c1...", "skinId": "s1..." } }
```
200 (сняли):
```json
{ "success": true, "message": "Скин снят", "data": { "categoryId": "c1...", "skinId": null } }
```
Ошибки: `400` — скин не куплен; `404` — скин не найден; `422` — не передано ни `skin_id`, ни `category_id`, либо ID не UUID.

---

## 🏆 Лидерборд и уровни домов — `/api` 🔒

### `GET /api/leaderboard`
Топ-100 по EXP + позиция текущего пользователя (даже если он не попал в топ-100).
200:
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      { "id": "u1...", "full_name": "Иванов Иван", "grade": "10A", "level": 9, "exp": 15000, "avatar_url": null, "rank": "1" }
    ],
    "myRank": "42",
    "me": { "id": "b3f1...", "full_name": "Петров Пётр", "grade": "10A", "level": 6, "exp": 3200, "avatar_url": null }
  }
}
```
> `rank`/`myRank` приходят строкой (Postgres `RANK()` window function) — приведи к числу на фронте. Сбрасывается ежемесячно 1-го числа (снапшот сохраняется в истории).

### `GET /api/house-levels`
200:
```json
{
  "success": true,
  "data": [
    { "level": 1, "name": "Шалаш", "exp_required": 0, "image_url": null, "description": null, "price_foxes": null },
    { "level": 2, "name": "Палатка", "exp_required": 500, "image_url": null, "description": null, "price_foxes": 800 }
  ]
}
```
Всего 50 уровней. `price_foxes: null` — уровень нельзя купить за FOX, только заработать EXP (квизы/игры/скины с `exp_bonus`).

### `POST /api/house-levels/buy-next`
Покупает **следующий** уровень дома от текущего (пропустить уровень нельзя — всегда бьёт по `текущий_уровень + 1`). Тело запроса не нужно. По сути это грант ровно того EXP, которого не хватает до порога следующего уровня — то есть механика идентична `exp_bonus` у скинов: level всегда остаётся производным от exp, а не устанавливается напрямую, поэтому его невозможно случайно рассинхронизировать с последующими квизами/играми.

200:
```json
{
  "success": true,
  "message": "Уровень куплен!",
  "data": {
    "houseName": "Палатка",
    "foxesSpent": 800,
    "newFoxesBalance": 440,
    "newExp": 500,
    "newLevel": 2
  }
}
```
Ошибки: `400` — вы уже на максимальном уровне (50); `400` — у следующего уровня `price_foxes: null` (нельзя купить, только заработать); `400` — не хватает FOX.

---

## 🔐 Admin — `/api/admin` 🔒👑

Все требуют `Authorization: Bearer <adminToken>` и `role: "admin"`.

### `GET /api/admin/dashboard`
200:
```json
{
  "success": true,
  "data": {
    "users": { "total": 340, "active": 312 },
    "pendingRegistrations": 5,
    "foxesInCirculation": 1250000,
    "quizScheduledToday": true,
    "pendingShopOrders": 3
  }
}
```

### `GET /api/admin/registrations?status=pending&limit=20&offset=0`
> Ответ **не** обёрнут в `data` — поля `requests`/`total` на верхнем уровне.
```json
{
  "success": true,
  "requests": [
    {
      "id": "r1...", "full_name": "Сидоров Сидор", "phone": "77009998877", "grade": "9B",
      "status": "pending", "reviewed_by": null, "reviewed_at": null, "reject_reason": null,
      "created_at": "2026-08-20T10:00:00.000Z"
    }
  ],
  "total": 5
}
```

### `POST /api/admin/registrations/:id/approve`
Создаёт пользователя, генерирует пароль, отправляет его на WhatsApp.
200:
```json
{
  "success": true,
  "message": "Заявка одобрена, пользователь создан",
  "data": { "userId": "u9...", "phone": "77009998877", "rawPassword": "A1B2C3D4", "whatsappSent": true }
}
```
Ошибки: `404` — заявка не найдена; `400` — уже обработана; `409` — телефон уже занят другим пользователем.

### `POST /api/admin/registrations/:id/reject`
Body (опционально):
```json
{ "reason": "Некорректные данные" }
```
200:
```json
{ "success": true, "message": "Заявка отклонена" }
```

### `GET /api/admin/users?search=&status=&role=&limit=20&offset=0`
`status`: `pending|active|blocked`, `role`: `student|admin`. Ответ **не** обёрнут в `data`.
```json
{
  "success": true,
  "users": [
    {
      "id": "u1...", "phone": "77001234567", "full_name": "Иванов Иван", "grade": "10A",
      "role": "student", "status": "active", "foxes": 1240, "exp": 3200, "level": 6,
      "created_at": "2026-01-10T08:00:00.000Z", "last_login_at": "2026-08-21T09:00:00.000Z"
    }
  ],
  "total": 340
}
```

### `POST /api/admin/users`
Создать пользователя напрямую (минуя заявку), пароль генерируется и уходит на WhatsApp.
Body:
```json
{ "full_name": "Новый Студент", "phone": "77005554433", "grade": "11A" }
```
201:
```json
{
  "success": true,
  "message": "Пользователь создан",
  "data": { "userId": "u10...", "phone": "77005554433", "rawPassword": "F3E2D1C0", "whatsappSent": true }
}
```
Ошибки: `409` — телефон уже занят.

### `PATCH /api/admin/users/:id/status`
Body:
```json
{ "status": "blocked" }
```
`status`: `"active" | "blocked"`.
200:
```json
{ "success": true, "data": { "id": "u1...", "phone": "77001234567", "full_name": "Иванов Иван", "status": "blocked" } }
```
Ошибки: `404` — пользователь не найден.

### `POST /api/admin/users/:id/grant-foxes`
Body:
```json
{ "amount": 500, "description": "Приз за конкурс" }
```
`amount` — целое число, может быть отрицательным (списание). `description` опционален.
200:
```json
{ "success": true, "data": { "success": true, "newBalance": 1740, "previousBalance": 1240, "change": 500 } }
```
Ошибки: `400 INSUFFICIENT_FUNDS` — если списание уводит баланс в минус.

### `POST /api/admin/users/:id/grant-exp`
Body:
```json
{ "amount": 300, "description": "Бонус за активность" }
```
`amount` — целое число ≥ 0.
200:
```json
{
  "success": true,
  "data": { "success": true, "newExp": 3500, "previousExp": 3200, "newLevel": 7, "previousLevel": 6, "leveledUp": true }
}
```

### `POST /api/admin/users/:id/reset-password`
200:
```json
{ "success": true, "message": "Пароль сброшен и отправлен на WhatsApp", "data": { "rawPassword": "G7H8I9J0", "whatsappSent": true } }
```

### `GET /api/admin/quiz/questions?category=&limit=20&offset=0`
200:
```json
{
  "success": true,
  "data": [
    {
      "id": "q1...", "question": "Что такое алгоритм?",
      "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
      "correct": "a", "category": "IT", "difficulty": "medium",
      "is_active": true, "created_by": "admin-uuid", "created_at": "2026-01-10T08:00:00.000Z"
    }
  ]
}
```

### `POST /api/admin/quiz/questions`
Body:
```json
{
  "question": "Столица Казахстана?",
  "option_a": "Алматы", "option_b": "Шымкент", "option_c": "Астана", "option_d": "Актобе",
  "correct": "c",
  "category": "Казахстан",
  "difficulty": "easy"
}
```
`correct`: `"a" | "b" | "c" | "d"`. `category`/`difficulty` опциональны (`difficulty` по умолчанию `"medium"`).
201: созданный объект вопроса (та же форма, что в списке выше) в `data`.

### `POST /api/admin/quiz/schedule`
Задаёт квиз дня целиком — до 5 вопросов, в переданном порядке. Повторный вызов на ту же дату **полностью заменяет** ранее запланированные вопросы (в т.ч. если пользователи уже на них отвечали — их ответы за прошлый набор остаются в истории, но новый `GET /api/quiz/today` покажет уже новый список).

Body:
```json
{ "quiz_date": "2026-08-25", "question_ids": ["q1...", "q2...", "q3...", "q4...", "q5..."] }
```
`quiz_date`: `YYYY-MM-DD`. `question_ids`: массив от 1 до 5 ID вопросов, порядок = порядок показа (`position`).

200:
```json
{
  "success": true,
  "data": [
    { "id": "sch1...", "question_id": "q1...", "quiz_date": "2026-08-25T00:00:00.000Z", "position": 1 },
    { "id": "sch2...", "question_id": "q2...", "quiz_date": "2026-08-25T00:00:00.000Z", "position": 2 }
  ]
}
```

### `POST /api/admin/shop/items`
Body:
```json
{
  "name": "Powerbank",
  "description": "20000 mAh",
  "image_url": "https://.../powerbank.png",
  "price_foxes": 15000,
  "whatsapp_link": "https://wa.me/77001112233",
  "category": "Техника"
}
```
Обязательны только `name`, `price_foxes` (≥1). 201: созданный товар в `data`.

### `PUT /api/admin/shop/items/:id`
**Частичное обновление** — присылай только те поля, которые меняешь, остальные останутся прежними.
Body (пример):
```json
{ "price_foxes": 12000, "is_active": false }
```
200: обновлённый товар в `data`. Ошибки: `404` — товар не найден.

### `POST /api/admin/skins`
Body:
```json
{
  "category_id": "c1...",
  "name": "Синяя куртка",
  "description": null,
  "image_url": "https://.../skin2.png",
  "price_foxes": 800,
  "level_req": 5,
  "exp_bonus": 0
}
```
Обязательны `category_id`, `name`, `price_foxes` (≥0). `level_req` по умолчанию `1`, `exp_bonus` по умолчанию `0` (EXP, начисляемый пользователю при покупке — см. описание в разделе «Скины» выше). 201: созданный скин в `data`.

### `PUT /api/admin/skins/:id`
**Частичное обновление**, как и для товаров.
Body (пример):
```json
{ "is_active": false }
```
200: обновлённый скин в `data`. Ошибки: `404` — скин не найден.

### `PATCH /api/admin/house-levels/:level/price`
Задаёт цену покупки уровня за FOX (см. `POST /api/house-levels/buy-next` в разделе «Лидерборд и уровни домов»). `:level` — номер уровня (1–50), для которого настраивается цена его покупки (то есть цена перехода `level-1 → level`).

Body:
```json
{ "price_foxes": 800 }
```
Передай `price_foxes: null`, чтобы снова сделать уровень непокупаемым (только через EXP):
```json
{ "price_foxes": null }
```
200: обновлённая строка уровня (`{ level, name, exp_required, image_url, description, price_foxes }`) в `data`. Ошибки: `404` — уровня с таким номером нет.

---

## 🎮 Игровая механика

| Действие | FOX | EXP |
|----------|-----|-----|
| Daily Quiz — 1 вопрос, верный ответ | +100 (`DAILY_QUIZ_FOX_REWARD`) | +50 |
| Daily Quiz — 1 вопрос, неверный ответ | +10 | +10 |
| Мини-игра «Сбор Фоксов» | +30 | +15 |
| Остальные мини-игры | +20 | +10 |
| **Дневной лимит FOX за игры** | **100** (`DAILY_GAMES_FOX_LIMIT`) | ∞ |

> Квиз дня — до 5 вопросов, награда начисляется за **каждый** отдельно (не только за первый) — то есть за полностью пройденный квиз с верными ответами можно получить до 500 FOX / 250 EXP в день. Это отдельно от лимита FOX за мини-игры. Суммы регулируются через `DAILY_QUIZ_FOX_REWARD`/`quizWrongFoxReward`/`quizCorrectExpReward`/`quizWrongExpReward` — если 500 FOX/день за квиз многовато для экономики, уменьшите `DAILY_QUIZ_FOX_REWARD` в `.env`.

- Уровни домов 1–50 растут по EXP (см. `GET /api/house-levels`); следующий уровень (только следующий, без пропусков) можно докупить за FOX через `POST /api/house-levels/buy-next`, если админ задал ему цену (`PATCH /api/admin/house-levels/:level/price`) — по умолчанию у всех уровней цены нет, только через EXP.
- Некоторые скины дают разовый EXP-бонус при покупке (`exp_bonus` в `GET /api/skins`) — например, «+3 к уровню» в макете реализовано как эквивалентное количество EXP, а не прямая установка уровня, чтобы прогресс не расходился с формулой уровней.
- Лидерборд — топ-100 по EXP, сбрасывается 1-го числа месяца (снапшот сохраняется).
- WhatsApp (UltraMsg) — уведомления при одобрении/отклонении заявки и заказе из магазина; в `development` только логируются.

---

## 🚀 Готовность к продакшену

Что уже сделано в коде для деплоя и роста нагрузки:

- **Graceful shutdown** — `SIGTERM`/`SIGINT` закрывают HTTP-сервер и пул БД корректно (важно для zero-downtime деплоя на Docker/K8s/Railway/Render).
- **`GET /api/health`** — проверяет не только процесс, но и доступность БД (`db: "up" | "down"`, `503` при недоступности) — используй как readiness/liveness probe.
- **`trust proxy`** включён — корректная работа за reverse proxy/балансировщиком (иначе rate-limit и IP в логах будут привязаны к IP прокси, а не клиента).
- **Транзакционная целостность кошелька** — начисление FOX/EXP защищено `SELECT ... FOR UPDATE`; начисление за мини-игры атомарно обёрнуто в одну транзакцию с проверкой дневного лимита, гонки при параллельных запросах исключены.
- **Refresh-токены хранятся хэшированными** (SHA-256) — утечка БД не даёт готовых рабочих сессий.
- Обработчики `unhandledRejection`/`uncaughtException` — ошибки логируются вместо тихого падения процесса.

Что нужно сделать руками перед деплоем:

1. **Сгенерировать новые `JWT_SECRET`/`REFRESH_TOKEN_SECRET`/`ADMIN_SECRET_KEY`** для продакшн-окружения (те, что в текущем `.env`, годятся только для локальной разработки).
2. **Задать `ALLOWED_ORIGINS`** — иначе в `NODE_ENV=production` CORS заблокирует все запросы с фронтенда.
3. **Ротировать пароль от Supabase БД**, если `.env`/`.env.example` когда-либо публиковались или расшаривались — они содержали боевой пароль в открытом виде.
4. Для деплоя в несколько инстансов (горизонтальное масштабирование): используй Supabase connection pooler (порт `6543`) вместо прямого подключения (`5432`) — иначе `N инстансов × 20 соединений` может упереться в лимит БД. Также учти, что `express-rate-limit` сейчас хранит счётчики в памяти процесса — при нескольких инстансах лимиты не общие между ними (на старте это некритично, но при горизонтальном масштабировании стоит перейти на общий store, например Redis).
5. Убедиться, что `npm run migrate` прогнан на целевой БД перед первым запуском.

---

## 🗂 Структура проекта

```
src/
├── config/           — конфиг (валидация обязательных env), пул подключений к БД
├── constants/        — статусы, типы транзакций
├── domain/           — иерархия AppError (NotFoundError, ConflictError, ...)
├── shared/           — логгер
├── repositories/      — весь SQL, бизнес-логика о нём не знает
├── services/          — бизнес-логика, бросает domain-ошибки
├── controllers/        — req → service → res, без логики
├── routes/            — auth.js, app.js, admin.js
├── validators/         — express-validator схемы
├── middleware/          — auth, admin-guard, validate, error handler, asyncHandler
├── jobs/               — cron: снапшот лидерборда, автовыбор квиза дня, чистка токенов
├── db/                 — migrate.js, seed.js
└── index.js             — точка входа
```
