import { describe, it, expect } from "vitest";
import {
  findEmptySpot,
  initialSize,
  rectsOverlap,
  resizeRect,
  MIN_ITEM_SIDE,
  PLACE_MARGIN,
} from "../collageGeometry";

const start = { x: 100, y: 100, w: 200, h: 100 };

describe("resizeRect", () => {
  it("east edge with lock keeps ratio, anchors the west edge, and keeps the vertical center", () => {
    const r = resizeRect(start, "e", 500, 0, true);
    expect(r).toEqual({ x: 100, y: 50, w: 400, h: 200 });
  });

  it("west edge without lock stretches one axis and anchors the east edge", () => {
    const r = resizeRect(start, "w", 50, 999, false);
    expect(r).toEqual({ x: 50, y: 100, w: 250, h: 100 });
  });

  it("south-east corner with lock follows the larger relative change", () => {
    // pointer mostly down: height drives, width follows the 2:1 ratio
    const r = resizeRect(start, "se", 320, 400, true);
    expect(r).toEqual({ x: 100, y: 100, w: 600, h: 300 });
  });

  it("north-west corner without lock anchors the south-east corner", () => {
    const r = resizeRect(start, "nw", 0, 0, false);
    expect(r).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });

  it("never goes below the minimum side, keeping ratio when locked", () => {
    const free = resizeRect(start, "se", 100, 100, false);
    expect(free.w).toBe(MIN_ITEM_SIDE);
    expect(free.h).toBe(MIN_ITEM_SIDE);
    const locked = resizeRect(start, "se", 100, 100, true);
    expect(locked.h).toBe(MIN_ITEM_SIDE);
    expect(locked.w).toBe(MIN_ITEM_SIDE * 2);
  });
});

describe("initialSize", () => {
  it("caps the longer side at a third of the viewport's longer side", () => {
    expect(initialSize(3000, 1500, { x: 0, y: 0, w: 1200, h: 900 })).toEqual({ w: 400, h: 200 });
  });

  it("never upscales small pictures", () => {
    expect(initialSize(100, 80, { x: 0, y: 0, w: 1200, h: 900 })).toEqual({ w: 100, h: 80 });
  });
});

describe("findEmptySpot", () => {
  it("uses the view center when nothing is there", () => {
    expect(findEmptySpot({ w: 100, h: 50 }, { x: 500, y: 400 }, [])).toEqual({ x: 450, y: 375 });
  });

  it("spirals outward past occupied rects, honoring the margin", () => {
    const occupied = [{ x: 450, y: 375, w: 100, h: 50 }];
    const spot = findEmptySpot({ w: 100, h: 50 }, { x: 500, y: 400 }, occupied);
    expect(rectsOverlap({ ...spot, w: 100, h: 50 }, occupied[0], PLACE_MARGIN)).toBe(false);
    // nearest ring: at most one step plus margin away from the center slot
    expect(Math.abs(spot.x - 450) + Math.abs(spot.y - 375)).toBeLessThanOrEqual(2 * 32 + 2 * PLACE_MARGIN + 100);
  });

  it("finds a spot outside a fully covered area", () => {
    const wall = { x: 0, y: 0, w: 1000, h: 800 };
    const spot = findEmptySpot({ w: 100, h: 100 }, { x: 500, y: 400 }, [wall]);
    expect(rectsOverlap({ ...spot, w: 100, h: 100 }, wall, PLACE_MARGIN)).toBe(false);
  });

  it("places several in sequence without overlaps", () => {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = findEmptySpot({ w: 120, h: 90 }, { x: 0, y: 0 }, placed);
      placed.push({ ...s, w: 120, h: 90 });
    }
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(rectsOverlap(placed[i], placed[j])).toBe(false);
  });
});
