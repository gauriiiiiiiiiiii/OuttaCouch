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
  return { push, replace, back, router: { push, replace, back }, params: {} as Record<string, string> };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => nav.params
}));
const auth = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: auth.update, data: null, status: "authenticated" }),
  signIn: vi.fn(),
  signOut: vi.fn()
}));
const storage = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/services/storage", () => ({ StorageService: storage }));

import ProfilePage from "@/app/(main)/profile/page";
import EditProfilePage from "@/app/(main)/profile/edit/page";
import MemoriesPage from "@/app/(main)/profile/memories/page";
import TicketsPage from "@/app/(main)/profile/tickets/page";
import PublicProfilePage from "@/app/(main)/users/[id]/page";
import ProfileOnboardingPage from "@/app/(auth)/onboarding/profile/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const calls = () => fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
const bodyOf = (url: string, method: string) => {
  const call = calls().find(([u, i]) => u === url && i?.method === method);
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};

const me = {
  user: { id: "me", displayName: "Priya", email: "p@x.com", bio: "Hi", city: "Delhi", profilePhotoUrl: null, preferences: ["Music"], remindersEnabled: true, recommendationsEnabled: false, profileVisibility: "public" },
  stats: { eventsHosted: 1, eventsAttended: 1, connections: 2 },
  privateCalendar: [
    { id: "h1", title: "Hosted Gig", date: new Date().toISOString(), category: "Music", status: "hosted", imageUrl: null },
    { id: "a1", title: "Attended Hike", date: new Date().toISOString(), category: "Outdoors", status: "attended", imageUrl: "https://img/a.jpg" }
  ]
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.params = { id: "them" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ProfilePage", () => {
  const mockApi = () =>
    fetchMock.mockImplementation((url: string) =>
      url === "/api/users/me" ? json(me) : url === "/api/connections" ? json({ connections: [{ id: "c1", userId: "a", name: "Alice" }] }) : json({}, false)
    );

  it("renders header, quick actions and the calendar, and navigates from quick actions", async () => {
    mockApi();
    render(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "Priya" })).toBeInTheDocument();
    for (const [label, path] of [["Edit profile", "/profile/edit"], ["My tickets", "/profile/tickets"], ["Memories", "/profile/memories"], ["Hosted events", "/events/manage"]] as const) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
      expect(nav.push).toHaveBeenCalledWith(path);
    }
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(nav.push).toHaveBeenCalledWith("/settings");
  });

  it("toggles the attended / hosted / connections sections", async () => {
    mockApi();
    render(<ProfilePage />);
    await screen.findByRole("heading", { name: "Priya" });

    await userEvent.click(screen.getByRole("button", { name: /^Attended \d+$/ }));
    expect(screen.getByText("Attended Hike")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Attended Hike/ }));
    expect(nav.push).toHaveBeenCalledWith("/events/a1");

    await userEvent.click(screen.getByRole("button", { name: /^Hosted \d+$/ }));
    expect(screen.getByText("Hosted Gig")).toBeInTheDocument();
    expect(screen.queryByText("Attended Hike")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(nav.push).toHaveBeenCalledWith("/events/manage/h1/edit");

    await userEvent.click(screen.getByRole("button", { name: /^Connections \d+$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Alice/ }));
    expect(nav.push).toHaveBeenCalledWith("/users/a");

    await userEvent.click(screen.getByRole("button", { name: /^Connections \d+$/ }));
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("falls back to email for the display name and shows an error when loading fails", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/users/me" ? json({ ...me, user: { ...me.user, displayName: null } }) : json({ connections: [] })));
    const { unmount } = render(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "p@x.com" })).toBeInTheDocument();
    unmount();
    fetchMock.mockImplementation(() => json({}, false, 502));
    render(<ProfilePage />);
    expect(await screen.findByText("Could not load profile.")).toBeInTheDocument();
  });
});

