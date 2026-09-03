// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import ProfileHeader from "@/components/profile/ProfileHeader";
import MemoriesGrid from "@/components/profile/MemoriesGrid";
import CalendarGrid from "@/components/profile/CalendarGrid";

describe("ProfileHeader", () => {
  const stats = { eventsAttended: 4, eventsHosted: 2, connections: 9 };

  it("renders identity, stats and the photo when present", () => {
    render(<ProfileHeader name="Priya" bio="Hi there" city="Delhi" photo="https://cdn/p.jpg" stats={stats} />);
    expect(screen.getByRole("heading", { name: "Priya" })).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Delhi")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Priya" })).toHaveAttribute("src", "https://cdn/p.jpg");
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("hides optional bits and the settings button when not provided", () => {
    render(<ProfileHeader name="Anon" stats={stats} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("wires each stat tile and the settings button to its handler", async () => {
    const onSettingsClick = vi.fn();
    const onAttendedClick = vi.fn();
    const onHostedClick = vi.fn();
    const onConnectionsClick = vi.fn();
    render(
      <ProfileHeader
        name="P"
        stats={stats}
        onSettingsClick={onSettingsClick}
        onAttendedClick={onAttendedClick}
        onHostedClick={onHostedClick}
        onConnectionsClick={onConnectionsClick}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.click(screen.getByRole("button", { name: /Attended/ }));
    await userEvent.click(screen.getByRole("button", { name: /Hosted/ }));
    await userEvent.click(screen.getByRole("button", { name: /Connections/ }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
    expect(onAttendedClick).toHaveBeenCalledTimes(1);
    expect(onHostedClick).toHaveBeenCalledTimes(1);
    expect(onConnectionsClick).toHaveBeenCalledTimes(1);
  });
});

describe("MemoriesGrid", () => {
  it("shows an empty state", () => {
    render(<MemoriesGrid items={[]} />);
    expect(screen.getByText(/No memories yet/)).toBeInTheDocument();
  });

  it("renders each memory with date, caption, source event and status badge", () => {
    render(
      <MemoriesGrid
        items={[
          { id: "1", title: "Gig", date: "2026-03-05T10:00:00Z", category: "Music", imageUrl: "https://cdn/1.jpg", caption: "Loud", eventTitle: "Gig", status: "attended" },
          { id: "2", title: "Hike", date: "2026-03-06T10:00:00Z", category: "Outdoors", imageUrl: null }
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: "Gig" })).toBeInTheDocument();
    expect(screen.getByText("Loud")).toBeInTheDocument();
    expect(screen.getByText("From Gig")).toBeInTheDocument();
    expect(screen.getByText("attended")).toBeInTheDocument();
    expect(screen.getByText(format(new Date("2026-03-05T10:00:00Z"), "MMM d, yyyy"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gig" })).toHaveAttribute("src", "https://cdn/1.jpg");
    // No image -> category placeholder (rendered once as placeholder, once as label)
    expect(screen.getAllByText("Outdoors")).toHaveLength(2);
  });
});

describe("CalendarGrid", () => {
  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");
  const events = [
    { id: "e1", title: "Morning Run", date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 30).toISOString(), category: "Fitness", location: "Park" },
    { id: "e1", title: "Morning Run (dup)", date: today.toISOString(), category: "Fitness" },
    { id: "e2", title: "Evening Jam", date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0).toISOString(), category: "Music" }
  ];

  it("renders the current month with a custom title and weekday headers", () => {
    render(<CalendarGrid events={events} title="Public events" />);
    expect(screen.getByText(format(today, "MMMM yyyy"))).toBeInTheDocument();
    expect(screen.getByText("Public events")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it("navigates months with Prev/Next", async () => {
    render(<CalendarGrid events={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    expect(screen.getByText(format(next, "MMMM yyyy"))).toBeInTheDocument();
    expect(screen.queryByText("Current")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    expect(screen.getByText(format(prev, "MMMM yyyy"))).toBeInTheDocument();
  });

  it("opens a popup for the clicked day listing de-duplicated events and fires onEventSelect", async () => {
    const onEventSelect = vi.fn();
    render(<CalendarGrid events={events} onEventSelect={onEventSelect} />);

    const dayButtons = screen.getAllByRole("button").filter((b) => b.textContent === String(today.getDate()));
    const todayCell = dayButtons.find((b) => b.className.includes("ring-ink")) ?? dayButtons[0];
    await userEvent.click(todayCell);

    const popup = screen.getByText(format(new Date(todayKey), "EEEE, MMMM d")).closest("div")!.parentElement!.parentElement!;
    expect(within(popup).getByText("2 events")).toBeInTheDocument();
    expect(within(popup).getByText("Morning Run")).toBeInTheDocument();
    expect(within(popup).getByText("Evening Jam")).toBeInTheDocument();
    expect(within(popup).queryByText("Morning Run (dup)")).toBeNull();
    expect(within(popup).getByText("Park")).toBeInTheDocument();

    await userEvent.click(within(popup).getByText("Evening Jam"));
    expect(onEventSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "e2", title: "Evening Jam" }));

    await userEvent.click(within(popup).getByRole("button", { name: "Close" }));
    expect(screen.queryByText("2 events")).toBeNull();
  });

  it("closes the popup when clicking outside it", async () => {
    render(<CalendarGrid events={events} />);
    const todayCell = screen.getAllByRole("button").find((b) => b.textContent === String(today.getDate()) && b.className.includes("ring-ink"))!;
    await userEvent.click(todayCell);
    expect(screen.getByText("2 events")).toBeInTheDocument();
    await userEvent.click(document.querySelector(".fixed.inset-0")!);
    expect(screen.queryByText("2 events")).toBeNull();
  });

  it("shows an empty popup for a day without events", async () => {
    render(<CalendarGrid events={[]} />);
    const firstOfMonth = screen.getAllByRole("button").find((b) => b.textContent === "1" && b.className.includes("bg-white"));
    await userEvent.click(firstOfMonth!);
    expect(screen.getByText("No events for this date.")).toBeInTheDocument();
    expect(screen.getByText("0 events")).toBeInTheDocument();
  });
});
