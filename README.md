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

После `seed`: админ `login=77000000000`, `pass=Admin2025!`.

### Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да | Строка подключения к Postgres (Supabase). Порт `:5432` на pooler-хосте = session mode (жёсткий лимит клиентов, на этом проекте — 15, см. чеклист деплоя ниже); порт `:6543` = transaction mode (лимит намного мягче, рекомендуется под нагрузку). |
| `DB_POOL_MAX` | нет (`10`) | Макс. размер пула соединений на один инстанс. Держи ниже лимита клиентов используемого режима pooler'а — иначе `FATAL: max clients reached`. |
| `JWT_SECRET` | да | Секрет для access-токенов. Генерировать: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `ADMIN_SECRET_KEY` | да | Секрет для создания первого админа. |
| `REFRESH_TOKEN_SECRET` | нет (fallback → `JWT_SECRET`) | Отдельный секрет для refresh-токенов — рекомендуется задавать отдельно. |
| `JWT_EXPIRES_IN` | нет (`30d`) | TTL access-токена. Намеренно долгий — дети не помнят пароли и приложение может не успевать сделать silent-refresh вовремя, поэтому сессия живёт долго сама по себе. |
| `REFRESH_TOKEN_EXPIRES_IN` | нет (`30d`) | TTL refresh-токена. |
| `PORT` | нет (`3000`) | Порт HTTP-сервера. |
| `NODE_ENV` | нет (`development`) | Режим окружения. |
| `ALLOWED_ORIGINS` | нет | CSV доменов фронтенда. **В `production` без этой переменной CORS блокирует все запросы** — обязательно задать перед деплоем. |
| `ENTRY_BONUS_FOX` | нет (`200`) | Разовый FOX-бонус при первом входе в приложение (см. `POST /api/auth/login`). |
| `QUIZ_CORRECT_FOX_REWARD` | нет (`20`) | FOX за верный ответ одного вопроса квиза дня. При 5 вопросах/день — максимум 100 FOX/день с квиза. |
| `QUIZ_WRONG_FOX_REWARD` | нет (`0`) | FOX за неверный ответ. |
| `QUIZ_CORRECT_EXP_REWARD` | нет (`50`) | EXP за верный ответ одного вопроса. |
| `QUIZ_WRONG_EXP_REWARD` | нет (`10`) | EXP за неверный ответ. |
| `DAILY_GAMES_FOX_LIMIT` | нет (`100`) | Дневной лимит FOX за мини-игры (при 10 FOX/игру — максимум 10 засчитанных игр в день). |

---

## 🔑 Аутентификация

```
Authorization: Bearer <accessToken>
```

- **Access token** — 30 дней (`JWT_EXPIRES_IN`), кладётся в заголовок каждого защищённого запроса.
- **Refresh token** — 30 дней (`REFRESH_TOKEN_EXPIRES_IN`), хранится на клиенте отдельно, используется только для `/api/auth/refresh`. Ротируется на каждый refresh (старый инвалидируется).
- Роуты помечены 🔒 — требуют `Authorization`; 🔒👑 — требуют ещё и роль `admin` (`status: active`, `role: admin`).
- Просроченный access-токен вернёт `401` с `code: "TOKEN_EXPIRED"` — по этому коду фронт должен молча дёрнуть `/api/auth/refresh` и повторить запрос.

### Модель логина: у ребёнка нет своего телефона

Регистрация собирает данные **родителя**, а не телефон ребёнка — у детей его обычно нет. Поэтому логин для входа в игру — это **сгенерированный на бэкенде код** (8 цифр, например `68664666`), а не телефон. Полный флоу:

1. Родитель (или ребёнок с его данными) отправляет заявку — `POST /api/auth/register` с 4 полями: ФИО ребёнка, класс, имя родителя, телефон родителя. Заявка уходит «на модерацию» (`status: pending`).
2. Куратор смотрит очередь заявок в админке (`GET /api/admin/registrations`) и одобряет (`POST /api/admin/registrations/:id/approve`).
3. При одобрении бэкенд **автоматически генерирует и логин, и пароль** и отдаёт их куратору прямо в ответе запроса. Автоотправки никуда нет (ни WhatsApp, ни email) — куратор сам пересылает их на WhatsApp родителя (телефон родителя есть в том же ответе).
4. Ребёнок входит в игру через `POST /api/auth/login` этой парой `{ login, password }`.

