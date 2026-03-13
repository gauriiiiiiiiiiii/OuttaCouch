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

---

# SDE Interview Breakdown (Code-Verified)

This section is written strictly from the codebase. All statements are tied to concrete files.

## High-Level Overview

- **Problem solved**: Event-first social networking where real-world attendance drives identity, not posts. Landing copy in [app/page.tsx](app/page.tsx) and flows in [app/(main)/explore/page.tsx](app/(main)/explore/page.tsx), [app/(main)/events/[id]/page.tsx](app/(main)/events/[id]/page.tsx), and [app/(main)/profile/page.tsx](app/(main)/profile/page.tsx) show the experience is centered on discovering events, committing or buying tickets, and building connections.
- **Target users**: People who want to meet others through events and shared attendance, reinforced by the explore swipe feed and connections from shared events in [app/(main)/explore/page.tsx](app/(main)/explore/page.tsx) and [app/(main)/connections/page.tsx](app/(main)/connections/page.tsx).
- **Core functionality**: OTP onboarding, event discovery, event creation, tickets/QR validation, connections + chat, and memories. This is implemented across [app/(auth)](app/(auth)), [app/(main)/events](app/(main)/events), [app/(main)/connections](app/(main)/connections), [app/(main)/chat](app/(main)/chat), and [app/(main)/profile/memories/page.tsx](app/(main)/profile/memories/page.tsx).

## Architecture

- **Architecture style**: A full-stack Next.js App Router monolith with serverless-style API routes. Client UI and server logic live in [app](app) and [app/api](app/api), with shared services in [lib](lib).
- **Routing and layout**: App Router layouts in [app/layout.tsx](app/layout.tsx), [app/(auth)/layout.tsx](app/(auth)/layout.tsx), and [app/(main)/layout.tsx](app/(main)/layout.tsx) provide consistent structure for auth vs main experiences.
- **Authentication gate**: Access control and onboarding gating are enforced at the edge via [middleware.ts](middleware.ts), using `next-auth` JWT claims (profileComplete, isDeactivated).
- **Data layer**: Prisma and PostgreSQL define and access data via [prisma/schema.prisma](prisma/schema.prisma) and [lib/prisma.ts](lib/prisma.ts). Migrations in [prisma/migrations](prisma/migrations) codify schema evolution.
- **Realtime**: Socket.io is configured in [pages/api/socketio.ts](pages/api/socketio.ts) with server emission helpers in [lib/socketServer.ts](lib/socketServer.ts), used by chat routes and clients.

## Technology Stack (from code and config)

- **Core framework**: Next.js 14, React 18, TypeScript (declared in [package.json](package.json), configured in [tsconfig.json](tsconfig.json)).
- **Styling**: Tailwind CSS configured in [tailwind.config.ts](tailwind.config.ts) and [postcss.config.js](postcss.config.js), with global fonts and background in [app/globals.css](app/globals.css).
- **Auth**: NextAuth Credentials provider in [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts), login UI in [app/(auth)/login/LoginClient.tsx](app/(auth)/login/LoginClient.tsx).
- **ORM and DB**: Prisma Client in [lib/prisma.ts](lib/prisma.ts) with schema in [prisma/schema.prisma](prisma/schema.prisma).
- **Storage**: Supabase client and admin access in [lib/supabase.ts](lib/supabase.ts) and [lib/supabaseAdmin.ts](lib/supabaseAdmin.ts), used by upload route [app/api/storage/upload/route.ts](app/api/storage/upload/route.ts) and client helper [lib/services/storage.ts](lib/services/storage.ts).
- **Payments**: Stripe PaymentIntents in [app/api/tickets/create-intent/route.ts](app/api/tickets/create-intent/route.ts) and webhook handling in [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts).
- **Maps and charts**: Leaflet map components in [components/events/EventMap.tsx](components/events/EventMap.tsx) and [components/events/MapPicker.tsx](components/events/MapPicker.tsx); analytics charts in [app/(main)/events/manage/[id]/page.tsx](app/(main)/events/manage/[id]/page.tsx) with Recharts.

