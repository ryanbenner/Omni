import type { CollageItem, ExportFormat, Rect } from "../types";
import { readBitmap } from "./collageImages";
import { rectsOverlap } from "./collageGeometry";
import { mimeFor, writeImageBytes } from "./useImageSave";

export const MAX_EXPORT_SIDE = 16384;
export const MAX_EXPORT_PIXELS = 268_435_456;
const JPG_QUALITY = 0.92;

export interface Ctx2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  drawImage(img: ImageBitmap, x: number, y: number, w: number, h: number): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): Ctx2D | null;
  convertToBlob(opts: { type: string; quality?: number }): Promise<Blob>;
}

export interface RenderDeps {
  loadBitmap(path: string): Promise<ImageBitmap>;
  makeCanvas(w: number, h: number): CanvasLike;
}

export const browserDeps: RenderDeps = {
  loadBitmap: (path) => readBitmap(path),
  makeCanvas: (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
};

export function validateArea(rect: Rect): string | null {
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  if (w < 1 || h < 1) return "The export area is empty.";
  if (w > MAX_EXPORT_SIDE || h > MAX_EXPORT_SIDE) {
    return `The export area is too large: each side must be 16,384 px or less (this one is ${w} × ${h}).`;
  }
  // at the max side, w*h lands exactly on the limit, so this only fires for
  // areas that are large in both dimensions without both hitting the side cap
  if (w * h > MAX_EXPORT_PIXELS) {
    return `The export area is too large: at most 268 million pixels (this one is ${w} × ${h}).`;
  }
  return null;
}

export function itemsInArea(items: CollageItem[], rect: Rect): CollageItem[] {
  return items.filter((i) => rectsOverlap(i, rect)).sort((a, b) => a.z - b.z);
}

// draws every item in the area into a canvas of the area's size times
// `scale`; the same code serves the preview (scale < 1) and the file (1)
export async function renderArea(
  rect: Rect,
  items: CollageItem[],
  format: ExportFormat,
  scale: number,
  deps: RenderDeps,
): Promise<{ canvas: CanvasLike; missing: string[] }> {
  const canvas = deps.makeCanvas(
    Math.max(1, Math.round(rect.w * scale)),
    Math.max(1, Math.round(rect.h * scale)),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const missing: string[] = [];
  for (const it of itemsInArea(items, rect)) {
    let bmp: ImageBitmap;
    try {
      bmp = await deps.loadBitmap(it.path);
    } catch {
      missing.push(it.path);
      continue;
    }
    try {
      const swap = it.rotation === 90 || it.rotation === 270;
      // the footprint is post-rotation; the bitmap draws unrotated then turns
      const dw = swap ? it.h : it.w;
      const dh = swap ? it.w : it.h;
      const cx = (it.x - rect.x + it.w / 2) * scale;
      const cy = (it.y - rect.y + it.h / 2) * scale;
      ctx.save();
      ctx.translate(cx, cy);
      if (it.rotation) ctx.rotate((it.rotation * Math.PI) / 180);
      ctx.drawImage(bmp, (-dw / 2) * scale, (-dh / 2) * scale, dw * scale, dh * scale);
      ctx.restore();
    } finally {
      bmp.close();
    }
  }
  return { canvas, missing };
}

export async function exportArea(
  rect: Rect,
  items: CollageItem[],
  format: ExportFormat,
  destPath: string,
  deps: RenderDeps,
): Promise<{ missing: string[] }> {
  const { canvas, missing } = await renderArea(rect, items, format, 1, deps);
  const blob = await canvas.convertToBlob(
    format === "jpg" ? { type: mimeFor("jpg"), quality: JPG_QUALITY } : { type: mimeFor("png") },
  );
  await writeImageBytes(destPath, new Uint8Array(await blob.arrayBuffer()));
  return { missing };
}
