import { describe, it, expect } from "vitest";
import { useCollage } from "../useCollage";
import { emptyDoc } from "../collageFile";

const view = { center: { x: 500, y: 400 }, visible: { x: 0, y: 0, w: 1200, h: 900 } };
const pic = (n: string) => ({ path: `/p/${n}.jpg`, nw: 3000, nh: 1500, thumb: "data:," });

describe("useCollage", () => {
  it("add places a sized item at the view center, selects nothing, and marks dirty", () => {
    const c = useCollage();
    const it1 = c.add(pic("a"), view);
    expect(it1).toMatchObject({ w: 400, h: 200, x: 300, y: 300, z: 1, rotation: 0, nw: 3000 });
    expect(c.selectedId.value).toBeNull();
    expect(c.dirty.value).toBe(true);
  });

  it("adds do not overlap and z increases", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view);
    const b = c.add(pic("b"), view);
    expect(b.z).toBe(a.z + 1);
    expect(b.x !== a.x || b.y !== a.y).toBe(true);
  });

  it("placing 150 items stays fast (placement reads plain objects, not proxies)", () => {
    const c = useCollage();
    const start = performance.now();
    for (let i = 0; i < 150; i++) c.add(pic("p" + i), view);
    expect(c.items.value).toHaveLength(150);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("select, bringToFront, remove", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view);
    const b = c.add(pic("b"), view);
    c.select(a.id);
    expect(c.selected.value?.id).toBe(a.id);
    c.bringToFront(a.id);
    expect(c.items.value.find((i) => i.id === a.id)!.z).toBeGreaterThan(b.z);
    c.remove(a.id);
    expect(c.items.value.map((i) => i.id)).toEqual([b.id]);
    expect(c.selectedId.value).toBeNull();
  });

  it("moveBy and setRect update the footprint", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view);
    c.moveBy(a.id, 10, -5);
    expect(c.items.value[0]).toMatchObject({ x: 310, y: 295 });
    c.setRect(a.id, { x: 0, y: 0, w: 50, h: 25 });
    expect(c.items.value[0]).toMatchObject({ x: 0, y: 0, w: 50, h: 25 });
  });

  it("rotate steps 90 degrees about the center and swaps the footprint", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view); // 400x200 at 300,300; center 500,400
    c.rotate(a.id);
    expect(c.items.value[0]).toMatchObject({ rotation: 90, w: 200, h: 400, x: 400, y: 200 });
    c.rotate(a.id);
    c.rotate(a.id);
    c.rotate(a.id);
    expect(c.items.value[0]).toMatchObject({ rotation: 0, w: 400, h: 200, x: 300, y: 300 });
  });

  it("reorder uses insertion slots like pins", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view);
    const b = c.add(pic("b"), view);
    const d = c.add(pic("d"), view);
    c.reorder(0, 3);
    expect(c.items.value.map((i) => i.id)).toEqual([b.id, d.id, a.id]);
    c.reorder(2, 0);
    expect(c.items.value.map((i) => i.id)).toEqual([a.id, b.id, d.id]);
  });

  it("load replaces state and clears dirty; toDoc round-trips with the view", () => {
    const c = useCollage();
    c.add(pic("a"), view);
    const doc = { ...emptyDoc(), lockAspect: false, exportFormat: "jpg" as const };
    c.load(doc, "/p/w.collage");
    expect(c.items.value).toEqual([]);
    expect(c.dirty.value).toBe(false);
    expect(c.filePath.value).toBe("/p/w.collage");
    expect(c.lockAspect.value).toBe(false);
    const out = c.toDoc({ x: 1, y: 2, zoom: 3 });
    expect(out.view).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(out.exportFormat).toBe("jpg");
  });

  it("lock and format toggles mark dirty; markClean stores the path", () => {
    const c = useCollage();
    c.load(emptyDoc(), null);
    c.toggleLock();
    expect(c.dirty.value).toBe(true);
    c.markClean("/p/w.collage");
    expect(c.dirty.value).toBe(false);
    expect(c.filePath.value).toBe("/p/w.collage");
    c.setFormat("jpg");
    expect(c.dirty.value).toBe(true);
  });

  it("relink swaps path and natural size and thumb, and marks dirty", () => {
    const c = useCollage();
    const a = c.add(pic("a"), view);
    c.markClean("/p/w.collage");
    c.relink(a.id, "/q/a2.jpg", { nw: 800, nh: 600, thumb: "data:new" });
    expect(c.items.value[0]).toMatchObject({ path: "/q/a2.jpg", nw: 800, nh: 600, thumb: "data:new", w: 400, h: 200 });
    expect(c.dirty.value).toBe(true);
  });
});
