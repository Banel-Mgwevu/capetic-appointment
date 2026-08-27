import { describe, expect, it } from 'vitest';
import { computeSlots } from '../src/domain/scheduling.js';

const base = {
  date: '2026-09-03',
  window: { open: '09:00', close: '11:00' },
  slotMinutes: 30,
  capacity: 1,
  existing: [],
  earliestStartMinutes: null,
};

describe('computeSlots', () => {
  it('lays out a grid that fits the service duration before closing time', () => {
    const slots = computeSlots({ ...base, durationMinutes: 30 });
    expect(slots.map((s) => s.startsAt.slice(11))).toEqual(['09:00', '09:30', '10:00', '10:30']);

    const hourSlots = computeSlots({ ...base, durationMinutes: 60 });
    expect(hourSlots.map((s) => s.startsAt.slice(11))).toEqual(['09:00', '09:30', '10:00']);
    expect(hourSlots[2]?.endsAt).toBe('2026-09-03T11:00');
  });

  it('marks a slot unavailable once capacity is reached', () => {
    const slots = computeSlots({
      ...base,
      durationMinutes: 30,
      existing: [{ startsAt: '2026-09-03T09:30', endsAt: '2026-09-03T10:00' }],
    });
    expect(slots.map((s) => s.available)).toEqual([true, false, true, true]);
  });

  it('a long booking consumes every unit it overlaps', () => {
    const slots = computeSlots({
      ...base,
      durationMinutes: 30,
      existing: [{ startsAt: '2026-09-03T09:00', endsAt: '2026-09-03T10:00' }],
    });
    expect(slots.map((s) => s.available)).toEqual([false, false, true, true]);
  });

  it('a long service cannot start where any later unit is full', () => {
    const slots = computeSlots({
      ...base,
      durationMinutes: 60,
      existing: [{ startsAt: '2026-09-03T10:00', endsAt: '2026-09-03T10:30' }],
    });
    // 09:00–10:00 fine; 09:30–10:30 overlaps the 10:00 unit; 10:00–11:00 too.
    expect(slots.map((s) => s.available)).toEqual([true, false, false]);
  });

  it('allows concurrent bookings up to capacity', () => {
    const slots = computeSlots({
      ...base,
      capacity: 2,
      durationMinutes: 30,
      existing: [{ startsAt: '2026-09-03T09:00', endsAt: '2026-09-03T09:30' }],
    });
    expect(slots[0]?.available).toBe(true);
  });

  it('hides slots that start before the lead-time cut-off', () => {
    const slots = computeSlots({ ...base, durationMinutes: 30, earliestStartMinutes: 9 * 60 + 45 });
    expect(slots.map((s) => s.available)).toEqual([false, false, true, true]);
  });
});
