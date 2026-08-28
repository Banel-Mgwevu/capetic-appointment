# Branch Appointment Booking

A full-stack system for customers to book an appointment at a bank branch and receive a (simulated) confirmation by email and SMS.

- **Backend:** Node.js 22, TypeScript, Express, SQLite (better-sqlite3), Zod, Pino
- **Frontend:** React 18, TypeScript, Vite, React Router
- **Tests:** Vitest, Supertest, Testing Library, Playwright (end to end)
- **Packaging:** single Docker image serving both the API and the built web app

## Quick start

### With Docker (recommended)

```bash
docker build -t branch-appointment-booking .
docker run --rm -p 3000:3000 -v appointments-data:/app/data branch-appointment-booking
```

or

```bash
docker compose up --build
```

Then open <http://localhost:3000>. The SQLite database is written to the `appointments-data` volume so bookings survive restarts. Confirmation messages are printed to the container log (`[SIMULATED EMAIL]`, `[SIMULATED SMS]`) and shown on the confirmation page.

### Locally

Requires Node.js 22 or 24 and npm 10+. `better-sqlite3` ships a prebuilt binary for these platforms, so no C++ toolchain is needed to install it. The repo's `.npmrc` sets `ignore-scripts=true` to make that reliable: npm has an undocumented-feeling default where, if a package ships a `binding.gyp` but no explicit `install`/`postinstall` script (true of `better-sqlite3`), npm runs `node-gyp rebuild` anyway — even though a prebuilt binary is sitting right there. `ignore-scripts=true` skips that. It's safe here: nothing else in this project's dependency tree needs an install script to run (verified — `esbuild`'s platform binary comes from `optionalDependencies`, not its postinstall).

```bash
npm install
npm run dev        # API on :3000 (tsx watch) + web app on :5173 (Vite, proxies /api)
```

Open <http://localhost:5173>. Copy `.env.example` to `.env` to override defaults.

To run the production build locally without Docker:

```bash
npm run build
STATIC_DIR=client/dist npm start   # http://localhost:3000
```

## Testing and quality checks

```bash
npm test             # server (unit + API integration) and client (unit + component) tests
npm run lint         # ESLint with type-aware rules
npm run typecheck    # tsc --noEmit for both workspaces
npm run check        # all of the above
```

Server tests run against an in-memory SQLite database with a fixed clock, so they are deterministic and need no setup.

### End-to-end tests

```bash
npx playwright install --with-deps chromium   # once, if browsers aren't installed yet
npm run build
npm run test:e2e
```