## Core Components and Responsibilities

- **Explore + ranking**: [app/(main)/explore/page.tsx](app/(main)/explore/page.tsx) consumes `/api/events`, renders swipe UI via [components/events/SwipeStack.tsx](components/events/SwipeStack.tsx) and map via [components/events/EventMap.tsx](components/events/EventMap.tsx).
- **Event creation**: [app/(main)/events/new/page.tsx](app/(main)/events/new/page.tsx) is a multi-step form that uploads a cover image via [lib/services/storage.ts](lib/services/storage.ts) and posts to `/api/events`.
- **Event detail and attendance**: [app/(main)/events/[id]/page.tsx](app/(main)/events/[id]/page.tsx) fetches `/api/events/[id]` and commits attendance via `/api/events/[id]/commit`.
- **Tickets and QR**: Purchase flow in [app/(main)/events/[id]/ticket/page.tsx](app/(main)/events/[id]/ticket/page.tsx), confirmation in [app/api/tickets/confirm/route.ts](app/api/tickets/confirm/route.ts), and validation in [app/(main)/events/manage/[id]/scanner/page.tsx](app/(main)/events/manage/[id]/scanner/page.tsx) plus [app/api/tickets/validate/route.ts](app/api/tickets/validate/route.ts).
- **Connections**: Suggestions and requests in [app/(main)/connections/page.tsx](app/(main)/connections/page.tsx), with server logic in [app/api/connections/suggestions/route.ts](app/api/connections/suggestions/route.ts) and request/accept/decline routes.
- **Chat**: Thread list in [app/(main)/chat/page.tsx](app/(main)/chat/page.tsx), message thread in [app/(main)/chat/[id]/page.tsx](app/(main)/chat/[id]/page.tsx), and persistence in [app/api/chat/[connectionId]/route.ts](app/api/chat/[connectionId]/route.ts) with read receipts in [app/api/chat/[connectionId]/read/route.ts](app/api/chat/[connectionId]/read/route.ts).
- **Profile and memories**: Profile data in [app/api/users/me/route.ts](app/api/users/me/route.ts) and UI in [app/(main)/profile/page.tsx](app/(main)/profile/page.tsx); memories upload and feed in [app/(main)/profile/memories/page.tsx](app/(main)/profile/memories/page.tsx) and [app/api/memories/route.ts](app/api/memories/route.ts).

## Algorithms and Business Logic

- **Event discovery ranking**: `/api/events` scores events with a weighted mix of location proximity (Haversine distance decay), category match, time proximity, connections attending, popularity, and recency in [app/api/events/route.ts](app/api/events/route.ts). Complexity is $O(E + C)$ where $E$ is events returned and $C$ is connections/lookups for a logged-in user.
- **Connection suggestions scoring**: `/api/connections/suggestions` computes a composite score from shared event count, recency of shared events, distance between users, preference overlap, and mutual connections in [app/api/connections/suggestions/route.ts](app/api/connections/suggestions/route.ts). Complexity is dominated by Prisma queries plus in-memory aggregation over shared attendance.
- **Chat ordering**: Chat list recency scoring uses exponential decay based on last message timestamp in [app/api/chat/route.ts](app/api/chat/route.ts).

## Data Handling and Models

- **Database schema**: Core entities include User, Event, EventImage, EventAttendee, Ticket, Connection, Message, Notification, Memory, EventSwipe, and OtpToken in [prisma/schema.prisma](prisma/schema.prisma) with migrations in [prisma/migrations](prisma/migrations).
- **OTP flow**: OTPs are hashed with SHA-256 and stored in `otp_tokens` via [app/api/auth/send-otp/route.ts](app/api/auth/send-otp/route.ts) and verified in [app/api/auth/verify-otp/route.ts](app/api/auth/verify-otp/route.ts).
- **Attendance and tickets**: Free events commit flow in [app/api/events/[id]/commit/route.ts](app/api/events/[id]/commit/route.ts); paid events use Stripe intents and ticket creation in [app/api/tickets/create-intent/route.ts](app/api/tickets/create-intent/route.ts) and [app/api/tickets/confirm/route.ts](app/api/tickets/confirm/route.ts).
- **Storage**: Supabase storage upload is handled server-side in [app/api/storage/upload/route.ts](app/api/storage/upload/route.ts) and used by profile/event/memory uploads in UI pages.

