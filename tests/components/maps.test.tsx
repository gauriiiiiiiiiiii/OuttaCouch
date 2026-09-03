// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => {
  const map = { on: vi.fn(), remove: vi.fn(), setView: vi.fn(), getZoom: vi.fn(() => 12) };
  const tileLayer = { addTo: vi.fn() };
  const makeMarker = () => {
    const marker = { bindPopup: vi.fn(), addTo: vi.fn(), setLatLng: vi.fn() };
    marker.bindPopup.mockReturnValue(marker);
    marker.addTo.mockReturnValue(marker);
    return marker;
  };
  const markers: ReturnType<typeof makeMarker>[] = [];
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => tileLayer),
    marker: vi.fn(() => {
      const marker = makeMarker();
      markers.push(marker);
      return marker;
    }),
    icon: vi.fn(() => ({ icon: true }))
  };
  return { L, map, tileLayer, markers };
});
vi.mock("leaflet", () => ({ default: leaflet.L }));

import EventMap from "@/components/events/EventMap";
import MapPicker from "@/components/events/MapPicker";

beforeEach(() => {
  leaflet.markers.length = 0;
});

describe("EventMap", () => {
  it("creates a map centred on the first valid event, adds tiles and one marker per event", () => {
    render(
      <EventMap
        events={[
          { id: "a", title: "Jam", location: "Terrace", lat: 28.6, lng: 77.2 },
          { id: "b", title: "No coords", lat: null, lng: null },
          { id: "c", title: "NaN coords", lat: Number.NaN, lng: 1 }
        ]}
        zoom={14}
        heightClassName="h-40"
      />
    );
    expect(leaflet.L.map).toHaveBeenCalledWith(expect.any(HTMLDivElement), { center: [28.6, 77.2], zoom: 14, scrollWheelZoom: false });
    expect(leaflet.L.tileLayer).toHaveBeenCalledWith("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", expect.objectContaining({ attribution: expect.stringContaining("OpenStreetMap") }));
    expect(leaflet.tileLayer.addTo).toHaveBeenCalledWith(leaflet.map);
    expect(leaflet.L.marker).toHaveBeenCalledTimes(1);
    expect(leaflet.L.marker).toHaveBeenCalledWith([28.6, 77.2], { icon: { icon: true } });
    expect(leaflet.markers[0].addTo).toHaveBeenCalledWith(leaflet.map);
    expect(document.querySelector(".h-40")).not.toBeNull();
  });

  it("escapes user content in popups and honours an explicit centre", () => {
    render(
      <EventMap
        events={[{ id: "x", title: `<img src=x onerror="alert(1)">`, location: "Bar & <Grill>", lat: 1, lng: 2 }]}
        center={[10, 20]}
      />
    );
    expect(leaflet.L.map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [10, 20], zoom: 12 }));
    const popup = leaflet.markers[0].bindPopup.mock.calls[0][0] as string;
    expect(popup).not.toContain("<img");
    expect(popup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(popup).toContain("Bar &amp; &lt;Grill&gt;");
  });

  it("falls back to the default centre with no valid events and omits the venue line when absent", () => {
    render(<EventMap events={[{ id: "x", title: "T", lat: 5, lng: 6 }]} />);
    expect(leaflet.markers[0].bindPopup.mock.calls[0][0]).not.toContain("text-gray-500");
    render(<EventMap events={[]} />);
    expect(leaflet.L.map).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ center: [28.6139, 77.209] }));
  });

  it("tears the map down on unmount and re-initialises when coordinates change", () => {
    const { rerender, unmount } = render(<EventMap events={[{ id: "a", title: "A", lat: 1, lng: 1 }]} />);
    expect(leaflet.L.map).toHaveBeenCalledTimes(1);
    rerender(<EventMap events={[{ id: "a", title: "A", lat: 1, lng: 1 }]} />);
    expect(leaflet.L.map).toHaveBeenCalledTimes(1); // same key → no re-init
    rerender(<EventMap events={[{ id: "a", title: "A", lat: 2, lng: 2 }]} />);
    expect(leaflet.map.remove).toHaveBeenCalledTimes(1);
    expect(leaflet.L.map).toHaveBeenCalledTimes(2);
    unmount();
    expect(leaflet.map.remove).toHaveBeenCalledTimes(2);
  });
});

describe("MapPicker", () => {
  const clickHandler = () => leaflet.map.on.mock.calls.find(([event]) => event === "click")![1] as (e: { latlng: { lat: number; lng: number } }) => void;

  it("initialises at the given coordinates with a marker, and reports rounded clicks", () => {
    const onChange = vi.fn();
    render(<MapPicker lat={28.6} lng={77.2} onChange={onChange} />);
    expect(leaflet.L.map).toHaveBeenCalledWith(expect.any(HTMLDivElement), { center: [28.6, 77.2], zoom: 12, scrollWheelZoom: false });
    expect(leaflet.L.marker).toHaveBeenCalledWith([28.6, 77.2], { icon: { icon: true } });

    clickHandler()({ latlng: { lat: 12.3456789, lng: 98.7654321 } });
    expect(onChange).toHaveBeenCalledWith(12.345679, 98.765432);
    expect(leaflet.markers[0].setLatLng).toHaveBeenCalledWith([12.3456789, 98.7654321]);
    expect(leaflet.L.marker).toHaveBeenCalledTimes(1); // existing marker moved, not recreated
  });

  it("starts at the default centre without a marker when coordinates are missing, then places one on click", () => {
    const onChange = vi.fn();
    render(<MapPicker onChange={onChange} />);
    expect(leaflet.L.map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [28.6139, 77.209] }));
    expect(leaflet.L.marker).not.toHaveBeenCalled();
    clickHandler()({ latlng: { lat: 1, lng: 2 } });
    expect(leaflet.L.marker).toHaveBeenCalledWith([1, 2], { icon: { icon: true } });
    expect(onChange).toHaveBeenCalledWith(1, 2);
  });

  it("follows external coordinate changes (e.g. 'Use my location') without re-creating the map", () => {
    const { rerender, unmount } = render(<MapPicker lat={1} lng={1} onChange={vi.fn()} />);
    // The sync effect also runs once on mount (a no-op recentre on the same coords).
    expect(leaflet.map.setView).toHaveBeenCalledTimes(1);
    rerender(<MapPicker lat={3} lng={4} onChange={vi.fn()} />);
    expect(leaflet.map.setView).toHaveBeenLastCalledWith([3, 4], 12);
    expect(leaflet.markers[0].setLatLng).toHaveBeenCalledWith([3, 4]);
    expect(leaflet.L.map).toHaveBeenCalledTimes(1);
    rerender(<MapPicker lat={Number.NaN} lng={4} onChange={vi.fn()} />);
    expect(leaflet.map.setView).toHaveBeenCalledTimes(2); // invalid coords ignored
    unmount();
    expect(leaflet.map.remove).toHaveBeenCalled();
  });

  it("always calls the latest onChange even after re-renders", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<MapPicker lat={1} lng={1} onChange={first} />);
    rerender(<MapPicker lat={1} lng={1} onChange={second} />);
    clickHandler()({ latlng: { lat: 5, lng: 6 } });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(5, 6);
  });
});