describe("EditProfilePage", () => {
  it("prefills, saves and reports the outcome", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({ user: {} }) : json(me)));
    render(<EditProfilePage />);
    expect(await screen.findByPlaceholderText("Display name")).toHaveValue("Priya");
    expect(screen.getByLabelText("Music")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Food"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf("/api/users/me", "PUT")).toMatchObject({ displayName: "Priya", bio: "Hi", preferences: ["Music", "Food"] });
  });

  it("uploads a new photo and shows the preview", async () => {
    fetchMock.mockImplementation(() => json(me));
    storage.uploadImage.mockResolvedValue({ publicUrl: "https://cdn/p.jpg" });
    render(<EditProfilePage />);
    await screen.findByPlaceholderText("Display name");
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "me.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: "Profile preview" })).toHaveAttribute("src", "https://cdn/p.jpg");
    expect(storage.uploadImage).toHaveBeenCalledWith(expect.objectContaining({ bucket: "profile-photos", folder: "users" }));
  });

  it("reports load, upload and save failures", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({}, false, 400) : json(me)));
    storage.uploadImage.mockResolvedValue({ error: "Too big" });
    render(<EditProfilePage />);
    await screen.findByPlaceholderText("Display name");
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "me.png", { type: "image/png" }));
    expect(await screen.findByText("Too big")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Save failed.")).toBeInTheDocument();
  });
});

describe("MemoriesPage", () => {
  const memory = { id: "m1", imageUrl: "https://img/m.jpg", caption: "Fun", createdAt: "2026-03-05T10:00:00Z", event: { id: "h1", title: "Hosted Gig", date: "2026-03-01", category: "Music" } };

  it("lists uploads and event-derived memories, uploads a new one and deletes", async () => {
    let memories = [memory];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/users/me") return json(me);
      if (url === "/api/memories" && init?.method === "POST") {
        memories = [...memories, { ...memory, id: "m2", caption: "New" }];
        return json({ id: "m2" });
      }
      if (url === "/api/memories") return json({ memories });
      if (url === "/api/memories/m1" && init?.method === "DELETE") return json({ status: "deleted" });
      return json({}, false);
    });
    storage.uploadImage.mockResolvedValue({ publicUrl: "https://cdn/new.jpg" });

    render(<MemoriesPage />);
    expect(await screen.findByText("Fun")).toBeInTheDocument();
    expect(screen.getByText("From Hosted Gig")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Attended Hike" })).toBeInTheDocument(); // from private calendar
    expect(screen.getByRole("option", { name: "Attended Hike" })).toBeInTheDocument(); // selectable for uploads

    await userEvent.type(screen.getByPlaceholderText("Add a caption"), "New");
    await userEvent.selectOptions(screen.getByRole("combobox"), "h1");
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "n.png", { type: "image/png" }));
    await waitFor(() => expect(bodyOf("/api/memories", "POST")).toEqual({ imageUrl: "https://cdn/new.jpg", caption: "New", eventId: "h1" }));
    expect(await screen.findByText("New")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a caption")).toHaveValue("");

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(screen.queryByText("Fun")).toBeNull());
  });

  it("reports upload and save failures", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/users/me" ? json(me) : init?.method === "POST" ? json({}, false, 400) : json({ memories: [] })
    );
    storage.uploadImage.mockResolvedValueOnce({ error: "Bucket missing" }).mockResolvedValueOnce({ publicUrl: "u" });
    render(<MemoriesPage />);
    await screen.findByText("No uploads yet.");
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "n.png", { type: "image/png" }));
    expect(await screen.findByText("Bucket missing")).toBeInTheDocument();
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "n.png", { type: "image/png" }));
    expect(await screen.findByText("Failed to save memory.")).toBeInTheDocument();
  });

  it("shows an error when the profile cannot load", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<MemoriesPage />);
    expect(await screen.findByText("Could not load memories.")).toBeInTheDocument();
  });
});

describe("TicketsPage", () => {
  it("lists tickets with payment badges and reveals the QR on demand", async () => {
    fetchMock.mockImplementation(() =>
      json({
        tickets: [
          { id: "t1", eventTitle: "Gala", eventDate: "2026-07-01T18:00:00Z", quantity: 2, amountPaid: "998", paymentStatus: "paid", qrCode: "QR-1" },
          { id: "t2", eventTitle: "Free Show", eventDate: "2026-07-02T18:00:00Z", quantity: 1, amountPaid: "0", paymentStatus: "refunded", qrCode: "QR-2" }
        ]
      })
    );
    render(<TicketsPage />);
    expect(await screen.findByText("Gala")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.getByText("Qty: 2 · ₹998")).toBeInTheDocument();
    expect(screen.getByText("Qty: 1 · Free")).toBeInTheDocument();
    expect(screen.queryByText("QR-1")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Gala/ }));
    expect(screen.getByText("QR-1")).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Hide QR")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Gala/ }));
    expect(screen.queryByText("QR-1")).toBeNull();
  });

  it("shows an empty state", async () => {
    fetchMock.mockImplementation(() => json({ tickets: [] }));
    render(<TicketsPage />);
    expect(await screen.findByText("No tickets yet.")).toBeInTheDocument();
  });
});

