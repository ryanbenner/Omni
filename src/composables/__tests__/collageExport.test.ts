import { describe, it, expect, vi, beforeEach } from "vitest";

const writeMock = vi.fn();
vi.mock("../useImageSave", async (orig) => ({
  ...(await orig<typeof import("../useImageSave")>()),
  writeImageBytes: (...a: unknown[]) => writeMock(...a),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn() }));

import {
  exportArea,
  itemsInArea,
  renderArea,
  validateArea,
  MAX_EXPORT_SIDE,
  type RenderDeps,
} from "../collageExport";
import type { CollageItem } from "../../types";

function item(over: Partial<CollageItem>): CollageItem {
  return {
    id: "x",
    kind: "image",
    path: "/p/x.jpg",
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    nw: 1000,
    nh: 500,
    rotation: 0,
    z: 1,
    ...over,
  };
}

function fakeDeps(missingPaths: string[] = []) {
  const ctx = {
    fillStyle: "",
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvases: { width: number; height: number }[] = [];
  const deps: RenderDeps = {
    loadBitmap: vi.fn((p: string) =>
      missingPaths.includes(p)
        ? Promise.reject(new Error("gone"))
        : Promise.resolve({ width: 1000, height: 500, close: vi.fn() } as unknown as ImageBitmap),
    ),
    makeCanvas: (w, h) => {
      const c = { width: w, height: h, getContext: () => ctx, convertToBlob: vi.fn(async () => new Blob([new Uint8Array([9])])) };
      canvases.push(c);
      return c;
    },
  };
  return { deps, ctx, canvases };
}

describe("validateArea", () => {
  it("accepts a normal area and rejects over-limit ones", () => {
    expect(validateArea({ x: 0, y: 0, w: 4000, h: 3000 })).toBeNull();
    expect(validateArea({ x: 0, y: 0, w: MAX_EXPORT_SIDE + 1, h: 10 })).toMatch(/16,384/);
    expect(validateArea({ x: 0, y: 0, w: 16384, h: 16384 })).toMatch(/268/);
    expect(validateArea({ x: 0, y: 0, w: 0, h: 10 })).toMatch(/empty/);
  });
});

describe("itemsInArea", () => {
  it("keeps intersecting items sorted by z", () => {
    const items = [
      item({ id: "a", z: 3, x: 50, y: 0 }),
      item({ id: "b", z: 1, x: 500, y: 500 }),
      item({ id: "c", z: 2, x: 0, y: 0 }),
    ];
    expect(itemsInArea(items, { x: 0, y: 0, w: 200, h: 100 }).map((i) => i.id)).toEqual(["c", "a"]);
  });
});

describe("renderArea", () => {
  it("draws each item offset from the area origin, scaled, and reports missing ones", async () => {
    const { deps, ctx, canvases } = fakeDeps(["/p/gone.jpg"]);
    const items = [item({ id: "a", x: 120, y: 80 }), item({ id: "g", path: "/p/gone.jpg", x: 0, y: 0 })];
    const out = await renderArea({ x: 100, y: 50, w: 400, h: 300 }, items, "png", 0.5, deps);
    expect(canvases[0]).toMatchObject({ width: 200, height: 150 });
    expect(out.missing).toEqual(["/p/gone.jpg"]);
    // png: no white fill
    expect(ctx.fillRect).not.toHaveBeenCalled();
    // item a: center at (120-100+50, 80-50+25) = (70, 55) wall px, times 0.5
    expect(ctx.translate).toHaveBeenCalledWith(35, 27.5);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -25, -12.5, 50, 25);
  });

  it("fills white for jpg and rotates 90-degree items about their center", async () => {
    const { deps, ctx } = fakeDeps();
    const items = [item({ id: "r", x: 0, y: 0, w: 50, h: 100, rotation: 90 })];
    await renderArea({ x: 0, y: 0, w: 100, h: 100 }, items, "jpg", 1, deps);
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    // footprint is 50x100 rotated, so the bitmap draws as 100x50 centered
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -50, -25, 100, 50);
  });

  it("closes every bitmap it decodes", async () => {
    const { deps } = fakeDeps();
    await renderArea({ x: 0, y: 0, w: 100, h: 100 }, [item({})], "png", 1, deps);
    const bmp = await (deps.loadBitmap as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(bmp.close).toHaveBeenCalled();
  });
});

describe("exportArea", () => {
  beforeEach(() => {
    writeMock.mockReset();
  });

  it("encodes with the format's mime and writes through the image save path", async () => {
    const { deps, canvases } = fakeDeps();
    const out = await exportArea({ x: 0, y: 0, w: 100, h: 100 }, [item({})], "jpg", "/p/collage.jpg", deps);
    expect(out.missing).toEqual([]);
    expect(canvases[0].width).toBe(100);
    const blobCall = (canvases[0] as unknown as { convertToBlob: ReturnType<typeof vi.fn> }).convertToBlob.mock.calls[0][0];
    expect(blobCall).toEqual({ type: "image/jpeg", quality: 0.92 });
    expect(writeMock).toHaveBeenCalledWith("/p/collage.jpg", new Uint8Array([9]));
  });
});
