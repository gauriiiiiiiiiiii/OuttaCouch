"use client";

import { useState, useRef, useEffect } from "react";
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
  Music: "text-pink-600 bg-pink-50",
  Sports: "text-green-600 bg-green-50",
  Art: "text-purple-600 bg-purple-50",
  Food: "text-orange-600 bg-orange-50",
  Networking: "text-blue-600 bg-blue-50",
  Outdoors: "text-emerald-600 bg-emerald-50",
  Comedy: "text-yellow-600 bg-yellow-50",
  Workshop: "text-indigo-600 bg-indigo-50",
  Fitness: "text-red-600 bg-red-50",
  Gaming: "text-slate-600 bg-slate-50",
  Other: "text-neutral-600 bg-neutral-50"
};

type EventPopupProps = {
  events: CalendarEvent[];
  date: string;
  onClose: () => void;
};

function EventPopup({ events, date, onClose }: EventPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 animate-fade-in"
        onClick={onClose}
      />

      {/* Popup Card */}
      <div
        ref={popupRef}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 animate-popup-in rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {format(new Date(date), "EEEE, MMMM d")}
            </p>
            <p className="text-xs text-neutral-500">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 transition hover:text-neutral-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Events List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.map((event) => (
            <div
              key={event.id}
              className={`rounded-lg border border-neutral-200 p-3 ${
                categoryColors[event.category] ?? categoryColors.Other
              }`}
            >
              <p className="font-medium text-sm">{event.title}</p>
              <p className="text-xs text-neutral-600 mt-1">
                {format(new Date(event.date), "h:mm a")}
              </p>
              <span className="inline-block text-xs font-medium mt-2">
                {event.category}
              </span>
            </div>
          ))}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200"
        >
          Close
        </button>
      </div>
    </>
  );
}

export default function CalendarGrid({ events }: { events: CalendarEvent[] }) {
  const now = new Date();
  const baseMonth = startOfMonth(now);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const month = addMonths(baseMonth, monthOffset);

  const eventsByDay = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const key = format(new Date(event.date), "yyyy-MM-dd");
      acc[key] = acc[key] ? [...acc[key], event] : [event];
      return acc;
    },
    {}
  );

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month))
  });

  return (
    <>
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              {format(month, "MMMM yyyy")}
            </p>
            <p className="text-sm text-neutral-600">Your attendance trail.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold transition hover:border-neutral-300 active:scale-95"
              onClick={() => setMonthOffset((prev) => prev - 1)}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold transition hover:border-neutral-300 active:scale-95"
              onClick={() => setMonthOffset((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
            {Object.keys(categoryColors).slice(0, 4).map((category) => (
              <span key={category} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${categoryColors[category].split(" ")[0].replace("text-", "bg-").replace("-600", "-500")}`} />
                {category}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 text-xs text-neutral-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center font-medium">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white/95 p-4">
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
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay[key] ?? [];
              const inMonth = isSameMonth(day, month);
              const hasEvents = dayEvents.length > 0;

              return (
                <button
                  key={key}
                  onClick={() => {
                    if (hasEvents) {
                      setSelectedDate(key);
                    }
                  }}
                  disabled={!hasEvents}
                  className={`relative rounded-xl border border-neutral-100 p-2 text-center text-xs transition ${
                    inMonth ? "bg-white" : "bg-neutral-50 opacity-50"
                  } ${isToday(day) ? "ring-2 ring-ink" : ""} ${
                    hasEvents
                      ? "cursor-pointer hover:border-neutral-300 hover:bg-neutral-50 active:scale-95"
                      : "cursor-default"
                  }`}
                >
                  <div className="text-neutral-700 font-medium">{format(day, "d")}</div>
                  {hasEvents && (
                    <div className="mt-1.5 flex justify-center gap-0.5">
                      {dayEvents.slice(0, 3).map((event, idx) => (
                        <span
                          key={idx}
                          className="h-1.5 w-1.5 rounded-full bg-ink"
                          title={event.title}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-xs text-neutral-400">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event Popup Modal */}
      {selectedDate && eventsByDay[selectedDate] && (
        <EventPopup
          events={eventsByDay[selectedDate]}
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}