`e2e/*.spec.ts` drive a real browser against the actual built production server (the same artifact the Dockerfile produces, served from `client/dist` via `STATIC_DIR`) on port 3100, covering the booking flow, find/cancel, reschedule, the OTP-gated "my appointments" list, and staff tools (lookup, cancel/reschedule on a customer's behalf, audit log). Playwright starts one server for the whole run, so specs use a fresh email per booking rather than assuming an empty database. `npm run test:e2e:ui` opens Playwright's UI mode for debugging a failing spec.

`.github/workflows/ci.yml` runs unit/integration tests, the E2E suite, and a Docker build-and-smoke-test on every push.

## How it works

### Booking flow

1. Customer picks a **service** (e.g. open an account, home loan consultation). Each service has a duration.
2. Picks a **branch**. Each branch has opening hours per weekday, a slot granularity (30 min) and a capacity (number of consultants).
3. Picks a **date** and sees a grid of times. Unavailable slots are shown but disabled.
4. Enters **their details** (name, email, SA mobile number, optional SA ID number, optional notes) and confirms.
5. Receives a **reference** (`APT-XXXXXX`) and a confirmation screen. The reference (with the email or phone on the booking) can be used on the *Find a booking* page to view, reschedule, or cancel the appointment. Every booking is also linked into **My appointments**, a one-time-code-gated list of everything tied to a contact.

### Availability rules

The slot grid for a branch-day is computed in one pure function (`server/src/domain/scheduling.ts`) that is used both to *show* availability and to *validate* a booking, so the two can never disagree. The same function backs rescheduling, with the appointment's own current slot excluded from the count so moving it doesn't collide with itself.

A slot is available when, for every 30-minute unit the service would occupy, fewer than `capacity` confirmed appointments overlap that unit. This makes variable-length services safe: a 60-minute consultation consumes two consecutive units of one consultant's time, and a 30-minute service can still use the other consultant.

Other rules:

- Bookings are accepted from today up to `BOOKING_HORIZON_DAYS` (default 30) ahead.
- Slots starting within `BOOKING_MIN_LEAD_MINUTES` (default 30) of now are not offered.
- Closed days return `open: false` with no slots.
- Appointments that have already started cannot be cancelled or rescheduled.

Times are branch-local wall-clock strings (`YYYY-MM-DDTHH:mm`) with the branch's IANA timezone stored alongside. "Now" is resolved in the branch timezone, so the system behaves correctly regardless of the server's timezone.

### Concurrency

The availability check and the insert (or, for rescheduling, the update) run inside a single SQLite transaction. better-sqlite3 is synchronous and SQLite serialises writers, so two requests racing for the last unit of capacity cannot both succeed. This holds for a single process, which is the deployment model here; scaling out would call for a database with row-level locking (see *Production considerations*).

### Confirmation, reminders, and rescheduling

`AppointmentService` depends on a `Notifier` interface. The provided `SimulatedNotifier` persists each message to the `notifications` table (tagged with a `kind`: `CONFIRMATION`, `CANCELLATION`, `RESCHEDULE`, or `REMINDER`) with status `SENT` and logs it, and it's returned in the booking/lookup API response so it can be inspected via the API even though the current UI doesn't render a message log. Swapping in a real email/SMS gateway means implementing `Notifier` and wiring it in `createApp`; nothing else changes.

A background job (`ReminderService`, scheduled in `index.ts` via `REMINDER_CHECK_INTERVAL_MINUTES`) sends a reminder for every confirmed appointment starting "tomorrow" that hasn't already had one — idempotent by checking the `notifications` table rather than a schedule, so restarts or overlapping runs never double-send.

Rescheduling (`POST /appointments/:reference/reschedule`) moves a confirmed appointment to a new time at the same branch and service, subject to the same availability and lead-time rules as a fresh booking, and sends a "moved" notification with the old and new times.

### Staff tools and the audit trail

Signed in separately from customers (`POST /auth/login`), staff can look up, cancel, or reschedule any booking by reference alone, for example while on the phone with a customer — no contact verification needed, since the admin session already establishes who's asking. Every staff **login (success or failure), lookup, cancel, or reschedule** is written to an append-only `audit_log` table (`AuditLogRepository`) with the actor, action, and booking reference, viewable at `/admin/audit-log`. Deliberately excluded from the log: customers acting on their own bookings (already visible via the booking's own status and notification history), and anything containing personal data — the log itself is a POPIA-relevant artifact, so it only ever stores booking references, never names, emails, or phone numbers.

Staff accounts are per-person (`staff_users` table), not one shared login, so the audit trail attributes actions to an actual account rather than "admin" for everyone. Manage accounts with:

```bash
npm run create-staff-user -w server -- <username> <password>   # creates, or resets the password if the username exists
```

The same operation is also available as an authenticated API call (`POST /admin/staff-users`, requires an existing admin token) — useful on platforms without shell access to the running server, since an already-signed-in admin can create the next account through the app itself rather than needing to run a CLI command against the live database.

Branches and services were otherwise pure seed data with no admin UI, meaning a new branch or a change in opening hours needed a code change and redeploy. `/admin/manage` fixes that: create or edit branches (including a per-weekday opening-hours editor) and services directly, each change logged the same way as everything else under `/admin`.

### Frontend resilience