## API Design (Representative Samples)

- **Auth**: OTP + credentials via [app/api/auth/send-otp/route.ts](app/api/auth/send-otp/route.ts), [app/api/auth/verify-otp/route.ts](app/api/auth/verify-otp/route.ts), [app/api/auth/register/route.ts](app/api/auth/register/route.ts), and [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts).
- **Events**: `GET /api/events` returns ranked summaries; `POST /api/events` creates events; `GET /api/events/[id]` returns rich detail with analytics; image CRUD in [app/api/events/[id]/images/route.ts](app/api/events/[id]/images/route.ts).
- **Connections**: Request/accept/decline and suggestion logic in [app/api/connections](app/api/connections).
- **Chat**: `GET /api/chat` lists threads, `GET/POST /api/chat/[connectionId]` for messages, and read receipts in [app/api/chat/[connectionId]/read/route.ts](app/api/chat/[connectionId]/read/route.ts).
- **Tickets and payments**: Intent creation, confirm, validate, and Stripe webhook in [app/api/tickets](app/api/tickets) and [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts).

## System Design Considerations Observed

- **Scalability**: Server routes are stateless and backed by PostgreSQL via Prisma. Socket.io uses a single in-process server in [pages/api/socketio.ts](pages/api/socketio.ts), which is simple but would need a shared adapter (Redis) for horizontal scaling.
- **Performance**: Prisma client is cached in development to avoid re-instantiation in [lib/prisma.ts](lib/prisma.ts). `GET /api/events` limits to 50 events and sorts by score in memory in [app/api/events/route.ts](app/api/events/route.ts).
- **Error handling**: API routes consistently return `401/403/404/400` on invalid auth or missing fields, e.g. [app/api/events/[id]/commit/route.ts](app/api/events/[id]/commit/route.ts) and [app/api/tickets/validate/route.ts](app/api/tickets/validate/route.ts).
- **Operational hooks**: Node runtime forced for storage and Stripe webhook routes via `export const runtime = "nodejs"` in [app/api/storage/upload/route.ts](app/api/storage/upload/route.ts) and [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts).

## Security Aspects (from code)

- **Authentication**: JWT sessions with NextAuth credentials provider in [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts). Passwords are hashed with bcrypt in [app/api/auth/register/route.ts](app/api/auth/register/route.ts).
- **OTP safety**: OTPs are stored as SHA-256 hashes in [app/api/auth/send-otp/route.ts](app/api/auth/send-otp/route.ts), and verified with hash comparison in [app/api/auth/verify-otp/route.ts](app/api/auth/verify-otp/route.ts).
- **Authorization checks**: Host-only operations and connection checks guard sensitive actions, e.g. event image updates in [app/api/events/[id]/images/route.ts](app/api/events/[id]/images/route.ts) and ticket validation in [app/api/tickets/validate/route.ts](app/api/tickets/validate/route.ts).
- **Webhook verification**: Stripe signature verification in [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts).

## Testing

- No unit or integration tests are present in the repository. There are no test directories or test scripts in [package.json](package.json).

## DevOps and Configuration

- **Scripts**: Development and build scripts defined in [package.json](package.json) including `vercel-build` and `postinstall` Prisma generation.
- **Environment variables**: Required env vars are enumerated in [Readme.md](Readme.md), covering database, NextAuth, email, Supabase, and Stripe.
- **Next.js config**: Remote image host allowlist in [next.config.mjs](next.config.mjs).
- **Database migrations**: Prisma migrations live in [prisma/migrations](prisma/migrations) with `migration_lock.toml` in [prisma/migrations/migration_lock.toml](prisma/migrations/migration_lock.toml).

## Strengths (Code-Evident)

