import type { Branch, Weekday } from './types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today's date (YYYY-MM-DD) as seen at the branch. */
export function todayAt(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isOpenOn(branch: Branch, date: string): boolean {
  return branch.openingHours[String(weekdayOf(date)) as Weekday] !== undefined;
}

/** First date on or after `from` when the branch is open. */
export function nextOpenDate(branch: Branch, from: string): string {
  let date = from;
  for (let i = 0; i < 7; i += 1) {
    if (isOpenOn(branch, date)) return date;
    date = addDays(date, 1);
  }
  return from;
}

/** "Thursday 3 Sep 2026" from a date or date-time string */
export function formatLongDate(value: string): string {
  const date = value.slice(0, 10);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Thu 3 Sep" */
export function formatShortDate(value: string): string {
  const date = value.slice(0, 10);
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`;
}

/** "09:30" from a date-time string */
export function formatTime(dateTime: string): string {
  return dateTime.slice(11, 16);
}

/** "Mon–Fri 08:30–16:30 · Sat 08:30–12:30" */
export function describeHours(branch: Branch): string {
  const groups: { from: number; to: number; open: string; close: string }[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const window = branch.openingHours[String(day % 7) as Weekday];
    if (!window) continue;
    const last = groups[groups.length - 1];
    if (last && last.to === day - 1 && last.open === window.open && last.close === window.close) {
      last.to = day;
    } else {
      groups.push({ from: day, to: day, open: window.open, close: window.close });
    }
  }
  return groups
    .map((g) => {
      const label = g.from === g.to ? WEEKDAYS_SHORT[g.from % 7] : `${WEEKDAYS_SHORT[g.from % 7]}–${WEEKDAYS_SHORT[g.to % 7]}`;
      return `${label} ${g.open}–${g.close}`;
    })
    .join(' · ');
}
