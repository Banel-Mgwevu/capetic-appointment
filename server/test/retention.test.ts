import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppointmentRepository } from '../src/repositories/appointmentRepository.js';
import { JobLockRepository } from '../src/repositories/jobLockRepository.js';
import { RetentionService } from '../src/services/retentionService.js';
import { createTestContext, customer, OPEN_ACCOUNT, ROSEBANK, TOMORROW, type TestContext } from './helpers.js';
import request from 'supertest';

let ctx: TestContext;
let appointments: AppointmentRepository;
let locks: JobLockRepository;

beforeEach(async () => {
  ctx = await createTestContext();
  appointments = new AppointmentRepository(ctx.db);
  locks = new JobLockRepository(ctx.db);
});

const book = () =>
  request(ctx.app)
    .post('/api/appointments')
    .send({ branchId: ROSEBANK, serviceId: OPEN_ACCOUNT, startsAt: `${TOMORROW}T09:00`, customer, consent: true });

describe('RetentionService', () => {
  it('leaves recent bookings untouched', async () => {
    const { reference } = (await book()).body.appointment;
    const logger = pino({ level: 'silent' });
    const retention = new RetentionService({ appointments, locks, retentionDays: 90, logger, clock: () => ctx.now });

    const count = retention.sweep();
    expect(count).toBe(0);

    const appointment = appointments.findByReference(reference);
    expect(appointment?.customerName).toBe(customer.name);
    expect(appointment?.anonymisedAt).toBeNull();
  });

  it('redacts personal fields once a booking is older than the retention window', async () => {
    const { reference } = (await book()).body.appointment;
    const logger = pino({ level: 'silent' });
    // Retention window of 0 days means "today and anything before it" is due.
    const farFuture = new Date('2026-12-31T00:00:00Z');
    const retention = new RetentionService({ appointments, locks, retentionDays: 1, logger, clock: () => farFuture });

    const count = retention.sweep();
    expect(count).toBe(1);

    const appointment = appointments.findByReference(reference);
    expect(appointment?.customerName).not.toBe(customer.name);
    expect(appointment?.customerEmail).not.toBe(customer.email);
    expect(appointment?.customerPhone).not.toBe(customer.phone);
    expect(appointment?.anonymisedAt).not.toBeNull();
    // Status, timing and branch/service links survive so analytics stay accurate.
    expect(appointment?.status).toBe('CONFIRMED');
    expect(appointment?.startsAt).toBe(`${TOMORROW}T09:00`);
  });

  it('is idempotent: a second sweep finds nothing new to redact', async () => {
    await book();
    const logger = pino({ level: 'silent' });
    const farFuture = new Date('2026-12-31T00:00:00Z');
    const retention = new RetentionService({ appointments, locks, retentionDays: 1, logger, clock: () => farFuture });

    expect(retention.sweep()).toBe(1);
    expect(retention.sweep()).toBe(0);
  });
});
