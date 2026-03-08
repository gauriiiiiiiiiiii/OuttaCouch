"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L, { type LeafletMouseEvent } from "leaflet";

const markerIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

type MapPickerProps = {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
};

function ClickHandler({ onChange }: { onChange: MapPickerProps["onChange"] }) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onChange(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([28.6139, 77.209]);
  const isValidCoord = (value?: number) =>
    typeof value === "number" && Number.isFinite(value);

  useEffect(() => {
    if (isValidCoord(lat) && isValidCoord(lng)) {
      setPosition([lat as number, lng as number]);
    }
  }, [lat, lng]);

  const center = useMemo<[number, number]>(() => position, [position]);
  const hasValidPosition = isValidCoord(position[0]) && isValidCoord(position[1]);

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-64 w-full rounded-2xl border border-neutral-200"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {hasValidPosition ? <Marker position={position} icon={markerIcon} /> : null}
      <ClickHandler
        onChange={(nextLat, nextLng) => {
          setPosition([nextLat, nextLng]);
          onChange(Number(nextLat.toFixed(6)), Number(nextLng.toFixed(6)));
        }}
      />
    </MapContainer>
  );
}
