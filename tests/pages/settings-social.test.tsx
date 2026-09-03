// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
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

type Handler = (...args: unknown[]) => void;
const socket = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  emit: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn((event: string, fn: Handler) => {
    socket.handlers[event] = fn;
  }),
  io: vi.fn()
}));
vi.mock("socket.io-client", () => ({ io: (...args: unknown[]) => { socket.io(...args); return socket; } }));

import ContactsPage from "@/app/(main)/settings/contacts/page";
import HostToolsPage from "@/app/(main)/settings/host/page";
import NotificationSettingsPage from "@/app/(main)/settings/notifications/page";
import PaymentSettingsPage from "@/app/(main)/settings/payments/page";
import PrivacySettingsPage from "@/app/(main)/settings/privacy/page";
import ConnectionsPage from "@/app/(main)/connections/page";
import ChatThreadPage from "@/app/(main)/chat/[id]/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const calls = () => fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
const bodyOf = (url: string, method: string) => {
  const call = calls().find(([u, i]) => u === url && i?.method === method);
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.params = { id: "c1" };
  socket.handlers = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ContactsPage", () => {
  const contacts = [
    { id: "1", name: "Alice", phone: "+911", status: "registered", invitedAt: null, registeredUser: { id: "a", displayName: "Alice A", profilePhotoUrl: "https://img/a.jpg" } },
    { id: "2", name: "Bob", phone: "+912", status: "pending", invitedAt: null, registeredUser: null },
    { id: "3", name: null, phone: "+913", status: "invited", invitedAt: "2026-01-01", registeredUser: null }
  ];
  const stats = { total: 3, registered: 1, invited: 1, pending: 1 };

  it("lists synced contacts with status, filters by tile and invites pending ones", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/referrals/share" && init?.method === "POST" ? json({ invitations: [] }) : json({ contacts, stats })
    );
    render(<ContactsPage />);
    expect(await screen.findByText("Alice A")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("On Outtacouch")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText(/Contact syncing requires a supported mobile browser/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Pending/ }));
    expect(screen.queryByText("Alice A")).toBeNull();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Alice A")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(bodyOf("/api/referrals/share", "POST")).toEqual({ contactIds: ["2"], channel: "sms" }));
    expect(await screen.findAllByText("Sent")).toHaveLength(2);
  });

  it("explains when the Contact Picker is unavailable, and syncs when it is", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "POST" ? json({ contacts: [], errors: [] }) : json({ contacts: [], stats: { total: 0, registered: 0, invited: 0, pending: 0 } })));
    const { unmount } = render(<ContactsPage />);
    await screen.findByText(/No contacts synced yet/);
    await userEvent.click(screen.getByRole("button", { name: "Sync contacts" }));
    expect(await screen.findByText("Contact picker not supported in this browser.")).toBeInTheDocument();
    unmount();

    const select = vi.fn().mockResolvedValue([{ name: ["Zed"], tel: ["+919", "+918"] }, { name: [], tel: [] }]);
    Object.defineProperty(navigator, "contacts", { value: { select }, configurable: true });
    try {
      render(<ContactsPage />);
      await screen.findByText(/No contacts synced yet/);
      await userEvent.click(screen.getByRole("button", { name: "Sync contacts" }));
      await waitFor(() => expect(bodyOf("/api/contacts/sync", "POST")).toEqual({ contacts: [{ name: "Zed", phone: "+919" }, { name: "Zed", phone: "+918" }] }));
      expect(select).toHaveBeenCalledWith(["name", "tel"], { multiple: true });

      select.mockResolvedValueOnce([]);
      await userEvent.click(screen.getByRole("button", { name: "Sync contacts" }));
      expect(await screen.findByText("No contacts selected.")).toBeInTheDocument();

      select.mockRejectedValueOnce(new Error("denied"));
      await userEvent.click(screen.getByRole("button", { name: "Sync contacts" }));
      expect(await screen.findByText("Could not access contacts.")).toBeInTheDocument();
    } finally {
      delete (navigator as unknown as { contacts?: unknown }).contacts;
    }
  });
});

