import { describe, expect, it } from 'vitest';
import { addDays, describeHours, formatLongDate, formatShortDate, formatTime, nextOpenDate, todayAt } from './dates';
import type { Branch } from './types';

const branch: Branch = {
  id: 1,
  slug: 'x',
  name: 'X',
  city: 'Y',
  address: 'Z',
  timezone: 'Africa/Johannesburg',
  slotMinutes: 30,
  capacity: 1,
  openingHours: {
    '1': { open: '08:30', close: '16:30' },
    '2': { open: '08:30', close: '16:30' },
    '3': { open: '08:30', close: '16:30' },
    '4': { open: '08:30', close: '16:30' },
    '5': { open: '08:30', close: '16:30' },
    '6': { open: '08:30', close: '12:30' },
  },
};

describe('dates', () => {
  it('formats dates and times for humans', () => {
    expect(formatLongDate('2026-09-03T09:30')).toBe('Thursday 3 Sep 2026');
    expect(formatShortDate('2026-09-03')).toBe('Thu 3 Sep');
    expect(formatTime('2026-09-03T09:30')).toBe('09:30');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('skips closed days when finding the next open date', () => {
    expect(nextOpenDate(branch, '2026-09-06')).toBe('2026-09-07'); // Sunday → Monday
    expect(nextOpenDate(branch, '2026-09-05')).toBe('2026-09-05'); // Saturday open
  });

  it('summarises opening hours compactly', () => {
    expect(describeHours(branch)).toBe('Mon–Fri 08:30–16:30 · Sat 08:30–12:30');
  });

  it('resolves today in the branch timezone', () => {
    expect(todayAt('Africa/Johannesburg', new Date('2026-09-02T22:30:00Z'))).toBe('2026-09-03');
  });
});