describe("PublicProfilePage", () => {
  const profile = (overrides: Record<string, unknown> = {}) => ({
    user: { id: "them", displayName: "Them", bio: "Bio", profilePhotoUrl: null, city: "Delhi", preferences: ["Art"], profileVisibility: "public", isVerifiedHost: true },
    isSelf: false,
    connectionStatus: "none",
    connectionId: null,
    stats: { eventsHosted: 3, connections: 5 },
    hostedEvents: [{ id: "h1", title: "Their Gig", date: "2026-05-01T00:00:00Z", venueName: "V", coverImageUrl: "https://img/h.jpg", isFree: true, ticketPrice: null }],
    timelineEvents: [{ id: "t1", title: "Went Here", date: "2026-04-01T00:00:00Z", category: "Art", location: "Addr", status: "attended", imageUrl: null }],
    publicCalendar: [],
    ...overrides
  });

  it("renders the profile and sends a connection request", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ status: "pending", id: "c-new" }) : json(profile())
    );
    render(<PublicProfilePage />);
    expect(await screen.findByRole("heading", { name: "Them" })).toBeInTheDocument();
    expect(screen.getByText("Verified host")).toBeInTheDocument();
    // Interest chip (the calendar legend also prints category names).
    expect(screen.getByText("Art", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(screen.getByText("Went Here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Their Gig/ })).toHaveAttribute("href", "/events/h1");
    // Stat tiles (the calendar grid also renders bare day numbers).
    expect(screen.getByText("Hosted events").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Connections").nextElementSibling).toHaveTextContent("5");

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("button", { name: "Requested" })).toBeDisabled();
    expect(calls().some(([u, i]) => u === "/api/connections/request/them" && i?.method === "POST")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /Went Here/ }));
    expect(nav.push).toHaveBeenCalledWith("/events/t1");
  });

  it("offers messaging when already connected and hides actions on your own profile", async () => {
    fetchMock.mockImplementation(() => json(profile({ connectionStatus: "accepted", connectionId: "c1" })));
    const { unmount } = render(<PublicProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Message" }));
    expect(nav.push).toHaveBeenCalledWith("/chat/c1");
    unmount();

    fetchMock.mockImplementation(() => json(profile({ isSelf: true })));
    render(<PublicProfilePage />);
    await screen.findByRole("heading", { name: "Them" });
    expect(screen.queryByRole("button", { name: /Connect|Message/ })).toBeNull();
  });

  it("shows the API error for hidden profiles", async () => {
    fetchMock.mockImplementation(() => json({ error: "Profile not available" }, false, 403));
    render(<PublicProfilePage />);
    expect(await screen.findByText("Profile not available")).toBeInTheDocument();
  });
});

describe("ProfileOnboardingPage", () => {
  it("uploads a photo, saves the profile and moves to the location step", async () => {
    storage.uploadImage.mockResolvedValue({ publicUrl: "https://cdn/p.jpg" });
    fetchMock.mockImplementation(() => json({ user: {} }));
    render(<ProfileOnboardingPage />);
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "me.png", { type: "image/png" }));
    expect(await screen.findByText("Photo uploaded.")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Display name"), "Priya");
    await userEvent.click(screen.getByLabelText("Music"));
    await userEvent.click(screen.getByRole("button", { name: "Next: set location" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding/location"));
    expect(bodyOf("/api/users/me", "PUT")).toMatchObject({ displayName: "Priya", preferences: ["Music"], profilePhotoUrl: "https://cdn/p.jpg" });
  });

  it("reports upload and save errors", async () => {
    storage.uploadImage.mockResolvedValue({ error: "Nope" });
    fetchMock.mockImplementation(() => json({ error: "Display name required" }, false, 400));
    render(<ProfileOnboardingPage />);
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "me.png", { type: "image/png" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Display name"), "P");
    await userEvent.click(screen.getByRole("button", { name: "Next: set location" }));
    expect(await screen.findByText("Could not save profile.")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

// keep `within` referenced for scoped queries in future additions
void within;
