# OuttaCouch

Event-first social platform. Discover events nearby, commit to attend, and connect with the people you meet there.

## Stack

- **Next.js 15** App Router + TypeScript + Tailwind CSS
- **Prisma 7** + PostgreSQL (Supabase) + Socket.io
- **NextAuth v4** — Credentials + JWT
- **Twilio** — Verify (OTP), SMS + WhatsApp (invites)
- **Nodemailer** — email OTP and notifications
- **Supabase Storage** — profile photos, event images, memories
- **Leaflet** — interactive maps
- **qrcode.react** — QR tickets
- **Vitest + Testing Library** — unit, API-route and UI tests

## Getting Started

```bash
cp .env.example .env   # fill in credentials
npm install
npx prisma generate
npm run dev
```

## Project layout

```
app/(auth)/        login, signup (+verify, +password), reset, onboarding — public
app/(main)/        explore, events, connections, chat, notifications, profile, settings, users — protected
app/api/           REST backend (one route.ts per endpoint)
app/join/          public referral landing (/join?ref=CODE)
pages/api/socketio.ts  the only Pages-Router file: boots Socket.io on the Node server
components/        events (EventMap, MapPicker, SwipeStack), profile, ui
lib/               prisma, auth helpers, csrf, rateLimit, socketAuth, twilio, email, storage, validation
middleware.ts      JWT-only route gating (no DB hit)
prisma/            schema + migrations
scripts/e2e/       seed + smoke scripts for a disposable database
tests/             Vitest suite (mirrors the source tree)
Outtacouch.txt     master reference guide (architecture, decisions, security posture)
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase PgBouncer pooled connection (runtime) |
| `DIRECT_URL` | Supabase direct connection (migrations only) |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Auth session |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio credentials |
| `TWILIO_VERIFY_SERVICE_SID` | Phone OTP |
| `TWILIO_PHONE_NUMBER` / `TWILIO_WHATSAPP_NUMBER` | SMS + WhatsApp invites |
| `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` | SMTP credentials |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server-side storage uploads |
| `CRON_SECRET` | Vercel cron authentication |

## Windows Dev Note

Add to `.env` to avoid TLS errors with Supabase on Windows:

```
DATABASE_SSL_INSECURE=true
```

`next.config.mjs` already disables Node TLS verification in dev for the Supabase JS SDK.

## Quality gates

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm test               # vitest run
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage report (coverage/)
npm run build          # next build
```

The Vitest suite (540+ tests) covers every lib module, the middleware, every API route handler branch by branch, the Socket.io auth layer, every component, and every page. Prisma, NextAuth, Twilio, SMTP, Supabase and Leaflet are mocked, so it needs no database or credentials. API-route tests call the exported `GET`/`POST`/... handlers directly with a `NextRequest`; UI tests run under jsdom (opt in per file with `// @vitest-environment jsdom`). Any unmocked `fetch` fails fast instead of reaching the network.

### End-to-end smoke test

`scripts/e2e/` drives the real server through the whole product loop (login, onboarding gates, feed, commit + capacity race, chat, tickets, cron dispatch, referrals, socket auth — 100 checks). It needs a **disposable** PostgreSQL database because the seed truncates every table.

```bash
# 1. point DATABASE_URL at a throwaway database, then apply the schema and seed it
DATABASE_URL=postgresql://... DATABASE_SSL=false npx prisma migrate deploy
DATABASE_URL=postgresql://... DATABASE_SSL=false npm run e2e:seed

# 2. run the server against it (any secret works, it just has to match)
DATABASE_URL=postgresql://... DATABASE_SSL=false CRON_SECRET=smoke-cron npm run dev

# 3. in another shell
BASE=http://localhost:3000 CRON_SECRET=smoke-cron npm run e2e:smoke
```

Seeded logins: `host@test.local`, `alice@test.local`, `bob@test.local`. Their shared password is the value of `E2E_LOGIN_SECRET` (a fixed dev default is used when unset; set the same value for seed and smoke). The seed refuses Supabase hosts unless `E2E_ALLOW_REMOTE=true`.

## Database

```bash
# Apply migrations (production — requires DIRECT_URL)
npx prisma migrate deploy

# Regenerate client after schema changes
npx prisma generate
```

Timestamp columns are `timestamp` without time zone and Prisma reads/writes them as UTC wall-clock. Anything else that writes the database (seeds, raw SQL) must do the same.

## Supabase Storage

Create these buckets in your Supabase dashboard before uploading any media:

- `profile-photos`
- `event-images`
- `memories`

Uploads go through `POST /api/storage/upload` with the service-role key on the server; object keys are user-scoped and random.

## Notifications (Cron)

`vercel.json` runs `GET /api/notifications/dispatch` every 5 minutes with `Authorization: Bearer $CRON_SECRET`. The claim is a single `UPDATE … RETURNING`, so overlapping runs never double-send.

## Realtime

Socket.io is bootstrapped from `pages/api/socketio.ts` and needs a long-lived Node process (Railway, Render, a VM). On Vercel's serverless runtime the socket never upgrades; chat still works because messages persist over REST and the UI appends the POST response. The handshake is authenticated from the NextAuth cookie and `join` verifies connection membership.

## Known limitations / not built yet

- **No online payments.** Paid events say "contact the host"; nothing creates `Ticket` rows, so the ticket, QR and refund endpoints only operate on rows inserted out of band. Stripe ids in the schema are unused.
- **`ApprovalMode.manual` and `AttendeeStatus.waitlisted`** exist in the schema but have no logic.
- **Web push** is not wired; notifications are in-app only (plus email for connection events).
- **QR scanner** is a paste box, not a camera.
- **Rate limiting is in-memory** (per instance) and trusts `x-forwarded-for`; use Redis + a trusted client IP in production.
- **No JWT revocation** after password reset or deactivation until the token expires.
- **Feed ranking** scores only the current 50-row page in memory; rank in SQL before paginating at scale.
- **Contact sync** replaces all imports each run and auto-connects matched users without asking.
- **Event dates are parsed in server-local time** with no timezone; store UTC and render local.

## Deploy

Push to Vercel. Add all environment variables in the Vercel dashboard. Vercel runs `prisma generate` and `next build` automatically.

Run migrations manually after deploy:

```bash
npx prisma migrate deploy
```
