import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const listeners: Record<string, (e: { payload: { percent: number } }) => void> = {};
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, cb: (e: { payload: { percent: number } }) => void) => {
    listeners[name] = cb;
    return Promise.resolve(() => delete listeners[name]);
  },
}));

import {
  CAP_BYTES,
  ensureMp4,
  estimateClipBytes,
  formatMB,
  newClipName,
  useExport,
} from "../useExport";

describe("estimateClipBytes", () => {
  it("scales the source size by the kept fraction", () => {
    expect(estimateClipBytes(100 * 1024 * 1024, 60, 30)).toBe(50 * 1024 * 1024);
    expect(estimateClipBytes(100, 10, 2.5)).toBe(25);
  });
  it("guards zero and nonsense inputs", () => {
    expect(estimateClipBytes(0, 60, 30)).toBe(0);
    expect(estimateClipBytes(100, 0, 30)).toBe(0);
    expect(estimateClipBytes(100, 60, 0)).toBe(0);
    expect(estimateClipBytes(100, 60, 90)).toBe(100); // kept clamps at whole clip
  });
});

describe("formatMB", () => {
  it("formats with one decimal, trimming .0, rounding at 100+", () => {
    expect(formatMB(CAP_BYTES)).toBe("50 MB");
    expect(formatMB(12.34 * 1024 * 1024)).toBe("12.3 MB");
    expect(formatMB(123.6 * 1024 * 1024)).toBe("124 MB");
  });
});

describe("newClipName", () => {
  it("appends _clip.mp4 and dodges collisions case-insensitively", () => {
    expect(newClipName("round.mp4", [])).toBe("round_clip.mp4");
    expect(newClipName("round.mkv", ["round_clip.mp4"])).toBe("round_clip_2.mp4");
    expect(newClipName("round.mp4", ["ROUND_CLIP.MP4", "round_clip_2.mp4"])).toBe(
      "round_clip_3.mp4",
    );
  });
});

describe("ensureMp4", () => {
  it("forces the mp4 extension", () => {
    expect(ensureMp4("a.mkv")).toBe("a.mp4");
    expect(ensureMp4("a.mp4")).toBe("a.mp4");
    expect(ensureMp4("noext")).toBe("noext.mp4");
  });
});

describe("useExport", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("runs, tracks progress, resolves and unsubscribes", async () => {
    invokeMock.mockResolvedValue(undefined);
    const ex = useExport();
    const p = ex.run({
      input: "/a.mp4",
      output: "/a_clip.mp4",
      inSec: 1,
      outSec: 3,
      mode: "precise",
    });
    await Promise.resolve();
    expect(ex.running.value).toBe(true);
    listeners["export-progress"]({ payload: { percent: 40 } });
    expect(ex.percent.value).toBe(40);
    await p;
    expect(ex.running.value).toBe(false);
    expect(listeners["export-progress"]).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("export_clip", {
      req: expect.objectContaining({ mode: "precise" }),
    });
  });

  it("rejects with the backend error and stops running", async () => {
    invokeMock.mockRejectedValue("ffmpeg failed: boom");
    const ex = useExport();
    await expect(
      ex.run({ input: "/a.mp4", output: "/o.mp4", inSec: 0, outSec: 1, mode: "fast" }),
    ).rejects.toBe("ffmpeg failed: boom");
    expect(ex.running.value).toBe(false);
  });

  it("cancel invokes cancel_export", () => {
    const ex = useExport();
    invokeMock.mockResolvedValue(undefined);
    ex.cancel();
    expect(invokeMock).toHaveBeenCalledWith("cancel_export");
  });
});
