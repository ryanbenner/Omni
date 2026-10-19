// the id whose box overlaps the viewport most; ties go to the earlier one
export function mostVisible<T>(
  items: { id: T; top: number; bottom: number }[],
  viewTop: number,
  viewBottom: number,
): T {
  let best = items[0].id;
  let bestOverlap = -Infinity;
  for (const it of items) {
    const overlap = Math.min(it.bottom, viewBottom) - Math.max(it.top, viewTop);
    if (overlap > bestOverlap) {
      best = it.id;
      bestOverlap = overlap;
    }
  }
  return best;
}
