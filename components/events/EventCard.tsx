import { Calendar, MapPin, Tag } from "lucide-react";
import type { EventSummary } from "@/types";

export default function EventCard({ event }: { event: EventSummary }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-sm">
      {event.imageUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl">
          <img
            src={event.imageUrl}
            alt={event.title}
            className="h-40 w-full object-cover"
          />
        </div>
      ) : (
        <div className="mb-3 flex h-40 items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-500">
          No image
        </div>
      )}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ocean">
        <Tag className="h-3.5 w-3.5" />
        <span>{event.category}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{event.title}</h3>
      <div className="mt-2 space-y-1 text-sm text-neutral-600">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-400" />
          <span>{event.date}</span>
        </div>
        <div className="flex items-center gap-2 text-neutral-500">
          <MapPin className="h-4 w-4 text-neutral-400" />
          <span>{event.location}</span>
        </div>
      </div>
    </div>
  );
}
