// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable router object per file: Next's useRouter() returns a stable reference, and
// components list it in effect deps, so a fresh object per render would loop forever.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  return { push, replace, back, router: { push, replace, back }, searchParams: new URLSearchParams(), params: {} as Record<string, string> };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.searchParams,
  useParams: () => nav.params
}));

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth/react", () => ({
  signIn: auth.signIn,
  signOut: auth.signOut,
  useSession: () => ({ data: null, status: "unauthenticated", update: vi.fn() })
}));

import HomePage from "@/app/page";
import NotFound from "@/app/not-found";
import JoinPage from "@/app/join/page";
import ExplorePage from "@/app/(main)/explore/page";
import NotificationsPage from "@/app/(main)/notifications/page";
import SettingsPage from "@/app/(main)/settings/page";
import ChatListPage from "@/app/(main)/chat/page";
import HostEventsPage from "@/app/(main)/events/manage/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.searchParams = new URLSearchParams();
  nav.params = {};
});

describe("HomePage and NotFound", () => {
  it("HomePage links to login and signup", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Get off the couch/);
    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/signup");
  });

  it("NotFound links back home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});

describe("JoinPage", () => {
  it("redirects to /signup when no referral code is present", async () => {
    render(<JoinPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signup"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tracks the click and shows the referrer with a signup link carrying the code", async () => {
    nav.searchParams = new URLSearchParams("ref=ABCD1234");
    fetchMock.mockImplementation(() => json({ code: "ABCD1234", invitedPhone: "+911", fromUser: { id: "r", displayName: "Ravi", profilePhotoUrl: null } }));
    render(<JoinPage />);
    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/referrals/ABCD1234");
    expect(screen.getByRole("heading", { name: "You're invited" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?ref=ABCD1234");
    expect(screen.getByText("R")).toBeInTheDocument(); // avatar initial fallback
  });

  it("shows an expired state with a plain signup link on error", async () => {
    nav.searchParams = new URLSearchParams("ref=BAD");
    fetchMock.mockImplementation(() => json({ error: "Invalid referral code" }, false));
    render(<JoinPage />);
    expect(await screen.findByRole("heading", { name: "Link expired" })).toBeInTheDocument();
    expect(screen.getByText("Invalid referral code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up anyway" })).toHaveAttribute("href", "/signup");
  });
});

describe("ExplorePage", () => {
  const feed = (events: unknown[], hasMore = false) => json({ events, hasMore, page: 1, totalCount: events.length });
  // SwipeStack shows the title inside the image overlay, so fixtures need an image.
  const ev = (id: string, title: string, category: string, location = "Somewhere") => ({ id, title, category, date: "Mar 1, 2026", location, imageUrl: `https://img/${id}.jpg` });

  it("loads the ranked feed and renders the top card with category chips", async () => {
    fetchMock.mockImplementation(() => feed([ev("e1", "Rooftop Jam", "Music"), ev("e2", "Trail Sprint", "Outdoors")]));
    render(<ExplorePage />);
    expect(await screen.findByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/events?page=1");
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outdoors" })).toBeInTheDocument();
    expect(screen.queryByText(/Welcome to OuttaCouch/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it("filters by search text and category", async () => {
    fetchMock.mockImplementation(() => feed([ev("e1", "Rooftop Jam", "Music"), ev("e2", "Trail Sprint", "Outdoors", "Riverbend")]));
    render(<ExplorePage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });

    await userEvent.type(screen.getByPlaceholderText(/Search events/), "riverbend");
    expect(screen.getByRole("heading", { name: "Trail Sprint" })).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText(/Search events/));
    await userEvent.type(screen.getByPlaceholderText(/Search events/), "zzz");
    expect(screen.getByText("No events match your search.")).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText(/Search events/));

    await userEvent.click(screen.getByRole("button", { name: "Outdoors" }));
    expect(screen.getByRole("heading", { name: "Trail Sprint" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Outdoors" })); // toggle off
    expect(screen.getByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
  });

  it("falls back to demo events with a welcome banner when the feed is empty", async () => {
    fetchMock.mockImplementation(() => feed([]));
    render(<ExplorePage />);
    expect(await screen.findByText(/Welcome to OuttaCouch/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sunset Rooftop Jam" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Host your own event" }));
    expect(nav.push).toHaveBeenCalledWith("/events/new");
  });

  it("records swipes and routes a right swipe to the event's ticket section", async () => {
    fetchMock.mockImplementation((url: string) => (url.startsWith("/api/events/swipe") ? json({ status: "logged" }) : feed([ev("e1", "Rooftop Jam", "Music")])));
    render(<ExplorePage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/e1#tickets"));
    const swipeCall = fetchMock.mock.calls.find(([url]) => url === "/api/events/swipe")!;
    expect(JSON.parse((swipeCall[1] as RequestInit).body as string)).toEqual({ event_id: "e1", action: "right" });
  });

  it("offers and performs 'load more' with de-duplication", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/events?page=2" ? feed([ev("e1", "Rooftop Jam", "Music"), ev("e3", "Comedy Night", "Comedy")]) : feed([ev("e1", "Rooftop Jam", "Music")], true)
    );
    render(<ExplorePage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Load more events" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Comedy" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/events?page=2");
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it("shows an error when the feed cannot load", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<ExplorePage />);
    expect(await screen.findByText("Could not load events.")).toBeInTheDocument();
  });
});

describe("NotificationsPage", () => {
  const list = [
    { id: "n1", title: "Reminder", body: "Starts soon", link: "/events/e1", readAt: null, createdAt: "2026-03-01T10:00:00Z" },
    { id: "n2", title: "Welcome", body: "Hi", link: null, readAt: "2026-02-01T10:00:00Z", createdAt: "2026-02-01T10:00:00Z" }
  ];

  it("lists notifications with unread summary and navigates on click after marking read", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/notifications" ? json({ notifications: list }) : json({ status: "ok" })));
    render(<NotificationsPage />);
    expect(await screen.findByText("1 unread")).toBeInTheDocument();
    expect(screen.getByText("2 total notifications")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Reminder"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/e1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1/read", { method: "PUT" });
    expect(await screen.findByText("All caught up")).toBeInTheDocument();
  });

  it("marks all read, dismisses one and clears all", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/notifications" && !fetchMock.mock.calls.some(([u, i]) => u === url && (i as RequestInit)?.method === "DELETE") ? json({ notifications: list }) : json({ status: "ok" })));
    render(<NotificationsPage />);
    await screen.findByText("1 unread");

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", { method: "PUT" }));
    expect(await screen.findByText("All caught up")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1", { method: "DELETE" }));
    expect(screen.queryByText("Reminder")).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/notifications", { method: "DELETE" }));
    expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  it("links to each settings section and logs out", async () => {
    render(<SettingsPage />);
    expect(screen.getByRole("link", { name: /Edit profile/ })).toHaveAttribute("href", "/profile/edit");
    expect(screen.getByRole("link", { name: /Privacy/ })).toHaveAttribute("href", "/settings/privacy");
    expect(screen.getByRole("link", { name: /Sync & invite contacts/ })).toHaveAttribute("href", "/settings/contacts");
    expect(screen.getByRole("link", { name: /Host dashboard/ })).toHaveAttribute("href", "/settings/host");
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("deactivates only after confirmation, then signs out", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fetchMock.mockImplementation(() => json({ status: "deactivated" }));
    render(<SettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/me", { method: "DELETE" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/" }));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

describe("ChatListPage", () => {
  it("shows connections to start chats with and existing conversations, filterable", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/chat"
        ? json({ chats: [{ connectionId: "c1", userId: "a", name: "Alice", lastMessage: "hey", lastAt: "2026-03-01T00:00:00Z" }] })
        : json({ connections: [{ id: "c1", userId: "a", name: "Alice" }, { id: "c2", userId: "b", name: "Bob" }] })
    );
    render(<ChatListPage />);
    expect(await screen.findByText("hey")).toBeInTheDocument();
    expect(screen.getByText("Open chat")).toBeInTheDocument();
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alice/ })).toHaveAttribute("href", "/chat/c1");

    await userEvent.click(screen.getByText("Bob"));
    expect(nav.push).toHaveBeenCalledWith("/chat/c2");

    await userEvent.type(screen.getByPlaceholderText("Search chats"), "zzz");
    expect(screen.queryByText("hey")).toBeNull();
  });

  it("nudges users without connections to find people", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/chat" ? json({ chats: [] }) : json({ connections: [] })));
    render(<ChatListPage />);
    expect(await screen.findByText(/don't have any connections yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find people/ })).toHaveAttribute("href", "/connections");
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
  });
});

describe("HostEventsPage", () => {
  it("lists hosted events linking to their dashboards", async () => {
    fetchMock.mockImplementation(() => json({ events: [{ id: "e1", title: "Gig", date: "Mar 1, 2026", attendeeCount: 12 }] }));
    render(<HostEventsPage />);
    const link = await screen.findByRole("link", { name: /Gig/ });
    expect(link).toHaveAttribute("href", "/events/manage/e1");
    expect(within(link).getByText(/12 attending/)).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    fetchMock.mockImplementation(() => json({ events: [] }));
    render(<HostEventsPage />);
    expect(await screen.findByText("No hosted events yet.")).toBeInTheDocument();
  });
});