- Clear separation between auth and main experiences with dedicated layouts in [app/(auth)/layout.tsx](app/(auth)/layout.tsx) and [app/(main)/layout.tsx](app/(main)/layout.tsx).
- End-to-end flows are cohesive: onboarding -> discovery -> attendance -> connections -> chat (see [app/(auth)](app/(auth)) and [app/(main)](app/(main))).
- Recommendation logic is explicitly encoded and easy to iterate on in [app/api/events/route.ts](app/api/events/route.ts) and [app/api/connections/suggestions/route.ts](app/api/connections/suggestions/route.ts).
- Host analytics and operational tooling (gallery, downloads, QR validation) are integrated in [app/(main)/events/manage/[id]/page.tsx](app/(main)/events/manage/[id]/page.tsx) and [app/(main)/events/manage/[id]/scanner/page.tsx](app/(main)/events/manage/[id]/scanner/page.tsx).

## Potential Improvements (Grounded in Current Code)

- **Validation**: Many routes accept raw JSON without schema validation (e.g. [app/api/events/route.ts](app/api/events/route.ts), [app/api/users/me/route.ts](app/api/users/me/route.ts)). Introduce a validation layer (Zod or similar) to tighten input constraints.
- **Rate limiting**: OTP endpoints in [app/api/auth/send-otp/route.ts](app/api/auth/send-otp/route.ts) and [app/api/auth/verify-otp/route.ts](app/api/auth/verify-otp/route.ts) do not rate-limit; add IP or contact throttling.
- **Attendance capacity race**: Paid ticket confirmations in [app/api/tickets/confirm/route.ts](app/api/tickets/confirm/route.ts) do not re-check `maxAttendees` before incrementing `currentAttendees`; consider a transaction with capacity checks.
- **Socket scaling**: Socket.io server is single-instance in [pages/api/socketio.ts](pages/api/socketio.ts). For multi-instance deploys, add a shared adapter and remove in-memory assumptions.
- **Hooks are stubs**: Client hooks like [hooks/useAuth.ts](hooks/useAuth.ts), [hooks/useEvents.ts](hooks/useEvents.ts), and [hooks/useSocket.ts](hooks/useSocket.ts) return placeholder data; implement real hooks or remove unused dependencies.

## How to Explain This in an SDE Interview (1-2 Minutes)

"OUTTACOUCH is a full-stack Next.js 14 app that turns event attendance into a social graph. The front end lives in the App Router with dedicated auth and main layouts, while the backend is a set of API routes using Prisma on PostgreSQL. Users sign up through OTP verification, complete a profile, then explore nearby events ranked by location proximity, category match, recency, and social signals. Free events commit instantly; paid events go through Stripe PaymentIntents with a webhook that finalizes tickets and QR codes. Connections are suggested based on shared event attendance and preference overlap, and each accepted connection gets a real-time chat thread over Socket.io. We store media in Supabase Storage via a server upload endpoint and expose a host dashboard with attendance analytics and QR validation."

### Technical Highlights to Mention

- Weighted ranking and recommendation logic in [app/api/events/route.ts](app/api/events/route.ts) and [app/api/connections/suggestions/route.ts](app/api/connections/suggestions/route.ts).
- Stripe PaymentIntent + webhook ticket issuance flow in [app/api/tickets](app/api/tickets) and [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts).
- Real-time chat using Socket.io in [pages/api/socketio.ts](pages/api/socketio.ts) plus REST persistence in [app/api/chat/[connectionId]/route.ts](app/api/chat/[connectionId]/route.ts).

### Possible Interviewer Follow-Ups

- "How would you prevent OTP abuse and brute force?" (see [app/api/auth/send-otp/route.ts](app/api/auth/send-otp/route.ts))
- "How would you scale Socket.io across instances?" (see [pages/api/socketio.ts](pages/api/socketio.ts))
- "What happens if many users buy the last tickets simultaneously?" (see [app/api/tickets/confirm/route.ts](app/api/tickets/confirm/route.ts))
- "How do you justify the ranking weights and validate them?" (see [app/api/events/route.ts](app/api/events/route.ts))
