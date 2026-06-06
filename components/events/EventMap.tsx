"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

type MapEvent = {
  id: string;
  title: string;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type EventMapProps = {
  events: MapEvent[];
  center?: [number, number];
  zoom?: number;
  heightClassName?: string;
};

const isValidCoord = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value);

export default function EventMap({
  events,
  center,
  zoom = 12,
  heightClassName = "h-72"
}: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const validEvents = events.filter(
    (e) => isValidCoord(e.lat) && isValidCoord(e.lng)
  );
  const mapCenter: [number, number] =
    center ??
    (validEvents.length > 0
      ? [Number(validEvents[0].lat), Number(validEvents[0].lng)]
      : [28.6139, 77.209]);

  // Stable serialized key so the map only re-initialises when coords actually change
  const eventsKey = validEvents
    .map((e) => `${e.id}:${e.lat},${e.lng}`)
    .join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Force-remove any leftover Leaflet instance on this DOM node (HMR / strict mode)
    const node = container as HTMLDivElement & { _leaflet_id?: number };
    if (node._leaflet_id) {
      try {
        (node as unknown as { _leaflet?: L.Map })._leaflet?.remove();
      } catch {
        // ignore
      }
      delete node._leaflet_id;
    }

    const map = L.map(container, {
      center: mapCenter,
      zoom,
      scrollWheelZoom: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    validEvents.forEach((event) => {
      L.marker([Number(event.lat), Number(event.lng)], { icon: markerIcon })
        .bindPopup(
          `<div class="space-y-1"><div class="text-sm font-semibold">${event.title}</div>${
            event.location
              ? `<div class="text-xs text-gray-500">${event.location}</div>`
              : ""
          }</div>`
        )
        .addTo(map);
    });

    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter[0], mapCenter[1], zoom, eventsKey]);

  return (
    <div
      ref={containerRef}
      className={`${heightClassName} w-full rounded-2xl border border-neutral-200`}
    />
  );
}
