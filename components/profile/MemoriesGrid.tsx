import { format } from "date-fns";

type MemoryItem = {
  id: string;
  title: string;
  date: string;
  category: string;
  imageUrl?: string | null;
  status?: string;
  caption?: string | null;
  eventTitle?: string | null;
};

export default function MemoriesGrid({ items }: { items: MemoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-10 text-center text-sm text-neutral-600">
        No memories yet. Attend a few events to start your timeline.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow-sm"
        >
          <div className="relative aspect-[4/3] bg-gradient-to-br from-sand to-white">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em] text-neutral-400">
                {item.category}
              </div>
            )}
            {item.status ? (
              <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700">
                {item.status}
              </span>
            ) : null}
          </div>
          <div className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              {format(new Date(item.date), "MMM d, yyyy")}
            </p>
            <h3 className="text-base font-semibold text-neutral-900">
              {item.title}
            </h3>
            {item.caption ? (
              <p className="text-sm text-neutral-700">{item.caption}</p>
            ) : null}
            {item.eventTitle ? (
              <p className="text-xs text-neutral-500">From {item.eventTitle}</p>
            ) : null}
            <p className="text-xs text-neutral-500">{item.category}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