A React error boundary wraps the routed page content (not the header/footer, so navigation still works if a page crashes), keyed by the current path so navigating away from a broken page recovers cleanly rather than staying stuck on the fallback. Covered by `ErrorBoundary.test.tsx`.

On a fresh database, the *first* account is bootstrapped automatically from `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` (or the dev-only `ADMIN_PASSWORD` fallback) so an existing deployment's env vars keep working with no manual step — after that, those env vars are never consulted again. Five failed logins against one account lock it for 15 minutes (`ADMIN_MAX_LOGIN_ATTEMPTS`/`ADMIN_LOCKOUT_MINUTES`), independent of the per-IP rate limiter, so brute-forcing one person's password doesn't work just by spreading attempts across source IPs. An unknown username is rejected with the same generic message and roughly the same response time as a wrong password, so the login endpoint can't be used to enumerate valid staff usernames.

### "My appointments" and data retention (POPIA)

An email address or phone number isn't a secret the way a random booking reference is, so listing every booking tied to one (`GET /customers/appointments`) requires proving control of it first: request a one-time code (`POST /customers/otp/request`, always returns the same generic response so the endpoint can't be used to check who has bookings), verify it (`POST /customers/otp/verify`) for a short-lived contact-scoped token, then list. Opening one booking from that list mints a normal per-booking token behind the scenes (`POST /customers/appointments/:reference/access-token`) rather than asking the customer to re-verify.

Booking now requires explicit `consent` (validated server-side; see the in-app privacy notice at `/privacy`), and `RetentionService` anonymises — not deletes — the personal fields (name, email, phone, ID number, notes) on any booking older than `DATA_RETENTION_DAYS`, once it's no longer needed for the purpose it was collected for. The row, its status, timing, and branch/service links are kept so analytics stay accurate indefinitely; only who it was for is forgotten. Runs automatically (`RETENTION_CHECK_INTERVAL_HOURS`) and can be triggered on demand from the audit log page, which is itself an audited staff action.

Delivery failures do not fail the booking: the appointment is already committed and the customer has their reference on screen.

## Signing in to a booking (customer) and staff analytics

There are no customer accounts. Instead:

- **Booking lookup** requires proving you know the reference *and* the email or phone on the booking (`POST /appointments/:reference/access`). A correct match returns a signed, 30-minute access token; the frontend stores it in `sessionStorage` and sends it as `Authorization: Bearer <token>` on every request for that booking. Right after you book, a token is issued automatically so you land on your confirmation page without a separate sign-in step.
- **Branch search** on the "Which branch suits you?" step is a client-side filter over name, suburb and city -- there is no separate search endpoint, since the branch list is already small and fully returned.
- **Staff analytics** (`/admin/analytics`) is protected separately: sign in at `/admin/login` with a staff account (see above) to get an 8-hour admin token, then view booking totals, per-branch and per-service breakdowns, a day-by-day trend, and the busiest hour, over a 7/30/90-day range.

Both token kinds are short, self-contained, HMAC-signed strings (`domain/token.ts`) rather than a session store or JWT library -- enough for this project's needs without adding a dependency or a stateful session table. See *Production considerations* below for what a real deployment would add on top.

## API

