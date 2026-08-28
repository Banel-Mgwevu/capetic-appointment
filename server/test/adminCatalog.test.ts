import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

const adminAuth = async () => {
  const res = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'test-admin-password' });
  return { Authorization: `Bearer ${res.body.token as string}` };
};

const validBranch = {
  name: 'Menlyn Test Branch',
  city: 'Pretoria',
  address: '1 Test Street, Menlyn',
  capacity: 2,
  openingHours: { '1': { open: '08:30', close: '16:30' }, '2': { open: '08:30', close: '16:30' } },
};

describe('POST /api/admin/branches', () => {
  it('creates a branch with an auto-generated slug and logs it', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app).post('/api/admin/branches').set(auth).send(validBranch);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: 'menlyn-test-branch', name: 'Menlyn Test Branch', capacity: 2 });
    expect(res.body.timezone).toBe('Africa/Johannesburg');
    expect(res.body.slotMinutes).toBe(30); // default

    // The new branch is immediately visible on the public list.
    const list = await request(ctx.app).get('/api/branches');
    expect(list.body.branches.some((b: { slug: string }) => b.slug === 'menlyn-test-branch')).toBe(true);

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    const entry = log.body.entries.find((e: { action: string }) => e.action === 'BRANCH_CREATED');
    expect(entry).toMatchObject({ targetType: 'branch', targetId: 'menlyn-test-branch' });
  });

  it('appends a numeric suffix when the slug already exists', async () => {
    const auth = await adminAuth();
    const first = await request(ctx.app).post('/api/admin/branches').set(auth).send(validBranch);
    const second = await request(ctx.app).post('/api/admin/branches').set(auth).send(validBranch);
    expect(first.body.slug).toBe('menlyn-test-branch');
    expect(second.body.slug).toBe('menlyn-test-branch-2');
  });

  it('rejects a branch with no open days', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app)
      .post('/api/admin/branches')
      .set(auth)
      .send({ ...validBranch, openingHours: {} });
    expect(res.status).toBe(400);
  });

  it('rejects an opening time that is not before the closing time', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app)
      .post('/api/admin/branches')
      .set(auth)
      .send({ ...validBranch, openingHours: { '1': { open: '16:00', close: '09:00' } } });
    expect(res.status).toBe(400);
  });

  it('rejects the request without an admin token', async () => {
    const res = await request(ctx.app).post('/api/admin/branches').send(validBranch);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/branches/:id', () => {
  it('updates only the provided fields and logs it', async () => {
    const auth = await adminAuth();
    // Sandton City is branch id 1 from the seed data.
    const res = await request(ctx.app).patch('/api/admin/branches/1').set(auth).send({ capacity: 9 });
    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(9);
    expect(res.body.name).toBe('Sandton City'); // unchanged

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    expect(log.body.entries.find((e: { action: string }) => e.action === 'BRANCH_UPDATED')).toMatchObject({
      targetType: 'branch',
      targetId: 'sandton-city',
    });
  });

  it('replaces opening hours wholesale when provided', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app)
      .patch('/api/admin/branches/1')
      .set(auth)
      .send({ openingHours: { '3': { open: '10:00', close: '14:00' } } });
    expect(res.status).toBe(200);
    expect(res.body.openingHours).toEqual({ '3': { open: '10:00', close: '14:00' } });
  });

  it('404s for an unknown branch', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app).patch('/api/admin/branches/999').set(auth).send({ capacity: 5 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/services', () => {
  it('creates a service appended to the end of the display order', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app)
      .post('/api/admin/services')
      .set(auth)
      .send({ name: 'New Test Service', description: 'A brand new service for testing', durationMinutes: 45 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: 'new-test-service', durationMinutes: 45 });

    const list = await request(ctx.app).get('/api/services');
    expect(list.body.services.at(-1).slug).toBe('new-test-service');
  });
});

describe('PATCH /api/admin/services/:id', () => {
  it('updates only the provided fields', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app).patch('/api/admin/services/1').set(auth).send({ durationMinutes: 20 });
    expect(res.status).toBe(200);
    expect(res.body.durationMinutes).toBe(20);
    expect(res.body.name).toBe('Open a new account'); // unchanged
  });

  it('404s for an unknown service', async () => {
    const auth = await adminAuth();
    const res = await request(ctx.app).patch('/api/admin/services/999').set(auth).send({ durationMinutes: 20 });
    expect(res.status).toBe(404);
  });
});
