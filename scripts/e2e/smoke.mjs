// End-to-end smoke test against a running server whose database was seeded by scripts/e2e/seed.mjs.
// Usage: BASE=http://localhost:3000 CRON_SECRET=<same as the server> node scripts/e2e/smoke.mjs
// Logs in through NextAuth's credentials callback and walks every major flow (100 checks).
const BASE = process.env.BASE ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "smoke-cron";
const ids = {
  host: "11111111-1111-4111-8111-111111111111",
  alice: "22222222-2222-4222-8222-222222222222",
  bob: "33333333-3333-4333-8333-333333333333",
  freeEvent: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  paidEvent: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ticket: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  connection: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
};

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "" || /Max-Age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar, path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (jar) headers.set("cookie", jar.header());
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  if (jar) jar.absorb(res);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

async function login(email, password = "Passw0rd!") {
  const jar = new Jar();
  const csrf = await call(jar, "/api/auth/csrf");
  const form = new URLSearchParams({ csrfToken: csrf.body.csrfToken, contact: email, password, json: "true" });
  const res = await call(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const ok = jar.cookies.has("next-auth.session-token");
  return { jar, ok, status: res.status };
}

// ---------------------------------------------------------------------------
console.log(`\n== Smoke test against ${BASE} ==\n`);

// Public pages + middleware
{
  const home = await call(null, "/");
  check("GET / renders landing", home.status === 200 && String(home.body).includes("Get off the couch"));
  const login = await call(null, "/login");
  check("GET /login renders", login.status === 200 && String(login.body).includes("Log in"));
  const explore = await call(null, "/explore");
  check("GET /explore anonymous -> redirect to /login", explore.status === 307 && /\/login\?next=%2Fexplore/.test(explore.headers.get("location") ?? ""), explore.headers.get("location") ?? "");
  const swipe = await call(null, "/explore/swipe");
  check("GET /explore/swipe anonymous -> redirect (middleware gap closed)", swipe.status === 307, `status ${swipe.status}`);
  const join = await call(null, "/join?ref=NOPE");
  check("GET /join renders for any code", join.status === 200);
  const headers = await call(null, "/login");
  check("security headers present", headers.headers.get("x-frame-options") === "SAMEORIGIN" && headers.headers.get("x-content-type-options") === "nosniff");
}

// Auth
const bad = await login("alice@test.local", "wrong");
check("login rejects a wrong password", !bad.ok);
const alice = await login("alice@test.local");
check("login succeeds for Alice", alice.ok, `status ${alice.status}`);
const host = await login("host@test.local");
check("login succeeds for Host", host.ok);
const bob = await login("bob@test.local");
check("login succeeds for Bob (profile incomplete)", bob.ok);

{
  const session = await call(alice.jar, "/api/auth/session");
  check("session carries id + profileComplete", session.body?.user?.id === ids.alice && session.body?.user?.profileComplete === true, JSON.stringify(session.body?.user));
  const bobExplore = await call(bob.jar, "/explore");
  check("incomplete profile is redirected to onboarding", bobExplore.status === 307 && /onboarding\/profile/.test(bobExplore.headers.get("location") ?? ""));
  const aliceExplore = await call(alice.jar, "/explore");
  check("complete profile can load /explore", aliceExplore.status === 200);
  const aliceOnboarding = await call(alice.jar, "/onboarding/profile");
  check("complete profile bounced away from onboarding", aliceOnboarding.status === 307 && /\/explore/.test(aliceOnboarding.headers.get("location") ?? ""));
}

// Users
{
  const me = await call(alice.jar, "/api/users/me");
  check("GET /api/users/me ok", me.status === 200 && me.body.user?.id === ids.alice);
  check("GET /api/users/me never returns passwordHash", me.status === 200 && !("passwordHash" in me.body.user) && !("stripeCustomerId" in me.body.user), Object.keys(me.body.user ?? {}).join(","));
  check("private calendar includes paid event Alice committed to", me.body.privateCalendar?.some((e) => e.id === ids.paidEvent));

  const anon = await call(null, "/api/users/me");
  check("GET /api/users/me anonymous -> 401", anon.status === 401);

  const put = await call(alice.jar, "/api/users/me", { method: "PUT", json: { displayName: "  Alice A.  ", profileComplete: false, preferences: ["Food", "Food", "Art"] } });
  check("PUT /api/users/me trims, dedupes and ignores profileComplete", put.status === 200 && put.body.user.displayName === "Alice A." && put.body.user.preferences.join() === "Food,Art" && put.body.user.profileComplete === true, JSON.stringify(put.body.user?.preferences));
  const badPut = await call(alice.jar, "/api/users/me", { method: "PUT", json: { displayName: "" } });
  check("PUT /api/users/me rejects empty display name", badPut.status === 400);

  const loc = await call(alice.jar, "/api/users/me/location", { method: "PUT", json: { lat: 91, lng: 0 } });
  check("PUT location rejects out-of-range coords", loc.status === 400);
  const priv = await call(alice.jar, "/api/users/me/privacy", { method: "PUT", json: { profileVisibility: "everyone" } });
  check("PUT privacy rejects invalid visibility", priv.status === 400);

  const pub = await call(bob.jar, `/api/users/${ids.alice}`);
  check("GET /api/users/:id public profile", pub.status === 200 && pub.body.user?.displayName === "Alice A." && pub.body.connectionStatus === "none");
  const self = await call(alice.jar, `/api/users/${ids.alice}`);
  check("GET /api/users/:id self", self.status === 200 && self.body.isSelf === true);
  const asHost = await call(host.jar, `/api/users/${ids.alice}`);
  check("GET /api/users/:id shows accepted connection for the host", asHost.body.connectionStatus === "accepted" && asHost.body.connectionId === ids.connection, JSON.stringify(asHost.body.connectionStatus));
}

// Events
{
  const feed = await call(null, "/api/events");
  check("GET /api/events anonymous feed lists 2 public events", feed.status === 200 && feed.body.events?.length === 2, `got ${feed.body.events?.length}`);
  const badPage = await call(null, "/api/events?page=abc");
  check("GET /api/events?page=abc no longer blanks the feed", badPage.status === 200 && badPage.body.events?.length === 2 && badPage.body.page === 1);

  const detailAlice = await call(alice.jar, `/api/events/${ids.paidEvent}`);
  check("event detail for non-host hides roster/revenue", detailAlice.status === 200 && detailAlice.body.isHost === false && !("attendees" in detailAlice.body) && !("revenueTotal" in detailAlice.body) && detailAlice.body.isCommitted === true);
  check("event detail goingList never leaks emails", !JSON.stringify(detailAlice.body.goingList ?? []).includes("@"));
  const detailHost = await call(host.jar, `/api/events/${ids.paidEvent}`);
  check("event detail for host includes roster and revenue", detailHost.status === 200 && detailHost.body.isHost === true && detailHost.body.attendees?.length === 1 && detailHost.body.revenueTotal === 499, JSON.stringify({ n: detailHost.body.attendees?.length, rev: detailHost.body.revenueTotal }));

  const edit = await call(alice.jar, `/api/events/${ids.paidEvent}/edit`);
  check("edit form is host-only", edit.status === 403);
  const editHost = await call(host.jar, `/api/events/${ids.paidEvent}/edit`);
  check("edit form returns form-shaped data", editHost.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(editHost.body.eventDate) && editHost.body.ticketPrice === 499);

  const commitPaid = await call(alice.jar, `/api/events/${ids.paidEvent}/commit`, { method: "POST" });
  check("commit to paid event -> 403", commitPaid.status === 403);
  const commitFree = await call(alice.jar, `/api/events/${ids.freeEvent}/commit`, { method: "POST" });
  check("Alice commits to free event (capacity 1)", commitFree.status === 200 && commitFree.body.status === "committed", JSON.stringify(commitFree.body));
  const again = await call(alice.jar, `/api/events/${ids.freeEvent}/commit`, { method: "POST" });
  check("re-commit is idempotent", again.body.status === "already-committed");
  const full = await call(host.jar, `/api/events/${ids.freeEvent}/commit`, { method: "POST" });
  check("second user hits capacity -> 409", full.status === 409, JSON.stringify(full.body));
  const cancel = await call(alice.jar, `/api/events/${ids.freeEvent}/commit`, { method: "DELETE" });
  check("cancel attendance", cancel.status === 200 && cancel.body.status === "cancelled");
  const afterCancel = await call(host.jar, `/api/events/${ids.freeEvent}/commit`, { method: "POST" });
  check("seat freed after cancel", afterCancel.status === 200 && afterCancel.body.status === "committed");

  const created = await call(host.jar, "/api/events", {
    method: "POST",
    json: { title: "Smoke Event", descriptionShort: "s", descriptionFull: "f", category: "Food", eventDate: "2026-12-01", startTime: "18:00", venueName: "V", address: "A", lat: 28.61, lng: 77.2, isFree: true, maxAttendees: 10, coverImageUrl: "" }
  });
  check("host creates an event", created.status === 200 && typeof created.body.id === "string", JSON.stringify(created.body));
  const newId = created.body.id;
  const notif = await call(alice.jar, "/api/notifications");
  check("Alice (prefers Food) was notified about the new Food event", notif.body.notifications?.some((n) => n.link === `/events/${newId}`));

  const swipeBad = await call(alice.jar, "/api/events/swipe", { method: "POST", json: { event_id: newId, action: "sideways" } });
  check("swipe rejects invalid action", swipeBad.status === 400);
  const swipeOk = await call(alice.jar, "/api/events/swipe", { method: "POST", json: { event_id: newId, action: "right" } });
  check("swipe recorded", swipeOk.status === 200);

  const csrf = await call(host.jar, "/api/events", { method: "POST", headers: { origin: "https://evil.example" }, json: {} });
  check("cross-origin event create blocked (CSRF)", csrf.status === 403);

  const img = await call(host.jar, `/api/events/${newId}/images`, { method: "POST", json: { imageUrl: "https://img/1.jpg", isCover: true } });
  check("host adds a cover image", img.status === 200 && img.body.image?.isCover === true);
  const imgs = await call(null, `/api/events/${newId}/images`);
  check("images list is public", imgs.status === 200 && imgs.body.images?.length === 1);
  const foreignDel = await call(host.jar, `/api/events/${ids.paidEvent}/images`, { method: "DELETE", json: { imageId: img.body.image.id } });
  check("image delete is scoped to its event", foreignDel.status === 404);

  const upd = await call(host.jar, `/api/events/${newId}`, { method: "PUT", json: { title: "Smoke Event v2", category: "Food", eventDate: "2026-12-02", startTime: "19:00", venueName: "V", address: "A", lat: 1, lng: 2, isFree: false, ticketPrice: 100, maxAttendees: 5 } });
  check("host updates the event", upd.status === 200);
  const hostList = await call(host.jar, "/api/events/host");
  check("host event list includes the new event", hostList.body.events?.some((e) => e.id === newId && e.title === "Smoke Event v2"));
  const del = await call(host.jar, `/api/events/${newId}`, { method: "DELETE" });
  check("host deletes the event (cascade transaction)", del.status === 200);
  const gone = await call(null, `/api/events/${newId}`);
  check("deleted event is 404", gone.status === 404);
}

// Connections + chat
{
  const selfReq = await call(alice.jar, `/api/connections/request/${ids.alice}`, { method: "POST", json: {} });
  check("cannot request a connection with yourself", selfReq.status === 400);
  const req = await call(alice.jar, `/api/connections/request/${ids.bob}`, { method: "POST", json: { sharedEventId: ids.paidEvent } });
  check("Alice requests Bob", req.status === 200 && req.body.status === "pending", JSON.stringify(req.body));
  const incoming = await call(bob.jar, "/api/connections/requests");
  check("Bob sees the incoming request with the shared event", incoming.body.requests?.[0]?.sharedEventTitle === "Paid Gala");
  const wrongAccept = await call(alice.jar, `/api/connections/${req.body.id}/accept`, { method: "PUT" });
  check("requester cannot accept their own request", wrongAccept.status === 403);
  const accept = await call(bob.jar, `/api/connections/${req.body.id}/accept`, { method: "PUT" });
  check("Bob accepts", accept.status === 200 && accept.body.status === "accepted");
  const twice = await call(bob.jar, `/api/connections/${req.body.id}/accept`, { method: "PUT" });
  check("accepting twice -> 409", twice.status === 409);
  const list = await call(alice.jar, "/api/connections");
  check("Alice now has 2 accepted connections", list.body.connections?.length === 2, `got ${list.body.connections?.length}`);

  const send = await call(alice.jar, `/api/chat/${req.body.id}`, { method: "POST", json: { content: "  hello bob  " } });
  check("Alice messages Bob (trimmed)", send.status === 200 && send.body.message?.content === "hello bob");
  const outsider = await call(host.jar, `/api/chat/${req.body.id}`);
  check("outsider cannot read the thread", outsider.status === 403);
  const outsiderRead = await call(host.jar, `/api/chat/${req.body.id}/read`, { method: "PUT" });
  check("outsider cannot mark the thread read (IDOR closed)", outsiderRead.status === 403);
  const chats = await call(bob.jar, "/api/chat");
  check("Bob's chat list shows 1 unread", chats.body.chats?.[0]?.unreadCount === 1, JSON.stringify(chats.body.chats?.[0]));
  const read = await call(bob.jar, `/api/chat/${req.body.id}/read`, { method: "PUT" });
  check("Bob marks read", read.status === 200);
  const history = await call(bob.jar, `/api/chat/${req.body.id}`);
  check("history shows readAt set", history.body.messages?.every((m) => m.senderId === ids.bob || m.readAt));

  const remove = await call(bob.jar, `/api/connections/${req.body.id}`, { method: "DELETE" });
  check("Bob removes the connection", remove.status === 200 && remove.body.status === "removed");
  const sendAfter = await call(alice.jar, `/api/chat/${req.body.id}`, { method: "POST", json: { content: "still there?" } });
  check("messaging a removed connection is refused", sendAfter.status === 403);

  const discover = await call(alice.jar, "/api/connections/discover?query=host");
  check("discover finds by name", discover.status === 200 && Array.isArray(discover.body.results));
  const suggestions = await call(alice.jar, "/api/connections/suggestions");
  check("suggestions endpoint responds", suggestions.status === 200 && Array.isArray(suggestions.body.suggestions));
}

// Tickets
{
  const mine = await call(alice.jar, "/api/tickets/me");
  check("Alice sees her ticket", mine.body.tickets?.[0]?.qrCode === "QR-ALICE-1");
  const qr = await call(host.jar, `/api/tickets/${ids.ticket}/qr`);
  check("ticket QR is owner-only", qr.status === 403);
  const validateWrongHost = await call(alice.jar, "/api/tickets/validate", { method: "POST", json: { qr_code: "QR-ALICE-1", event_id: ids.paidEvent } });
  check("only the host can validate", validateWrongHost.status === 403);
  const validate = await call(host.jar, "/api/tickets/validate", { method: "POST", json: { qr_code: "QR-ALICE-1", event_id: ids.paidEvent } });
  check("host validates the QR", validate.status === 200 && validate.body.status === "validated", JSON.stringify(validate.body));
  const rescan = await call(host.jar, "/api/tickets/validate", { method: "POST", json: { qr_code: "QR-ALICE-1", event_id: ids.paidEvent } });
  check("re-scan -> 409", rescan.status === 409);
  const detail = await call(host.jar, `/api/events/${ids.paidEvent}`);
  check("attendee marked attended", detail.body.attendees?.[0]?.status === "attended");
  const refund = await call(alice.jar, "/api/tickets/refund", { method: "POST", json: { ticketId: ids.ticket } });
  check("refund of a scanned ticket is refused", refund.status === 400 && /already used/.test(refund.body.error ?? ""), JSON.stringify(refund.body));
}

// Notifications + dispatch
{
  const noSecret = await call(null, "/api/notifications/dispatch");
  check("dispatch without secret -> 401", noSecret.status === 401);
  const dispatch = await call(null, "/api/notifications/dispatch", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check("cron dispatch delivers the due reminder", dispatch.status === 200 && dispatch.body.sent === 1, JSON.stringify(dispatch.body));
  const again = await call(null, "/api/notifications/dispatch", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check("second dispatch sends nothing (claimed)", again.body.sent === 0);
  const list = await call(alice.jar, "/api/notifications");
  const reminder = list.body.notifications?.find((n) => n.title === "Due reminder");
  check("Alice received the reminder", !!reminder);
  const readAll = await call(alice.jar, "/api/notifications/read-all", { method: "PUT" });
  check("mark all read", readAll.status === 200);
  const dismissOther = await call(host.jar, `/api/notifications/${reminder?.id}`, { method: "DELETE" });
  check("cannot dismiss another user's notification", dismissOther.status === 404);
  const dismiss = await call(alice.jar, `/api/notifications/${reminder?.id}`, { method: "DELETE" });
  check("owner dismisses", dismiss.status === 200);
}

// Memories + referrals + contacts
{
  const mem = await call(alice.jar, "/api/memories", { method: "POST", json: { imageUrl: "https://img/m.jpg", caption: "fun", eventId: ids.paidEvent } });
  check("create memory", mem.status === 200 && mem.body.id);
  const others = await call(bob.jar, `/api/memories/user/${ids.alice}`);
  check("public memories visible to others", others.status === 200 && others.body.memories?.length === 1);
  const delOther = await call(bob.jar, `/api/memories/${mem.body.id}`, { method: "DELETE" });
  check("cannot delete another user's memory", delOther.status === 403);
  const del = await call(alice.jar, `/api/memories/${mem.body.id}`, { method: "DELETE" });
  check("owner deletes memory", del.status === 200);

  const imp = await call(alice.jar, "/api/contacts", { method: "POST", json: { contacts: [{ name: "Friend", phone: "9876500000" }, { phone: "abc" }] } });
  check("import contacts normalises and counts", imp.status === 200 && imp.body.imported === 1 && imp.body.invalid === 1, JSON.stringify(imp.body));
  const contacts = await call(alice.jar, "/api/contacts");
  check("list contacts", contacts.body.contacts?.[0]?.phone === "+919876500000");
  const share = await call(alice.jar, "/api/referrals/share", { method: "POST", json: { contactIds: [contacts.body.contacts[0].id], channel: "sms" } });
  check("share creates an invitation (Twilio send fails gracefully without creds)", share.status === 200 && /^[A-Z0-9]{8}$/.test(share.body.invitations?.[0]?.referralCode ?? ""), JSON.stringify(share.body));
  const code = share.body.invitations?.[0]?.referralCode;
  const track = await call(null, `/api/referrals/${code.toLowerCase()}`);
  check("join link tracks the click", track.status === 200 && track.body.fromUser?.id === ids.alice);
  const stats = await call(alice.jar, "/api/referrals");
  check("referral stats count the click", stats.body.stats?.clicked === 1 && stats.body.stats?.totalClicks === 1, JSON.stringify(stats.body.stats));
  const redeemAnon = await call(null, `/api/referrals/${code}`, { method: "POST", json: { newUserId: ids.bob } });
  check("anonymous redeem -> 401 (IDOR closed)", redeemAnon.status === 401);
  const redeemSelf = await call(alice.jar, `/api/referrals/${code}`, { method: "POST" });
  check("cannot redeem your own invitation", redeemSelf.status === 400);
  const redeem = await call(bob.jar, `/api/referrals/${code}`, { method: "POST" });
  check("Bob redeems -> auto-connected to Alice", redeem.status === 200);
  const conns = await call(bob.jar, "/api/connections");
  check("Bob and Alice are connected again after redeem", conns.body.connections?.some((c) => c.userId === ids.alice));
  const gone = await call(null, `/api/referrals/${code}`);
  check("redeemed link reports already registered", gone.status === 400);
  const removedRoute = await call(alice.jar, "/api/contacts/invite", { method: "POST" });
  check("removed invite endpoint is gone (404)", removedRoute.status === 404);
}

// Storage validation (no Supabase creds needed for the rejection paths)
{
  const fd = new FormData();
  fd.append("bucket", "memories");
  fd.append("folder", "../etc");
  fd.append("file", new File([new Uint8Array(3)], "x.png", { type: "image/png" }));
  const res = await call(alice.jar, "/api/storage/upload", { method: "POST", body: fd });
  check("upload rejects folder traversal", res.status === 400 && res.body.error === "Invalid folder", JSON.stringify(res.body));
}

// Socket handshake auth
{
  // First hit boots Socket.io (200 from Next); afterwards Socket.io owns the
  // path and answers a bare GET itself with an Engine.IO 400 "Transport unknown".
  const anon = await fetch(`${BASE}/api/socketio`);
  check("socket bootstrap endpoint responds", anon.status === 200 || anon.status === 400, `status ${anon.status}`);
  const { io } = await import("socket.io-client");
  const tryConnect = (cookie) =>
    new Promise((resolve) => {
      const socket = io(BASE, { path: "/api/socketio", transports: ["polling"], extraHeaders: cookie ? { cookie } : {}, reconnection: false, timeout: 15000 });
      const done = (v) => { socket.close(); resolve(v); };
      socket.on("connect", () => done("connected"));
      socket.on("connect_error", (e) => done(`error:${e.message}`));
      setTimeout(() => done("timeout"), 20000);
    });
  // Warm up once (first namespace connect in dev can be slow), then measure.
  await tryConnect(alice.jar.header());
  const anonResult = await tryConnect(null);
  check("socket refuses anonymous handshake", anonResult.startsWith("error:Unauthorized"), anonResult);
  const authedResult = await tryConnect(alice.jar.header());
  check("socket accepts an authenticated handshake", authedResult === "connected", authedResult);
}

console.log(`\n== ${results.length - failures}/${results.length} checks passed ==`);
process.exit(failures ? 1 : 0);
