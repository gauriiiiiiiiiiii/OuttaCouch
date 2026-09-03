// @vitest-environment jsdom
/**
 * The map components are loaded with next/dynamic({ ssr: false }). The other
 * page suites stub next/dynamic; this file uses the real loader (with Leaflet
 * mocked) so the import thunks and the client-only boundary are exercised.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const leaflet = vi.hoisted(() => {
  const map = { on: vi.fn(), remove: vi.fn(), setView: vi.fn(), getZoom: vi.fn(() => 12) };
  // Plain methods (not vi.fn) so the per-test mock reset cannot strip the chaining return values.
  const marker = {
    bindPopup() {
      return marker;
    },
    addTo() {
      return marker;
    },
    setLatLng() {}
  };
  return {
    map,
    L: { map: vi.fn(() => map), tileLayer: vi.fn(() => ({ addTo: vi.fn() })), marker: vi.fn(() => marker), icon: vi.fn(() => ({})) }
  };
});
vi.mock("leaflet", () => ({ default: leaflet.L }));
vi.mock("@/lib/services/storage", () => ({ StorageService: { uploadImage: vi.fn() } }));

import EventDetailPage from "@/app/(main)/events/[id]/page";
import CreateEventPage from "@/app/(main)/events/new/page";
import EditEventPage from "@/app/(main)/events/manage/[id]/edit/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.params = { id: "e1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("map components through the real next/dynamic loader", () => {
  it("EventDetailPage mounts the Leaflet map for an event with coordinates", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/events/e1"
        ? json({ id: "e1", title: "Rooftop Jam", description: "d", category: "Music", date: "d", time: "t", venueName: "Terrace", address: "A", lat: 28.6, lng: 77.2, coverImageUrl: "https://img/c.jpg", images: [], isFree: true, ticketPrice: null, host: { id: "h", name: "H", photo: null }, attendeeCount: 0, isCommitted: false, goingList: [] })
        : json({ events: [] })
    );
    render(<EventDetailPage />);
    await screen.findByRole("heading", { name: "Rooftop Jam" });
    await waitFor(() => expect(leaflet.L.map).toHaveBeenCalled());
    expect(leaflet.L.marker).toHaveBeenCalledWith([28.6, 77.2], expect.anything());
  });

  it("CreateEventPage mounts the venue picker on the venue step", async () => {
    render(<CreateEventPage />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "T");
    await userEvent.selectOptions(screen.getByRole("combobox"), "Art");
    await userEvent.type(screen.getByPlaceholderText("Short description"), "s");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.change(document.querySelector('input[name="eventDate"]')!, { target: { value: "2026-12-01" } });
    fireEvent.change(document.querySelector('input[name="startTime"]')!, { target: { value: "07:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 3 of 4");
    await waitFor(() => expect(leaflet.L.map).toHaveBeenCalled());
    expect(leaflet.L.map).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ center: [28.6139, 77.209] }));
  });

  it("EditEventPage mounts the venue picker centred on the saved coordinates", async () => {
    fetchMock.mockImplementation(() =>
      json({ id: "e1", title: "T", descriptionShort: "s", category: "Art", eventDate: "2026-05-10", startTime: "18:05", venueName: "V", address: "A", lat: 12.9, lng: 77.6, isFree: true, ticketPrice: null, maxAttendees: 10 })
    );
    render(<EditEventPage />);
    await screen.findByPlaceholderText("Event name");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await screen.findByText("Step 3 of 4");
    await waitFor(() => expect(leaflet.L.map).toHaveBeenCalled());
    expect(leaflet.L.map).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ center: [12.9, 77.6] }));
  });
});
