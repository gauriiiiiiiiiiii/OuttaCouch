// @vitest-environment jsdom
/**
 * Main app pages: secondary error paths and interactions the primary page suites did not reach.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), update: vi.fn() }));
vi.mock("next-auth/react", () => ({
  signIn: auth.signIn,
  signOut: auth.signOut,
  useSession: () => ({ update: auth.update, data: null, status: "authenticated" })
}));
vi.mock("next/dynamic", () => ({
  default: () => {
    const DynamicStub = (props: { onChange?: (lat: number, lng: number) => void }) => (
      <div data-testid="map-stub">{props.onChange ? <button type="button" onClick={() => props.onChange?.(1, 2)}>pick-on-map</button> : null}</div>
    );
    return DynamicStub;
  }
}));
const storage = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/services/storage", () => ({ StorageService: storage }));
const socket = vi.hoisted(() => ({ emit: vi.fn(), disconnect: vi.fn(), on: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: () => socket }));

import ChatListPage from "@/app/(main)/chat/page";
import ChatThreadPage from "@/app/(main)/chat/[id]/page";
import ConnectionsPage from "@/app/(main)/connections/page";
import PublicProfilePage from "@/app/(main)/users/[id]/page";
import EventDetailPage from "@/app/(main)/events/[id]/page";
import EditEventPage from "@/app/(main)/events/manage/[id]/edit/page";
import HostDashboardPage from "@/app/(main)/events/manage/[id]/page";
import HostEventsPage from "@/app/(main)/events/manage/page";
import CreateEventPage from "@/app/(main)/events/new/page";
import ExplorePage from "@/app/(main)/explore/page";
import ProfilePage from "@/app/(main)/profile/page";
import EditProfilePage from "@/app/(main)/profile/edit/page";
import MemoriesPage from "@/app/(main)/profile/memories/page";
import ContactsPage from "@/app/(main)/settings/contacts/page";
import NotificationSettingsPage from "@/app/(main)/settings/notifications/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const calls = () => fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
const bodyOf = (url: string, method: string) => {
  const call = calls().find(([u, i]) => u === url && i?.method === method);
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};
const setGeolocation = (impl: unknown) => Object.defineProperty(navigator, "geolocation", { value: impl, configurable: true });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.searchParams = new URLSearchParams();
  nav.params = { id: "e1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
  setGeolocation(undefined);
});

describe("ChatListPage — avatars, photos and failures", () => {
  it("opens profiles from avatars without following the chat link", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/chat"
        ? json({ chats: [{ connectionId: "c1", userId: "a", name: "Alice", lastMessage: "", photo: "https://img/a.jpg", lastAt: null }] })
        : json({ connections: [{ id: "c1", userId: "a", name: "Alice", photo: "https://img/a.jpg" }] })
    );
    render(<ChatListPage />);
    const avatars = await screen.findAllByRole("button", { name: "View Alice" });
    expect(avatars).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "Alice" })).toHaveLength(2);
    await userEvent.click(avatars[0]);
    await userEvent.click(avatars[1]);
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenCalledWith("/users/a");
    expect(screen.getByText("Say hello")).toBeInTheDocument();
  });

  it("degrades to empty lists when both requests fail", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<ChatListPage />);
    expect(await screen.findByText(/don't have any connections yet/)).toBeInTheDocument();
  });
});

describe("ChatThreadPage — failed send", () => {
  it("clears the input but does not append when the server rejects the message", async () => {
    nav.params = { id: "c1" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/users/me") return json({ user: { id: "me" } });
      if (url === "/api/chat/c1" && init?.method === "POST") return json({ error: "Connection not active" }, false, 403);
      if (url === "/api/chat/c1") return json({ messages: [] });
      return json({});
    });
    render(<ChatThreadPage />);
    await screen.findByText("No messages yet.");
    await userEvent.type(screen.getByPlaceholderText("Type a message"), "hello{Enter}");
    await waitFor(() => expect(bodyOf("/api/chat/c1", "POST")).toEqual({ content: "hello" }));
    expect(screen.getByPlaceholderText("Type a message")).toHaveValue("");
    expect(screen.queryByText("hello")).toBeNull();
  });
});

describe("ConnectionsPage — avatars and photos", () => {
  it("opens profiles from request, nearby and suggestion rows and renders photos", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/connections/suggestions") return json({ suggestions: [{ userId: "s1", name: "Sam", photo: "https://img/s.jpg", sharedEventTitle: null, sharedCount: 0 }] });
      if (url === "/api/connections") return json({ connections: [] });
      if (url === "/api/connections/requests") return json({ requests: [{ id: "r1", userId: "b", name: "Bob", photo: "https://img/b.jpg", sharedEventTitle: "Jam", requestedAt: "x" }] });
      if (url === "/api/connections/discover") return json({ results: [{ userId: "n1", name: "Nia", photo: "https://img/n.jpg", matchReason: "Nearby" }] });
      return json({}, false);
    });
    render(<ConnectionsPage />);
    await screen.findByText("Suggested for you");
    expect(screen.getAllByRole("img")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "View Bob" }));
    await userEvent.click(screen.getByRole("button", { name: /Nia/ }));
    await userEvent.click(screen.getByRole("button", { name: "View Sam" }));
    expect(nav.push.mock.calls.map((c) => c[0])).toEqual(["/users/b", "/users/n1", "/users/s1"]);
  });
});

describe("PublicProfilePage — remaining branches", () => {
  const base = {
    user: { id: "them", displayName: null, bio: null, profilePhotoUrl: "https://img/t.jpg", city: null, preferences: [], profileVisibility: "public", isVerifiedHost: false },
    isSelf: false,
    connectionStatus: "none",
    connectionId: null,
    stats: { eventsHosted: 0, connections: 0 },
    hostedEvents: [{ id: "h1", title: "Paid Gig", date: "2026-05-01T00:00:00Z", venueName: "V", coverImageUrl: "https://img/h.jpg", isFree: false, ticketPrice: "499" }],
    timelineEvents: [{ id: "t1", title: "Quiet", date: "2026-04-01T00:00:00Z", category: "Art", location: null, status: "committed", imageUrl: "https://img/q.jpg" }],
    publicCalendar: []
  };

  it("handles a nameless user, no interests, paid hosted events and a failed connect", async () => {
    nav.params = { id: "them" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "POST" ? json({ error: "nope" }, false, 400) : json(base)));
    render(<PublicProfilePage />);
    expect(await screen.findByRole("heading", { name: "User" })).toBeInTheDocument();
    expect(screen.getByText("No interests shared.")).toBeInTheDocument();
    expect(screen.getByText("499")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "User" })).toHaveAttribute("src", "https://img/t.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "View User" }));
    expect(nav.push).toHaveBeenCalledWith("/users/them");
  });

  it("does nothing on Message when the connection id is missing", async () => {
    nav.params = { id: "them" };
    fetchMock.mockImplementation(() => json({ ...base, connectionStatus: "accepted", connectionId: null }));
    render(<PublicProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Message" }));
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("EventDetailPage — minimal event and cancel failure", () => {
  const minimal = {
    id: "e1",
    title: "Bare",
    description: "",
    category: "Other",
    date: "Jan 1, 2027",
    time: "10:00 AM",
    startTime: null,
    endTime: null,
    eventDate: null,
    venueName: "V",
    address: "A",
    lat: null,
    lng: null,
    coverImageUrl: "https://img/c.jpg",
    images: [],
    isFree: true,
    ticketPrice: null,
    host: { id: "h", name: "Host", photo: "https://img/h.jpg" },
    attendeeCount: 0,
    isCommitted: true,
    goingList: []
  };

  it("omits gallery, map, going list and distance; shows TBD; keeps commitment when cancel fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({}, false, 500) : url === "/api/events/e1" ? json(minimal) : Promise.reject(new Error("feed down"))
    );
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Bare" });
    expect(screen.queryByText("Gallery")).toBeNull();
    expect(screen.queryByTestId("map-stub")).toBeNull();
    expect(screen.queryByText(/Going \(/)).toBeNull();
    expect(screen.queryByText(/km away/)).toBeNull();
    expect(screen.getByText("TBD")).toBeInTheDocument();
    expect(screen.getByText("No similar events right now.")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2027 10:00 AM")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel attendance" }));
    await waitFor(() => expect(calls().some(([, i]) => i?.method === "DELETE")).toBe(true));
    expect(await screen.findByRole("button", { name: "✓ Confirmed" })).toBeInTheDocument();
  });
});

describe("EditEventPage — media, location and save failure", () => {
  const form = { id: "e1", title: "T", descriptionShort: "s", descriptionFull: "", category: "Art", eventDate: "2026-05-10", startTime: "18:05", endDate: "", endTime: "", venueName: "V", address: "A", lat: 1, lng: 2, isFree: true, ticketPrice: null, maxAttendees: 10, coverImageUrl: null };

  it("uploads a cover, uses the device location and reports a failed save", async () => {
    setGeolocation({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 5.5, longitude: 6.6 } }) });
    storage.uploadImage.mockResolvedValueOnce({ error: "Too big" }).mockResolvedValueOnce({ publicUrl: "https://cdn/new.jpg" });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({}, false, 500) : json(form)));
    render(<EditEventPage />);
    await screen.findByPlaceholderText("Event name");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 3 of 4");
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(document.querySelector('input[name="lat"]')).toHaveValue("5.5");
    await userEvent.click(screen.getByRole("button", { name: "pick-on-map" }));
    expect(document.querySelector('input[name="lng"]')).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 4 of 4");
    expect(screen.queryByRole("img", { name: "Cover preview" })).toBeNull();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "c.png", { type: "image/png" }));
    expect(await screen.findByText("Too big")).toBeInTheDocument();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "c.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: "Cover preview" })).toHaveAttribute("src", "https://cdn/new.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Could not update event.")).toBeInTheDocument();
  });

  it("reports unsupported geolocation", async () => {
    fetchMock.mockImplementation(() => json(form));
    render(<EditEventPage />);
    await screen.findByPlaceholderText("Event name");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 3 of 4");
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Geolocation not supported.")).toBeInTheDocument();
  });
});

describe("CreateEventPage — unsupported geolocation", () => {
  it("shows an error instead of crashing", async () => {
    render(<CreateEventPage />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "T");
    await userEvent.selectOptions(screen.getByRole("combobox"), "Art");
    await userEvent.type(screen.getByPlaceholderText("Short description"), "s");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
    fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 3 of 4");
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Geolocation not supported.")).toBeInTheDocument();
  });
});

describe("HostDashboardPage — failure paths", () => {
  const hostEvent = { id: "e1", title: "Gig", date: "x", attendeeCount: 0, isHost: true, attendees: [], revenueTotal: 0 };

  it("reports delete, copy and gallery-upload failures", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1" && init?.method === "DELETE") return json({}, false, 500);
      if (url === "/api/events/e1") return json(hostEvent);
      if (url === "/api/events/e1/images") return json({ images: [] });
      return json({}, false);
    });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    storage.uploadImage.mockResolvedValue({ error: undefined });
    render(<HostDashboardPage />);
    await screen.findByRole("heading", { name: "Gig" });
    expect(screen.getByText("No attendees yet.")).toBeInTheDocument();
    expect(screen.getByText("No gallery images yet.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete event" }));
    expect(screen.getByText(/Delete event\? This cannot be undone/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText("Could not delete event.")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Copy event link" }));
    expect(await screen.findByText("Could not copy link.")).toBeInTheDocument();

    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "g.png", { type: "image/png" }));
    expect(await screen.findByText("Gallery upload failed.")).toBeInTheDocument();
  });
});

describe("list pages degrade when their API fails", () => {
  it("HostEventsPage shows the empty state", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<HostEventsPage />);
    expect(await screen.findByText("No hosted events yet.")).toBeInTheDocument();
  });

  it("MemoriesPage shows no uploads when the memories request fails", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/users/me" ? json({ user: {}, stats: {}, privateCalendar: [] }) : json({}, false, 500)));
    render(<MemoriesPage />);
    expect(await screen.findByText("No uploads yet.")).toBeInTheDocument();
  });

  it("ProfilePage shows no connections when that request fails", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/users/me" ? json({ user: { displayName: "Me" }, stats: { eventsHosted: 0, eventsAttended: 0, connections: 0 }, privateCalendar: [] }) : json({}, false, 500)
    );
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Connections \d+$/ }));
    expect(screen.getByText("No connections yet.")).toBeInTheDocument();
  });

  it("EditProfilePage and NotificationSettingsPage tolerate a failed load", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    const { unmount } = render(<EditProfilePage />);
    expect(await screen.findByText("Could not load profile.")).toBeInTheDocument();
    unmount();
    render(<NotificationSettingsPage />);
    const reminders = await screen.findByLabelText("Event reminders");
    await waitFor(() => expect(reminders).toBeEnabled());
    expect(reminders).toBeChecked();
  });
});

describe("ExplorePage — demo card swipes", () => {
  it("hides a skipped demo card (exactly one) and opens a committed one without calling the API", async () => {
    fetchMock.mockImplementation(() => json({ events: [], hasMore: false }));
    render(<ExplorePage />);
    await screen.findByRole("heading", { name: "Sunset Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("heading", { name: "Midnight Food Crawl" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1200)); // animation settles; still the second card
    expect(screen.getByRole("heading", { name: "Midnight Food Crawl" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(nav.push).toHaveBeenCalledWith("/events/dummy-2");
    expect(calls().some(([u]) => u === "/api/events/swipe")).toBe(false);
  });
});

describe("remaining page branches", () => {
  it("ChatListPage nudges when there are connections but no conversations yet", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/chat" ? json({ chats: [] }) : json({ connections: [{ id: "c1", userId: "a", name: "Alice" }] })));
    render(<ChatListPage />);
    expect(await screen.findByText(/tap a connection above to say hello/)).toBeInTheDocument();
  });

  it("ChatThreadPage: empty POST reply is ignored and the typing indicator times out", async () => {
    nav.params = { id: "c1" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/users/me") return json({ user: { id: "me" } });
      if (url === "/api/chat/c1" && init?.method === "POST") return json({});
      if (url === "/api/chat/c1") return json({ messages: [] });
      return json({});
    });
    render(<ChatThreadPage />);
    await screen.findByText("No messages yet.");
    await userEvent.type(screen.getByPlaceholderText("Type a message"), "hi{Enter}");
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(socket.emit).toHaveBeenCalledWith("typing", { roomId: "c1", userId: "me", isTyping: false });
  });

  it("ConnectionsPage degrades to empty sections when every request fails", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<ConnectionsPage />);
    expect(await screen.findByText(/No connections yet/)).toBeInTheDocument();
    expect(screen.getByText("No suggestions yet.")).toBeInTheDocument();
  });

  it("EventDetailPage: similar-events failure, photos in the going list, share cancel and cancel-network-error", async () => {
    nav.params = { id: "e1" };
    const detail = {
      id: "e1", title: "Rooftop Jam", description: "d", category: "Music", date: "d", time: "t", startTime: null, endTime: null, eventDate: null,
      venueName: "V", address: "A", lat: 1, lng: 2, coverImageUrl: "https://img/c.jpg", images: [], isFree: true, ticketPrice: null,
      host: { id: "h", name: "Host", photo: null }, attendeeCount: 2, isCommitted: true,
      goingList: [{ name: "Pic", photo: "https://img/p.jpg" }, { name: "NoPic", photo: null }]
    };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1" && !init?.method) return json(detail);
      if (url === "/api/events/e1/commit" && init?.method === "DELETE") return Promise.reject(new Error("offline"));
      return json({}, false, 500);
    });
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new Error("cancelled")), configurable: true });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    expect(screen.getByText("No similar events right now.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pic" })).toHaveAttribute("src", "https://img/p.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Share event" }));
    expect(screen.getByRole("button", { name: "Share event" })).toBeInTheDocument(); // cancel is silent
    await userEvent.click(screen.getByRole("button", { name: "Cancel attendance" }));
    expect(await screen.findByRole("button", { name: "✓ Confirmed" })).toBeInTheDocument();
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("EventDetailPage falls back silently when the profile location request fails", async () => {
    nav.params = { id: "e1" };
    fetchMock.mockImplementation((url: string) =>
      url === "/api/events/e1"
        ? json({ id: "e1", title: "T", description: "", category: "x", date: "d", time: "t", venueName: "V", address: "A", lat: 1, lng: 2, coverImageUrl: "https://img/c.jpg", images: [], isFree: true, ticketPrice: null, host: { id: "h", name: "H", photo: null }, attendeeCount: 0, isCommitted: false, goingList: [] })
        : json({}, false, 500)
    );
    setGeolocation({ getCurrentPosition: (_ok: unknown, fail: () => void) => fail() });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "T" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/km away/)).toBeNull();
  });

  it("HostDashboardPage: 'Move down', empty file selection and a failed images request", async () => {
    nav.params = { id: "e1" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1") return json({ id: "e1", title: "Gig", date: "x", attendeeCount: 0, isHost: true, attendees: [], revenueTotal: 0 });
      if (url === "/api/events/e1/images" && !init?.method) return json({}, false, 500);
      return json({ status: "ok" });
    });
    render(<HostDashboardPage />);
    await screen.findByRole("heading", { name: "Gig" });
    expect(await screen.findByText("No gallery images yet.")).toBeInTheDocument();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(calls().some(([u, i]) => u === "/api/events/e1/images" && i?.method === "POST")).toBe(false);
  });

  it("HostDashboardPage reorders downwards", async () => {
    nav.params = { id: "e1" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1") return json({ id: "e1", title: "Gig", date: "x", attendeeCount: 0, isHost: true, attendees: [], revenueTotal: 0 });
      if (url === "/api/events/e1/images" && !init?.method) return json({ images: [{ id: "i1", imageUrl: "https://img/1.jpg", isCover: false, orderIndex: 0 }, { id: "i2", imageUrl: "https://img/2.jpg", isCover: false, orderIndex: 1 }] });
      return json({ status: "ok" });
    });
    render(<HostDashboardPage />);
    await screen.findAllByRole("img", { name: "Gig" });
    await userEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/events/e1/images" && i?.method === "PUT" && (i.body as string).includes('"direction":"down"'))).toBe(true));
  });

  it("EditEventPage: Back button, empty file selection and an upload without a message", async () => {
    nav.params = { id: "e1" };
    fetchMock.mockImplementation(() => json({ id: "e1", title: "T", descriptionShort: "s", category: "Art", eventDate: "2026-05-10", startTime: "18:05", venueName: "V", address: "A", lat: 1, lng: 2, isFree: true, ticketPrice: null, maxAttendees: 10 }));
    storage.uploadImage.mockResolvedValue({});
    render(<EditEventPage />);
    await screen.findByPlaceholderText("Event name");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    for (let i = 0; i < 3; i += 1) await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 4 of 4");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(storage.uploadImage).not.toHaveBeenCalled();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "c.png", { type: "image/png" }));
    expect(await screen.findByText(/Image upload failed\. Create the bucket 'event-images'/)).toBeInTheDocument();
  });

  it("CreateEventPage: empty file selection and an upload without a message", async () => {
    storage.uploadImage.mockResolvedValue({});
    render(<CreateEventPage />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "T");
    await userEvent.selectOptions(screen.getByRole("combobox"), "Art");
    await userEvent.type(screen.getByPlaceholderText("Short description"), "s");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
    fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.type(screen.getByPlaceholderText("Venue name"), "V");
    await userEvent.type(screen.getByPlaceholderText("Address"), "A");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 4 of 4");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(storage.uploadImage).not.toHaveBeenCalled();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "c.png", { type: "image/png" }));
    expect(await screen.findByText(/Image upload failed\. Create the bucket 'event-images'/)).toBeInTheDocument();
  });

  it("ProfilePage: hosted 'View' and calendar event selection navigate to the event", async () => {
    const today = new Date();
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0).toISOString();
    fetchMock.mockImplementation((url: string) =>
      url === "/api/users/me"
        ? json({ user: { displayName: "Me" }, stats: { eventsHosted: 1, eventsAttended: 0, connections: 0 }, privateCalendar: [{ id: "h1", title: "Hosted Gig", date: at, category: "Music", status: "hosted", imageUrl: null }] })
        : json({ connections: [] })
    );
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Hosted \d+$/ }));
    await userEvent.click(screen.getByRole("button", { name: "View" }));
    expect(nav.push).toHaveBeenCalledWith("/events/h1");
    nav.push.mockClear();
    const dayCell = screen.getAllByRole("button").find((b) => b.textContent === String(today.getDate()) && b.className.includes("ring-ink"))!;
    await userEvent.click(dayCell);
    const popup = screen.getByText("1 event").closest("div")!.parentElement!.parentElement!;
    await userEvent.click(within(popup).getByText("Hosted Gig"));
    expect(nav.push).toHaveBeenCalledWith("/events/h1");
  });

  it("EditProfilePage and MemoriesPage ignore an empty file selection and show fallback upload messages", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/users/me" ? json({ user: { displayName: "Me", preferences: [] }, stats: {}, privateCalendar: [] }) : init?.method === "POST" ? json({ id: "m" }) : json({}, false, 500)
    );
    storage.uploadImage.mockResolvedValue({});
    const edit = render(<EditProfilePage />);
    await screen.findByPlaceholderText("Display name");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(storage.uploadImage).not.toHaveBeenCalled();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "p.png", { type: "image/png" }));
    expect(await screen.findByText(/Create the bucket 'profile-photos'/)).toBeInTheDocument();
    edit.unmount();

    storage.uploadImage.mockReset();
    storage.uploadImage.mockResolvedValueOnce({}).mockResolvedValueOnce({ publicUrl: "https://cdn/m.jpg" });
    render(<MemoriesPage />);
    await screen.findByText("No uploads yet.");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "m.png", { type: "image/png" }));
    expect(await screen.findByText(/Create the bucket 'memories'/)).toBeInTheDocument();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "m.png", { type: "image/png" }));
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/memories" && i?.method === "POST")).toBe(true));
    expect(await screen.findByText("No uploads yet.")).toBeInTheDocument(); // refresh failed -> empty
  });

  it("NotificationSettingsPage toggles recommendations", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({ user: {} }) : json({ user: { remindersEnabled: true, recommendationsEnabled: true } })));
    render(<NotificationSettingsPage />);
    const recs = await screen.findByLabelText("Recommendations");
    await waitFor(() => expect(recs).toBeEnabled());
    await userEvent.click(recs);
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(bodyOf("/api/users/me", "PUT")).toEqual({ remindersEnabled: true, recommendationsEnabled: false }));
  });

  it("PublicProfilePage shows empty states and opens events from the public calendar", async () => {
    nav.params = { id: "them" };
    const today = new Date();
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0).toISOString();
    fetchMock.mockImplementation(() =>
      json({
        user: { id: "them", displayName: "Them", bio: null, profilePhotoUrl: null, city: null, preferences: [], profileVisibility: "public", isVerifiedHost: false },
        isSelf: true, connectionStatus: "none", connectionId: null, stats: { eventsHosted: 0, connections: 0 },
        hostedEvents: [], timelineEvents: [],
        publicCalendar: [{ id: "pc1", title: "Public Thing", date: at, category: "Art", status: "attended" }]
      })
    );
    render(<PublicProfilePage />);
    await screen.findByRole("heading", { name: "Them" });
    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
    expect(screen.getByText("No upcoming events listed.")).toBeInTheDocument();
    const dayCell = screen.getAllByRole("button").find((b) => b.textContent === String(today.getDate()) && b.className.includes("ring-ink"))!;
    await userEvent.click(dayCell);
    await userEvent.click(screen.getByText("Public Thing"));
    expect(nav.push).toHaveBeenCalledWith("/events/pc1");
  });

  it("ChatThreadPage survives a failed socket bootstrap request", async () => {
    nav.params = { id: "c1" };
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/socketio") return Promise.reject(new Error("no socket server"));
      if (url === "/api/users/me") return json({ user: { id: "me" } });
      if (url === "/api/chat/c1") return json({ messages: [] });
      return json({});
    });
    render(<ChatThreadPage />);
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
    await waitFor(() => expect(socket.emit).toHaveBeenCalledWith("join", "c1"));
  });

  it("EventDetailPage does not re-submit after the server reports an existing commitment", async () => {
    nav.params = { id: "e1" };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1" && !init?.method) return json({ id: "e1", title: "Rooftop Jam", description: "", category: "x", date: "d", time: "t", venueName: "V", address: "A", lat: null, lng: null, coverImageUrl: "https://img/c.jpg", images: [], isFree: true, ticketPrice: null, host: { id: "h", name: "H", photo: null }, attendeeCount: 0, isCommitted: false, goingList: [] });
      if (url === "/api/events/e1/commit") return json({ status: "already-committed" });
      return json({ events: [] });
    });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Already added")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(calls().filter(([u, i]) => u === "/api/events/e1/commit" && i?.method === "POST")).toHaveLength(1);
  });

  it("ContactsPage treats a non-OK invite response as a failure", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ error: "nope" }, false, 500) : json({ contacts: [{ id: "2", name: "Bob", phone: "+912", status: "pending", invitedAt: null, registeredUser: null }], stats: { total: 1, registered: 0, invited: 0, pending: 1 } })
    );
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Could not send the invite. Try again.")).toBeInTheDocument();
  });
});

describe("ContactsPage — invite failure", () => {
  it("shows an error and re-enables the button when the invite request fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST" ? Promise.reject(new Error("offline")) : json({ contacts: [{ id: "2", name: "Bob", phone: "+912", status: "pending", invitedAt: null, registeredUser: null }], stats: { total: 1, registered: 0, invited: 0, pending: 1 } })
    );
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Could not send the invite. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeEnabled();
  });
});
