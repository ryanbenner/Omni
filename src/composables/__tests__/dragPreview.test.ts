import { describe, it, expect, vi } from "vitest";
import { filePreview } from "../dragPreview";

describe("filePreview", () => {
  it("renders the file name onto a png data url", () => {
    const fillText = vi.fn();
    const ctx = {
      fillText,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: () => ({ width: 60 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,xyz");
    expect(filePreview("clip.mp4")).toBe("data:image/png;base64,xyz");
    expect(fillText).toHaveBeenCalledWith("clip.mp4", 12, 14, expect.any(Number));
  });
});
