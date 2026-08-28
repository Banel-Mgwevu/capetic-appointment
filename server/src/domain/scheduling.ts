import { combine, type LocalDate, type LocalDateTime, split } from './time.js';

export interface OpeningWindow {
  open: string; // HH:mm
  close: string; // HH:mm
}

/** Keyed by weekday number as a string ("0" = Sunday … "6" = Saturday). Missing = closed. */
export type OpeningHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', OpeningWindow>>;

/**
 * Zod's `.optional()` types each weekday as `OpeningWindow | undefined`
 * (the key can be present *and* explicitly undefined); this domain type
 * instead means "the key is simply absent when closed". Written as a plain
 * loop with an explicit return type rather than a generic mapped-type
 * transform, since the two shapes are subtly different under
 * `exactOptionalPropertyTypes` and generic inference kept losing that
 * distinction.
 */
export function cleanOpeningHours(input: Record<string, OpeningWindow | undefined>): OpeningHours {
  const result: OpeningHours = {};
  for (const [day, window] of Object.entries(input)) {
    if (window) result[day as keyof OpeningHours] = window;
  }
  return result;
}

export interface Slot {
  startsAt: LocalDateTime;
  endsAt: LocalDateTime;
  available: boolean;
}

export interface Booking {
  startsAt: LocalDateTime;
  endsAt: LocalDateTime;
}

export interface SlotComputationInput {
  date: LocalDate;
  window: OpeningWindow;
  /** Granularity of the slot grid (e.g. 30) */
  slotMinutes: number;
  /** How long the requested service takes */
  durationMinutes: number;
  /** How many consultants can serve customers simultaneously */
  capacity: number;
  /** Confirmed bookings already on this date at this branch */
  existing: readonly Booking[];
  /** Slots starting before this (minutes since midnight) are not offered. Null = no cut-off. */
  earliestStartMinutes: number | null;
}

/**
 * Builds the slot grid for one branch-day and marks each slot as available or not.
 *
 * A slot is available when, for every `slotMinutes`-wide sub-interval the service
 * would occupy, fewer than `capacity` existing bookings overlap it. Checking each
 * sub-interval (rather than the whole window at once) is what makes staggered,
 * variable-length bookings safe: a 60-minute booking correctly consumes two
 * consecutive 30-minute units of capacity.
 */
export function computeSlots(input: SlotComputationInput): Slot[] {
  const { date, window, slotMinutes, durationMinutes, capacity, existing, earliestStartMinutes } = input;
  const openAt = toMinutes(window.open);
  const closeAt = toMinutes(window.close);

  const bookings = existing.map((b) => ({
    start: split(b.startsAt).minutes,
    end: split(b.endsAt).minutes,
  }));

  const slots: Slot[] = [];
  for (let start = openAt; start + durationMinutes <= closeAt; start += slotMinutes) {
    const end = start + durationMinutes;
    const notTooSoon = earliestStartMinutes === null || start >= earliestStartMinutes;
    slots.push({
      startsAt: combine(date, start),
      endsAt: combine(date, end),
      available: notTooSoon && hasCapacity(start, end, slotMinutes, capacity, bookings),
    });
  }
  return slots;
}

function hasCapacity(
  start: number,
  end: number,
  slotMinutes: number,
  capacity: number,
  bookings: readonly { start: number; end: number }[],
): boolean {
  for (let unitStart = start; unitStart < end; unitStart += slotMinutes) {
    const unitEnd = Math.min(unitStart + slotMinutes, end);
    const overlapping = bookings.filter((b) => b.start < unitEnd && b.end > unitStart).length;
    if (overlapping >= capacity) return false;
  }
  return true;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}
