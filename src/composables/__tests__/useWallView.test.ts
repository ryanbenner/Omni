import { describe, it, expect } from "vitest";
import { useWallView, MAX_ZOOM, MIN_ZOOM } from "../useWallView";

const vp = { w: 1000, h: 800 };

describe("useWallView", () => {
  it("converts between screen and wall through the transform", () => {
    const v = useWallView();
    v.set({ x: 100, y: 50, zoom: 2 });
    expect(v.toWall(300, 250)).toEqual({ x: 100, y: 100 });
    expect(v.toScreen(100, 100)).toEqual({ x: 300, y: 250 });
    expect(v.style.value.transform).toBe("translate(100px, 50px) scale(2)");
  });

  it("zoomAt keeps the wall point under the cursor fixed", () => {
    const v = useWallView();
    v.set({ x: 20, y: 30, zoom: 1 });
    const before = v.toWall(400, 300);
    v.zoomAt(1.5, 400, 300);
    expect(v.zoom.value).toBeCloseTo(1.5);
    const after = v.toWall(400, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to the allowed range", () => {
    const v = useWallView();
    v.zoomAt(1000, 0, 0);
    expect(v.zoom.value).toBe(MAX_ZOOM);
    v.zoomAt(1e-9, 0, 0);
    expect(v.zoom.value).toBe(MIN_ZOOM);
  });

  it("panBy shifts the offset in screen pixels", () => {
    const v = useWallView();
    v.panBy(10, -5);
    expect(v.get()).toEqual({ x: 10, y: -5, zoom: 1 });
  });

  it("visibleRect is the viewport in wall coordinates, optionally expanded", () => {
    const v = useWallView();
    v.set({ x: -100, y: -50, zoom: 2 });
    expect(v.visibleRect(vp)).toEqual({ x: 50, y: 25, w: 500, h: 400 });
    expect(v.visibleRect(vp, 1)).toEqual({ x: -450, y: -375, w: 1500, h: 1200 });
  });

  it("fitAll contains every rect with padding and centers the group", () => {
    const v = useWallView();
    v.fitAll(
      [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 900, y: 0, w: 100, h: 100 },
      ],
      vp,
      50,
    );
    // group is 1000 wide; viewport minus padding is 900 wide
    expect(v.zoom.value).toBeCloseTo(0.9);
    const vis = v.visibleRect(vp);
    expect(vis.x).toBeLessThanOrEqual(0);
    expect(vis.x + vis.w).toBeGreaterThanOrEqual(1000);
    expect(vis.y + vis.h / 2).toBeCloseTo(50);
  });

  it("fitAll with no rects resets to origin at 100%", () => {
    const v = useWallView();
    v.set({ x: 5, y: 5, zoom: 3 });
    v.fitAll([], vp);
    expect(v.get()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("centerOn puts the rect's center in the middle of the viewport without changing zoom", () => {
    const v = useWallView();
    v.set({ x: 0, y: 0, zoom: 2 });
    v.centerOn({ x: 100, y: 100, w: 50, h: 50 }, vp);
    expect(v.zoom.value).toBe(2);
    expect(v.toScreen(125, 125)).toEqual({ x: 500, y: 400 });
  });
});
