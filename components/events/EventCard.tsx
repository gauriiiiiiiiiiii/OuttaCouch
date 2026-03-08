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
      <div className="text-xs uppercase tracking-[0.2em] text-ocean">
        {event.category}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{event.title}</h3>
      <p className="text-sm text-neutral-600">{event.date}</p>
      <p className="text-sm text-neutral-500">{event.location}</p>
    </div>
  );
}
