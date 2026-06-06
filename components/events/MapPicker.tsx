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

type MapPickerProps = {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
};

const isValidCoord = (value?: number) =>
  typeof value === "number" && Number.isFinite(value);

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Initialize map once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Force-remove any leftover Leaflet instance (HMR / strict mode)
    const node = container as HTMLDivElement & { _leaflet_id?: number };
    if (node._leaflet_id) {
      try {
        (node as unknown as { _leaflet?: L.Map })._leaflet?.remove();
      } catch {
        // ignore
      }
      delete node._leaflet_id;
    }

    const initialCenter: [number, number] =
      isValidCoord(lat) && isValidCoord(lng)
        ? [lat as number, lng as number]
        : [28.6139, 77.209];

    const map = L.map(container, {
      center: initialCenter,
      zoom: 12,
      scrollWheelZoom: false
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    if (isValidCoord(lat) && isValidCoord(lng)) {
      markerRef.current = L.marker([lat as number, lng as number], {
        icon: markerIcon
      }).addTo(map);
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        markerRef.current = L.marker([clickLat, clickLng], {
          icon: markerIcon
        }).addTo(map);
      }
      onChangeRef.current(
        Number(clickLat.toFixed(6)),
        Number(clickLng.toFixed(6))
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only run on mount — lat/lng updates handled in separate effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng changes (e.g. city search) into existing map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isValidCoord(lat) || !isValidCoord(lng)) return;
    const position: [number, number] = [lat as number, lng as number];
    map.setView(position, map.getZoom());
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      markerRef.current = L.marker(position, { icon: markerIcon }).addTo(map);
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-2xl border border-neutral-200"
    />
  );
}