describe("Settings sub-pages", () => {
  it("HostToolsPage links to the dashboards and the create flow", () => {
    render(<HostToolsPage />);
    expect(screen.getByRole("link", { name: "View hosted events" })).toHaveAttribute("href", "/events/manage");
    expect(screen.getByRole("link", { name: "Create event" })).toHaveAttribute("href", "/events/new");
    expect(screen.getByRole("link", { name: /Back to settings/ })).toHaveAttribute("href", "/settings");
  });

  it("PaymentSettingsPage explains that online payments are off", () => {
    render(<PaymentSettingsPage />);
    expect(screen.getByText(/Online payment processing is not enabled/)).toBeInTheDocument();
  });

  it("NotificationSettingsPage loads preferences and saves them", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PUT" ? json({ user: {} }) : json({ user: { remindersEnabled: false, recommendationsEnabled: true } })
    );
    render(<NotificationSettingsPage />);
    const reminders = await screen.findByLabelText("Event reminders");
    await waitFor(() => expect(reminders).not.toBeChecked());
    expect(screen.getByLabelText("Recommendations")).toBeChecked();
    await userEvent.click(reminders);
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(bodyOf("/api/users/me", "PUT")).toEqual({ remindersEnabled: true, recommendationsEnabled: true });
  });

  it("NotificationSettingsPage reports a failed save", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({}, false, 500) : json({ user: {} })));
    render(<NotificationSettingsPage />);
    await screen.findByLabelText("Event reminders");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });

  it("PrivacySettingsPage loads the current visibility and saves a new one", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({ user: {} }) : json({ user: { profileVisibility: "connections" } })));
    render(<PrivacySettingsPage />);
    const select = await screen.findByRole("combobox");
    await waitFor(() => expect(select).toHaveValue("connections"));
    await userEvent.selectOptions(select, "public");
    await userEvent.click(screen.getByRole("button", { name: "Save privacy" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(bodyOf("/api/users/me/privacy", "PUT")).toEqual({ profileVisibility: "public" });
  });

  it("PrivacySettingsPage tolerates a failed load and reports a failed save", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? json({}, false, 400) : json({}, false, 500)));
    render(<PrivacySettingsPage />);
    const button = await screen.findByRole("button", { name: "Save privacy" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });
});

describe("ConnectionsPage", () => {
  const mockApi = () =>
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method) return json({ status: "ok" });
      if (url === "/api/connections/suggestions") return json({ suggestions: [{ userId: "s1", name: "Sam", sharedEventTitle: "Jam", sharedEventId: "e1", sharedCount: 1 }] });
      if (url === "/api/connections") return json({ connections: [{ id: "c1", userId: "a", name: "Alice", photo: "https://img/a.jpg" }] });
      if (url === "/api/connections/requests") return json({ requests: [{ id: "r1", userId: "b", name: "Bob", sharedEventTitle: null, requestedAt: "2026-01-01" }] });
      if (url === "/api/connections/discover") return json({ results: [{ userId: "n1", name: "Nia", city: "Delhi", matchReason: "Nearby in Delhi" }] });
      return json({}, false);
    });

  it("renders all four sections and handles accept, decline, commit, skip and nearby connect", async () => {
    mockApi();
    render(<ConnectionsPage />);
    expect(await screen.findByText("1 person connected with you.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/chat/c1");
    expect(screen.getByText("Shared: Event")).toBeInTheDocument();
    expect(screen.getByText("Nearby in Delhi")).toBeInTheDocument();
    expect(screen.getByText("Shared: Jam")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/connections/r1/accept" && i?.method === "PUT")).toBe(true));
    expect(await screen.findByText("2 people connected with you.")).toBeInTheDocument();
    expect(screen.getByText("No requests right now.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/connections/request/n1" && i?.method === "POST")).toBe(true));
    expect(screen.queryByText("Nia")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(bodyOf("/api/connections/request/s1", "POST")).toEqual({ sharedEventId: "e1" }));
    expect(nav.push).toHaveBeenCalledWith("/users/s1");

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("No suggestions yet.")).toBeInTheDocument();
  });

  it("declines a request and opens profiles from avatars", async () => {
    mockApi();
    render(<ConnectionsPage />);
    await screen.findByText("Bob");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/connections/r1/decline" && i?.method === "PUT")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "View Alice" }));
    expect(nav.push).toHaveBeenCalledWith("/users/a");
  });

  it("shows empty states when every list is empty", async () => {
    fetchMock.mockImplementation(() => json({ suggestions: [], connections: [], requests: [], results: [] }));
    render(<ConnectionsPage />);
    expect(await screen.findByText(/No connections yet/)).toBeInTheDocument();
    expect(screen.getByText("No requests right now.")).toBeInTheDocument();
    expect(screen.getByText("No suggestions yet.")).toBeInTheDocument();
    expect(screen.queryByText("People nearby")).toBeNull();
  });
});