Итог: `login` — непрозрачный сгенерированный идентификатор (не телефон, не имеет отношения к телефону родителя), уникален на `users`. `parent_phone`/`parent_name` хранятся отдельно как контакт для связи, не как учётные данные — по ним можно найти ученика в поиске (`GET /api/admin/users?search=`), но войти по ним нельзя.

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
  "errors": [{ "field": "parent_phone", "message": "Неверный номер телефона родителя" }]
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
| 409 | `CONFLICT` | Дубликат (заявка на этого ученика уже отправлена, скин уже куплен, уже отвечено сегодня) |
| 422 | `VALIDATION_ERROR` | Не прошла валидация тела/параметров запроса |
| 500 | — | Внутренняя ошибка сервера |

---

## 📡 Auth — `/api/auth` (публичные, если не указано иначе)

### `POST /api/auth/register`
Заявка на регистрацию — уходит в очередь на одобрение куратору. Логин ребёнка на этом шаге не запрашивается и не существует — он появится только после одобрения (см. «Модель логина» выше).

Body:
```json
{ "full_name": "Иванов Иван Иванович", "grade": "10A", "parent_name": "Иванова Мария Петровна", "parent_phone": "+77001234567", "is_booster_student": true }
```
| Поле | Тип | Обязательно |
|---|---|---|
| full_name | string | да — ФИО ребёнка |
| grade | string | да — класс обучения |
| parent_name | string | да — имя родителя |
| parent_phone | string (любой формат телефона) | да — телефон родителя, на него куратор пришлёт логин/пароль |
| is_booster_student | boolean | да — ответ на экран «Вы ученик Booster?» перед отправкой; заявка уходит на модерацию в любом случае (и на `true`, и на `false`) — поле только помечает её для куратора в очереди (`GET /api/admin/registrations`), не блокирует регистрацию |

201:
```json
{
  "success": true,
  "message": "Заявка отправлена. Администратор рассмотрит её и передаст логин и пароль куратору.",
  "requestId": "5e2a1e0a-1b1a-4c9e-9f0a-3a0f6c1e2b10"
}
```
Ошибки: `409` — заявка на этого ребёнка (то же ФИО + телефон родителя) уже отправлена и ещё не рассмотрена.

---

### `GET /api/auth/registration-status/:id`
Публичный (без токена) опрос статуса заявки — для экрана ожидания «одобрили меня?». `:id` — это `requestId` из ответа `POST /api/auth/register`. Пароль сюда не приходит — логин и пароль куратор получает в ответе `POST /api/admin/registrations/:id/approve` и передаёт ученику сам (автоотправки нет).

200:
```json
{ "success": true, "data": { "status": "pending", "rejectReason": null } }
```
`status`: `"pending" | "approved" | "rejected"`. `rejectReason` заполнен только при `"rejected"`, иначе `null`.

Ошибки: `404` — заявки с таким ID не существует; `422` — `:id` не UUID.

---

### `POST /api/auth/login`
При самом первом входе пользователя (у него ещё нет `last_login_at`) автоматически начисляется разовый бонус `ENTRY_BONUS_FOX` (по умолчанию 200 FOX) — `foxes` в ответе уже учитывает этот бонус. При всех последующих входах ничего не начисляется.

Body:
```json
{ "login": "68664666", "password": "Admin2025!" }
```
`login` — сгенерированный логин из ответа `POST /api/admin/registrations/:id/approve` (не телефон). У сид-админа `login` для примера равен `77000000000` — это просто зафиксированное сид-значение, не признак того, что логин обязан выглядеть как телефон.

200:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b3f1...",
      "login": "68664666",
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
    "login": "68664666",
    "full_name": "Иванов Иван Иванович",
    "grade": "10A",
    "foxes": 1240,
    "exp": 3200,
    "level": 6,
    "house_level": 3,
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
        "foxesEarned": 20,
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
    "foxesEarned": 20,
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
> При неверном ответе `foxesEarned: 0` по умолчанию (`QUIZ_WRONG_FOX_REWARD`) — в этом случае `newFoxesBalance` в ответе будет `null`/отсутствовать (баланс FOX не менялся), а `newExp`/`newLevel` всё равно приходят, т.к. EXP за неверный ответ начисляется.

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
        "slug": "maze",
        "name": "Лабиринт",
        "description": null,
        "icon_url": null,
        "is_active": true,
        "fox_reward": 10,
        "exp_reward": 10,
        "created_at": "2026-01-10T08:00:00.000Z"
      }
    ],
    "dailyFoxesEarned": 70,
    "dailyFoxesLimit": 100,
    "dailyFoxesRemaining": 30
  }
}
```
> `fox_reward` одинаков (10) у всех мини-игр по умолчанию — при лимите 100 FOX/день это ровно 10 засчитанных игр в день, дальше играть можно, но FOX не начисляется.

Текущий каталог (`slug` → название): `maze` — Лабиринт, `memory` — Память, `math-sprint` — Матеспринт, `2048` — 2048, `puzzle` — Пазл, `runner` — Забег (`is_active: false`, в интерфейсе показан как «Скоро» — не возвращается этим эндпоинтом, пока не включат).

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
    "foxesEarned": 10,
    "expEarned": 10,
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
    "newHouseLevel": 2,
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
      "id": "r1...", "full_name": "Сидоров Сидор", "grade": "9B",
      "parent_name": "Сидорова Анна", "parent_phone": "77009998877", "is_booster_student": true,
      "status": "pending", "reviewed_by": null, "reviewed_at": null, "reject_reason": null,
      "created_at": "2026-08-20T10:00:00.000Z"
    }
  ],
  "total": 5
}
```