All endpoints are under `/api` and return JSON. Errors have the shape `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check (also verifies the database responds) |
| `GET` | `/branches` | Branches with address, timezone, capacity and opening hours |
| `GET` | `/services` | Services with duration |
| `GET` | `/branches/:id/availability?serviceId=&date=YYYY-MM-DD` | Slot grid for one day |
| `POST` | `/appointments` | Book (requires `consent: true`). Returns `201` with the appointment, notifications, and a 30-minute `access` token for it |
| `POST` | `/appointments/:reference/access` | "Sign in" to a booking with its email or phone. Returns a 30-minute access token |
| `GET` | `/appointments/:reference` | Appointment details. Requires `Authorization: Bearer <access token>` |
| `POST` | `/appointments/:reference/cancel` | Cancel a confirmed appointment. Requires the access token |
| `POST` | `/appointments/:reference/reschedule` | Move a confirmed appointment to a new time. Requires the access token |
| `POST` | `/customers/otp/request` | Request a one-time code for "my appointments". Always returns a generic response |
| `POST` | `/customers/otp/verify` | Verify the code. Returns a 15-minute contact-scoped token |
| `GET` | `/customers/appointments` | Every booking for the verified contact. Requires `Authorization: Bearer <contact token>` |
| `POST` | `/customers/appointments/:reference/access-token` | Mint a per-booking access token from an already-verified contact session |
| `POST` | `/auth/login` | Admin sign-in (`username`, `password`). Returns an 8-hour admin token. Logged to the audit trail either way |
| `GET` | `/analytics/summary?rangeDays=30` | Booking totals, per-branch/service/day/hour breakdowns. Requires `Authorization: Bearer <admin token>` |
| `GET` | `/admin/appointments/:reference` | Staff lookup of any booking, no customer verification. Logged to the audit trail |
| `POST` | `/admin/appointments/:reference/cancel` | Staff-initiated cancel. Logged |
| `POST` | `/admin/appointments/:reference/reschedule` | Staff-initiated reschedule. Logged |
| `GET` | `/admin/audit-log?limit=50` | Recent staff actions |
| `POST` | `/admin/privacy/purge` | Run the data-retention sweep immediately. Logged |
| `POST` | `/admin/staff-users` | Create a staff account, or reset an existing one's password/lockout. Admin-only. Logged |
| `POST` | `/admin/branches` | Create a branch (slug auto-generated). Admin-only. Logged |
| `PATCH` | `/admin/branches/:id` | Update any subset of a branch's fields, including opening hours. Admin-only. Logged |
| `POST` | `/admin/services` | Create a service (slug auto-generated, appended to the display order). Admin-only. Logged |
| `PATCH` | `/admin/services/:id` | Update any subset of a service's fields. Admin-only. Logged |

Example booking:

```bash
curl -X POST http://localhost:3000/api/appointments \
  -H 'Content-Type: application/json' \
  -d '{
    "branchId": 2,
    "serviceId": 1,
    "startsAt": "2026-09-03T09:00",
    "customer": { "name": "Banele Ndlovu", "email": "banele@example.com", "phone": "082 555 0123" },
    "consent": true
  }'
