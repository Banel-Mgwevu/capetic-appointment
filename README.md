# Branch Appointment Booking

A full-stack system for customers to book an appointment at a bank branch and receive a (simulated) confirmation by email and SMS.

- **Backend:** Node.js 22, TypeScript, Express, SQLite (better-sqlite3), Zod, Pino
- **Frontend:** React 18, TypeScript, Vite, React Router
- **Tests:** Vitest, Supertest, Testing Library
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

Requires Node.js 22 or 24 and npm 10+. (`better-sqlite3` downloads a prebuilt binary for these versions, so no C++ toolchain is needed.)

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

Server tests run against an in-memory SQLite database with a fixed clock, so they are deterministic and need no setup. `.github/workflows/ci.yml` runs the same checks and then builds and smoke-tests the Docker image.

## How it works

### Booking flow

1. Customer picks a **service** (e.g. open an account, home loan consultation). Each service has a duration.
2. Picks a **branch**. Each branch has opening hours per weekday, a slot granularity (30 min) and a capacity (number of consultants).
3. Picks a **date** and sees a grid of times. Unavailable slots are shown but disabled.
4. Enters **their details** (name, email, SA mobile number, optional SA ID number, optional notes) and confirms.
5. Receives a **reference** (`APT-XXXXXX`) and sees the confirmation email and SMS that were "sent". The reference can be used on the *Find a booking* page to view or cancel the appointment; cancelling releases the slot and sends a cancellation notice.

### Availability rules

The slot grid for a branch-day is computed in one pure function (`server/src/domain/scheduling.ts`) that is used both to *show* availability and to *validate* a booking, so the two can never disagree.

A slot is available when, for every 30-minute unit the service would occupy, fewer than `capacity` confirmed appointments overlap that unit. This makes variable-length services safe: a 60-minute consultation consumes two consecutive units of one consultant's time, and a 30-minute service can still use the other consultant.

Other rules:

- Bookings are accepted from today up to `BOOKING_HORIZON_DAYS` (default 30) ahead.
- Slots starting within `BOOKING_MIN_LEAD_MINUTES` (default 30) of now are not offered.
- Closed days return `open: false` with no slots.
- Appointments that have already started cannot be cancelled.

Times are branch-local wall-clock strings (`YYYY-MM-DDTHH:mm`) with the branch's IANA timezone stored alongside. "Now" is resolved in the branch timezone, so the system behaves correctly regardless of the server's timezone.

### Concurrency

The availability check and the insert run inside a single SQLite transaction. better-sqlite3 is synchronous and SQLite serialises writers, so two requests racing for the last unit of capacity cannot both succeed. This holds for a single process, which is the deployment model here; scaling out would call for a database with row-level locking (see *Production considerations*).

### Confirmation

`AppointmentService` depends on a `Notifier` interface. The provided `SimulatedNotifier` persists each message to the `notifications` table with status `SENT` and logs it. That gives an auditable record of exactly what the customer would have received, which the UI displays. Swapping in a real email/SMS gateway means implementing `Notifier` and wiring it in `createApp`; nothing else changes.

Delivery failures do not fail the booking: the appointment is already committed and the customer has their reference on screen.

## Signing in to a booking (customer) and staff analytics

There are no customer accounts. Instead:

- **Booking lookup** requires proving you know the reference *and* the email or phone on the booking (`POST /appointments/:reference/access`). A correct match returns a signed, 30-minute access token; the frontend stores it in `sessionStorage` and sends it as `Authorization: Bearer <token>` on every request for that booking. Right after you book, a token is issued automatically so you land on your confirmation page without a separate sign-in step.
- **Branch search** on the "Which branch suits you?" step is a client-side filter over name, suburb and city -- there is no separate search endpoint, since the branch list is already small and fully returned.
- **Staff analytics** (`/admin/analytics`) is protected separately: sign in at `/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` (see Configuration) to get an 8-hour admin token, then view booking totals, per-branch and per-service breakdowns, a day-by-day trend, and the busiest hour, over a 7/30/90-day range.

Both token kinds are short, self-contained, HMAC-signed strings (`domain/token.ts`) rather than a session store or JWT library -- enough for this project's needs without adding a dependency or a stateful session table. See *Production considerations* below for what a real deployment would add on top.

## API

