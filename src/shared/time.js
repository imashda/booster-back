'use strict';

/**
 * «Сегодня» для игровой логики — по часовому поясу учеников, а не сервера.
 *
 * Раньше дата бралась как new Date().toISOString() — это UTC. Ученики живут
 * в UTC+5 (Asia/Qyzylorda), поэтому с 00:00 до 05:00 по местному времени
 * сервер считал, что всё ещё «вчера»: квиз дня, дневной лимит FOX за игры и
 * расписание расходились с календарём ребёнка. Часовой пояс можно
 * переопределить переменной APP_TIMEZONE.
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Qyzylorda';

const formatters = new Map();

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    // en-CA форматирует дату как YYYY-MM-DD — ровно тот вид, что ждёт DATE в Postgres
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Календарная дата 'YYYY-MM-DD' в часовом поясе приложения. */
function localDate(now = new Date(), timeZone = APP_TIMEZONE) {
  return formatterFor(timeZone).format(now);
}

/** Первый день текущего месяца 'YYYY-MM-01' в часовом поясе приложения. */
function localMonth(now = new Date(), timeZone = APP_TIMEZONE) {
  return `${localDate(now, timeZone).slice(0, 7)}-01`;
}

/** Сдвиг месяца: shiftMonth('2026-01-01', -1) -> '2025-12-01'. */
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

module.exports = { APP_TIMEZONE, localDate, localMonth, shiftMonth };
