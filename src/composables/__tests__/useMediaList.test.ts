import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick } from "vue";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import { useMediaList } from "../useMediaList";
import type { ScanResult } from "../../types";

const scanResult: ScanResult = {
  items: [
    { path: "/f/new.mp4", kind: "video", name: "new.mp4", mtime: 300 },
    { path: "/f/mid.jpg", kind: "image", name: "mid.jpg", mtime: 200 },
    { path: "/f/old.png", kind: "image", name: "old.png", mtime: 100 },
  ],
  startIndex: 1,
};

describe("useMediaList", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(scanResult);
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
});
