"use client";

import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  category: string;
};

const categoryColors: Record<string, string> = {
  Music: "bg-pink-500",
  Sports: "bg-green-500",
  Art: "bg-purple-500",
  Food: "bg-orange-500",
  Networking: "bg-blue-500",
  Outdoors: "bg-emerald-500",
  Comedy: "bg-yellow-500",
  Workshop: "bg-indigo-500",
  Fitness: "bg-red-500",
  Gaming: "bg-slate-500",
  Other: "bg-neutral-500"
};

export default function CalendarGrid({ events }: { events: CalendarEvent[] }) {
  const now = new Date();
  const baseMonth = startOfMonth(now);
  const [monthOffset, setMonthOffset] = useState(0);
  const month = addMonths(baseMonth, monthOffset);

  const eventsByDay = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const key = format(new Date(event.date), "yyyy-MM-dd");
      acc[key] = acc[key] ? [...acc[key], event] : [event];
      return acc;
    },
    {}
  );

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            {format(month, "MMMM yyyy")}
          </p>
          <p className="text-sm text-neutral-600">Your attendance trail.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold"
            onClick={() => setMonthOffset((prev) => prev - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold"
            onClick={() => setMonthOffset((prev) => prev + 1)}
          >
            Next
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
          {Object.keys(categoryColors).slice(0, 4).map((category) => (
            <span key={category} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${categoryColors[category]}`} />
              {category}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2 text-xs text-neutral-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              {format(month, "MMMM yyyy")}
            </p>
            {isSameMonth(month, now) ? (
              <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
                Current
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {eachDayOfInterval({
              start: startOfWeek(startOfMonth(month)),
              end: endOfWeek(endOfMonth(month))
            }).map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay[key] ?? [];
              const inMonth = isSameMonth(day, month);
              return (
                <div
                  key={key}
                  className={`rounded-lg border border-neutral-100 p-2 text-center text-xs ${
                    inMonth ? "bg-white" : "bg-neutral-50 opacity-50"
                  } ${isToday(day) ? "ring-2 ring-ink" : ""}`}
                >
                  <div className="text-neutral-700">{format(day, "d")}</div>
                  <div className="mt-1 flex justify-center gap-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`h-2 w-2 rounded-full ${
                          categoryColors[event.category] ?? "bg-neutral-500"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