describe("ChatThreadPage", () => {
  const messages = [
    { id: "m1", content: "hi", senderId: "them", sentAt: "2026-03-01T10:00:00Z", readAt: null },
    { id: "m2", content: "hello", senderId: "me", sentAt: "2026-03-01T10:01:00Z", readAt: "2026-03-01T10:02:00Z" }
  ];
  const mockApi = () =>
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/users/me") return json({ user: { id: "me" } });
      if (url === "/api/chat/c1" && init?.method === "POST") return json({ message: { id: "m3", content: JSON.parse(init.body as string).content, senderId: "me", sentAt: "2026-03-01T10:05:00Z" } });
      if (url === "/api/chat/c1") return json({ messages });
      if (url === "/api/chat/c1/read") return json({ status: "ok" });
      if (url === "/api/socketio") return json({});
      return json({}, false);
    });

  it("loads the thread, marks it read, opens one authenticated socket and shows the seen receipt", async () => {
    mockApi();
    render(<ChatThreadPage />);
    expect(await screen.findByText("hi")).toBeInTheDocument();
    expect(screen.getByText(/· Seen/)).toBeInTheDocument();
    expect(calls().some(([u, i]) => u === "/api/chat/c1/read" && i?.method === "PUT")).toBe(true);
    await waitFor(() => expect(socket.io).toHaveBeenCalledTimes(1));
    expect(socket.io).toHaveBeenCalledWith({ path: "/api/socketio" });
    expect(socket.emit).toHaveBeenCalledWith("join", "c1");
    expect(screen.getByRole("link", { name: "Back to chats" })).toHaveAttribute("href", "/chat");
  });

  it("sends with Enter, appends the reply, and de-duplicates the socket echo", async () => {
    mockApi();
    render(<ChatThreadPage />);
    await screen.findByText("hi");
    await waitFor(() => expect(socket.handlers.message).toBeDefined());
    const input = screen.getByPlaceholderText("Type a message");
    await userEvent.type(input, "new msg{Enter}");
    expect(await screen.findByText("new msg")).toBeInTheDocument();
    expect(bodyOf("/api/chat/c1", "POST")).toEqual({ content: "new msg" });
    expect(input).toHaveValue("");
    expect(socket.emit).toHaveBeenCalledWith("typing", { roomId: "c1", userId: "me", isTyping: true });

    act(() => socket.handlers.message({ id: "m3", content: "new msg", senderId: "me", sentAt: "x" }));
    expect(screen.getAllByText("new msg")).toHaveLength(1);

    act(() => socket.handlers.message({ id: "m4", content: "incoming", senderId: "them", sentAt: "x" }));
    expect(screen.getByText("incoming")).toBeInTheDocument();
    await waitFor(() => expect(calls().filter(([u, i]) => u === "/api/chat/c1/read" && i?.method === "PUT").length).toBeGreaterThan(1));
  });

  it("shows the typing indicator only for the other participant and reloads on read receipts", async () => {
    mockApi();
    render(<ChatThreadPage />);
    await screen.findByText("hi");
    await waitFor(() => expect(socket.handlers.typing).toBeDefined());
    act(() => socket.handlers.typing({ userId: "me", isTyping: true }));
    expect(screen.queryByText("Typing...")).toBeNull();
    act(() => socket.handlers.typing({ userId: "them", isTyping: true }));
    expect(screen.getByText("Typing...")).toBeInTheDocument();
    act(() => socket.handlers.typing({ userId: "them", isTyping: false }));
    expect(screen.queryByText("Typing...")).toBeNull();

    const before = calls().filter(([u, i]) => u === "/api/chat/c1" && !i?.method).length;
    act(() => socket.handlers.read());
    await waitFor(() => expect(calls().filter(([u, i]) => u === "/api/chat/c1" && !i?.method).length).toBe(before + 1));
  });

  it("ignores blank sends and disconnects on unmount", async () => {
    mockApi();
    const { unmount } = render(<ChatThreadPage />);
    await screen.findByText("hi");
    await waitFor(() => expect(socket.io).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(calls().some(([u, i]) => u === "/api/chat/c1" && i?.method === "POST")).toBe(false);
    unmount();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
