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

## Getting Started

```bash
cp .env.example .env   # fill in credentials
npm install
npx prisma generate
npm run dev
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
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side storage uploads |
| `CRON_SECRET` | Vercel cron authentication |

## Windows Dev Note

Add to `.env` to avoid TLS errors with Supabase on Windows:

```
DATABASE_SSL_INSECURE=true
```

`next.config.mjs` already disables Node TLS verification in dev for the Supabase JS SDK.

## Database

```bash
# Apply migrations (production — requires DIRECT_URL)
npx prisma migrate deploy

# Regenerate client after schema changes
npx prisma generate
```

## Supabase Storage

Create these buckets in your Supabase dashboard before uploading any media:

- `profile-photos`
- `event-images`
- `memories`

## Notifications (Cron)

Add to `vercel.json` to run the notification dispatch every 5 minutes:

```json
{
  "crons": [
    { "path": "/api/notifications/dispatch", "schedule": "*/5 * * * *" }
  ]
}
```

## Deploy

Push to Vercel. Add all environment variables in the Vercel dashboard. Vercel runs `prisma generate` and `next build` automatically.

Run migrations manually after deploy:

```bash
npx prisma migrate deploy
```
