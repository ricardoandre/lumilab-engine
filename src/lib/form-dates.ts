import dayjs from 'dayjs';

/**
 * Serialize a DatePicker value for the API.
 *
 * Date-only fields (`@db.Date`) must NOT go through `.toISOString()`. A picker
 * value is local-midnight, and in a positive-offset timezone (Asia/Jakarta,
 * +07:00) `.toISOString()` rolls the calendar day BACK by one — Aug 31 00:00
 * +07:00 becomes Aug 30 17:00Z — which MySQL then truncates to Aug 30. The day
 * the user picked silently reverts (looks like "saved but didn't change").
 * Pin the picked calendar day to UTC-midnight instead so it round-trips
 * unchanged. `datetime` fields keep their real instant.
 */
export function serializeFormDate(value: dayjs.ConfigType, dateOnly: boolean): string {
  const d = dayjs(value);
  return dateOnly ? `${d.format('YYYY-MM-DD')}T00:00:00.000Z` : d.toISOString();
}

/**
 * The range a hand-keyed date is allowed to fall in.
 *
 * A DatePicker accepts TYPED input, and nothing was bounding the year. On
 * 2026-07 someone keyed `20226-07-28` into QC Date; dayjs formats a five-digit
 * year back out quite happily, so it reached MySQL, which rejected it with
 * error 1292 and produced a 500. They tried eighteen times and it never saved —
 * the only trace was in the pm2 log, and nobody was reading it.
 *
 * Deliberately wide rather than "around now": birthdates and historical
 * production records are legitimately decades old, and planning dates run years
 * ahead. This is a typo guard, not a business rule — any field needing a real
 * range should say so itself.
 */
export const MIN_FORM_YEAR = 1900;
export const MAX_FORM_YEAR_AHEAD = 20;

export function minFormDate(): dayjs.Dayjs {
  return dayjs(`${MIN_FORM_YEAR}-01-01`);
}

export function maxFormDate(): dayjs.Dayjs {
  return dayjs().add(MAX_FORM_YEAR_AHEAD, 'year').endOf('year');
}

/**
 * Server-side counterpart, for write paths that take a date STRING from a
 * request body and hand it to Prisma. Returns false for anything MySQL would
 * refuse, so the route can answer 400 with a sentence instead of 500 with a
 * stack trace. Empty/null is not this function's problem — check it first.
 */
export function isSaneDateString(value: string): boolean {
  const d = dayjs(value);
  if (!d.isValid()) return false;
  const year = d.year();
  return year >= MIN_FORM_YEAR && year <= new Date().getUTCFullYear() + MAX_FORM_YEAR_AHEAD;
}

/**
 * Today's calendar date (local timezone) as `YYYY-MM-DD` — the correct default
 * for a date-only input. `new Date().toISOString().slice(0, 10)` gives UTC's
 * "today", which is still *yesterday* during the early-morning hours of a
 * positive-offset timezone (00:00–07:00 in Asia/Jakarta).
 */
export function todayDateOnly(): string {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Today's calendar date in JAKARTA (+07:00), for code that does NOT run in the
 * browser — API routes, cron handlers, scripts.
 *
 * `todayDateOnly()` above is correct in the browser, where local time already
 * IS Jakarta. On the server it is not: the droplet runs UTC, so both it and a
 * bare `new Date().toISOString().slice(0, 10)` return the wrong day for the
 * last 7 hours of every Jakarta day — and the wrong MONTH for the last 7 hours
 * of every month, which is how a UTC boundary put 1 August orders into July's
 * settlement (see the shopee-accounting report route).
 */
export function jakartaToday(): string {
  return jakartaNow().slice(0, 10);
}

/** This month in Jakarta (`YYYY-MM`) — same reasoning as jakartaToday(). */
export function jakartaMonth(): string {
  return jakartaNow().slice(0, 7);
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
function jakartaNow(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString();
}