```

Error codes you will see: `VALIDATION_ERROR` (400, with per-field `details`), `NOT_FOUND` (404), `UNAUTHENTICATED` (401), `SLOT_UNAVAILABLE`, `VERIFICATION_FAILED`, `CODE_INVALID`, `ALREADY_CANCELLED`, `APPOINTMENT_IN_PAST` (409), `RATE_LIMITED` (429).

The customer's ID number is stored but never returned by the API.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `DATABASE_PATH` | `./data/appointments.db` | SQLite file (`:memory:` for ephemeral) |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | unset | Comma-separated allowed origins (only needed when the web app is served elsewhere) |
| `STATIC_DIR` | unset | Directory of the built web app to serve; unset = API only |
| `BOOKING_HORIZON_DAYS` | `30` | How far ahead bookings are accepted |
| `BOOKING_MIN_LEAD_MINUTES` | `30` | Minimum notice before a slot |
| `AUTH_SECRET` | dev default | HMAC signing key for customer-access, contact, and admin tokens. **Set a real random value in production.** |
| `ADMIN_USERNAME` | `admin` | Bootstraps the *first* staff account on a fresh database only. Ignored once any `staff_users` row exists |
| `ADMIN_PASSWORD_HASH` | unset | Bootstrap password hash (`npm run hash-password -w server -- <password>`). **Set this in production.** |
| `ADMIN_PASSWORD` | `changeme123` | Dev-only bootstrap fallback used when `ADMIN_PASSWORD_HASH` is unset (logs a startup warning) |
| `ADMIN_MAX_LOGIN_ATTEMPTS` | `5` | Failed logins before an account is temporarily locked |
| `ADMIN_LOCKOUT_MINUTES` | `15` | How long an account stays locked after hitting the attempt limit |
| `EMERGENCY_ADMIN_USERNAME` / `EMERGENCY_ADMIN_PASSWORD` | unset | Set both to forcibly reset that account's password on next boot. See "Recovering admin access" below. **Remove after use.** |
| `DATA_RETENTION_DAYS` | `90` | How long after a booking's date its personal fields are kept before anonymisation |
| `RETENTION_CHECK_INTERVAL_HOURS` | `24` | How often the retention sweep runs in the background. `0` disables it |
| `REMINDER_CHECK_INTERVAL_MINUTES` | `60` | How often the day-before reminder sweep runs. `0` disables it |
| `PRIVACY_CONTACT_EMAIL` | `privacy@capitec.example` | Shown on the in-app privacy notice for data-subject requests |

Configuration is validated at startup; the process exits with a clear message if a value is invalid.

### Deploying to Render (or similar PaaS)

`.env.render.example` lists exactly what to set as Environment Variables in the dashboard (not as a committed `.env` file). Two things that trip people up:

- **Don't set `PORT` yourself** — most platforms inject it, and the app already reads `process.env.PORT`.
- **SQLite needs a persistent disk.** Without one, `DATABASE_PATH` is wiped on every deploy. Mount a disk (e.g. `/var/data`) and point `DATABASE_PATH` at a file inside it.
- **Mounted disks arrive owned by root**, but the container runs the app as an unprivileged `node` user for security. A plain build-time `USER node`/`chown` can't fix this, since the disk is only mounted at container *start*, after the image was built. `docker-entrypoint.sh` runs as root first, `chown`s the database directory, then drops to `node` (via `gosu`) to actually run the app — this is the same pattern the official Postgres/MySQL images use. If you see `EACCES: permission denied, mkdir '/var/data'` in your platform's logs, this is what fixes it; it's already wired into the Dockerfile.

### Recovering admin access

Staff passwords live in the database, not in an env var, so changing `ADMIN_PASSWORD_HASH` in your platform's dashboard **does nothing** once at least one staff account already exists — it's a bootstrap value, only ever read on a completely empty database (see "Staff tools" above). If you're locked out (five wrong attempts locks an account for 15 minutes) or have genuinely forgotten a password, in order of preference:

1. **Have a shell?** `npm run create-staff-user -w server -- <username> <password>` against the live database.
2. **No shell, but another account still works?** Sign in with it, then call `POST /admin/staff-users` with its token to reset the locked/forgotten one (exact `curl` commands in `.env.render.example`).
3. **No shell, and no working login at all?** Set both `EMERGENCY_ADMIN_USERNAME` and `EMERGENCY_ADMIN_PASSWORD` in your platform's dashboard and redeploy. On the next boot, that account's password is forcibly reset (and any lockout cleared) — no shell or `curl` needed, just a redeploy. **Remove both variables again immediately after and redeploy once more.** Leaving them set means every future restart repeats the reset, silently undoing any password change made through the app afterward — a real footgun if forgotten, so the server logs a loud warning every time it fires as a reminder.

## Branding and assets

The UI is themed on the Capitec mark: navy `#00466f` and red `#e73934`, sampled directly from the supplied logo. `client/public/logo.png` is the source logo with its background removed (flood-filled, not colour-keyed, so the white gap in the mark itself is preserved); the favicon and PWA icon set in the same folder were generated from it. If the logo changes, regenerate the icon set rather than hand-editing the PNGs — see the git history for the generation script if needed.

## Project layout

