# OUTTACOUCH Web

Event-first social connection web app where the feed is the city and the profile is the events you lived.

## Tech Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- NextAuth (Credentials)
- Prisma + PostgreSQL (Supabase)
- Supabase Storage (images)
- Nodemailer (Gmail SMTP for OTP email)
- Framer Motion (swipe)
- Recharts (analytics)
- Leaflet / React-Leaflet (maps)
- Zustand + TanStack Query
- Stripe (PaymentIntents + webhooks)
- Socket.io (realtime chat)

## Core Features

- OTP auth + onboarding (location, profile, interests)
- Explore swipe feed with ranking
- Event creation, detail, and attendance
- Ticket purchase flow + QR tickets
- Connections from shared events
- Chat threads per connection
- Host dashboards, scanner, analytics
- Notifications and settings
- Memories gallery + calendar

## Environment Variables

Create a `.env.local` file with:

```
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
```

## Supabase Storage Buckets

Public buckets expected:

- `event-images` (covers + gallery)
- `profile-photos`
- `memories`

## Database Migrations

After pulling new schema changes, run:

```
npx prisma migrate dev
npx prisma generate
```

## Getting Started

1. Install dependencies: `npm install`
2. Run migrations: `npx prisma migrate dev`
3. Start dev server: `npm run dev`

## Deployment Checklist

- Set all environment variables for production
- Set `NEXTAUTH_URL` to the production URL
- Run `npx prisma migrate deploy`
- Build and start: `npm run build` then `npm run start`
- Ensure Supabase storage buckets exist and are public
- Verify Gmail app password is set and active

## Structure

- `app/` Next.js app router pages + API routes
- `components/` UI and feature components
- `lib/` services and shared clients
- `prisma/` database schema
