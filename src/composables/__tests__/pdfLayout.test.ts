import { describe, it, expect } from "vitest";
import {
  GAP,
  MARGIN,
  MAX_ZOOM,
  MIN_THUMB,
  MIN_ZOOM,
  clampZoom,
  currentPage,
  fitScale,
  layout,
  pageSlice,
  scrollForThumb,
  thumb,
  visibleRange,
  wheelZoomFactor,
  zoomAt,
} from "../pdfLayout";

const letter = { w: 612, h: 792 };

describe("fitScale and clampZoom", () => {
  it("fits page 1 inside the viewport minus both margins", () => {
    expect(fitScale(1000, letter)).toBeCloseTo((1000 - 2 * MARGIN) / 612);
  });

  it("never divides by zero or goes negative on a tiny viewport", () => {
    expect(fitScale(10, letter)).toBeGreaterThan(0);
    expect(fitScale(1000, { w: 0, h: 0 })).toBeGreaterThan(0);
  });

  it("clamps zoom to the allowed range", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe("layout", () => {
  it("stacks pages with a gap and margins, centered in a wider viewport", () => {
    const l = layout([letter, letter], 1, 1000);
    expect(l.width).toBe(1000);
    expect(l.colLeft).toBe((1000 - 612) / 2);
    expect(l.boxes[0]).toEqual({ top: MARGIN, left: (1000 - 612) / 2, w: 612, h: 792 });
    expect(l.boxes[1].top).toBe(MARGIN + 792 + GAP);
    expect(l.height).toBe(MARGIN + 792 + GAP + 792 + MARGIN);
  });

  it("starts at the margin when the column is wider than the viewport", () => {
    const l = layout([letter], 2, 1000);
    expect(l.width).toBe(612 * 2 + 2 * MARGIN);
    expect(l.colLeft).toBe(MARGIN);
    expect(l.boxes[0].left).toBe(MARGIN);
  });

  it("centers narrower pages inside a column sized by the widest page", () => {
    const l = layout([{ w: 792, h: 612 }, letter], 1, 2000);
    expect(l.boxes[1].left).toBe(l.colLeft + (792 - 612) / 2);
    expect(l.boxes[1].left + 612).toBeLessThanOrEqual(l.colLeft + 792);
  });

  it("is empty without pages", () => {
    const l = layout([], 1, 1000);
    expect(l.boxes).toEqual([]);
    expect(l.height).toBe(0);
    expect(l.width).toBe(1000);
  });
});

describe("visibleRange and currentPage", () => {
  const boxes = layout([letter, letter, letter, letter], 1, 1000).boxes;

  it("returns the pages intersecting the viewport", () => {
    expect(visibleRange(boxes, 0, 800)).toEqual({ first: 0, last: 0 });
    expect(visibleRange(boxes, 700, 800)).toEqual({ first: 0, last: 1 });
  });

  it("grows the window by the margin on both sides", () => {
    expect(visibleRange(boxes, 900, 800, 800)).toEqual({ first: 0, last: 2 });
  });

  it("is null for an empty document or a viewport past the end", () => {
    expect(visibleRange([], 0, 800)).toBeNull();
    expect(visibleRange(boxes, 100000, 800)).toBeNull();
  });

  it("picks the page under the viewport center and clamps at the ends", () => {
    expect(currentPage(boxes, 0, 800)).toBe(0);
    expect(currentPage(boxes, boxes[2].top - 200, 800)).toBe(2);
    expect(currentPage(boxes, 100000, 800)).toBe(3);
    expect(currentPage([], 0, 800)).toBe(0);
  });
});

describe("zoomAt", () => {
  it("keeps the document point under the cursor fixed", () => {
    const before = layout([letter], 1, 1000);
    const after = layout([letter], 2, 1000);
    const scroll = { left: 0, top: 300 };
    const cursor = { x: 400, y: 200 };
    const next = zoomAt(before, after, 1, 2, scroll, cursor);
    // the point 400px right of the content's left edge and 500px down maps to
    // page coords ((400 - colLeft), (500 - MARGIN)); at scale 2 it must sit under the cursor again
    const docX = (scroll.left + cursor.x - before.colLeft) / 1;
    const docY = (scroll.top + cursor.y - MARGIN) / 1;
    expect(next.left + cursor.x).toBeCloseTo(after.colLeft + docX * 2);
    expect(next.top + cursor.y).toBeCloseTo(MARGIN + docY * 2);
  });

  it("with the cursor at the origin keeps the top-left point on a resize", () => {
    const before = layout([letter], 1, 1000);
    const after = layout([letter], 1.5, 1500);
    const next = zoomAt(before, after, 1, 1.5, { left: 0, top: 100 }, { x: 0, y: 0 });
    expect(next.top).toBeCloseTo(MARGIN + ((100 - MARGIN) / 1) * 1.5);
  });
});

describe("wheelZoomFactor", () => {
  it("treats a mouse notch as one step in the wheel's direction", () => {
    expect(wheelZoomFactor(-100, 1.1)).toBe(1.1);
    expect(wheelZoomFactor(100, 1.1)).toBeCloseTo(1 / 1.1);
    expect(wheelZoomFactor(-40, 1.2)).toBe(1.2);
  });

  it("zooms continuously for small pinch deltas", () => {
    const f = wheelZoomFactor(-4, 1.1);
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(1.1);
    expect(wheelZoomFactor(4, 1.1)).toBeCloseTo(1 / f);
    expect(wheelZoomFactor(0, 1.1)).toBe(1);
  });
});

describe("thumb and scrollForThumb", () => {
  it("fills the track when the content fits", () => {
    expect(thumb(0, 800, 600, 300)).toEqual({ offset: 0, len: 300 });
    expect(scrollForThumb(100, 800, 600, 300)).toBe(0);
  });

  it("sizes the thumb to the visible fraction and offsets it by the scroll fraction", () => {
    const t = thumb(200, 800, 1600, 300);
    expect(t.len).toBe(150);
    expect(t.offset).toBeCloseTo((300 - 150) * (200 / 800));
  });

  it("never shrinks below the minimum and clamps the offset", () => {
    const t = thumb(1e9, 100, 100000, 300);
    expect(t.len).toBe(MIN_THUMB);
    expect(t.offset).toBe(300 - MIN_THUMB);
  });

  it("inverts thumb() for any offset inside the track", () => {
    for (const pos of [0, 123, 800]) {
      const t = thumb(pos, 800, 1600, 300);
      expect(scrollForThumb(t.offset, 800, 1600, 300)).toBeCloseTo(pos);
    }
    expect(scrollForThumb(-50, 800, 1600, 300)).toBe(0);
    expect(scrollForThumb(1000, 800, 1600, 300)).toBe(800);
  });
});

describe("pageSlice", () => {
  const box = { top: 100, left: 50, w: 600, h: 800 };

  it("returns the visible part in page coordinates", () => {
    expect(pageSlice(box, 0, 0, 400, 500)).toEqual({ x: 0, y: 0, w: 350, h: 400 });
    expect(pageSlice(box, 200, 300, 400, 500)).toEqual({ x: 150, y: 200, w: 400, h: 500 });
  });

  it("is null when the page is off screen", () => {
    expect(pageSlice(box, 0, 1000, 400, 500)).toBeNull();
    expect(pageSlice(box, 700, 0, 400, 500)).toBeNull();
  });
});
