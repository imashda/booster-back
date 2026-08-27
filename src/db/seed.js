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
    // Одна категория на ВСЕ образы: реальные ассеты (assets/outfits/set_1.png…
    // set_30.png) — это цельные картинки персонажа целиком, а не части по
    // слотам (верх/низ/обувь), так что модель "несколько категорий = несколько
    // надетых вещей одновременно" сюда не подходит — один образ и есть весь
    // надетый "скин" (как equip по одной категории и работает на бэке).
    const skinCategories = [
      { slug: 'outfit', name: 'Образы', sort: 1 },
    ];
    for (const cat of skinCategories) {
      await client.query(`
        INSERT INTO skin_categories (id, slug, name, sort_order)
        VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING
      `, [uuidv4(), cat.slug, cat.name, cat.sort]);
    }
    console.log('✅ Skin categories seeded');

    // ── Skins (30 целых образов, картинки — во фронте по slug) ─
    // Названия/цены — из исходного мока (OUTFIT_SETS), levelBonus мока
    // переведён в exp_bonus как levelBonus*500 (примерная EXP-цена уровня
    // по таблице house_levels). set_1 бесплатный и без EXP-бонуса — как
    // раньше это был стартовый образ, а не "покупка ради профита".
    const { rows: [outfitCat] } = await client.query(
      "SELECT id FROM skin_categories WHERE slug = 'outfit'"
    );
    const outfitSets = [
      { n: 1,  name: 'Базовый',       price: 0,    levelBonus: 0 },
      { n: 2,  name: 'Королевский',   price: 100,  levelBonus: 1 },
      { n: 3,  name: 'Фермер',        price: 150,  levelBonus: 1 },
      { n: 4,  name: 'Спасатель',     price: 150,  levelBonus: 1 },
      { n: 5,  name: 'Кэжуал',        price: 150,  levelBonus: 1 },
      { n: 6,  name: 'Летний',        price: 200,  levelBonus: 1 },
      { n: 7,  name: 'Агент',         price: 200,  levelBonus: 1 },
      { n: 8,  name: 'Баскетболист',  price: 250,  levelBonus: 1 },
      { n: 9,  name: 'Футболист',     price: 250,  levelBonus: 1 },
      { n: 10, name: 'Спортсмен',     price: 300,  levelBonus: 2 },
      { n: 11, name: 'Деловой',       price: 350,  levelBonus: 2 },
      { n: 12, name: 'Уличный',       price: 400,  levelBonus: 2 },
      { n: 13, name: 'Чемпион',       price: 450,  levelBonus: 2 },
      { n: 14, name: 'Художник',      price: 500,  levelBonus: 2 },
      { n: 15, name: 'Новогодний',    price: 550,  levelBonus: 2 },
      { n: 16, name: 'Пилот',         price: 650,  levelBonus: 2 },
      { n: 17, name: 'Капитан',       price: 700,  levelBonus: 2 },
      { n: 18, name: 'Фотограф',      price: 800,  levelBonus: 3 },
      { n: 19, name: 'Детектив',      price: 900,  levelBonus: 3 },
      { n: 20, name: 'Врач',          price: 1050, levelBonus: 3 },
      { n: 21, name: 'Турист',        price: 1200, levelBonus: 3 },
      { n: 22, name: 'Рейнджер',      price: 1350, levelBonus: 3 },
      { n: 23, name: 'Пожарный',      price: 1500, levelBonus: 3 },
      { n: 24, name: 'Гонщик',        price: 1700, levelBonus: 4 },
      { n: 25, name: 'Супергерой',    price: 1900, levelBonus: 4 },
      { n: 26, name: 'Учёный',        price: 2150, levelBonus: 4 },
      { n: 27, name: 'Механик',       price: 2450, levelBonus: 4 },
      { n: 28, name: 'Разведчик',     price: 2800, levelBonus: 4 },
      { n: 29, name: 'Полицейский',   price: 3250, levelBonus: 5 },
      { n: 30, name: 'Легендарный',   price: 3600, levelBonus: 6 },
    ];
    // ON CONFLICT (slug) — идемпотентно per-скин, а не по общему числу строк в
    // таблице: раньше проверка "есть хоть один скин" блокировала весь досев,
    // если в базе уже была хоть одна ЧУЖАЯ запись (например, добавленная
    // вручную через админку), даже если ни одного из наших 30 ещё не было.
    let insertedCount = 0;
    for (const set of outfitSets) {
      const { rowCount } = await client.query(`
        INSERT INTO skins (id, category_id, slug, name, price_foxes, level_req, exp_bonus)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING
      `, [uuidv4(), outfitCat.id, `set_${set.n}`, set.name, set.price, 1, set.levelBonus * 500]);
      insertedCount += rowCount;
    }
    console.log(`✅ Skins seeded (${insertedCount} new, ${outfitSets.length - insertedCount} already present)`);

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
    // Столбец «Прибавка к уровню» листа «Дом»: 1–9 -> +1, 10–19 -> +2, 20–29 -> +3,
    // 30–39 -> +4, 40–49 -> +5, 50 -> +6. Это уровни ПЕРСОНАЖА, не дома.
    const houseLevelBonus = (lvl) => {
      if (lvl >= 50) return 6;
      if (lvl >= 40) return 5;
      if (lvl >= 30) return 4;
      if (lvl >= 20) return 3;
      if (lvl >= 10) return 2;
      return 1;
    };

    // Цена покупки уровня за FOX — столбец «Цена» листа «Дом» таблицы «Игра Booster».
    // Без неё price_foxes оставался NULL, а это на бэке значит «уровень нельзя
    // купить, только заработать EXP»: в игре модалка показывала цену 0 FOX, а
    // покупка падала с 400. Индекс 0 = уровень 1 (стартовый, не покупается).
    const housePrices = [
      0, 100, 150, 150, 150, 150, 200, 200, 200, 200,
      250, 250, 300, 300, 350, 350, 400, 450, 450, 500,
      550, 600, 650, 700, 750, 800, 850, 950, 1000, 1100,
      1200, 1300, 1400, 1550, 1650, 1800, 1950, 2100, 2250, 2450,
      2650, 2900, 3150, 3400, 3650, 4000, 4300, 4750, 5050, 5450,
    ];
    for (let i = 1; i <= 50; i++) {
      // DO UPDATE ... WHERE price_foxes IS NULL — дозаполняем цену на уже
      // засеянных базах, но не затираем то, что админ выставил руками через
      // PATCH /api/admin/house-levels/:level/price.
      await client.query(`
        INSERT INTO house_levels (level, name, exp_required, price_foxes, level_bonus)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (level) DO UPDATE
        SET price_foxes = EXCLUDED.price_foxes, level_bonus = EXCLUDED.level_bonus
        WHERE house_levels.price_foxes IS NULL
      `, [i, houseNames[i - 1], expPerLevel[i - 1], housePrices[i - 1], houseLevelBonus(i)]);
    }
    console.log('✅ 50 house levels seeded (with FOX prices)');

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
