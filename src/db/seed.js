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
    const pricePerLevel = [
      0, 100, 150, 150, 150, 150, 200, 200, 200, 200,
      250, 250, 300, 300, 350, 350, 400, 450, 450, 500,
      550, 600, 650, 700, 750, 800, 850, 950, 1000, 1100,
      1200, 1300, 1400, 1550, 1650, 1800, 1950, 2100, 2250, 2450,
      2650, 2900, 3150, 3400, 3650, 4000, 4300, 4750, 5050, 5450,
    ];
    for (let i = 1; i <= 50; i++) {
      await client.query(`
        INSERT INTO house_levels (level, name, exp_required, price_foxes)
        VALUES ($1, $2, $3, $4) ON CONFLICT (level) DO NOTHING
      `, [i, houseNames[i - 1], expPerLevel[i - 1], pricePerLevel[i - 1]]);
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

    // ── Shop Items ──────────────────────────────────────────
    // Витрина по макету: ровно 12 товаров, порядок и цены — из правок дизайна.
    //
    // Раньше товары вставлялись без ON CONFLICT, и каждый повторный запуск
    // seed'а добавлял ещё один комплект — отсюда «повторяются карточки».
    // Теперь сначала гасим ВСЁ, что сейчас в витрине, а потом поднимаем
    // ровно эти 12 (по названию). Строки не удаляем: на них могут ссылаться
    // оформленные заявки (shop_orders.item_id), а is_active = false просто
    // убирает товар с витрины (см. ShopRepository.findActiveItems).
    const shopItems = [
      { name: 'Iphone',           price: 800000, category: 'Техника',    desc: 'Смартфон Apple iPhone' },
      { name: 'PlayStation 5',    price: 500000, category: 'Техника',    desc: 'Игровая консоль Sony PlayStation 5' },
      { name: 'Instax',           price: 150000, category: 'Техника',    desc: 'Фотоаппарат мгновенной печати Instax' },
      { name: 'Яндекс Станция',   price:  80000, category: 'Техника',    desc: 'Умная колонка Яндекс Станция' },
      { name: 'Наушники Hoco',    price:  60000, category: 'Аксессуары', desc: 'Беспроводные наушники Hoco' },
      { name: 'AirPods Pro',      price:  50000, category: 'Аксессуары', desc: 'Беспроводные наушники Apple AirPods Pro' },
      { name: 'Колонка',          price:  40000, category: 'Аксессуары', desc: 'Портативная беспроводная колонка' },
      { name: 'Шоппер',           price:  30000, category: 'Мерч',       desc: 'Шоппер Booster' },
      { name: 'Кепка',            price:  15000, category: 'Мерч',       desc: 'Кепка Booster' },
      { name: 'Термос/Бутылка',   price:  10000, category: 'Мерч',       desc: 'Термос-бутылка Booster' },
      { name: 'Блокнот',          price:  10000, category: 'Мерч',       desc: 'Блокнот Booster' },
      { name: 'Значок',           price:   7000, category: 'Мерч',       desc: 'Значок Booster' },
    ];

    await client.query('UPDATE shop_items SET is_active = false');
    for (let i = 0; i < shopItems.length; i++) {
      const item = shopItems[i];
      // Если товар с таким названием уже был — обновляем его (самый старый
      // экземпляр), лишние дубликаты остаются погашенными
      const { rowCount } = await client.query(`
        UPDATE shop_items
        SET description = $2, price_foxes = $3, category = $4, sort_order = $5, is_active = true
        WHERE id = (SELECT id FROM shop_items WHERE name = $1 ORDER BY created_at LIMIT 1)
      `, [item.name, item.desc, item.price, item.category, i + 1]);
      if (rowCount === 0) {
        await client.query(`
          INSERT INTO shop_items (id, name, description, price_foxes, category, sort_order, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `, [uuidv4(), item.name, item.desc, item.price, item.category, i + 1]);
      }
    }
    console.log('✅ Shop items seeded (12 товаров, дубликаты погашены)');

    // ── Дубликаты образов ───────────────────────────────────
    // В гардеробе показывался 31 образ вместо 30: первый образ был
    // заведён дважды. Строки не удаляем (на них ссылается user_skins),
    // а гасим все повторы с тем же названием, кроме самого раннего.
    const { rowCount: dupSkins } = await client.query(`
      UPDATE skins s SET is_active = false
      WHERE s.is_active = true
        AND EXISTS (
          SELECT 1 FROM skins older
          WHERE older.name = s.name
            AND older.is_active = true
            AND (older.created_at, older.id) < (s.created_at, s.id)
        )
    `);
    console.log(`✅ Дубликаты образов погашены: ${dupSkins}`);

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
