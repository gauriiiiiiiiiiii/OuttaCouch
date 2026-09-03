"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, useMotionValue, useTransform } from "framer-motion";
import type { EventSummary } from "@/types";
import { SWIPE_THRESHOLD_PX, isTapNotDrag, swipeDirectionForOffset } from "@/lib/swipeGesture";

type SwipeStackProps = {
  events: EventSummary[];
  onSwipe: (event: EventSummary, action: "left" | "right") => void;
};

/**
 * Card stack. Dismissal is tracked by event id rather than a positional index so
 * that a parent which removes the swiped event from `events` (as the explore
 * pages do) does not cause a second card to be skipped.
 */
export default function SwipeStack({ events, onSwipe }: SwipeStackProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [swipeAction, setSwipeAction] = useState<"left" | "right" | null>(null);
  const swipedIdRef = useRef<string | null>(null);
  const visible = events.filter((event) => !dismissed.has(event.id));
  const current = visible[0];
  const next = visible[1];
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const likeOpacity = useTransform(x, [40, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -40], [1, 0]);

  // Only animate the card that was actually swiped. If the parent already
  // removed it, the next card must appear in place without flying off.
  const isSwipingCurrent = swipeAction !== null && current?.id === swipedIdRef.current;

  useEffect(() => {
    if (swipeAction && !isSwipingCurrent) {
      setSwipeAction(null);
      swipedIdRef.current = null;
      x.set(0);
      y.set(0);
    }
  }, [swipeAction, isSwipingCurrent, x, y]);

  const handleSwipe = (action: "left" | "right") => {
    if (!current) {
      return;
    }
    swipedIdRef.current = current.id;
    onSwipe(current, action);
    setSwipeAction(action);
  };

  const handleOpenDetails = () => {
    if (!current || current.id.startsWith("dummy")) {
      return;
    }
    if (!isTapNotDrag(x.get(), y.get())) {
      return;
    }
    router.push(`/events/${current.id}`);
  };

  if (!current) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-center text-sm text-neutral-600">
        No more events.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
      {next ? (
        <div className="pointer-events-none absolute inset-6 -z-10 scale-[0.97] rounded-2xl border border-neutral-200 bg-white/70" />
      ) : null}
      <motion.div
        key={current.id}
        className="cursor-grab active:cursor-grabbing"
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.2}
        style={{ x, y, rotate }}
        animate={
          isSwipingCurrent && swipeAction === "right"
            ? { x: 600, y: 0, rotate: 18 }
            : isSwipingCurrent && swipeAction === "left"
              ? { x: -600, y: 0, rotate: -18 }
              : { x: 0, y: 0, rotate: 0 }
        }
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onDragEnd={(_, info) => {
          // Gesture-only path (pointer drag); the decision itself is unit-tested in lib/swipeGesture.
          const direction = swipeDirectionForOffset(info.offset.x, SWIPE_THRESHOLD_PX);
          if (direction) {
            handleSwipe(direction);
            return;
          }
          x.set(0);
          y.set(0);
        }}
        onAnimationComplete={() => {
          if (isSwipingCurrent) {
            const swipedId = swipedIdRef.current;
            setSwipeAction(null);
            swipedIdRef.current = null;
            x.set(0);
            y.set(0);
            if (swipedId) {
              setDismissed((prev) => new Set([...prev, swipedId]));
            }
          }
        }}
      >
        <motion.div
          className="absolute left-4 top-4 rounded-full border border-green-500 px-3 py-1 text-xs font-semibold text-green-600"
          style={{ opacity: likeOpacity }}
        >
          COMMIT
        </motion.div>
        <motion.div
          className="absolute right-4 top-4 rounded-full border border-red-500 px-3 py-1 text-xs font-semibold text-red-600"
          style={{ opacity: nopeOpacity }}
        >
          SKIP
        </motion.div>
        <div
          className="mb-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
          onClick={handleOpenDetails}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleOpenDetails();
            }
          }}
        >
          {current.imageUrl ? (
            <div className="relative h-60 w-full">
              <Image
                src={current.imageUrl}
                alt={current.title}
                fill
                sizes="(min-width:1024px) 40vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/80">
                  {current.category}
                </div>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {current.title}
                </h3>
                <p className="text-sm text-white/80">
                  {current.date} · {current.location}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-neutral-500">
              No image available
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="rounded-full border border-neutral-200 px-3 py-1">
            {current.category}
          </span>
          <span className="rounded-full border border-neutral-200 px-3 py-1">
            {current.date}
          </span>
          <span className="rounded-full border border-neutral-200 px-3 py-1">
            {current.location}
          </span>
        </div>
      </motion.div>
      <div className="mt-6 flex items-center justify-between">
        <button
          className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
          onClick={() => handleSwipe("left")}
        >
          Skip
        </button>
        <button
          className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
          onClick={() => handleSwipe("right")}
        >
          Commit
        </button>
      </div>
    </div>
  );
}