### `POST /api/admin/registrations/:id/approve`
Создаёт пользователя, **генерирует и логин, и пароль**. Автоотправки никуда нет — оба значения возвращаются прямо в ответе вместе с контактом родителя, куратор сам пересылает их на WhatsApp `parentPhone`.
200:
```json
{
  "success": true,
  "message": "Заявка одобрена, пользователь создан",
  "data": {
    "userId": "u9...",
    "login": "68664666",
    "rawPassword": "A1B2C3D4",
    "parentName": "Сидорова Анна",
    "parentPhone": "77009998877"
  }
}
```
Ошибки: `404` — заявка не найдена; `400` — уже обработана.

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
`status`: `pending|active|blocked`, `role`: `student|admin`. `search` ищет по ФИО ребёнка, логину и телефону родителя. Ответ **не** обёрнут в `data`.
```json
{
  "success": true,
  "users": [
    {
      "id": "u1...", "login": "68664666", "full_name": "Иванов Иван", "grade": "10A",
      "role": "student", "status": "active", "foxes": 1240, "exp": 3200, "level": 6,
      "parent_name": "Иванова Мария", "parent_phone": "77001234567",
      "created_at": "2026-01-10T08:00:00.000Z", "last_login_at": "2026-08-21T09:00:00.000Z"
    }
  ],
  "total": 340
}
```

### `POST /api/admin/users`
Создать пользователя напрямую (минуя заявку/модерацию) — например, для тестовых аккаунтов. Логин и пароль генерируются так же, как при одобрении заявки, и возвращаются в ответе.
Body:
```json
{ "full_name": "Новый Студент", "grade": "11A", "parent_name": "Петров Пётр", "parent_phone": "77005554433" }
```
201:
```json
{
  "success": true,
  "message": "Пользователь создан",
  "data": {
    "userId": "u10...", "login": "40218857", "rawPassword": "F3E2D1C0",
    "parentName": "Петров Пётр", "parentPhone": "77005554433"
  }
}
```

### `PATCH /api/admin/users/:id/status`
Body:
```json
{ "status": "blocked" }
```
`status`: `"active" | "blocked"`.
200:
```json
{ "success": true, "data": { "id": "u1...", "login": "68664666", "full_name": "Иванов Иван", "status": "blocked" } }
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
Генерирует новый пароль и разлогинивает все устройства пользователя (удаляет все refresh-токены). Пароль возвращается в ответе — куратор передаёт его ученику сам.
200:
```json
{ "success": true, "message": "Пароль сброшен", "data": { "login": "68664666", "rawPassword": "G7H8I9J0" } }
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
| Первый вход в приложение (разово) | +200 (`ENTRY_BONUS_FOX`) | — |
| Daily Quiz — 1 вопрос, верный ответ | +20 (`QUIZ_CORRECT_FOX_REWARD`) | +50 |
| Daily Quiz — 1 вопрос, неверный ответ | +0 (`QUIZ_WRONG_FOX_REWARD`) | +10 |
| Мини-игра (любая, за одну засчитанную игру) | +10 | зависит от игры (`mini_games.exp_reward`) |
| **Дневной лимит FOX за игры** | **100** (`DAILY_GAMES_FOX_LIMIT`) — т.е. максимум 10 засчитанных игр в день | ∞ |

> Квиз дня — до 5 вопросов, награда начисляется за **каждый** отдельно — при 5 верных ответах в день выходит максимум 100 FOX / 250 EXP. Это отдельно от лимита FOX за мини-игры. Суммы регулируются через `QUIZ_CORRECT_FOX_REWARD`/`QUIZ_WRONG_FOX_REWARD`/`QUIZ_CORRECT_EXP_REWARD`/`QUIZ_WRONG_EXP_REWARD` в `.env`.

