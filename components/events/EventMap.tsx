"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

const markerIcon = new L.Icon({
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
  const validEvents = events.filter(
    (event) => isValidCoord(event.lat) && isValidCoord(event.lng)
  );
  const fallbackCenter: [number, number] = center ?? [28.6139, 77.209];
  const mapCenter =
    validEvents.length > 0
      ? ([Number(validEvents[0].lat), Number(validEvents[0].lng)] as [number, number])
      : fallbackCenter;

  return (
    <MapContainer
      center={mapCenter}
      zoom={zoom}
      className={`${heightClassName} w-full rounded-2xl border border-neutral-200`}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {validEvents.map((event) => (
        <Marker
          key={event.id}
          position={[Number(event.lat), Number(event.lng)]}
          icon={markerIcon}
        >
          <Popup>
            <div className="space-y-1">
              <div className="text-sm font-semibold">{event.title}</div>
              {event.location ? (
                <div className="text-xs text-neutral-600">{event.location}</div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
