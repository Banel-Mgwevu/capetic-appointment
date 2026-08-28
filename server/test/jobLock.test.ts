import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppointmentRepository } from '../src/repositories/appointmentRepository.js';
import { BranchRepository } from '../src/repositories/branchRepository.js';
import { JobLockRepository } from '../src/repositories/jobLockRepository.js';
import { NotificationRepository } from '../src/repositories/notificationRepository.js';
import { ServiceRepository } from '../src/repositories/serviceRepository.js';
import { ReminderService } from '../src/services/reminderService.js';
import { RetentionService } from '../src/services/retentionService.js';
import { SimulatedNotifier } from '../src/services/notifications/simulatedNotifier.js';
import { createTestContext, customer, OPEN_ACCOUNT, ROSEBANK, type TestContext } from './helpers.js';

let ctx: TestContext;
let locks: JobLockRepository;

beforeEach(async () => {
  ctx = await createTestContext();
  locks = new JobLockRepository(ctx.db);
});

describe('JobLockRepository', () => {
  it('a fresh job name can be claimed', () => {
    expect(locks.tryAcquire('demo', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('cannot be claimed again while still locked', () => {
    locks.tryAcquire('demo', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(locks.tryAcquire('demo', '2026-01-01T00:10:00.000Z', '2026-01-01T00:02:00.000Z')).toBe(false);
  });

  it('can be claimed again once the lock has expired', () => {
    locks.tryAcquire('demo', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(locks.tryAcquire('demo', '2026-01-01T00:10:00.000Z', '2026-01-01T00:06:00.000Z')).toBe(true);
  });

  it('release lets an immediate re-claim succeed regardless of TTL', () => {
    locks.tryAcquire('demo', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z');
    locks.release('demo');
    expect(locks.tryAcquire('demo', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:01.000Z')).toBe(true);
  });

  it('different job names have independent locks', () => {
    locks.tryAcquire('retention', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(locks.tryAcquire('reminder', '2026-01-01T00:05:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(true);
  });
});

const book = (startsAt: string) =>
  request(ctx.app)
    .post('/api/appointments')
    .send({ branchId: ROSEBANK, serviceId: OPEN_ACCOUNT, startsAt, customer, consent: true });

describe('RetentionService respects the job lock', () => {
  it('a concurrent sweep while one is already running is skipped, not double-processed', async () => {
    const { reference } = (await book(`${'2026-09-03'}T09:00`)).body.appointment;
    const logger = pino({ level: 'silent' });
    const farFuture = () => new Date('2026-12-31T00:00:00Z');
    const appointments = new AppointmentRepository(ctx.db);
    const retention = new RetentionService({ appointments, locks, retentionDays: 1, logger, clock: farFuture });

    // Simulate another process already holding the lock (e.g. the scheduled
    // sweep firing at the same moment as someone clicking "run purge now").
    locks.tryAcquire('retention', '2026-12-31T00:05:00.000Z', farFuture().toISOString());

    expect(retention.sweep()).toBe(0); // lock held elsewhere -- skipped entirely
    expect(appointments.findByReference(reference)?.anonymisedAt).toBeNull(); // untouched

    locks.release('retention');
    expect(retention.sweep()).toBe(1); // now it can actually run
  });
});

describe('ReminderService respects the job lock', () => {
  it('a concurrent sweep while one is already running is skipped, not a double-send', async () => {
    await book('2026-09-03T09:00');
    const logger = pino({ level: 'silent' });
    const appointments = new AppointmentRepository(ctx.db);
    const branches = new BranchRepository(ctx.db);
    const services = new ServiceRepository(ctx.db);
    const notifications = new NotificationRepository(ctx.db);
    const reminder = new ReminderService({
      appointments,
      branches,
      services,
      locks,
      notifier: new SimulatedNotifier(notifications, logger, () => ctx.now),
      logger,
      clock: () => ctx.now,
    });

    locks.tryAcquire('reminder', new Date(ctx.now.getTime() + 60_000).toISOString(), ctx.now.toISOString());

    expect(await reminder.sweep()).toBe(0); // lock held elsewhere -- skipped

    locks.release('reminder');
    expect(await reminder.sweep()).toBe(1); // now it actually sends
  });
});