- **Два разных уровня, не путать:**
  - `users.level` — уровень **персонажа**. Производная от EXP (квизы, игры, `exp_bonus` скинов и домов). Показывается в бейдже и лидерборде.
  - `users.house_level` — уровень **дома** на карте. Растёт ТОЛЬКО покупкой за FOX через `POST /api/house-levels/buy-next` (по одному, без пропусков). Задаёт фон главного экрана и прогресс карты уровней; `GET /api/me/house` отдаёт именно его.

  Раньше это было одно число, и любое начисление EXP (даже пройденный квиз) переселяло игрока в следующий дом — по дизайну игры так быть не должно.
- Покупка дома, кроме самого дома, даёт ещё и уровни персонажа: столбец «Прибавка к уровню» листа «Дом» (`house_levels.level_bonus`) переводится в EXP тем же курсом, что и у скинов — 1 уровень ≈ 500 EXP.
- Некоторые скины дают разовый EXP-бонус при покупке (`exp_bonus` в `GET /api/skins`) — например, «+3 к уровню» в макете реализовано как эквивалентное количество EXP, а не прямая установка уровня, чтобы прогресс не расходился с формулой уровней.
- Лидерборд — топ-100 по EXP, сбрасывается 1-го числа месяца (снапшот сохраняется).
- Автоотправки логина/пароля никуда нет (не WhatsApp, не email) — они возвращаются в ответе админских эндпоинтов (`approve`, `POST /api/admin/users`, `reset-password`), куратор передаёт их ученику вручную.

---

## 🚀 Готовность к продакшену

Что уже сделано в коде для деплоя и роста нагрузки:

- **Graceful shutdown** — `SIGTERM`/`SIGINT` закрывают HTTP-сервер и пул БД корректно (важно для zero-downtime деплоя на Docker/K8s/Railway/Render).
- **`GET /api/health`** — проверяет не только процесс, но и доступность БД (`db: "up" | "down"`, `503` при недоступности) — используй как readiness/liveness probe.
- **`trust proxy`** включён — корректная работа за reverse proxy/балансировщиком (иначе rate-limit и IP в логах будут привязаны к IP прокси, а не клиента).
- **Транзакционная целостность кошелька** — начисление FOX/EXP защищено `SELECT ... FOR UPDATE`; квиз, мини-игры, покупки скинов/товаров/уровней дома атомарно обёрнуты в одну транзакцию каждая. Дневной лимит FOX за игры проверен стресс-тестом — 30 параллельных запросов от одного пользователя не превысили лимит ни на FOX.
- **Refresh-токены хранятся хэшированными** (SHA-256) — утечка БД не даёт готовых рабочих сессий.
- Обработчики `unhandledRejection`/`uncaughtException` — ошибки логируются вместо тихого падения процесса.

Что нужно сделать руками перед деплоем:

1. **Сгенерировать новые `JWT_SECRET`/`REFRESH_TOKEN_SECRET`/`ADMIN_SECRET_KEY`** для продакшн-окружения (те, что в текущем `.env`, годятся только для локальной разработки).
2. **Задать `ALLOWED_ORIGINS`** — иначе в `NODE_ENV=production` CORS заблокирует все запросы с фронтенда.
3. **Ротировать пароль от Supabase БД**, если `.env`/`.env.example` когда-либо публиковались или расшаривались — они содержали боевой пароль в открытом виде.
4. **Проверить режим Supabase pooler в `DATABASE_URL`.** Порт `:5432` на `*.pooler.supabase.com` — это session mode с жёстким лимитом одновременных клиентов (эмпирически проверено на этом проекте: лимит **15**, при превышении — `FATAL: max clients reached in session mode`, реальные запросы пользователей начнут падать 500-й ошибкой). `DB_POOL_MAX` (по умолчанию 10) специально держится ниже этого лимита. Порт `:6543` (transaction mode, тот же хост) — конкуррентность гораздо выше за счёт мультиплексирования, наш код полностью совместим (используем только `BEGIN/COMMIT/ROLLBACK` на явно взятом `client`, без сессионных фич вроде `LISTEN/NOTIFY` или advisory locks, которые transaction mode не поддерживает). При переходе на `:6543` можно смело поднимать `DB_POOL_MAX`.
5. Для деплоя в несколько инстансов (горизонтальное масштабирование): каждый инстанс держит свой пул — `N инстансов × DB_POOL_MAX` не должно превышать лимит выбранного режима pooler'а. Также учти, что `express-rate-limit` сейчас хранит счётчики в памяти процесса — при нескольких инстансах лимиты не общие между ними (на старте это некритично, но при горизонтальном масштабировании стоит перейти на общий store, например Redis).
6. Убедиться, что `npm run migrate` прогнан на целевой БД перед первым запуском.

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
