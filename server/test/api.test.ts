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
beforeEach(() => {
  ctx = createTestContext();
});

const book = (overrides: Record<string, unknown> = {}) =>
  request(ctx.app)
    .post('/api/appointments')
    .send({ branchId: ROSEBANK, serviceId: OPEN_ACCOUNT, startsAt: `${TOMORROW}T09:00`, customer, ...overrides });

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

describe('GET /api/appointments/:reference', () => {
  it('returns the booking with its notification history', async () => {
    const { reference } = (await book()).body.appointment;

    const res = await request(ctx.app).get(`/api/appointments/${reference.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.appointment.reference).toBe(reference);
    expect(res.body.notifications).toHaveLength(2);
  });

  it('404s for unknown and malformed references', async () => {
    expect((await request(ctx.app).get('/api/appointments/APT-ZZZZZZ')).status).toBe(404);
    expect((await request(ctx.app).get('/api/appointments/nope')).status).toBe(400);
  });
});

describe('POST /api/appointments/:reference/cancel', () => {
  it('cancels, releases the slot and simulates a cancellation notice', async () => {
    const { reference } = (await book()).body.appointment;
    await book();
    expect((await book()).status).toBe(409);

    const res = await request(ctx.app).post(`/api/appointments/${reference}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe('CANCELLED');
    expect(res.body.appointment.cancelledAt).toBe(ctx.now.toISOString());
    expect(res.body.notifications).toHaveLength(4);
    expect(res.body.notifications[2].subject).toContain('cancelled');

    expect((await book()).status).toBe(201);
  });

  it('cannot cancel twice', async () => {
    const { reference } = (await book()).body.appointment;
    await request(ctx.app).post(`/api/appointments/${reference}/cancel`);
    const again = await request(ctx.app).post(`/api/appointments/${reference}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
  });

  it('cannot cancel an appointment that has already started', async () => {
    const { reference } = (await book()).body.appointment;
    ctx.now = new Date('2026-09-03T07:30:00Z'); // 09:30 local, appointment began at 09:00
    const res = await request(ctx.app).post(`/api/appointments/${reference}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_IN_PAST');
  });

  it('404s for unknown references', async () => {
    expect((await request(ctx.app).post('/api/appointments/APT-ZZZZZZ/cancel')).status).toBe(404);
  });
});

describe('unknown API routes', () => {
  it('return JSON 404s', async () => {
    const res = await request(ctx.app).get('/api/nothing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