All endpoints are under `/api` and return JSON. Errors have the shape `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check (also verifies the database responds) |
| `GET` | `/branches` | Branches with address, timezone, capacity and opening hours |
| `GET` | `/services` | Services with duration |
| `GET` | `/branches/:id/availability?serviceId=&date=YYYY-MM-DD` | Slot grid for one day |
| `POST` | `/appointments` | Book. Returns `201` with the appointment, notifications, and a 30-minute `access` token for it |
| `POST` | `/appointments/:reference/access` | "Sign in" to a booking with its email or phone. Returns a 30-minute access token |
| `GET` | `/appointments/:reference` | Appointment details. Requires `Authorization: Bearer <access token>` |
| `POST` | `/appointments/:reference/cancel` | Cancel a confirmed appointment. Requires the access token |
| `POST` | `/auth/login` | Admin sign-in (`username`, `password`). Returns an 8-hour admin token |
| `GET` | `/analytics/summary?rangeDays=30` | Booking totals, per-branch/service/day/hour breakdowns. Requires `Authorization: Bearer <admin token>` |

Example booking:

```bash
curl -X POST http://localhost:3000/api/appointments \
  -H 'Content-Type: application/json' \
  -d '{
    "branchId": 2,
    "serviceId": 1,
    "startsAt": "2026-09-03T09:00",
    "customer": { "name": "Banele Ndlovu", "email": "banele@example.com", "phone": "082 555 0123" }
  }'
```

Error codes you will see: `VALIDATION_ERROR` (400, with per-field `details`), `NOT_FOUND` (404), `UNAUTHENTICATED` (401), `SLOT_UNAVAILABLE`, `VERIFICATION_FAILED`, `ALREADY_CANCELLED`, `APPOINTMENT_IN_PAST` (409), `RATE_LIMITED` (429).

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
| `AUTH_SECRET` | dev default | HMAC signing key for customer-access and admin tokens. **Set a real random value in production.** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `changeme123` | Staff sign-in for `/admin/analytics`. **Change both before deploying.** |

Configuration is validated at startup; the process exits with a clear message if a value is invalid.

## Branding and assets

The UI is themed on the Capitec mark: navy `#00466f` and red `#e73934`, sampled directly from the supplied logo. `client/public/logo.png` is the source logo with its background removed (flood-filled, not colour-keyed, so the white gap in the mark itself is preserved); the favicon and PWA icon set in the same folder were generated from it. If the logo changes, regenerate the icon set rather than hand-editing the PNGs — see the git history for the generation script if needed.

## Project layout

```
server/
  src/
    index.ts              # bootstrap: config, migrations, seed, listen, graceful shutdown
    app.ts                # composition root: wires repositories, services, middleware, routes
    config.ts             # environment schema
    logger.ts             # pino with PII redaction
    domain/               # pure business rules, no I/O
      scheduling.ts       #   slot grid + capacity rule
      time.ts             #   local date/time helpers
      customer.ts         #   SA phone / ID number validation
      reference.ts        #   booking reference format
      errors.ts
    db/                   # connection, forward-only migrations, seed data
    repositories/         # thin SQL access, one per table
    services/             # use cases: availability, booking/cancel, notifications
    http/                 # zod schemas, validation + error middleware, routers
  test/                   # unit tests for domain, supertest tests for the API
client/
  src/
    pages/                # Booking wizard, confirmation, find, manage
    components/           # Ticket, SlotGrid, Stepper, Field, MessageLog, Notice
    lib/                  # typed API client, date helpers, client-side validation
Dockerfile                # multi-stage build → single runtime image
docker-compose.yml
.github/workflows/ci.yml
```

## Production considerations

Things deliberately kept simple for this exercise, and what I would change for a real deployment:

- **Database.** SQLite is a good fit for a single-instance service and makes the project self-contained. For horizontal scaling I would move to PostgreSQL, keep the same repository interfaces, and enforce capacity with `SELECT … FOR UPDATE` on the branch-day.
- **Authentication.** Appointments are looked up by reference only. A real system would tie bookings to an authenticated customer or, at minimum, require a second factor (e.g. the phone number) to view or cancel.
- **Notifications.** Replace `SimulatedNotifier` with an outbox-backed worker so retries and provider failures are handled outside the request path.
- **Reminders.** A scheduled job to send a reminder the day before, using the same templates.
- **Rescheduling** as a first-class operation (currently cancel + rebook).
- **Admin/branch view** for staff to see the day's appointments and mark arrivals.
- **Observability.** Request IDs are already propagated (`X-Request-Id`); I would add OpenTelemetry tracing and metrics on booking outcomes.
- **Secrets and TLS** are expected to be handled by the platform (reverse proxy / load balancer), which is why the app does not upgrade insecure requests itself.
