export const SWIPE_THRESHOLD_PX = 120;

/** Map a horizontal drag offset to a swipe direction, or null to snap back. */
export function swipeDirectionForOffset(offsetX: number, threshold = SWIPE_THRESHOLD_PX): "left" | "right" | null {
  if (!Number.isFinite(offsetX)) return null;
  if (offsetX > threshold) return "right";
  if (offsetX < -threshold) return "left";
  return null;
}

/** A card tap counts as "open details" only if the pointer barely moved. */
export function isTapNotDrag(deltaX: number, deltaY: number, tolerance = 4): boolean {
  return Math.abs(deltaX) <= tolerance && Math.abs(deltaY) <= tolerance;
}
