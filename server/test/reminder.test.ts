import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppointmentRepository } from '../src/repositories/appointmentRepository.js';
import { BranchRepository } from '../src/repositories/branchRepository.js';
import { NotificationRepository } from '../src/repositories/notificationRepository.js';
import { ServiceRepository } from '../src/repositories/serviceRepository.js';
import { ReminderService } from '../src/services/reminderService.js';
import { SimulatedNotifier } from '../src/services/notifications/simulatedNotifier.js';
import { createTestContext, customer, OPEN_ACCOUNT, ROSEBANK, type TestContext } from './helpers.js';

let ctx: TestContext;
let reminder: ReminderService;
let notifications: NotificationRepository;

const book = (startsAt: string) =>
  request(ctx.app)
    .post('/api/appointments')
    .send({ branchId: ROSEBANK, serviceId: OPEN_ACCOUNT, startsAt, customer, consent: true });

beforeEach(() => {
  ctx = createTestContext();
  const branches = new BranchRepository(ctx.db);
  const services = new ServiceRepository(ctx.db);
  const appointments = new AppointmentRepository(ctx.db);
  notifications = new NotificationRepository(ctx.db);
  const logger = pino({ level: 'silent' });
  reminder = new ReminderService({
    appointments,
    branches,
    services,
    notifier: new SimulatedNotifier(notifications, logger, () => ctx.now),
    logger,
    clock: () => ctx.now,
  });
});

describe('ReminderService', () => {
  it('sends a reminder for a booking starting tomorrow', async () => {
    // ctx.now is 2026-09-02T08:00:00Z (Wed); "tomorrow" is 2026-09-03.
    const { reference } = (await book('2026-09-03T09:00')).body.appointment;
    const idRow = ctx.db.prepare('SELECT id FROM appointments WHERE reference = ?').get(reference) as { id: number };

    const count = await reminder.sweep();
    expect(count).toBe(1);

    const sent = notifications.listForAppointment(idRow.id);
    const reminders = sent.filter((n) => n.kind === 'REMINDER');
    expect(reminders).toHaveLength(2); // email + SMS
    expect(reminders[0]?.subject).toContain('tomorrow');
  });

  it('does not remind for a booking further in the future', async () => {
    await book('2026-09-10T09:00');
    expect(await reminder.sweep()).toBe(0);
  });

  it('does not remind twice for the same booking', async () => {
    await book('2026-09-03T09:00');
    expect(await reminder.sweep()).toBe(1);
    expect(await reminder.sweep()).toBe(0);
  });

  it('does not remind for a cancelled booking', async () => {
    const booked = (await book('2026-09-03T09:00')).body;
    await request(ctx.app)
      .post(`/api/appointments/${booked.appointment.reference}/cancel`)
      .set('Authorization', `Bearer ${booked.access.token}`);

    expect(await reminder.sweep()).toBe(0);
  });
});
