import { describe, it, expect, vi, beforeEach } from "vitest";

const readTextMock = vi.fn();
const writeTextMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...a: unknown[]) => readTextMock(...a),
  writeTextFile: (...a: unknown[]) => writeTextMock(...a),
}));
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

import {
  emptyDoc,
  nextFreeCompositionPath,
  nextFreeName,
  parseDoc,
  readCollage,
  relativizePath,
  resolvePath,
  serializeDoc,
  writeCollage,
} from "../collageFile";
import type { CollageDoc, CollageItem } from "../../types";

function item(over: Partial<CollageItem> = {}): CollageItem {
  return {
    id: "a",
    kind: "image",
    path: "C:\\Pics\\wall\\a.jpg",
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

describe("paths", () => {
  it("relativizes pictures inside the collage folder with forward slashes", () => {
    expect(relativizePath("C:\\Pics\\wall\\sub\\a.jpg", "C:\\Pics\\wall\\w.collage")).toBe("sub/a.jpg");
    expect(relativizePath("/p/wall/a.jpg", "/p/wall/w.collage")).toBe("a.jpg");
  });

  it("keeps pictures outside the folder absolute, and is separator-aware", () => {
    expect(relativizePath("C:\\Other\\a.jpg", "C:\\Pics\\wall\\w.collage")).toBe("C:\\Other\\a.jpg");
    expect(relativizePath("C:\\Pics\\wallpaper\\a.jpg", "C:\\Pics\\wall\\w.collage")).toBe(
      "C:\\Pics\\wallpaper\\a.jpg",
    );
  });

  it("ignores case on windows paths", () => {
    expect(relativizePath("c:\\pics\\WALL\\a.jpg", "C:\\Pics\\wall\\w.collage")).toBe("a.jpg");
  });

  it("resolves relative paths against the collage folder using its separator", () => {
    expect(resolvePath("sub/a.jpg", "C:\\Pics\\wall\\w.collage")).toBe("C:\\Pics\\wall\\sub\\a.jpg");
    expect(resolvePath("a.jpg", "/p/wall/w.collage")).toBe("/p/wall/a.jpg");
    expect(resolvePath("D:\\x\\a.jpg", "C:\\Pics\\wall\\w.collage")).toBe("D:\\x\\a.jpg");
    expect(resolvePath("/abs/a.jpg", "/p/wall/w.collage")).toBe("/abs/a.jpg");
  });
});

describe("parse and serialize", () => {
  it("round-trips a document and relativizes on write", () => {
    const doc: CollageDoc = { ...emptyDoc(), items: [item()] };
    const text = serializeDoc(doc, "C:\\Pics\\wall\\w.collage");
    expect(JSON.parse(text).items[0].path).toBe("a.jpg");
    const back = parseDoc(text);
    expect(back.items[0].w).toBe(100);
    expect(back.lockAspect).toBe(true);
    expect(back.exportFormat).toBe("png");
  });

  it("rejects wrong versions and malformed items", () => {
    expect(() => parseDoc("{not json")).toThrow(/invalid collage file/);
    expect(() => parseDoc(JSON.stringify({ version: 2, items: [] }))).toThrow(/unsupported collage version 2/);
    expect(() => parseDoc(JSON.stringify({ version: 1 }))).toThrow(/invalid collage file/);
    expect(() =>
      parseDoc(JSON.stringify({ version: 1, items: [{ id: "a", path: "a.jpg", x: "0" }] })),
    ).toThrow(/invalid collage file/);
  });

  it("defaults missing optional fields", () => {
    const back = parseDoc(JSON.stringify({ version: 1, items: [] }));
    expect(back.view).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(back.lockAspect).toBe(true);
    expect(back.exportFormat).toBe("png");
  });
});

describe("read and write", () => {
  beforeEach(() => {
    readTextMock.mockReset();
    writeTextMock.mockReset();
    invokeMock.mockReset();
  });

  it("readCollage resolves stored paths", async () => {
    readTextMock.mockResolvedValue(
      JSON.stringify({ version: 1, items: [{ ...item(), path: "a.jpg" }] }),
    );
    const doc = await readCollage("C:\\Pics\\wall\\w.collage");
    expect(doc.items[0].path).toBe("C:\\Pics\\wall\\a.jpg");
  });

  it("writeCollage writes relativized json", async () => {
    await writeCollage("C:\\Pics\\wall\\w.collage", { ...emptyDoc(), items: [item()] });
    const [path, text] = writeTextMock.mock.calls[0];
    expect(path).toBe("C:\\Pics\\wall\\w.collage");
    expect(JSON.parse(text).items[0].path).toBe("a.jpg");
  });
});

describe("composition names", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("picks collage, collage1, collage2 skipping taken names case-insensitively", () => {
    expect(nextFreeName([], "png")).toBe("collage.png");
    expect(nextFreeName(["Collage.png"], "png")).toBe("collage1.png");
    expect(nextFreeName(["collage.png", "collage1.png"], "png")).toBe("collage2.png");
    expect(nextFreeName(["collage.png"], "jpg")).toBe("collage.jpg");
  });

  it("nextFreeCompositionPath reads the folder listing", async () => {
    invokeMock.mockResolvedValue({ folders: [], files: [{ name: "collage.png" }] });
    expect(await nextFreeCompositionPath("C:\\Pics", "png")).toBe("C:\\Pics\\collage1.png");
    expect(invokeMock).toHaveBeenCalledWith("read_dir_entries", { path: "C:\\Pics" });
  });

  it("nextFreeCompositionPath starts fresh when the folder is unreadable", async () => {
    invokeMock.mockRejectedValue("nope");
    expect(await nextFreeCompositionPath("/p", "jpg")).toBe("/p/collage.jpg");
  });
});
