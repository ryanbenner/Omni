import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { CollageDoc, CollageItem, DirListing, ExportFormat } from "../types";
import { joinPath, parentDir, sepOf } from "./pathUtils";

export const COLLAGE_VERSION = 1;
export const COLLAGE_EXT = "collage";

export function emptyDoc(): CollageDoc {
  return {
    version: COLLAGE_VERSION,
    items: [],
    view: { x: 0, y: 0, zoom: 1 },
    lockAspect: true,
    exportFormat: "png",
  };
}

function isAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

function folderBase(folder: string): string {
  const sep = sepOf(folder);
  return folder.endsWith(sep) ? folder : folder + sep;
}

// windows paths compare case-insensitively; posix paths do not
function isUnder(child: string, folder: string): boolean {
  const base = folderBase(folder);
  const norm = (s: string) => (sepOf(folder) === "\\" ? s.toLowerCase() : s);
  return norm(child).startsWith(norm(base));
}

export function relativizePath(picturePath: string, collagePath: string): string {
  const folder = parentDir(collagePath);
  if (!isUnder(picturePath, folder)) return picturePath;
  const rel = picturePath.slice(folderBase(folder).length);
  return rel.split(sepOf(folder)).join("/");
}

export function resolvePath(stored: string, collagePath: string): string {
  if (isAbsolute(stored)) return stored;
  const folder = parentDir(collagePath);
  return folderBase(folder) + stored.split("/").join(sepOf(folder));
}

const ROTATIONS = [0, 90, 180, 270];

function validItem(raw: unknown): raw is CollageItem {
  const i = raw as Partial<CollageItem>;
  return (
    !!i &&
    typeof i === "object" &&
    typeof i.id === "string" &&
    typeof i.path === "string" &&
    [i.x, i.y, i.w, i.h, i.nw, i.nh, i.z].every((n) => typeof n === "number") &&
    ROTATIONS.includes(i.rotation as number)
  );
}

export function parseDoc(text: string): CollageDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("invalid collage file");
  }
  const d = raw as Partial<CollageDoc> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.items)) {
    throw new Error("invalid collage file");
  }
  if (d.version !== COLLAGE_VERSION) {
    throw new Error(`unsupported collage version ${String(d.version)}`);
  }
  if (!d.items.every(validItem)) throw new Error("invalid collage file");
  return {
    version: COLLAGE_VERSION,
    items: d.items.map((i) => ({ ...i, kind: "image" })),
    view: d.view ?? { x: 0, y: 0, zoom: 1 },
    lockAspect: d.lockAspect ?? true,
    exportFormat: d.exportFormat === "jpg" ? "jpg" : "png",
  };
}

export function serializeDoc(doc: CollageDoc, collagePath: string): string {
  const out: CollageDoc = {
    ...doc,
    items: doc.items.map((i) => ({ ...i, path: relativizePath(i.path, collagePath) })),
  };
  return JSON.stringify(out, null, 2);
}

export async function readCollage(path: string): Promise<CollageDoc> {
  const doc = parseDoc(await readTextFile(path));
  doc.items = doc.items.map((i) => ({ ...i, path: resolvePath(i.path, path) }));
  return doc;
}

export async function writeCollage(path: string, doc: CollageDoc): Promise<void> {
  await writeTextFile(path, serializeDoc(doc, path));
}

export function nextFreeName(existing: Iterable<string>, ext: ExportFormat): string {
  const taken = new Set([...existing].map((n) => n.toLowerCase()));
  for (let n = 0; ; n++) {
    const name = `collage${n === 0 ? "" : n}.${ext}`;
    if (!taken.has(name)) return name;
  }
}

// read_dir_entries lists png/jpg, which is every name the rule can collide with
export async function nextFreeCompositionPath(folder: string, ext: ExportFormat): Promise<string> {
  let names: string[] = [];
  try {
    const listing = await invoke<DirListing>("read_dir_entries", { path: folder });
    names = listing.files.map((f) => f.name);
  } catch {
    // unreadable folder: the save dialog will surface the real problem
  }
  return joinPath(folder, nextFreeName(names, ext));
}
