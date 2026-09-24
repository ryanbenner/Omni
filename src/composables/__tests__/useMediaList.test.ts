import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick } from "vue";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (p: string) => `asset://${p}`,
}));
const watchMock = vi.fn();
const unwatchMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  watch: (...args: unknown[]) => watchMock(...args),
}));

import { useMediaList } from "../useMediaList";
import type { ScanResult } from "../../types";

const scanResult: ScanResult = {
  items: [
    { path: "/f/new.mp4", kind: "video", name: "new.mp4", mtime: 300, size: 0 },
    { path: "/f/mid.jpg", kind: "image", name: "mid.jpg", mtime: 200, size: 0 },
    { path: "/f/old.png", kind: "image", name: "old.png", mtime: 100, size: 0 },
  ],
  startIndex: 1,
};

describe("useMediaList", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // clone per call so tests that mutate items cannot bleed into each other
    invokeMock.mockImplementation(() => Promise.resolve(structuredClone(scanResult)));
    watchMock.mockImplementation(() => Promise.resolve(() => {}));
  });

  it("openFile scans and lands on the launched file", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    expect(invokeMock).toHaveBeenCalledWith("scan_media", { path: "/f/mid.jpg" });
    expect(list.items.value).toHaveLength(3);
    expect(list.current.value?.name).toBe("mid.jpg");
  });

  it("next/prev move and clamp at the ends", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    list.next();
    expect(list.current.value?.name).toBe("old.png");
    list.next(); // already last, clamps
    expect(list.current.value?.name).toBe("old.png");
    list.prev();
    list.prev();
    expect(list.current.value?.name).toBe("new.mp4");
    list.prev(); // already first, clamps
    expect(list.current.value?.name).toBe("new.mp4");
  });

  it("jumpTo ignores out-of-range indexes", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    list.jumpTo(0);
    expect(list.current.value?.name).toBe("new.mp4");
    list.jumpTo(99);
    expect(list.current.value?.name).toBe("new.mp4");
    list.jumpTo(-1);
    expect(list.current.value?.name).toBe("new.mp4");
  });

  it("preloads only adjacent images, never videos", async () => {
    const created: string[] = [];
    class FakeImage {
      set src(v: string) {
        created.push(v);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const list = useMediaList();
    await list.openFile("/f/mid.jpg"); // neighbors: new.mp4 (video), old.png (image)
    await nextTick();
    expect(created).toEqual(["asset:///f/old.png"]);
    vi.unstubAllGlobals();
  });

  it("openFile surfaces scan errors", async () => {
    invokeMock.mockRejectedValue("cannot open /bad: not found");
    const list = useMediaList();
    await list.openFile("/bad");
    expect(list.error.value).toContain("cannot open");
    expect(list.items.value).toHaveLength(0);
  });

  it("removeItem drops the entry and keeps a valid current", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg"); // lands on index 1 of 3
    list.removeItem("/f/mid.jpg");
    expect(list.items.value.map((i) => i.name)).toEqual(["new.mp4", "old.png"]);
    expect(list.current.value?.name).toBe("old.png"); // next file takes its place
    list.removeItem("/f/old.png");
    expect(list.current.value?.name).toBe("new.mp4"); // clamped back from the end
    list.removeItem("/f/new.mp4");
    expect(list.current.value).toBeNull();
    list.removeItem("/f/ghost.mp4"); // unknown path is a no-op
    expect(list.items.value).toHaveLength(0);
  });

  it("renameItem updates path and name in place", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    list.renameItem("/f/mid.jpg", "/f/renamed.jpg", "renamed.jpg");
    expect(list.current.value).toMatchObject({
      path: "/f/renamed.jpg",
      name: "renamed.jpg",
    });
    list.renameItem("/f/ghost.mp4", "/f/x.mp4", "x.mp4"); // no-op
    expect(list.items.value).toHaveLength(3);
  });
});

describe("useMediaList live updates", () => {
  const watchers = new Map<string, () => void>();
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const newer = { path: "/f/newer.mp4", kind: "video", name: "newer.mp4", mtime: 400, size: 0 };

  // scan_media answers openFile; read_dir_entries answers a folder re-read
  function wire(files: unknown[]) {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "scan_media") return Promise.resolve(structuredClone(scanResult));
      if (cmd === "read_dir_entries") return Promise.resolve({ folders: [], files });
      return Promise.reject(`unexpected ${cmd}`);
    });
  }

  beforeEach(() => {
    invokeMock.mockReset();
    watchers.clear();
    watchMock.mockReset();
    unwatchMock.mockReset();
    watchMock.mockImplementation((path: string, cb: () => void) => {
      watchers.set(path, cb);
      return Promise.resolve(() => {
        watchers.delete(path);
        unwatchMock(path);
      });
    });
    wire(scanResult.items);
  });

  it("openFile watches the file's folder", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    expect(watchMock).toHaveBeenCalledWith(
      "/f",
      expect.any(Function),
      expect.objectContaining({ recursive: false }),
    );
  });

  it("a new file in the folder joins the list without moving the current file", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    wire([newer, ...scanResult.items]);
    watchers.get("/f")!();
    await flush();
    expect(list.items.value.map((i) => i.name)).toEqual(["newer.mp4", "new.mp4", "mid.jpg", "old.png"]);
    expect(list.current.value?.name).toBe("mid.jpg");
  });

  it("the current file vanishing outside the app moves to its neighbor", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    wire(scanResult.items.filter((i) => i.name !== "mid.jpg"));
    watchers.get("/f")!();
    await flush();
    expect(list.current.value?.name).toBe("old.png");
  });

  it("opening a file in another folder swaps the watch", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    invokeMock.mockImplementation(() =>
      Promise.resolve({ items: [{ path: "/g/x.mp4", kind: "video", name: "x.mp4", mtime: 1, size: 0 }], startIndex: 0 }),
    );
    await list.openFile("/g/x.mp4");
    await flush();
    expect(unwatchMock).toHaveBeenCalledWith("/f");
    expect(watchers.has("/g")).toBe(true);
  });

  it("resync re-reads the current folder", async () => {
    const list = useMediaList();
    await list.openFile("/f/mid.jpg");
    wire([newer, ...scanResult.items]);
    await list.resync();
    expect(list.items.value).toHaveLength(4);
  });
});
