require('dotenv').config();
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding database...');

    // ── Admin user ──────────────────────────────────────────
    const adminPasswordHash = await bcrypt.hash('Admin2025!', 12);
    await client.query(`
      INSERT INTO users (id, login, password_hash, full_name, grade, role, status, foxes, exp, level)
      VALUES ($1, '77000000000', $2, 'Администратор', 'admin', 'admin', 'active', 0, 0, 1)
      ON CONFLICT (login) DO NOTHING
    `, [uuidv4(), adminPasswordHash]);
    console.log('✅ Admin user created (login: 77000000000, pass: Admin2025!)');

    // ── Skin Categories ─────────────────────────────────────
    const skinCategories = [
      { slug: 'top',        name: 'Верхняя одежда', sort: 1 },
      { slug: 'pants',      name: 'Штаны',          sort: 2 },
      { slug: 'shoes',      name: 'Обувь',          sort: 3 },
      { slug: 'accessories',name: 'Аксессуары',     sort: 4 },
      { slug: 'headwear',   name: 'Головные уборы', sort: 5 },
    ];
    for (const cat of skinCategories) {
      await client.query(`
        INSERT INTO skin_categories (id, slug, name, sort_order)
        VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING
      `, [uuidv4(), cat.slug, cat.name, cat.sort]);
    }
    console.log('✅ Skin categories seeded');

    // ── Skins ───────────────────────────────────────────────
    // Один бесплатный скин на слот (level_req 1, price 0) — как раньше был
    // бесплатный "Базовый" сет в моке, плюс несколько платных на пробу.
    const { rows: catRows } = await client.query('SELECT id, slug FROM skin_categories');
    const catIdBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));
    const skins = [
      { cat: 'top', name: 'Базовая футболка', price: 0, levelReq: 1, exp: 0 },
      { cat: 'top', name: 'Кожаная куртка', price: 500, levelReq: 3, exp: 0 },
      { cat: 'top', name: 'Худи', price: 300, levelReq: 2, exp: 0 },
      { cat: 'pants', name: 'Базовые джинсы', price: 0, levelReq: 1, exp: 0 },
      { cat: 'pants', name: 'Спортивные штаны', price: 250, levelReq: 2, exp: 0 },
      { cat: 'shoes', name: 'Базовые кроссовки', price: 0, levelReq: 1, exp: 0 },
      { cat: 'shoes', name: 'Кроссовки Air', price: 400, levelReq: 3, exp: 0 },
      { cat: 'accessories', name: 'Солнечные очки', price: 300, levelReq: 2, exp: 0 },
      { cat: 'accessories', name: 'Наушники', price: 500, levelReq: 4, exp: 0 },
      { cat: 'headwear', name: 'Кепка', price: 350, levelReq: 2, exp: 0 },
      { cat: 'headwear', name: 'Корона', price: 1000, levelReq: 5, exp: 300 },
    ];
    const { rows: [{ count: existingSkins }] } = await client.query('SELECT COUNT(*) FROM skins');
    if (Number(existingSkins) === 0) {
      for (const sk of skins) {
        await client.query(`
          INSERT INTO skins (id, category_id, name, price_foxes, level_req, exp_bonus)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [uuidv4(), catIdBySlug[sk.cat], sk.name, sk.price, sk.levelReq, sk.exp]);
      }
      console.log('✅ Skins seeded');
    } else {
      console.log('↷ Skins already present, skipped');
    }

    // ── Mini Games ──────────────────────────────────────────
    // 10 FOX за игру, лимит 100 FOX/день (DAILY_GAMES_FOX_LIMIT) = максимум 10 засчитанных игр в день.
    // 'runner' помечен is_active=false — в интерфейсе он показан как "Скоро", ещё не готов.
    const games = [
      { slug: 'maze',        name: 'Лабиринт',   fox: 10, exp: 10, active: true },
      { slug: 'memory',      name: 'Память',      fox: 10, exp: 10, active: true },
      { slug: 'math-sprint', name: 'Матеспринт',  fox: 10, exp: 10, active: true },
      { slug: '2048',        name: '2048',        fox: 10, exp: 10, active: true },
      { slug: 'puzzle',      name: 'Пазл',        fox: 10, exp: 10, active: true },
      { slug: 'runner',      name: 'Забег',       fox: 10, exp: 10, active: false },
    ];
    for (const g of games) {
      await client.query(`
        INSERT INTO mini_games (id, slug, name, fox_reward, exp_reward, is_active)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING
      `, [uuidv4(), g.slug, g.name, g.fox, g.exp, g.active]);
    }
    console.log('✅ Mini games seeded');

    // ── House Levels 1–50 ───────────────────────────────────
    // EXP formula: level N requires N * 500 EXP total (like Clash Royale trophies)
    const expPerLevel = [
      0, 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 11700,
      14000, 16500, 19200, 22100, 25200, 28500, 32000, 35700, 39600, 43700,
      48000, 52500, 57200, 62100, 67200, 72500, 78000, 83700, 89600, 95700,
      102000, 108500, 115200, 122100, 129200, 136500, 144000, 151700, 159600, 167700,
      176000, 184500, 193200, 202100, 211200, 220500, 230000, 239700, 249600, 259700
    ];
    const houseNames = [
      'Шалаш', 'Палатка', 'Избушка', 'Домик', 'Бунгало',
      'Коттедж', 'Таунхаус', 'Вилла', 'Особняк', 'Дача',
      'Резиденция', 'Замок', 'Дворец', 'Башня', 'Цитадель',
      'Форт', 'Крепость', 'Замок Лис', 'Дворец Лис', 'Академия',
      'Институт', 'Университет', 'Технопарк', 'Бизнес-центр', 'Небоскрёб',
      'Небоскрёб Лис', 'Мегатауэр', 'Звёздный Форт', 'Лунная База', 'Орбита',
      'Космостанция', 'Космическая Крепость', 'Звёздная Цитадель', 'Галактический Дом', 'Туманность',
      'Планета Лис', 'Звезда', 'Чёрная Дыра', 'Квазар', 'Суперкластер',
      'Вселенная Лис', 'Мультивселенная', 'Измерение Лис', 'Бесконечность', 'Легенда',
      'Мифос', 'Бог Лис', 'Избранный', 'Мастер Лис', 'Чемпион Booster',
    ];
    for (let i = 1; i <= 50; i++) {
      await client.query(`
        INSERT INTO house_levels (level, name, exp_required)
        VALUES ($1, $2, $3) ON CONFLICT (level) DO NOTHING
      `, [i, houseNames[i - 1], expPerLevel[i - 1]]);
    }
    console.log('✅ 50 house levels seeded');

    // ── Sample Quiz Questions ───────────────────────────────
    const questions = [
      {
        q: 'Что такое алгоритм?',
        a: 'Пошаговая инструкция для решения задачи',
        b: 'Язык программирования',
        c: 'Операционная система',
        d: 'База данных',
        correct: 'a', category: 'IT'
      },
      {
        q: 'Сколько байт в одном килобайте (KB)?',
        a: '100', b: '1000', c: '1024', d: '512',
        correct: 'c', category: 'IT'
      },
      {
        q: 'В каком году обрела независимость Республика Казахстан?',
        a: '1989', b: '1990', c: '1991', d: '1992',
        correct: 'c', category: 'Казахстан'
      },
      {
        q: 'Что означает CSS в веб-разработке?',
        a: 'Computer Style System',
        b: 'Cascading Style Sheets',
        c: 'Colorful Style Syntax',
        d: 'Creative Script Style',
        correct: 'b', category: 'IT'
      },
      {
        q: 'Столица Республики Казахстан?',
        a: 'Алматы', b: 'Шымкент', c: 'Астана', d: 'Актобе',
        correct: 'c', category: 'Казахстан'
      },
    ];
    for (const q of questions) {
      await client.query(`
        INSERT INTO quiz_questions (id, question, option_a, option_b, option_c, option_d, correct, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [uuidv4(), q.q, q.a, q.b, q.c, q.d, q.correct, q.category]);
    }
    console.log('✅ Sample quiz questions seeded');

    // ── Sample Shop Items ───────────────────────────────────
    const shopItems = [
      { name: 'iPhone 15 Pro',      price: 80000, category: 'Техника',     desc: 'Смартфон Apple iPhone 15 Pro 256GB' },
      { name: 'PlayStation 5',      price: 50000, category: 'Техника',     desc: 'Игровая консоль Sony PlayStation 5' },
      { name: 'AirPods Pro',        price: 50000, category: 'Аксессуары',  desc: 'Беспроводные наушники Apple AirPods Pro 2' },
      { name: 'ChatGPT Plus 1 мес', price: 60000, category: 'Подписки',    desc: 'Подписка ChatGPT Plus на 1 месяц' },
      { name: 'Netflix 1 мес',      price: 30000, category: 'Подписки',    desc: 'Подписка Netflix на 1 месяц' },
      { name: 'Велосипед',          price: 60000, category: 'Спорт',       desc: 'Горный велосипед 26"' },
      { name: 'Gallup Test',        price: 80000, category: 'Образование', desc: 'Тест Gallup StrengthsFinder' },
      { name: 'Наушники',           price: 40000, category: 'Аксессуары',  desc: 'Беспроводные наушники' },
    ];
    for (const item of shopItems) {
      await client.query(`
        INSERT INTO shop_items (id, name, description, price_foxes, category)
        VALUES ($1, $2, $3, $4, $5)
      `, [uuidv4(), item.name, item.desc, item.price, item.category]);
    }
    console.log('✅ Shop items seeded');

    await client.query('COMMIT');
    console.log('\n🎉 Seed completed!');
    console.log('─────────────────────────────────');
    console.log('Admin: login=77000000000, pass=Admin2025!');
    console.log('─────────────────────────────────');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
