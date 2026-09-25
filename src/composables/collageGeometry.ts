import type { Rect } from "../types";

export const MIN_ITEM_SIDE = 16;
export const PLACE_STEP = 32;
export const PLACE_MARGIN = 24;
const PLACE_MAX_RINGS = 400;
const INITIAL_FRACTION = 1 / 3;

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w + margin > b.x &&
    a.y < b.y + b.h + margin &&
    a.y + a.h + margin > b.y
  );
}

export function initialSize(nw: number, nh: number, visible: Rect): { w: number; h: number } {
  const cap = Math.max(visible.w, visible.h) * INITIAL_FRACTION;
  const s = Math.min(1, cap / Math.max(nw, nh));
  return { w: nw * s, h: nh * s };
}

// square spiral of candidate top-left corners around the centered slot;
// ring r visits every cell whose chebyshev distance is exactly r
export function findEmptySpot(
  size: { w: number; h: number },
  center: { x: number; y: number },
  occupied: Rect[],
): { x: number; y: number } {
  const ox = center.x - size.w / 2;
  const oy = center.y - size.h / 2;
  const free = (x: number, y: number) =>
    !occupied.some((o) => rectsOverlap({ x, y, w: size.w, h: size.h }, o, PLACE_MARGIN));
  if (free(ox, oy)) return { x: ox, y: oy };
  for (let r = 1; r <= PLACE_MAX_RINGS; r++) {
    // walk only the ring's perimeter: full top and bottom rows, then the
    // two side columns without their corners
    const cells: [number, number][] = [];
    for (let dx = -r; dx <= r; dx++) cells.push([dx, -r], [dx, r]);
    for (let dy = -r + 1; dy <= r - 1; dy++) cells.push([-r, dy], [r, dy]);
    for (const [dx, dy] of cells) {
      const x = ox + dx * PLACE_STEP;
      const y = oy + dy * PLACE_STEP;
      if (free(x, y)) return { x, y };
    }
  }
  // pathological wall: drop it past everything on the right
  const right = Math.max(...occupied.map((o) => o.x + o.w));
  return { x: right + PLACE_MARGIN, y: oy };
}

export function resizeRect(start: Rect, handle: Handle, px: number, py: number, lock: boolean): Rect {
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");
  const hasE = handle.includes("e");
  const hasW = handle.includes("w");
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  let w = hasE ? px - start.x : hasW ? right - px : start.w;
  let h = hasS ? py - start.y : hasN ? bottom - py : start.h;
  w = Math.max(w, MIN_ITEM_SIDE);
  h = Math.max(h, MIN_ITEM_SIDE);
  if (lock) {
    const ratio = start.w / start.h;
    const corner = (hasN || hasS) && (hasE || hasW);
    if (corner) {
      w = Math.max(w, h * ratio);
      h = w / ratio;
    } else if (hasE || hasW) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    if (Math.min(w, h) < MIN_ITEM_SIDE) {
      if (w < h) {
        w = MIN_ITEM_SIDE;
        h = w / ratio;
      } else {
        h = MIN_ITEM_SIDE;
        w = h * ratio;
      }
    }
  }
  let x = hasW ? right - w : start.x;
  let y = hasN ? bottom - h : start.y;
  // a locked edge drag changes the other axis too; keep that axis centered
  if (lock && !(hasE || hasW)) x = start.x + (start.w - w) / 2;
  if (lock && !(hasN || hasS)) y = start.y + (start.h - h) / 2;
  return { x, y, w, h };
}
