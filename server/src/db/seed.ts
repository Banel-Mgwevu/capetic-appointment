import type { Db } from './connection.js';
import type { OpeningHours } from '../domain/scheduling.js';

interface BranchSeed {
  slug: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  slotMinutes: number;
  capacity: number;
  openingHours: OpeningHours;
}

interface ServiceSeed {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
}

const WEEKDAYS: OpeningHours = {
  '1': { open: '08:30', close: '16:30' },
  '2': { open: '08:30', close: '16:30' },
  '3': { open: '08:30', close: '16:30' },
  '4': { open: '08:30', close: '16:30' },
  '5': { open: '08:30', close: '16:30' },
};

const WEEKDAYS_AND_SATURDAY: OpeningHours = {
  ...WEEKDAYS,
  '6': { open: '08:30', close: '12:30' },
};

export const BRANCHES: BranchSeed[] = [
  {
    slug: 'sandton-city',
    name: 'Sandton City',
    city: 'Johannesburg',
    address: 'Shop L23, Sandton City, 83 Rivonia Rd, Sandton',
    timezone: 'Africa/Johannesburg',
    slotMinutes: 30,
    capacity: 3,
    openingHours: WEEKDAYS_AND_SATURDAY,
  },
  {
    slug: 'rosebank-mall',
    name: 'Rosebank Mall',
    city: 'Johannesburg',
    address: 'Shop 112, Rosebank Mall, 50 Bath Ave, Rosebank',
    timezone: 'Africa/Johannesburg',
    slotMinutes: 30,
    capacity: 2,
    openingHours: WEEKDAYS_AND_SATURDAY,
  },
  {
    slug: 'menlyn-park',
    name: 'Menlyn Park',
    city: 'Pretoria',
    address: 'Shop 84, Menlyn Park, Atterbury Rd, Menlyn',
    timezone: 'Africa/Johannesburg',
    slotMinutes: 30,
    capacity: 2,
    openingHours: WEEKDAYS,
  },
  {
    slug: 'canal-walk',
    name: 'Canal Walk',
    city: 'Cape Town',
    address: 'Shop 421, Canal Walk, Century City',
    timezone: 'Africa/Johannesburg',
    slotMinutes: 30,
    capacity: 3,
    openingHours: WEEKDAYS_AND_SATURDAY,
  },
  {
    slug: 'gateway-umhlanga',
    name: 'Gateway Theatre of Shopping',
    city: 'Durban',
    address: 'Shop F214, Gateway, 1 Palm Blvd, Umhlanga',
    timezone: 'Africa/Johannesburg',
    slotMinutes: 30,
    capacity: 2,
    openingHours: WEEKDAYS,
  },
];

export const SERVICES: ServiceSeed[] = [
  {
    slug: 'open-account',
    name: 'Open a new account',
    description: 'Open a transactional or savings account. Bring your ID and proof of address.',
    durationMinutes: 30,
  },
  {
    slug: 'card-replacement',
    name: 'Replace a lost or damaged card',
    description: 'Cancel your old card and collect a new one on the spot.',
    durationMinutes: 30,
  },
  {
    slug: 'credit-consultation',
    name: 'Personal credit consultation',
    description: 'Talk through a personal loan or credit facility with a consultant.',
    durationMinutes: 60,
  },
  {
    slug: 'home-loan',
    name: 'Home loan consultation',
    description: 'Get pre-qualified and understand what you can afford.',
    durationMinutes: 60,
  },
  {
    slug: 'business-banking',
    name: 'Business banking',
    description: 'Open a business account or discuss merchant and payment services.',
    durationMinutes: 60,
  },
  {
    slug: 'general-query',
    name: 'General account query',
    description: 'Update your details, dispute a transaction or ask about your account.',
    durationMinutes: 30,
  },
];

/** Populates reference data on first run. Safe to call repeatedly. */
export function seed(db: Db): { branches: number; services: number } {
  const counts = { branches: 0, services: 0 };

  const insertBranch = db.prepare(`
    INSERT OR IGNORE INTO branches (slug, name, city, address, timezone, slot_minutes, capacity, opening_hours)
    VALUES (@slug, @name, @city, @address, @timezone, @slotMinutes, @capacity, @openingHours)
  `);
  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (slug, name, description, duration_minutes, sort_order)
    VALUES (@slug, @name, @description, @durationMinutes, @sortOrder)
  `);

  db.transaction(() => {
    for (const branch of BRANCHES) {
      const result = insertBranch.run({ ...branch, openingHours: JSON.stringify(branch.openingHours) });
      counts.branches += result.changes;
    }
    SERVICES.forEach((service, index) => {
      const result = insertService.run({ ...service, sortOrder: index });
      counts.services += result.changes;
    });
  })();

  return counts;
}
