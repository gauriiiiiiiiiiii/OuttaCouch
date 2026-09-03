// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import SwipeStack from "@/components/events/SwipeStack";
import { SWIPE_THRESHOLD_PX, isTapNotDrag, swipeDirectionForOffset } from "@/lib/swipeGesture";
import type { EventSummary } from "@/types";

const events: EventSummary[] = [
  { id: "e1", title: "Rooftop Jam", category: "Music", date: "Mar 18, 2026", location: "Terrace", imageUrl: "https://img/1.jpg" },
  { id: "e2", title: "Food Crawl", category: "Food", date: "Mar 21, 2026", location: "Market" }
];

describe("SwipeStack", () => {
  it("renders the top card with its image overlay and chips", () => {
    render(<SwipeStack events={events} onSwipe={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rooftop Jam" })).toHaveAttribute("src", "https://img/1.jpg");
    expect(screen.getAllByText("Music").length).toBeGreaterThan(0);
    expect(screen.getByText("Mar 18, 2026 · Terrace")).toBeInTheDocument();
    expect(screen.getByText("COMMIT")).toBeInTheDocument();
    expect(screen.getByText("SKIP")).toBeInTheDocument();
  });

  it("shows a placeholder when the current card has no image", () => {
    render(<SwipeStack events={[events[1]]} onSwipe={vi.fn()} />);
    expect(screen.getByText("No image available")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows an end-of-stack message when there are no events", () => {
    render(<SwipeStack events={[]} onSwipe={vi.fn()} />);
    expect(screen.getByText("No more events.")).toBeInTheDocument();
  });

  it("reports Skip and Commit for whichever card is on top", async () => {
    const onSwipe = vi.fn();
    render(<SwipeStack events={events} onSwipe={onSwipe} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSwipe).toHaveBeenCalledWith(events[0], "left");
    // The skipped card is dismissed once its exit animation ends; the second card is then on top.
    expect(await screen.findByText("No image available", {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(onSwipe).toHaveBeenLastCalledWith(events[1], "right");
  });

  it("renders a draggable card whose pointer-down does not throw (gesture wiring)", () => {
    render(<SwipeStack events={events} onSwipe={vi.fn()} />);
    const card = screen.getByRole("heading", { name: "Rooftop Jam" }).closest(".cursor-grab") as HTMLElement;
    expect(card).not.toBeNull();
    expect(() => fireEvent.pointerDown(card, { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0 })).not.toThrow();
    fireEvent.pointerUp(window, { pointerId: 1, isPrimary: true, clientX: 0, clientY: 0 });
  });
});

describe("swipe gesture helpers", () => {
  it("maps drag offsets to directions around the threshold", () => {
    expect(swipeDirectionForOffset(SWIPE_THRESHOLD_PX + 1)).toBe("right");
    expect(swipeDirectionForOffset(-(SWIPE_THRESHOLD_PX + 1))).toBe("left");
    expect(swipeDirectionForOffset(SWIPE_THRESHOLD_PX)).toBeNull();
    expect(swipeDirectionForOffset(-SWIPE_THRESHOLD_PX)).toBeNull();
    expect(swipeDirectionForOffset(0)).toBeNull();
    expect(swipeDirectionForOffset(Number.NaN)).toBeNull();
    expect(swipeDirectionForOffset(50, 40)).toBe("right");
  });

  it("distinguishes a tap from a drag", () => {
    expect(isTapNotDrag(0, 0)).toBe(true);
    expect(isTapNotDrag(4, -4)).toBe(true);
    expect(isTapNotDrag(5, 0)).toBe(false);
    expect(isTapNotDrag(0, -9)).toBe(false);
    expect(isTapNotDrag(8, 8, 10)).toBe(true);
  });

  it("opens the event detail when the image area is clicked or activated with the keyboard", async () => {
    render(<SwipeStack events={events} onSwipe={vi.fn()} />);
    const openers = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    await userEvent.click(openers[0]);
    expect(push).toHaveBeenCalledWith("/events/e1");
    push.mockClear();
    openers[0].focus();
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/events/e1");
  });

  it("advances to the next card once the swipe animation completes (parent keeps the list)", async () => {
    render(<SwipeStack events={events} onSwipe={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("No image available", {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(await screen.findByText("No more events.", {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it("does not skip an extra card when the parent removes the swiped event", async () => {
    const Harness = () => {
      const [list, setList] = useState(events.concat({ id: "e3", title: "Third", category: "Art", date: "d", location: "l", imageUrl: "https://img/3.jpg" }));
      return <SwipeStack events={list} onSwipe={(event) => setList((prev) => prev.filter((e) => e.id !== event.id))} />;
    };
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    // Food Crawl (no image) must be the next card, not "Third".
    expect(await screen.findByText("No image available")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1200)); // let any animation settle
    expect(screen.getByText("No image available")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Third" })).toBeNull();
  });

  it("does not navigate for placeholder (dummy) events", async () => {
    render(<SwipeStack events={[{ ...events[0], id: "dummy-1" }]} onSwipe={vi.fn()} />);
    const opener = screen.getAllByRole("button").find((b) => b.getAttribute("tabindex") === "0")!;
    await userEvent.click(opener);
    expect(push).not.toHaveBeenCalled();
  });
});
