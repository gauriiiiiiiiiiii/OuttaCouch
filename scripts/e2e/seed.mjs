// Seeds a DISPOSABLE Postgres database with deterministic fixtures for scripts/e2e/smoke.mjs.
// Usage: DATABASE_URL=postgresql://... node scripts/e2e/seed.mjs   (TRUNCATES every table!)
//
// TIMESTAMPS: the schema uses `timestamp` (no time zone) and Prisma reads/writes
// those columns as UTC wall-clock. node-pg would serialise JS Dates in local
// time and Postgres silently drops the offset, so every timestamp below is sent
// as a UTC string without a zone, and `now()` is converted with AT TIME ZONE.
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required (point it at a throwaway database).");
  process.exit(1);
}
if (/supabase.co|supabase.com/.test(connectionString) && process.env.E2E_ALLOW_REMOTE !== "true") {
  console.error("Refusing to truncate a Supabase database. Set E2E_ALLOW_REMOTE=true only if you really mean it.");
  process.exit(1);
}
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== "true" } });
const hash = await bcrypt.hash("Passw0rd!", 4);
const utc = (date) => date.toISOString().slice(0, 23); // "YYYY-MM-DDTHH:mm:ss.SSS"

const ids = {
  host: "11111111-1111-4111-8111-111111111111",
  alice: "22222222-2222-4222-8222-222222222222",
  bob: "33333333-3333-4333-8333-333333333333",
  freeEvent: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  paidEvent: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ticket: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  connection: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
};

const sql = async (text, params = []) => (await pool.query(text, params)).rows;

await sql(`TRUNCATE users, events, event_attendees, tickets, connections, messages, notifications,
  notification_schedules, otp_tokens, memories, event_swipes, event_images, contact_imports,
  contact_invitations, referral_links CASCADE`);

const in3days = utc(new Date(Date.now() + 3 * 86_400_000));

for (const [id, email, name, prefs, complete] of [
  [ids.host, "host@test.local", "Host Person", ["Music"], true],
  [ids.alice, "alice@test.local", "Alice", ["Music", "Food"], true],
  [ids.bob, "bob@test.local", null, [], false]
]) {
  await sql(
    `INSERT INTO users (id, email, password_hash, display_name, preferences, profile_complete, city, lat, lng, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Delhi',28.6139,77.209, now() AT TIME ZONE 'utc')`,
    [id, email, hash, name, prefs, complete]
  );
}

for (const [id, title, isFree, price, max] of [
  [ids.freeEvent, "Rooftop Jam", true, null, 1],
  [ids.paidEvent, "Paid Gala", false, 499, 50]
]) {
  await sql(
    `INSERT INTO events (id, host_id, title, description_short, description_full, category, event_date, start_time,
       venue_name, address, lat, lng, is_free, ticket_price, max_attendees, approval_mode, visibility, cover_image_url, status, updated_at)
     VALUES ($1,$2,$3,'short','full','Music',$4::timestamp,$4::timestamp,'Terrace','1 Sky Rd',28.6139,77.209,$5,$6,$7,'auto','public',
       'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee','upcoming', now() AT TIME ZONE 'utc')`,
    [id, ids.host, title, in3days, isFree, price, max]
  );
}

await sql(
  `INSERT INTO tickets (id, event_id, user_id, quantity, amount_paid, currency, payment_intent_id, payment_status, qr_code)
   VALUES ($1,$2,$3,1,499,'INR','manual','paid','QR-ALICE-1')`,
  [ids.ticket, ids.paidEvent, ids.alice]
);
await sql(
  `INSERT INTO event_attendees (id, event_id, user_id, ticket_id, status)
   VALUES (gen_random_uuid()::text,$1,$2,$3,'committed')`,
  [ids.paidEvent, ids.alice, ids.ticket]
);
await sql(`UPDATE events SET current_attendees = 1 WHERE id = $1`, [ids.paidEvent]);

await sql(
  `INSERT INTO connections (id, user1_id, user2_id, status, accepted_at) VALUES ($1,$2,$3,'accepted', now() AT TIME ZONE 'utc')`,
  [ids.connection, ids.host, ids.alice]
);

// Due one minute ago (UTC), attached to the paid event Alice never cancels.
await sql(
  `INSERT INTO notification_schedules (id, user_id, event_id, type, title, body, link, send_at)
   VALUES (gen_random_uuid()::text,$1,$2,'event_reminder','Due reminder','fires now','/events/x', (now() AT TIME ZONE 'utc') - interval '1 minute')`,
  [ids.alice, ids.paidEvent]
);

console.log(JSON.stringify(ids));
await pool.end();
