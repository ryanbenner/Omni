import { readFile } from "@tauri-apps/plugin-fs";

const THUMB_LONG_SIDE = 96;

// bytes come through the fs plugin, not the asset protocol, so the result
// is not a tainted canvas and can be read back for thumbnails and export
export async function readBitmap(
  path: string,
  level?: number,
  natural?: { w: number; h: number },
): Promise<ImageBitmap> {
  const blob = new Blob([await readFile(path)]);
  const opts: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (level && natural) {
    // one side given: the browser keeps the aspect ratio for the other
    if (natural.w >= natural.h) opts.resizeWidth = Math.min(level, natural.w);
    else opts.resizeHeight = Math.min(level, natural.h);
    opts.resizeQuality = "high";
  }
  return createImageBitmap(blob, opts);
}

export function makeThumb(bmp: ImageBitmap, long = THUMB_LONG_SIDE): string {
  const s = Math.min(1, long / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

export async function loadImageMeta(path: string): Promise<{ w: number; h: number; thumb: string }> {
  const bmp = await readBitmap(path);
  try {
    return { w: bmp.width, h: bmp.height, thumb: makeThumb(bmp) };
  } finally {
    bmp.close();
  }
}
