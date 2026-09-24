/**
 * ЛОКАЛЬНЫЙ РЕЖИМ БЕЗ ОБЛАКА:  npm run dev:offline
 *
 * Поднимает бэкенд вместе с базой прямо на этом компьютере — без Supabase,
 * без Railway и без установки PostgreSQL. Нужен, когда облако недоступно
 * (например, не прошла оплата), а игру проверить надо.
 *
 * Как устроено:
 *   - база — PGlite: настоящий PostgreSQL, собранный в WebAssembly, ставится
 *     обычным npm install. Данные лежат в папке .pglite-data и переживают
 *     перезапуск (аккаунт, купленные дома и т.п. сохраняются);
 *   - к базе поднимается сервер на порту 5433, бэкенд подключается к нему
 *     как к обычному PostgreSQL;
 *   - при каждом старте прогоняются migrate и seed — оба безопасны при
 *     повторном запуске, так что база всегда в актуальной схеме;
 *   - затем стартует сам бэкенд на обычном порту (3000).
 *
 * ПОЧЕМУ У БЭКЕНДА ОДНО ПОДКЛЮЧЕНИЕ К БАЗЕ (DB_POOL_MAX=1).
 * PGlite — одна сессия PostgreSQL. Его сервер пропускает запросы разных
 * подключений по одному СООБЩЕНИЮ, а не по одной транзакции: при двух
 * подключениях запрос одного мог бы попасть внутрь чужой транзакции. С одним
 * подключением бэкенд сам выстраивает запросы в очередь, и транзакции не
 * перемешиваются. Проверено полным сценарием игрока, включая покупки
 * параллельно с чтением.
 *
 * Это только для проверки на своём компьютере — данные локальные, с облачной
 * базой не синхронизируются. Аккаунт в этом режиме надо зарегистрировать
 * заново. Остановить — Ctrl+C.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Секреты берём из .env, если они там есть; адрес базы ВСЕГДА локальный —
// иначе dotenv в дочерних процессах подставил бы облачный DATABASE_URL
require('dotenv').config({ path: path.join(ROOT, '.env') });
const DB_PORT = 5433;
const DATA_DIR = path.join(ROOT, '.pglite-data');
process.env.JWT_SECRET ||= 'offline-dev-jwt-secret';
process.env.ADMIN_SECRET_KEY ||= 'offline-dev-admin-secret';
process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
process.env.DB_POOL_MAX = '1';

console.log(`[offline] база: ${DATA_DIR}`);
const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { uuid_ossp, pgcrypto } });
const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 1 });
await dbServer.start();
console.log(`[offline] PostgreSQL (PGlite) слушает 127.0.0.1:${DB_PORT}`);

function run(script) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script], { cwd: ROOT, env: process.env, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} завершился с кодом ${code}`))));
  });
}

let app = null;
async function shutdown(code = 0) {
  if (app && app.exitCode === null) app.kill();
  await dbServer.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await run('src/db/migrate.js');
  await run('src/db/seed.js');
} catch (e) {
  console.error(`[offline] ${e.message}`);
  await shutdown(1);
}

app = spawn(process.execPath, ['src/index.js'], { cwd: ROOT, env: process.env, stdio: 'inherit' });
app.on('exit', (code) => shutdown(code ?? 0));
