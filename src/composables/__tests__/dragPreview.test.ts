import { describe, it, expect, vi, beforeEach } from "vitest";
import { filePreview, videoThumbnail } from "../dragPreview";

const ctx = {
  fillText: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
  measureText: () => ({ width: 60 }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  ctx.fillText.mockReset();
  ctx.drawImage.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,xyz");
  // jsdom does not implement media loading
  HTMLMediaElement.prototype.load = vi.fn();
});

describe("filePreview", () => {
  it("renders the file name onto a png data url", () => {
    expect(filePreview("clip.mp4")).toBe("data:image/png;base64,xyz");
    expect(ctx.fillText).toHaveBeenCalledWith("clip.mp4", 12, 14, expect.any(Number));
  });
});

describe("videoThumbnail", () => {
  function pending() {
    const created: HTMLVideoElement[] = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === "video") created.push(el as HTMLVideoElement);
      return el;
    });
    return created;
  }

  it("seeks into the clip, draws the frame scaled to 160px wide, and resolves a png", async () => {
    const videos = pending();
    const p = videoThumbnail("asset://c/clip.mp4");
    const v = videos[0];
    expect(v.src).toBe("asset://c/clip.mp4");
    Object.defineProperty(v, "duration", { value: 30 });
    Object.defineProperty(v, "videoWidth", { value: 1920 });
    Object.defineProperty(v, "videoHeight", { value: 1080 });
    v.dispatchEvent(new Event("loadedmetadata"));
    expect(v.currentTime).toBe(1);
    v.dispatchEvent(new Event("seeked"));
    await expect(p).resolves.toBe("data:image/png;base64,xyz");
    expect(ctx.drawImage).toHaveBeenCalledWith(v, 0, 0, 160, 90);
  });

  it("rejects when the video cannot load", async () => {
    const videos = pending();
    const p = videoThumbnail("asset://c/bad.mkv");
    videos[0].dispatchEvent(new Event("error"));
    await expect(p).rejects.toThrow("video failed to load");
  });
});
