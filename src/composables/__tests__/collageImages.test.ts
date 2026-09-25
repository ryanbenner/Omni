import { describe, it, expect, vi, beforeEach } from "vitest";

const readFileMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...a: unknown[]) => readFileMock(...a),
}));

import { loadImageMeta, makeThumb, readBitmap } from "../collageImages";

function fakeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

describe("collageImages", () => {
  const cib = vi.fn();
  beforeEach(() => {
    readFileMock.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
    cib.mockReset().mockResolvedValue(fakeBitmap(400, 200));
    (globalThis as { createImageBitmap: unknown }).createImageBitmap = cib;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/jpeg;base64,x");
  });

  it("readBitmap decodes at full size when no level is given", async () => {
    await readBitmap("/p/a.jpg");
    expect(readFileMock).toHaveBeenCalledWith("/p/a.jpg");
    expect(cib.mock.calls[0][1]).toEqual({ imageOrientation: "from-image" });
  });

  it("readBitmap resizes the longer side to the level, never above natural", async () => {
    await readBitmap("/p/a.jpg", 256, { w: 4000, h: 3000 });
    expect(cib.mock.calls[0][1]).toEqual({
      imageOrientation: "from-image",
      resizeWidth: 256,
      resizeQuality: "high",
    });
    await readBitmap("/p/b.jpg", 8192, { w: 300, h: 900 });
    expect(cib.mock.calls[1][1]).toEqual({
      imageOrientation: "from-image",
      resizeHeight: 900,
      resizeQuality: "high",
    });
  });

  it("loadImageMeta returns the natural size and a thumbnail, then closes the bitmap", async () => {
    const meta = await loadImageMeta("/p/a.jpg");
    expect(meta.w).toBe(400);
    expect(meta.h).toBe(200);
    expect(meta.thumb.startsWith("data:image/jpeg")).toBe(true);
    const bmp = await cib.mock.results[0].value;
    expect(bmp.close).toHaveBeenCalled();
  });

  it("makeThumb scales the longer side to 96 and never upscales", () => {
    const sizes: number[][] = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return { drawImage: vi.fn() };
    }) as never;
    makeThumb(fakeBitmap(400, 200));
    makeThumb(fakeBitmap(50, 20));
    expect(sizes).toEqual([
      [96, 48],
      [50, 20],
    ]);
  });
});
