import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  customer,
  CREDIT_CONSULTATION,
  MENLYN,
  NEXT_SATURDAY,
  NEXT_SUNDAY,
  OPEN_ACCOUNT,
  ROSEBANK,
  SANDTON,
  TOMORROW,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await createTestContext();
});

const book = (overrides: Record<string, unknown> = {}) =>
  request(ctx.app)
    .post('/api/appointments')
    .send({
      branchId: ROSEBANK,
      serviceId: OPEN_ACCOUNT,
      startsAt: `${TOMORROW}T09:00`,
      customer,
      consent: true,
      ...overrides,
    });

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('reference data', () => {
  it('lists branches with opening hours', async () => {
    const res = await request(ctx.app).get('/api/branches');
    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(5);
    expect(res.body.branches[0]).toMatchObject({ name: expect.any(String), openingHours: expect.any(Object) });
  });

  it('lists services in display order', async () => {
    const res = await request(ctx.app).get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body.services[0].slug).toBe('open-account');
  });
});

describe('GET /api/branches/:id/availability', () => {
  it('returns the slot grid for an open day', async () => {
    const res = await request(ctx.app)
      .get(`/api/branches/${ROSEBANK}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: TOMORROW });
    expect(res.status).toBe(200);
    expect(res.body.open).toBe(true);
    expect(res.body.slots[0]).toEqual({ startsAt: `${TOMORROW}T08:30`, endsAt: `${TOMORROW}T09:00`, available: true });
    expect(res.body.slots.at(-1).endsAt).toBe(`${TOMORROW}T16:30`);
  });

  it('reports closed days with no slots', async () => {
    const res = await request(ctx.app)
      .get(`/api/branches/${MENLYN}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: NEXT_SATURDAY });
    expect(res.body).toMatchObject({ open: false, slots: [] });

    const sunday = await request(ctx.app)
      .get(`/api/branches/${SANDTON}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: NEXT_SUNDAY });
    expect(sunday.body.open).toBe(false);
  });

  it('applies the lead time to today', async () => {
    // Clock is 10:00 local; lead time 30 min → first bookable slot is 10:30.
    const res = await request(ctx.app)
      .get(`/api/branches/${ROSEBANK}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: '2026-09-02' });
    const firstAvailable = res.body.slots.find((s: { available: boolean }) => s.available);
    expect(firstAvailable.startsAt).toBe('2026-09-02T10:30');
  });

  it('rejects past dates, far-future dates and bad input', async () => {
    const past = await request(ctx.app)
      .get(`/api/branches/${ROSEBANK}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: '2026-09-01' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('VALIDATION_ERROR');

    const far = await request(ctx.app)
      .get(`/api/branches/${ROSEBANK}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: '2026-12-01' });
    expect(far.status).toBe(400);

    const bad = await request(ctx.app).get(`/api/branches/${ROSEBANK}/availability`).query({ date: 'tomorrow' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'serviceId' }), expect.objectContaining({ path: 'date' })]),
    );

    const missing = await request(ctx.app)
      .get('/api/branches/999/availability')
      .query({ serviceId: OPEN_ACCOUNT, date: TOMORROW });
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/appointments', () => {
  it('books a slot and simulates confirmation by email and SMS', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/^\/api\/appointments\/APT-/);

    const { appointment, notifications } = res.body;
    expect(appointment).toMatchObject({
      status: 'CONFIRMED',
      startsAt: `${TOMORROW}T09:00`,
      endsAt: `${TOMORROW}T09:30`,
      customer: { name: customer.name, email: customer.email, phone: '+27825550123' },
      branch: { id: ROSEBANK },
      service: { id: OPEN_ACCOUNT },
    });
    expect(appointment.reference).toMatch(/^APT-[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(appointment.customer.idNumber).toBeUndefined();

    expect(notifications).toHaveLength(2);
    expect(notifications.map((n: { channel: string }) => n.channel)).toEqual(['EMAIL', 'SMS']);
    expect(notifications[0]).toMatchObject({ recipient: customer.email, status: 'SENT' });
    expect(notifications[0].body).toContain(appointment.reference);
    expect(notifications[1]).toMatchObject({ recipient: '+27825550123' });
    expect(notifications[1].body).toContain('Rosebank Mall');
  });

  it('accepts an optional valid ID number and notes', async () => {
    const res = await book({ customer: { ...customer, idNumber: '8001015009087' }, notes: 'Wheelchair access please' });
    expect(res.status).toBe(201);
    expect(res.body.appointment.notes).toBe('Wheelchair access please');
  });

  it('fills capacity and then refuses the slot', async () => {
    expect((await book()).status).toBe(201);
    expect((await book()).status).toBe(201); // Rosebank capacity = 2

    const third = await book();
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('SLOT_UNAVAILABLE');

    const availability = await request(ctx.app)
      .get(`/api/branches/${ROSEBANK}/availability`)
      .query({ serviceId: OPEN_ACCOUNT, date: TOMORROW });
    const nine = availability.body.slots.find((s: { startsAt: string }) => s.startsAt === `${TOMORROW}T09:00`);
    expect(nine.available).toBe(false);
  });

  it('a 60-minute service blocks two consecutive units', async () => {
    const res = await book({ serviceId: CREDIT_CONSULTATION });
    expect(res.status).toBe(201);
    expect(res.body.appointment.endsAt).toBe(`${TOMORROW}T10:00`);

    // Rosebank has two consultants: one is now busy 09:00–10:00, the other is free.
    expect((await book({ startsAt: `${TOMORROW}T09:00` })).status).toBe(201);
    expect((await book({ startsAt: `${TOMORROW}T09:00` })).status).toBe(409);
    expect((await book({ startsAt: `${TOMORROW}T09:30` })).status).toBe(201);
    expect((await book({ startsAt: `${TOMORROW}T09:30` })).status).toBe(409);
    // A 60-minute booking at 08:30 would need the (full) 09:00 unit as well.
    expect((await book({ serviceId: CREDIT_CONSULTATION, startsAt: `${TOMORROW}T08:30` })).status).toBe(409);
  });

  it('rejects times off the slot grid, outside hours, on closed days or in the past', async () => {
    expect((await book({ startsAt: `${TOMORROW}T09:15` })).status).toBe(400);
    expect((await book({ startsAt: `${TOMORROW}T17:00` })).status).toBe(400);
    expect((await book({ branchId: MENLYN, startsAt: `${NEXT_SATURDAY}T09:00` })).status).toBe(400);
    expect((await book({ startsAt: '2026-09-01T09:00' })).status).toBe(400);

    // 09:00 today is before the 10:30 cut-off → shown as unavailable, so 409.
    expect((await book({ startsAt: '2026-09-02T09:00' })).status).toBe(409);
  });

  it('validates the customer details field by field', async () => {
    const res = await book({ customer: { name: 'B', email: 'not-an-email', phone: '123', idNumber: '1234567890123' } });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining(['customer.name', 'customer.email', 'customer.phone', 'customer.idNumber']),
    );
  });

  it('rejects unknown branch or service', async () => {
    expect((await book({ branchId: 999 })).status).toBe(404);
    expect((await book({ serviceId: 999 })).status).toBe(404);
  });

  it('rejects malformed JSON', async () => {
    const res = await request(ctx.app)
      .post('/api/appointments')
      .set('Content-Type', 'application/json')
      .send('{"branchId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/appointments/:reference/access', () => {
  it('issues a token when the email or phone matches', async () => {
    const { reference } = (await book()).body.appointment;

    const byEmail = await request(ctx.app).post(`/api/appointments/${reference}/access`).send({ contact: customer.email });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.token).toEqual(expect.any(String));

    const byPhone = await request(ctx.app)
      .post(`/api/appointments/${reference}/access`)
      .send({ contact: '+27825550123' });
    expect(byPhone.status).toBe(200);
  });

  it('rejects a non-matching contact', async () => {
    const { reference } = (await book()).body.appointment;
    const res = await request(ctx.app).post(`/api/appointments/${reference}/access`).send({ contact: 'someone-else@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERIFICATION_FAILED');
  });

  it('404s for an unknown reference', async () => {
    const res = await request(ctx.app).post('/api/appointments/APT-ZZZZZZ/access').send({ contact: customer.email });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/appointments/:reference', () => {
  it('returns the booking with its notification history using the token issued at booking', async () => {
    const booked = (await book()).body;
    const { reference } = booked.appointment;

    const res = await request(ctx.app)
      .get(`/api/appointments/${reference.toLowerCase()}`)
      .set('Authorization', `Bearer ${booked.access.token}`);
    expect(res.status).toBe(200);
    expect(res.body.appointment.reference).toBe(reference);
    expect(res.body.notifications).toHaveLength(2);
  });

  it('returns the booking after verifying by email instead', async () => {
    const { reference } = (await book()).body.appointment;
    const { token } = (await request(ctx.app).post(`/api/appointments/${reference}/access`).send({ contact: customer.email })).body;

    const res = await request(ctx.app).get(`/api/appointments/${reference}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects requests with no token, a bad token, or a token for a different booking', async () => {
    const first = (await book()).body;
    const second = (await book({ startsAt: `${TOMORROW}T10:00` })).body;

    expect((await request(ctx.app).get(`/api/appointments/${first.appointment.reference}`)).status).toBe(401);
    expect(
      (await request(ctx.app).get(`/api/appointments/${first.appointment.reference}`).set('Authorization', 'Bearer nonsense')).status,
    ).toBe(401);
    expect(
      (
        await request(ctx.app)
          .get(`/api/appointments/${first.appointment.reference}`)
          .set('Authorization', `Bearer ${second.access.token}`)
      ).status,
    ).toBe(401);
  });

  it('400s for a malformed reference', async () => {
    expect((await request(ctx.app).get('/api/appointments/nope')).status).toBe(400);
  });
});

describe('POST /api/appointments/:reference/cancel', () => {
  it('cancels, releases the slot and simulates a cancellation notice', async () => {
    const booked = (await book()).body;
    const { reference } = booked.appointment;
    await book();
    expect((await book()).status).toBe(409);

    const res = await request(ctx.app)
      .post(`/api/appointments/${reference}/cancel`)
      .set('Authorization', `Bearer ${booked.access.token}`);
    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe('CANCELLED');
    expect(res.body.appointment.cancelledAt).toBe(ctx.now.toISOString());
    expect(res.body.notifications).toHaveLength(4);
    expect(res.body.notifications[2].subject).toContain('cancelled');

    expect((await book()).status).toBe(201);
  });

  it('cannot cancel without a valid token for that booking', async () => {
    const { reference } = (await book()).body.appointment;
    expect((await request(ctx.app).post(`/api/appointments/${reference}/cancel`)).status).toBe(401);
  });

  it('cannot cancel twice', async () => {
    const booked = (await book()).body;
    const { reference } = booked.appointment;
    const auth = { Authorization: `Bearer ${booked.access.token}` };
    await request(ctx.app).post(`/api/appointments/${reference}/cancel`).set(auth);
    const again = await request(ctx.app).post(`/api/appointments/${reference}/cancel`).set(auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
  });

  it('cannot cancel an appointment that has already started', async () => {
    const booked = (await book()).body;
    const { reference } = booked.appointment;
    ctx.now = new Date('2026-09-03T07:30:00Z'); // 09:30 local, appointment began at 09:00
    const res = await request(ctx.app)
      .post(`/api/appointments/${reference}/cancel`)
      .set('Authorization', `Bearer ${booked.access.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_IN_PAST');
  });
});

describe('unknown API routes', () => {
  it('return JSON 404s', async () => {
    const res = await request(ctx.app).get('/api/nothing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/auth/login', () => {
  it('issues an admin token for correct credentials', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'test-admin-password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects wrong credentials', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/analytics/summary', () => {
  const adminLogin = async () =>
    (await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'test-admin-password' })).body
      .token as string;

  it('requires an admin token', async () => {
    expect((await request(ctx.app).get('/api/analytics/summary')).status).toBe(401);
    // A customer token must not work here.
    const booked = (await book()).body;
    expect(
      (await request(ctx.app).get('/api/analytics/summary').set('Authorization', `Bearer ${booked.access.token}`)).status,
    ).toBe(401);
  });

  it('summarises bookings for an admin', async () => {
    await book();
    const second = (await book({ startsAt: `${TOMORROW}T10:00` })).body;
    await request(ctx.app)
      .post(`/api/appointments/${second.appointment.reference}/cancel`)
      .set('Authorization', `Bearer ${second.access.token}`);

    const token = await adminLogin();
    const res = await request(ctx.app).get('/api/analytics/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ confirmed: 1, cancelled: 1, total: 2, cancellationRate: 50 });
    expect(res.body.byBranch.find((b: { branchId: number }) => b.branchId === ROSEBANK)).toMatchObject({ confirmed: 1, cancelled: 1 });
    expect(res.body.busiestService).toBe('Open a new account');
  });

  it('accepts a custom range', async () => {
    const token = await adminLogin();
    const res = await request(ctx.app).get('/api/analytics/summary').query({ rangeDays: 7 }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.rangeDays).toBe(7);
  });
});

describe('booking consent', () => {
  it('rejects a booking without explicit consent', async () => {
    const res = await book({ consent: false });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('consent');
  });

  it('rejects a booking with consent omitted entirely', async () => {
    const res = await request(ctx.app)
      .post('/api/appointments')
      .send({ branchId: ROSEBANK, serviceId: OPEN_ACCOUNT, startsAt: `${TOMORROW}T09:00`, customer });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/appointments/:reference/reschedule', () => {
  it('moves a confirmed appointment to a new time and notifies the customer', async () => {
    const booked = (await book()).body;
    const { reference } = booked.appointment;
    const auth = { Authorization: `Bearer ${booked.access.token}` };

    const res = await request(ctx.app)
      .post(`/api/appointments/${reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T11:00` });

    expect(res.status).toBe(200);
    expect(res.body.appointment.startsAt).toBe(`${TOMORROW}T11:00`);
    expect(res.body.appointment.rescheduleCount).toBe(1);
    expect(res.body.appointment.rescheduledAt).toBe(ctx.now.toISOString());
    expect(res.body.notifications).toHaveLength(4); // confirmation x2 + reschedule x2
    expect(res.body.notifications[2].kind).toBe('RESCHEDULE');
    expect(res.body.notifications[2].subject).toContain('moved');

    // original slot is released
    expect((await book({ startsAt: `${TOMORROW}T09:00` })).status).toBe(201);
  });

  it('re-checks capacity at the new time, excluding its own old slot', async () => {
    const booked = (await book({ startsAt: `${TOMORROW}T09:00` })).body;
    await book({ startsAt: `${TOMORROW}T09:00` }); // fills Rosebank's 2nd unit at 09:00
    const auth = { Authorization: `Bearer ${booked.access.token}` };

    // Moving within a slot that only its own old booking would have blocked must succeed.
    const ok = await request(ctx.app)
      .post(`/api/appointments/${booked.appointment.reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T09:30` });
    expect(ok.status).toBe(200);
  });

  it('rejects moving to a fully booked time', async () => {
    const booked = (await book({ startsAt: `${TOMORROW}T09:00` })).body;
    await book({ startsAt: `${TOMORROW}T11:00` });
    await book({ startsAt: `${TOMORROW}T11:00` });
    const auth = { Authorization: `Bearer ${booked.access.token}` };

    const res = await request(ctx.app)
      .post(`/api/appointments/${booked.appointment.reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T11:00` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('rejects rescheduling without a valid token', async () => {
    const { reference } = (await book()).body.appointment;
    const res = await request(ctx.app)
      .post(`/api/appointments/${reference}/reschedule`)
      .send({ startsAt: `${TOMORROW}T11:00` });
    expect(res.status).toBe(401);
  });

  it('rejects rescheduling a cancelled appointment', async () => {
    const booked = (await book()).body;
    const auth = { Authorization: `Bearer ${booked.access.token}` };
    await request(ctx.app).post(`/api/appointments/${booked.appointment.reference}/cancel`).set(auth);

    const res = await request(ctx.app)
      .post(`/api/appointments/${booked.appointment.reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T11:00` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CANCELLED');
  });

  it('rejects an appointment that has already started', async () => {
    const booked = (await book()).body;
    const auth = { Authorization: `Bearer ${booked.access.token}` };
    ctx.now = new Date('2026-09-03T07:30:00Z'); // 09:30 local, appointment began at 09:00

    const res = await request(ctx.app)
      .post(`/api/appointments/${booked.appointment.reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T14:00` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_IN_PAST');
  });
});

describe('customer OTP and "my appointments"', () => {
  const requestCode = (contact: string) => request(ctx.app).post('/api/customers/otp/request').send({ contact });

  it('always returns a generic response, whether or not the contact has bookings', async () => {
    const withBookings = await requestCode(customer.email);
    const withoutBookings = await requestCode('nobody@example.com');
    expect(withBookings.status).toBe(200);
    expect(withoutBookings.status).toBe(200);
    expect(withBookings.body).toEqual(withoutBookings.body);
  });

  it('verifies the correct code and lists every booking for that contact', async () => {
    const first = (await book()).body.appointment;
    const second = (await book({ startsAt: `${TOMORROW}T13:00`, serviceId: CREDIT_CONSULTATION })).body.appointment;

    const code = ctx.captureNextOtp(customer.email);
    await requestCode(customer.email);

    const verify = await request(ctx.app).post('/api/customers/otp/verify').send({ contact: customer.email, code: code() });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toEqual(expect.any(String));

    const list = await request(ctx.app)
      .get('/api/customers/appointments')
      .set('Authorization', `Bearer ${verify.body.token}`);
    expect(list.status).toBe(200);
    expect(list.body.appointments).toHaveLength(2);
    const references = list.body.appointments.map((a: { reference: string }) => a.reference);
    expect(references).toEqual(expect.arrayContaining([first.reference, second.reference]));
  });

  it('rejects a wrong code and does not list appointments without verifying', async () => {
    const code = ctx.captureNextOtp(customer.email);
    await requestCode(customer.email);
    code(); // consume/observe the real code without using it

    const verify = await request(ctx.app)
      .post('/api/customers/otp/verify')
      .send({ contact: customer.email, code: '000000' });
    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('CODE_INVALID');

    const list = await request(ctx.app).get('/api/customers/appointments');
    expect(list.status).toBe(401);
  });

  it('a fresh code invalidates the previous one', async () => {
    const codeA = ctx.captureNextOtp(customer.phone);
    await requestCode(customer.phone);
    const firstCode = codeA();

    const codeB = ctx.captureNextOtp(customer.phone);
    await requestCode(customer.phone);
    codeB();

    const verify = await request(ctx.app)
      .post('/api/customers/otp/verify')
      .send({ contact: customer.phone, code: firstCode });
    expect(verify.status).toBe(409);
  });
});

describe('admin support tools', () => {
  const adminAuth = async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'test-admin-password' });
    return { Authorization: `Bearer ${res.body.token as string}` };
  };

  it('lets staff look up a booking without the customer verifying, and logs it', async () => {
    const { reference } = (await book()).body.appointment;
    const auth = await adminAuth();

    const res = await request(ctx.app).get(`/api/admin/appointments/${reference}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.appointment.reference).toBe(reference);

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    expect(log.status).toBe(200);
    const lookup = log.body.entries.find((e: { action: string }) => e.action === 'APPOINTMENT_LOOKUP');
    expect(lookup).toMatchObject({ actor: 'admin', targetType: 'appointment', targetId: reference });
  });

  it('records both a successful and a failed admin login', async () => {
    await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    const auth = await adminAuth();

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    const actions = log.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('ADMIN_LOGIN_SUCCESS');
    expect(actions).toContain('ADMIN_LOGIN_FAILURE');
  });

  it('lets staff cancel and reschedule a booking on a customer\u2019s behalf', async () => {
    const { reference } = (await book()).body.appointment;
    const auth = await adminAuth();

    const rescheduled = await request(ctx.app)
      .post(`/api/admin/appointments/${reference}/reschedule`)
      .set(auth)
      .send({ startsAt: `${TOMORROW}T11:00` });
    expect(rescheduled.status).toBe(200);
    expect(rescheduled.body.appointment.startsAt).toBe(`${TOMORROW}T11:00`);

    const cancelled = await request(ctx.app).post(`/api/admin/appointments/${reference}/cancel`).set(auth);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.appointment.status).toBe('CANCELLED');

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    const actions = log.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('APPOINTMENT_RESCHEDULED_BY_STAFF');
    expect(actions).toContain('APPOINTMENT_CANCELLED_BY_STAFF');
  });

  it('rejects admin endpoints without a valid admin token', async () => {
    const { reference } = (await book()).body.appointment;
    expect((await request(ctx.app).get(`/api/admin/appointments/${reference}`)).status).toBe(401);
    expect((await request(ctx.app).get('/api/admin/audit-log')).status).toBe(401);

    const booked = (await book()).body;
    expect(
      (
        await request(ctx.app)
          .get(`/api/admin/appointments/${reference}`)
          .set('Authorization', `Bearer ${booked.access.token}`) // a customer token must not work here
      ).status,
    ).toBe(401);
  });

  it('triggers a privacy purge and logs it', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app).post('/api/admin/privacy/purge').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ redactedCount: expect.any(Number) });

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    const entry = log.body.entries.find((e: { action: string }) => e.action === 'PRIVACY_PURGE_TRIGGERED');
    expect(entry).toBeDefined();
  });
});
