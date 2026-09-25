import { readFile, rename, writeFile } from "@tauri-apps/plugin-fs";

export const ENCODABLE = ["jpg", "jpeg", "png", "webp"];

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function canSave(ext: string, rotation: number): boolean {
  return rotation % 360 !== 0 && ENCODABLE.includes(ext.toLowerCase());
}

export function saveAsName(name: string): string {
  const i = name.lastIndexOf(".");
  const stem = i === -1 ? name : name.slice(0, i);
  const ext = extOf(name);
  const outExt = ENCODABLE.includes(ext) ? ext : "png";
  return `${stem}_edited.${outExt}`;
}

export function mimeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "webp") return "image/webp";
  return "image/png";
}

// write to a temp sibling then rename so a failed write never truncates the target
export async function writeImageBytes(destPath: string, bytes: Uint8Array): Promise<void> {
  const tmp = destPath + ".omnitmp";
  await writeFile(tmp, bytes);
  await rename(tmp, destPath);
}

// read bytes via fs plugin (avoids canvas taint from the asset protocol),
// bake the rotation on a canvas, write bytes back
export async function saveRotated(
  srcPath: string,
  destPath: string,
  rotation: number,
): Promise<void> {
  const bytes = await readFile(srcPath);
  const bitmap = await createImageBitmap(new Blob([bytes]), {
    imageOrientation: "from-image",
  });
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const type = mimeFor(extOf(destPath));
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      type,
      0.95,
    );
  });
  const bytes2 = new Uint8Array(await blob.arrayBuffer());
  await writeImageBytes(destPath, bytes2);
}
