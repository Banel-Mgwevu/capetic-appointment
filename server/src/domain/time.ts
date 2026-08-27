/**
 * Appointments are wall-clock times at a physical branch, so the system works in
 * the branch's local time rather than UTC instants. Times are represented as
 * fixed-width ISO-like strings, which sort lexicographically and need no
 * timezone maths except when comparing against "now".
 *
 *   LocalDate      YYYY-MM-DD
 *   LocalTime      HH:mm
 *   LocalDateTime  YYYY-MM-DDTHH:mm
 */
export type LocalDate = string;
export type LocalTime = string;
export type LocalDateTime = string;

export const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isValidLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isValidLocalDateTime(value: string): value is LocalDateTime {
  if (!LOCAL_DATETIME_RE.test(value)) return false;
  const [date, time] = value.split('T') as [string, string];
  const minutes = timeToMinutes(time);
  return isValidLocalDate(date) && minutes >= 0 && minutes < 24 * 60;
}

export function timeToMinutes(time: LocalTime): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function minutesToTime(minutes: number): LocalTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function combine(date: LocalDate, minutes: number): LocalDateTime {
  return `${date}T${minutesToTime(minutes)}`;
}

export function split(dateTime: LocalDateTime): { date: LocalDate; minutes: number } {
  const [date, time] = dateTime.split('T') as [string, string];
  return { date, minutes: timeToMinutes(time) };
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Current wall-clock time in an IANA timezone, e.g. "Africa/Johannesburg". */
export function nowInZone(timeZone: string, now: Date = new Date()): { date: LocalDate; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
