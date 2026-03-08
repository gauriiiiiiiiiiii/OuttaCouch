# OUTTACOUCH Technical Specification

This is the authoritative technical document for the OUTTACOUCH application. It is intentionally exhaustive: architecture, feature flows, data model, APIs, ranking, storage, and deployment expectations.

## Product Overview

OUTTACOUCH is an event-first social platform. The user identity is built from real-world attendance, not likes or posts. Events are the main entity. Connections form only after shared event context. Chat exists inside those shared contexts.

Core loop:

1) Discover events nearby.
2) Decide via swipe or detail page.
3) Commit or buy tickets.
4) Attend and validate entry.
5) Collect memories and shared connections.
6) Chat with connections made through events.

## Runtime Architecture

Frontend:

- Next.js 14 App Router
- React 18, TypeScript
- Tailwind CSS
- Framer Motion (swipe and gesture UX)
- Leaflet / React-Leaflet (map picker)
- Recharts (host analytics)
- Zustand + TanStack Query (state + async caching)

Backend:

- Next.js API routes
- Prisma ORM
- PostgreSQL via Supabase

Auth + Email:

- NextAuth Credentials
- OTP-based verification via Nodemailer (Gmail SMTP)

Storage:

- Supabase Storage (public buckets)

Realtime:

- Socket.io (realtime chat)

Payments:

- Stripe PaymentIntents + webhooks

## Project Structure

- app/                Next.js App Router pages and API routes
- components/         UI and feature components
- hooks/              client hooks
- lib/                shared clients and service helpers
- prisma/             schema, migrations
- store/              Zustand stores

## Global UI + Branding

- Global fonts: Fraunces + Space Grotesk
- Background: layered gradients for atmospheric texture
- Design language: rounded cards, soft borders, editorial headings

## Data Model (Prisma)

### User

- Identity: email, phone, passwordHash
- Profile: displayName, bio, profilePhotoUrl
- Location: city, lat, lng
- Preferences: string[]
- Visibility: calendarVisibility, profileVisibility
- Flags: profileComplete, isVerifiedHost
- Stripe metadata: stripeCustomerId, stripeAccountId

### Event

- Host reference
- Title, descriptionShort, descriptionFull
- Category, schedule (eventDate, startTime, endTime)
- Venue: name, address, lat, lng
- Pricing: isFree, ticketPrice, currency
- Attendance: maxAttendees, currentAttendees
- Moderation: approvalMode, visibility, status
- Media: coverImageUrl

### EventImage

- eventId
- imageUrl
- isCover
- orderIndex

### EventAttendee

- eventId, userId
- status (committed, attended, missed, waitlisted)
- ticket reference

### Ticket

- eventId, userId
- quantity, amountPaid, currency
- paymentIntentId, paymentStatus
- qrCode, validatedAt

### Connection

- user1Id, user2Id
- status (pending, accepted, declined, removed)
- sharedEventId
- requestedAt, acceptedAt

### Message

- connectionId
- senderId
- content, type
- sentAt

### Notification

- userId
- title, body, link
- readAt, createdAt

### Memory

- userId
- eventId (optional)
- imageUrl
- caption
- createdAt

## Feature Flows (Detailed)

### Authentication + Onboarding

- OTP request and verification
- Credentials login for repeat users
- Onboarding steps:
	- Location capture
	- Profile setup (photo, name, bio)
	- Interest selection
- Middleware enforces profile completion

### Explore (Event Discovery)

- Swipe-based feed with ranked events
- Dummy fallback events when feed is empty
- Swipe directions mapped to actions:
	- Right: commit
	- Left: skip
	- Up: share
	- Down: maybe

### Event Detail

- Full metadata: schedule, venue, host
- Ticket CTA or commit CTA based on pricing
- Gallery rendered when event images exist

### Event Creation

- Sections: Overview, Schedule, Venue, Tickets, Media
- Cover image upload (no URL entry)
- Map picker sets lat/lng
- Supabase upload via shared storage helper

### Tickets + QR

- Create-intent and confirm routes
- Ticket record with QR code
- Host QR scanner validates entry

### Connections

- Suggestions built from shared event attendance
- Bumble-style stacked swipe cards
- Connect/skip maps to request flow

### Chat

- List of accepted connections
- Thread per connection
- Message bubbles + timestamps

### Host Dashboard

- Attendee count + revenue summary
- Attendee list with status
- Analytics charts (commits, revenue)
- Gallery upload

### Memories

- Upload post-event photos
- Link memory to attended event
- Display uploads + attended event gallery

### Settings

- Privacy controls
- Notifications (toggle layout)
- Payments
- Host tools

## Ranking / ML-Style Scoring

### Event Ranking (Explore)

Signals:

- Location proximity (distance decay)
- Category match
- Time proximity
- Connections attending
- Popularity (current/max ratio)
- Recency (createdAt)

### Connection Suggestions

Signals:

- Shared event count
- Recency of shared event
- Distance between users
- Preference overlap
- Mutual connections

### Chat Ordering

Signal:

- Recency of last message

## API Surface (Complete)

Auth:

- POST /api/auth/send-otp
- POST /api/auth/verify-otp
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/[...nextauth]

Users:

- GET /api/users/me
- PUT /api/users/me
- PUT /api/users/me/location
- PUT /api/users/me/privacy
- GET /api/users/[id]

Events:

- GET /api/events
- POST /api/events
- GET /api/events/[id]
- POST /api/events/[id]/commit
- GET /api/events/host
- GET /api/events/[id]/images
- POST /api/events/[id]/images

Connections:

- GET /api/connections
- GET /api/connections/suggestions
- POST /api/connections/request/[userId]
- PUT /api/connections/[id]/accept
- PUT /api/connections/[id]/decline
- DELETE /api/connections/[id]

Chat:

- GET /api/chat
- GET /api/chat/[connectionId]
- POST /api/chat/[connectionId]
- PUT /api/chat/[connectionId]/read

Tickets:

- POST /api/tickets/create-intent
- POST /api/tickets/confirm
- GET /api/tickets/me
- POST /api/tickets/validate

Notifications:

- GET /api/notifications
- PUT /api/notifications/[id]/read
- PUT /api/notifications/read-all
- POST /api/notifications/subscribe

Memories:

- GET /api/memories
- POST /api/memories

## Storage Buckets

Create public buckets in Supabase:

- event-images
- profile-photos
- memories

## Shared Upload Helper

- `lib/services/storage.ts` provides image upload to Supabase
- Guards against missing env vars
- Returns public URL and path

## Environment Variables

Required:

- DATABASE_URL
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- EMAIL_USER
- EMAIL_PASS
- EMAIL_FROM
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET

Optional:

- STRIPE_SECRET_KEY

## Deployment Checklist

- Ensure all env vars are set on host
- Run `npx prisma migrate deploy`
- Run `npm run build`
- Run `npm run start`
- Verify Supabase buckets exist and are public
- Verify Gmail app password is set and active

## Known Gaps / Enhancements

- Push notification providers and device tokens
- Typing indicators and presence

## Operational Notes

- Windows Prisma EPERM: stop dev server, close VS Code, delete node_modules/.prisma/client, rerun generate
- Supabase upload error: check bucket exists + policy
- NextAuth redirect loops: verify NEXTAUTH_URL

## Security and Access

- Only hosts can upload event galleries
- Connections only after shared events
- Profile + calendar visibility defaults to public
- Passwords hashed with bcryptjs

## Change Management

- Update README for public summary
- Update this document when schemas or API contracts change
- Add migration notes for schema updates