```
server/
  src/
    index.ts              # bootstrap: config, migrations, seed, background jobs, listen, graceful shutdown
    app.ts                # composition root: wires repositories, services, middleware, routes
    config.ts             # environment schema
    logger.ts             # pino with PII redaction
    domain/               # pure business rules, no I/O
      scheduling.ts       #   slot grid + capacity rule
      time.ts             #   local date/time helpers
      customer.ts         #   SA phone / ID number validation, contact normalisation
      reference.ts        #   booking reference format
      token.ts            #   signed customer/contact/admin tokens (HMAC, no JWT dependency)
      password.ts         #   scrypt password hashing for admin sign-in
      otp.ts              #   one-time-code generation/hashing for "my appointments"
      errors.ts
    db/                   # connection, forward-only migrations, seed data
    repositories/         # thin SQL access: branches, services, appointments, notifications, audit log, OTP codes
    services/             # use cases: availability, booking/cancel/reschedule, auth, OTP, retention, reminders, analytics
    http/                 # zod schemas, validation + error/auth middleware, routers (appointments, customers, admin, analytics)
  test/                   # unit tests for domain, supertest tests for the API
  scripts/                # hash-password and create-staff-user CLIs for managing admin credentials
client/
  src/
    pages/                # Booking wizard, confirmation, find/manage, reschedule, my-appointments, admin (login/lookup/audit/analytics), privacy notice
    components/           # Ticket, SlotGrid, Stepper, Field, Notice, Skeleton, Spinner, BarList, StaffNav
    lib/                  # typed API client, date helpers, client-side validation, session token storage
e2e/                      # Playwright specs against the real built server
Dockerfile                # multi-stage build → single runtime image
docker-compose.yml
playwright.config.ts
.github/workflows/ci.yml
```

## Production considerations

Things deliberately kept simple for this exercise, and what I would change for a real deployment:

- **Database.** SQLite is a good fit for a single-instance service and makes the project self-contained. For horizontal scaling I would move to PostgreSQL, keep the same repository interfaces, and enforce capacity with `SELECT … FOR UPDATE` on the branch-day.
- **Notifications.** Replace `SimulatedNotifier` with an outbox-backed worker so retries and provider failures are handled outside the request path. The OTP delivery path (currently a log line) would move to the same real gateway.
- **Background jobs are lock-protected but still single-instance.** `JobLockRepository` stops the retention/reminder sweeps from double-processing if two runs overlap (e.g. the scheduled timer racing a manual "run now" click) — a real bug this closed, not just a theoretical one, since the reminder sweep's "already reminded?" check and the send weren't atomic with each other. What it does *not* do is coordinate across multiple app instances each with their own SQLite file, since Render disks aren't shared storage; the same lock pattern would work correctly unchanged if this ever moves to a real shared database like Postgres with multiple replicas pointed at it.
- **Admin accounts.** Per-staff accounts with lockout exist, and an admin can create more staff accounts or manage the branch/service catalog through the app itself (no shell access needed). Still missing: SSO and permission tiers (every staff account can currently do everything).
- **Session storage.** Tokens live in the browser's `sessionStorage` and are attached manually as `Authorization` headers. An `httpOnly` cookie would be safer against any future XSS in the app, at the cost of needing CSRF protection instead.
- **Rate limiting is in-memory and per-process**, via `express-rate-limit`'s default store. It resets on every restart and doesn't coordinate across multiple instances — fine for one instance, not for a horizontally-scaled deployment, which would need a shared store (e.g. Redis-backed).
- **Observability.** Request IDs are already propagated (`X-Request-Id`); I would add OpenTelemetry tracing and metrics on booking outcomes.
- **Secrets and TLS** are expected to be handled by the platform (reverse proxy / load balancer), which is why the app does not upgrade insecure requests itself.
- **Data-subject deletion requests.** The retention sweep handles routine anonymisation on a schedule; an explicit "delete my data now" request (as opposed to "wait for the retention window") would need its own admin action, distinct from the scheduled purge.
- **No automated database backups.** A lost Render disk means lost bookings; a real deployment would schedule regular snapshots of the SQLite file (or move to a managed Postgres instance with point-in-time recovery).
