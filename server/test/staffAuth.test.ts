import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;

const login = (password: string, username = 'admin') => request(ctx.app).post('/api/auth/login').send({ username, password });

describe('per-staff accounts and lockout', () => {
  beforeEach(async () => {
    // Low threshold so the lockout path is practical to exercise in a test.
    ctx = await createTestContext({ ADMIN_MAX_LOGIN_ATTEMPTS: '3', ADMIN_LOCKOUT_MINUTES: '15' });
  });

  it('the bootstrapped account can sign in', async () => {
    const res = await login('test-admin-password');
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects an unknown username with the same generic message as a wrong password', async () => {
    const unknown = await login('whatever', 'nobody');
    const wrongPassword = await login('wrong-password');
    expect(unknown.status).toBe(400);
    expect(wrongPassword.status).toBe(400);
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('locks the account after the configured number of failed attempts', async () => {
    expect((await login('wrong-1')).status).toBe(400);
    expect((await login('wrong-2')).status).toBe(400);
    // Third failure hits the threshold (max 3) and locks the account.
    const third = await login('wrong-3');
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('ACCOUNT_LOCKED');

    // Even the correct password is refused while locked.
    const correctButLocked = await login('test-admin-password');
    expect(correctButLocked.status).toBe(409);
    expect(correctButLocked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('unlocks automatically once the lockout window has passed', async () => {
    await login('wrong-1');
    await login('wrong-2');
    await login('wrong-3');
    expect((await login('test-admin-password')).status).toBe(409);

    ctx.now = new Date(ctx.now.getTime() + 16 * 60_000); // 16 minutes later
    const res = await login('test-admin-password');
    expect(res.status).toBe(200);
  });

  it('a successful login resets the failed-attempt counter', async () => {
    await login('wrong-1');
    await login('wrong-2');
    expect((await login('test-admin-password')).status).toBe(200);

    // Counter should have reset to 0, not continued toward the lockout threshold.
    await login('wrong-again-1');
    const stillOk = await login('wrong-again-2');
    expect(stillOk.status).toBe(400);
    expect(stillOk.body.error.code).not.toBe('ACCOUNT_LOCKED');
  });

  it('a new account created via the CLI upsert path can sign in and audits under its own name', async () => {
    const { StaffUserRepository } = await import('../src/repositories/staffUserRepository.js');
    const { hashPassword } = await import('../src/domain/password.js');
    const staffUsers = new StaffUserRepository(ctx.db);
    staffUsers.upsert('sarah', await hashPassword('sarahs-password-123'), new Date().toISOString());

    const res = await login('sarahs-password-123', 'sarah');
    expect(res.status).toBe(200);

    const auth = { Authorization: `Bearer ${res.body.token as string}` };
    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    expect(log.body.entries[0]).toMatchObject({ actor: 'sarah', action: 'ADMIN_LOGIN_SUCCESS' });
  });
});

describe('POST /api/admin/staff-users', () => {
  beforeEach(async () => {
    ctx = await createTestContext({ ADMIN_MAX_LOGIN_ATTEMPTS: '3', ADMIN_LOCKOUT_MINUTES: '15' });
  });

  const adminAuth = async () => {
    const res = await login('test-admin-password');
    return { Authorization: `Bearer ${res.body.token as string}` };
  };

  it('lets a signed-in admin create a new staff account that can then sign in', async () => {
    const auth = await adminAuth();
    const create = await request(ctx.app)
      .post('/api/admin/staff-users')
      .set(auth)
      .send({ username: 'sarah', password: 'sarahs-password-123' });
    expect(create.status).toBe(201);
    expect(create.body).toEqual({ username: 'sarah', created: true });

    expect((await login('sarahs-password-123', 'sarah')).status).toBe(200);
  });

  it('resets an existing account\u2019s password and clears its lockout', async () => {
    await login('wrong-1');
    await login('wrong-2');
    await login('wrong-3'); // locks the account (threshold is 3 in this suite)
    expect((await login('test-admin-password')).status).toBe(409);

    // The admin account itself is locked, so use a separate account to perform the reset.
    const { StaffUserRepository } = await import('../src/repositories/staffUserRepository.js');
    const { hashPassword } = await import('../src/domain/password.js');
    new StaffUserRepository(ctx.db).upsert('helper', await hashPassword('helper-password-123'), new Date().toISOString());
    const helperLogin = await login('helper-password-123', 'helper');
    const helperAuth = { Authorization: `Bearer ${helperLogin.body.token as string}` };

    const reset = await request(ctx.app)
      .post('/api/admin/staff-users')
      .set(helperAuth)
      .send({ username: 'admin', password: 'brand-new-password-123' });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ username: 'admin', created: false });

    // Lockout is cleared and the new password works immediately.
    expect((await login('brand-new-password-123')).status).toBe(200);
  });

  it('rejects an invalid username or a short password', async () => {
    const auth = await adminAuth();
    const badUsername = await request(ctx.app).post('/api/admin/staff-users').set(auth).send({ username: 'a', password: 'longenough123' });
    expect(badUsername.status).toBe(400);

    const shortPassword = await request(ctx.app).post('/api/admin/staff-users').set(auth).send({ username: 'newperson', password: 'short' });
    expect(shortPassword.status).toBe(400);
  });

  it('rejects the request without a valid admin token', async () => {
    const res = await request(ctx.app).post('/api/admin/staff-users').send({ username: 'sarah', password: 'sarahs-password-123' });
    expect(res.status).toBe(401);
  });

  it('records the action in the audit log', async () => {
    const auth = await adminAuth();
    await request(ctx.app).post('/api/admin/staff-users').set(auth).send({ username: 'sarah', password: 'sarahs-password-123' });

    const log = await request(ctx.app).get('/api/admin/audit-log').set(auth);
    const entry = log.body.entries.find((e: { action: string }) => e.action === 'STAFF_USER_CREATED');
    expect(entry).toMatchObject({ targetType: 'staff_user', targetId: 'sarah' });
  });
});
