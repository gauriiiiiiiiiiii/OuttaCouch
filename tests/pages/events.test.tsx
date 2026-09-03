// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// Maps are loaded through next/dynamic (SSR-safe); stub them with a component
// that exposes the picker's onChange so the wizard's coordinate wiring is testable.
vi.mock("next/dynamic", () => ({
  default: () => {
    const DynamicStub = (props: { onChange?: (lat: number, lng: number) => void; events?: unknown[] }) => (
      <div data-testid="map-stub" data-events={props.events ? props.events.length : ""}>
        {props.onChange ? (
          <button type="button" onClick={() => props.onChange?.(12.3456789, 98.7654321)}>
            pick-on-map
          </button>
        ) : null}
      </div>
    );
    return DynamicStub;
  }
}));

const storage = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/services/storage", () => ({ StorageService: storage }));

import EventDetailPage from "@/app/(main)/events/[id]/page";
import CreateEventPage from "@/app/(main)/events/new/page";
import EditEventPage from "@/app/(main)/events/manage/[id]/edit/page";
import HostDashboardPage from "@/app/(main)/events/manage/[id]/page";
import ScannerPage from "@/app/(main)/events/manage/[id]/scanner/page";
import SwipeModePage from "@/app/(main)/explore/swipe/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const calls = () => fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
const bodyOf = (url: string, method?: string) => {
  const call = calls().find(([u, i]) => u === url && (!method || i?.method === method));
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.params = { id: "e1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// /events/[id]
// ---------------------------------------------------------------------------
describe("EventDetailPage", () => {
  const detail = (overrides: Record<string, unknown> = {}) => ({
    id: "e1",
    title: "Rooftop Jam",
    description: "Long story",
    category: "Music",
    date: "Mar 18, 2026",
    time: "06:30 PM - 09:00 PM",
    startTime: "2026-03-18T13:00:00.000Z",
    endTime: "2026-03-18T15:30:00.000Z",
    eventDate: "2026-03-18T00:00:00.000Z",
    venueName: "Terrace",
    address: "1 Sky Rd",
    lat: 28.6139,
    lng: 77.209,
    coverImageUrl: "https://img/cover.jpg",
    images: [{ id: "i1", imageUrl: "https://img/1.jpg", isCover: true, orderIndex: 0 }],
    isFree: true,
    ticketPrice: null,
    host: { id: "host-1", name: "Host", photo: null },
    attendeeCount: 12,
    isCommitted: false,
    goingList: Array.from({ length: 10 }, (_, i) => ({ name: `Guest ${i}`, photo: null })),
    ...overrides
  });

  const feed = { events: [{ id: "e2", title: "Jazz Night", category: "Music", date: "x", location: "y" }, { id: "e3", title: "Food", category: "Food", date: "x", location: "y" }] };

  const mockApi = (event: Record<string, unknown>, extra: Record<string, (init?: RequestInit) => Promise<Response>> = {}) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (extra[`${init?.method ?? "GET"} ${url}`]) return extra[`${init?.method ?? "GET"} ${url}`](init);
      if (url === "/api/events/e1") return json(event);
      if (url === "/api/events") return json(feed);
      return json({}, false);
    });
  };

  it("renders the event, gallery, host link, going list and similar events", async () => {
    mockApi(detail());
    render(<EventDetailPage />);
    expect(await screen.findByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
    expect(screen.getByText("Long story")).toBeInTheDocument();
    expect(screen.getByText("Mar 18, 2026 · 06:30 PM - 09:00 PM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Host/ })).toHaveAttribute("href", "/users/host-1");
    expect(screen.getByText("12 going")).toBeInTheDocument();
    expect(screen.getByText("Going (12)")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByText("Gallery")).toBeInTheDocument();
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-events", "1");
    expect(await screen.findByText("Jazz Night")).toBeInTheDocument();
    expect(screen.queryByText("Food")).toBeNull(); // different category filtered out
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("commits to a free event, then allows cancelling", async () => {
    mockApi(detail(), {
      "POST /api/events/e1/commit": () => json({ status: "committed" }),
      "DELETE /api/events/e1/commit": () => json({ status: "cancelled" })
    });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("button", { name: "✓ Confirmed" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel attendance" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled());
    expect(calls().some(([u, i]) => u === "/api/events/e1/commit" && i?.method === "DELETE")).toBe(true);
  });

  it("shows the server outcome for already-committed, full and failed commits", async () => {
    mockApi(detail(), { "POST /api/events/e1/commit": () => json({ status: "already-committed" }) });
    const { unmount } = render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Already added")).toBeInTheDocument();
    unmount();

    mockApi(detail(), { "POST /api/events/e1/commit": () => json({ error: "Event full" }, false, 409) });
    const second = render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Event full")).toBeInTheDocument();
    second.unmount();

    mockApi(detail(), { "POST /api/events/e1/commit": () => Promise.reject(new Error("network")) });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("failed")).toBeInTheDocument();
  });

  it("starts as confirmed when the viewer already committed", async () => {
    mockApi(detail({ isCommitted: true }));
    render(<EventDetailPage />);
    expect(await screen.findByRole("button", { name: "✓ Confirmed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel attendance" })).toBeInTheDocument();
  });

  it("routes paid events to the host instead of committing", async () => {
    mockApi(detail({ isFree: false, ticketPrice: "499" }));
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    expect(screen.getByText("499")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("button", { name: "Contact host to register" })).toBeDisabled();
    expect(screen.getByText(/arrange payment with the host/)).toBeInTheDocument();
    expect(calls().some(([u]) => u === "/api/events/e1/commit")).toBe(false);
  });

  it("shares via the Web Share API when available, else copies the link", async () => {
    mockApi(detail());
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const { unmount } = render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Share event" }));
    expect(share).toHaveBeenCalledWith({ title: "Rooftop Jam", url: `${window.location.origin}/events/e1` });
    unmount();

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Share event" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/events/e1`);
    expect(await screen.findByText("Link copied!")).toBeInTheDocument();
  });

  it("shows the distance from the device location when geolocation is available", async () => {
    mockApi(detail());
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 28.6139, longitude: 77.209 } }) },
      configurable: true
    });
    try {
      render(<EventDetailPage />);
      expect(await screen.findByText(/0 km away from your location/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    }
  });

  it("falls back to the saved profile location when the device denies geolocation", async () => {
    mockApi(detail({ lat: 28.6139, lng: 77.209 }), { "GET /api/users/me": () => json({ user: { lat: 28.7, lng: 77.3 } }) });
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
      configurable: true
    });
    try {
      render(<EventDetailPage />);
      expect(await screen.findByText(/km away from your location/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    }
  });

  it("shows an error when the event cannot be loaded", async () => {
    fetchMock.mockImplementation(() => json({ error: "Not found" }, false));
    render(<EventDetailPage />);
    expect(await screen.findByText("Could not load event.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// /events/new (4-step wizard)
// ---------------------------------------------------------------------------
describe("CreateEventPage", () => {
  const fillStep0 = async () => {
    await userEvent.type(screen.getByPlaceholderText("Event name"), "Trail Run");
    await userEvent.selectOptions(screen.getByRole("combobox"), "Outdoors");
    await userEvent.type(screen.getByPlaceholderText("Short description"), "Morning 5k");
  };
  const next = () => userEvent.click(screen.getByRole("button", { name: "Next step" }));

  it("blocks progress until required fields on the step are valid", async () => {
    render(<CreateEventPage />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    await next();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    await fillStep0();
    await next();
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Event name")).toHaveValue("Trail Run"); // values survive step changes
  });

  it("walks all four steps, picks a venue on the map, uploads a cover and publishes", async () => {
    storage.uploadImage.mockResolvedValue({ publicUrl: "https://cdn/cover.jpg", path: "covers/x.jpg" });
    fetchMock.mockImplementation(() => json({ id: "new-event" }));
    render(<CreateEventPage />);

    await fillStep0();
    await next();
    fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
    fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
    await next();

    expect(await screen.findByText("Step 3 of 4")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Venue name"), "Riverbend Park");
    await userEvent.type(screen.getByPlaceholderText("Address"), "Gate 2");
    await userEvent.click(screen.getByRole("button", { name: "pick-on-map" }));
    await next();

    expect(await screen.findByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ticket price")).toBeDisabled(); // free by default
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByPlaceholderText("Ticket price")).toBeEnabled();
    await userEvent.type(screen.getByPlaceholderText("Ticket price"), "250");
    await userEvent.type(screen.getByPlaceholderText("Max attendees"), "25");

    const file = new File(["img"], "cover.png", { type: "image/png" });
    await userEvent.upload(document.querySelector('input[type="file"]')!, file);
    expect(await screen.findByRole("img", { name: "Cover preview" })).toHaveAttribute("src", "https://cdn/cover.jpg");
    expect(storage.uploadImage).toHaveBeenCalledWith({ file, bucket: "event-images", folder: "covers" });

    // Review snapshot reflects the form
    expect(screen.getByText("Trail Run")).toBeInTheDocument();
    expect(screen.getByText("25 guests")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Publish event" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/new-event"));
    expect(bodyOf("/api/events", "POST")).toMatchObject({
      title: "Trail Run",
      category: "Outdoors",
      descriptionShort: "Morning 5k",
      eventDate: "2026-12-01",
      startTime: "07:30",
      venueName: "Riverbend Park",
      address: "Gate 2",
      // The page forwards picker coordinates verbatim (the real MapPicker rounds; the stub does not).
      lat: 12.3456789,
      lng: 98.7654321,
      isFree: false,
      ticketPrice: 250,
      maxAttendees: 25,
      coverImageUrl: "https://cdn/cover.jpg"
    });
  });

  it("uses the device location for the venue coordinates", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 19.07600001, longitude: 72.8777 } }) },
      configurable: true
    });
    try {
      fetchMock.mockImplementation(() => json({ id: "x" }));
      render(<CreateEventPage />);
      await fillStep0();
      await next();
      fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
      fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
      await next();
      await screen.findByText("Step 3 of 4");
      await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
      // Hidden inputs hold strings; the form reads them back as numbers.
      expect(document.querySelector('input[name="lat"]')).toHaveValue("19.076");
      expect(document.querySelector('input[name="lng"]')).toHaveValue("72.8777");
    } finally {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    }
  });

  it("surfaces upload and publish failures", async () => {
    storage.uploadImage.mockResolvedValue({ error: "Bucket not found" });
    fetchMock.mockImplementation(() => json({ error: "Missing fields" }, false, 400));
    render(<CreateEventPage />);
    await fillStep0();
    await next();
    fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
    fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
    await next();
    await userEvent.type(screen.getByPlaceholderText("Venue name"), "V");
    await userEvent.type(screen.getByPlaceholderText("Address"), "A");
    await next();
    await screen.findByText("Step 4 of 4");
    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "c.png", { type: "image/png" }));
    expect(await screen.findByText("Bucket not found")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Max attendees"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Publish event" }));
    expect(await screen.findByText("Could not create event.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// /events/manage/[id]/edit
// ---------------------------------------------------------------------------
describe("EditEventPage", () => {
  const form = {
    id: "e1",
    title: "Old Title",
    descriptionShort: "s",
    descriptionFull: "f",
    category: "Art",
    eventDate: "2026-05-10",
    startTime: "18:05",
    endDate: "2026-05-11",
    endTime: "01:30",
    venueName: "V",
    address: "A",
    lat: 28.6,
    lng: 77.2,
    isFree: false,
    ticketPrice: 499,
    maxAttendees: 10,
    coverImageUrl: "https://img/old.jpg"
  };

  it("prefills the wizard from the edit endpoint and saves changes", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PUT" ? json({ id: "e1" }) : url === "/api/events/e1/edit" ? json(form) : json({}, false)
    );
    render(<EditEventPage />);
    expect(screen.getByText("Loading event...")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Event name")).toHaveValue("Old Title");
    await userEvent.clear(screen.getByPlaceholderText("Event name"));
    await userEvent.type(screen.getByPlaceholderText("Event name"), "New Title");

    for (let step = 0; step < 3; step += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    }
    expect(await screen.findByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cover preview" })).toHaveAttribute("src", "https://img/old.jpg");
    expect(screen.getByText("New Title")).toBeInTheDocument();
    expect(screen.getByText("2026-05-10 18:05 → 2026-05-11 01:30")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/manage/e1"));
    expect(bodyOf("/api/events/e1", "PUT")).toMatchObject({ title: "New Title", category: "Art", ticketPrice: 499, maxAttendees: 10, lat: 28.6, lng: 77.2 });
  });

  it("reports load and save failures", async () => {
    fetchMock.mockImplementation(() => json({}, false, 403));
    render(<EditEventPage />);
    expect(await screen.findByText("Could not load event.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// /events/manage/[id] (host dashboard)
// ---------------------------------------------------------------------------
describe("HostDashboardPage", () => {
  const hostEvent = {
    id: "e1",
    title: "Rooftop Jam",
    date: "Mar 18, 2026",
    attendeeCount: 2,
    isHost: true,
    attendees: [
      { id: "a1", name: "Alice, Jr", status: "attended", ticketId: null },
      { id: "a2", name: "Bob", status: "committed", ticketId: null }
    ],
    revenueTotal: 998,
    analytics: { attendeeSeries: [{ date: "Apr 1", count: 2 }], revenueSeries: [{ date: "Apr 1", total: 998 }] }
  };
  const images = [
    { id: "i1", imageUrl: "https://img/1.jpg", isCover: true, orderIndex: 0 },
    { id: "i2", imageUrl: "https://img/2.jpg", isCover: false, orderIndex: 1 }
  ];

  const mockApi = (event: unknown = hostEvent) => {
    let imageList = images;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/events/e1" && !init?.method) return json(event);
      if (url === "/api/events/e1" && init?.method === "DELETE") return json({ status: "deleted" });
      if (url === "/api/events/e1/images" && !init?.method) return json({ images: imageList });
      if (url === "/api/events/e1/images" && init?.method === "DELETE") {
        imageList = imageList.filter((i) => i.id !== JSON.parse(init.body as string).imageId);
        return json({ status: "deleted" });
      }
      if (url === "/api/events/e1/images") return json({ status: "ok" });
      return json({}, false);
    });
  };

  it("renders stats, roster and gallery for the host", async () => {
    mockApi();
    render(<HostDashboardPage />);
    expect(await screen.findByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
    expect(screen.getByText("₹998.00")).toBeInTheDocument();
    expect(screen.getByText("Alice, Jr")).toBeInTheDocument();
    expect(screen.getAllByText("attended").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Edit event" })).toHaveAttribute("href", "/events/manage/e1/edit");
    expect(screen.getByRole("link", { name: "Open scanner" })).toHaveAttribute("href", "/events/manage/e1/scanner");
    expect(await screen.findAllByRole("img", { name: "Rooftop Jam" })).toHaveLength(2);
    expect(screen.getByText("Cover")).toBeInTheDocument();
  });

  it("treats a non-host payload as not found", async () => {
    mockApi({ id: "e1", title: "Rooftop Jam", date: "x", attendeeCount: 2, isHost: false });
    render(<HostDashboardPage />);
    expect(await screen.findByText("Event not found.")).toBeInTheDocument();
  });

  it("copies the link and downloads the attendee CSV", async () => {
    mockApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:csv");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<HostDashboardPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Copy event link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/events/e1`);
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Download attendees" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as unknown as Blob;
    expect(await blob.text()).toBe("Name,Status\nAlice  Jr,attended\nBob,committed");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");
    expect(await screen.findByText("Attendee list downloaded.")).toBeInTheDocument();
  });

  it("requires confirmation before deleting, then navigates back to the list", async () => {
    mockApi();
    render(<HostDashboardPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await userEvent.click(screen.getByRole("button", { name: "Delete event" }));
    expect(screen.getByText(/2 attendees will be affected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/will be affected/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete event" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/manage"));
    expect(calls().some(([u, i]) => u === "/api/events/e1" && i?.method === "DELETE")).toBe(true);
  });

  it("manages the gallery: upload, set cover, reorder, delete", async () => {
    mockApi();
    storage.uploadImage.mockResolvedValue({ publicUrl: "https://cdn/new.jpg" });
    render(<HostDashboardPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await screen.findAllByRole("img", { name: "Rooftop Jam" });

    await userEvent.upload(document.querySelector('input[type="file"]')!, new File(["x"], "g.png", { type: "image/png" }));
    await waitFor(() => expect(bodyOf("/api/events/e1/images", "POST")).toEqual({ imageUrl: "https://cdn/new.jpg" }));
    expect(storage.uploadImage).toHaveBeenCalledWith(expect.objectContaining({ bucket: "event-images", folder: "events/e1" }));

    await userEvent.click(screen.getAllByRole("button", { name: "Set cover" })[1]);
    await waitFor(() => expect(bodyOf("/api/events/e1/images", "PUT")).toEqual({ imageId: "i2", isCover: true }));

    await userEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]);
    await waitFor(() => expect(calls().some(([u, i]) => u === "/api/events/e1/images" && i?.method === "PUT" && (i.body as string).includes('"direction":"up"'))).toBe(true));

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Rooftop Jam" })).toHaveLength(1));
  });
});

// ---------------------------------------------------------------------------
// /events/manage/[id]/scanner and /explore/swipe
// ---------------------------------------------------------------------------
describe("ScannerPage", () => {
  it("validates a pasted QR code and shows the outcome", async () => {
    fetchMock.mockImplementationOnce(() => json({ status: "validated" })).mockImplementationOnce(() => json({ error: "Ticket already validated" }, false, 409));
    render(<ScannerPage />);
    await userEvent.type(screen.getByPlaceholderText("Paste QR code"), "QR-1");
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("validated")).toBeInTheDocument();
    expect(bodyOf("/api/tickets/validate", "POST")).toEqual({ qr_code: "QR-1", event_id: "e1" });
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("failed")).toBeInTheDocument();
  });
});

describe("SwipeModePage", () => {
  it("swipes through the feed and routes commits to the ticket section", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/events/swipe" ? json({ status: "logged" }) : json({ events: [{ id: "e1", title: "Rooftop Jam", category: "Music", date: "x", location: "y", imageUrl: "https://img/1.jpg" }] })
    );
    render(<SwipeModePage />);
    expect(await screen.findByRole("heading", { name: "Rooftop Jam" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back/ })).toHaveAttribute("href", "/explore");
    await userEvent.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/e1#tickets"));
    expect(bodyOf("/api/events/swipe", "POST")).toEqual({ event_id: "e1", action: "right" });
  });

  it("hides skipped events and shows the empty state", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/events/swipe" ? json({ status: "logged" }) : json({ events: [{ id: "e1", title: "Only One", category: "Music", date: "x", location: "y", imageUrl: "https://img/1.jpg" }] })
    );
    render(<SwipeModePage />);
    await screen.findByRole("heading", { name: "Only One" });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Host your own" })).toHaveAttribute("href", "/events/new");
  });

  it("shows the empty state when the feed fails", async () => {
    fetchMock.mockImplementation(() => json({}, false, 500));
    render(<SwipeModePage />);
    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
  });
});
