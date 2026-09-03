// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import NotificationBell from "@/components/ui/NotificationBell";
import ChatBadge from "@/components/ui/ChatBadge";

describe("PageShell", () => {
  it("renders title, subtitle and children", () => {
    render(
      <PageShell title="Explore" subtitle="Find events">
        <p>body</p>
      </PageShell>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText("Find events")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders a back link only when backHref is provided", () => {
    const { rerender } = render(<PageShell title="A" />);
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<PageShell title="A" backHref="/settings" backLabel="Back to settings" />);
    const link = screen.getByRole("link", { name: /Back to settings/ });
    expect(link).toHaveAttribute("href", "/settings");
  });
});

describe("SectionCard", () => {
  it("renders title, optional description, header action and children", () => {
    render(
      <SectionCard title="Card" description="Desc" headerAction={<button>Act</button>}>
        <span>inner</span>
      </SectionCard>
    );
    expect(screen.getByRole("heading", { level: 2, name: "Card" })).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(screen.getByText("inner")).toBeInTheDocument();
  });

  it("omits the description paragraph when not provided", () => {
    render(<SectionCard title="Only" />);
    expect(screen.queryByText("Desc")).toBeNull();
  });
});

describe("NotificationBell + ChatBadge (polling badges)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const json = (body: unknown, ok = true) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));

  it("NotificationBell shows the unread count and links to /notifications", async () => {
    fetchMock.mockImplementation(() =>
      json({ notifications: [{ readAt: null }, { readAt: "2026-01-01" }, { readAt: null }] })
    );
    render(<NotificationBell />);
    expect(await screen.findByText("2")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/notifications");
    expect(link).toHaveAttribute("aria-label", "2 unread notifications");
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications");
  });

  it("NotificationBell caps the badge at 9+ and hides it at zero", async () => {
    fetchMock.mockImplementationOnce(() => json({ notifications: Array.from({ length: 12 }, () => ({ readAt: null })) }));
    const { unmount } = render(<NotificationBell />);
    expect(await screen.findByText("9+")).toBeInTheDocument();
    unmount();

    fetchMock.mockImplementationOnce(() => json({ notifications: [{ readAt: "x" }] }));
    render(<NotificationBell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/^\d/)).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("aria-label", "Notifications");
  });

  it("NotificationBell polls every 30 seconds and stops on unmount", async () => {
    fetchMock.mockImplementation(() => json({ notifications: [] }));
    const { unmount } = render(<NotificationBell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NotificationBell ignores failed responses", async () => {
    fetchMock.mockImplementation(() => json({}, false));
    render(<NotificationBell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("link")).toHaveAttribute("aria-label", "Notifications");
  });

  it("ChatBadge sums unread counts across chats", async () => {
    fetchMock.mockImplementation(() => json({ chats: [{ unreadCount: 3 }, { unreadCount: 4 }, {}] }));
    render(<ChatBadge />);
    expect(await screen.findByText("7")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/chat");
    expect(link).toHaveAttribute("aria-label", "Chat — 7 unread");
  });

  it("ChatBadge caps at 9+ and polls", async () => {
    fetchMock.mockImplementation(() => json({ chats: [{ unreadCount: 15 }] }));
    render(<ChatBadge />);
    expect(await screen.findByText("9+")).toBeInTheDocument();
    vi.advanceTimersByTime(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
