import { describe, it, expect } from "vitest";
import { canSave, saveAsName, mimeFor } from "../useImageSave";

describe("canSave", () => {
  it("requires a nonzero rotation and a re-encodable format", () => {
    expect(canSave("jpg", 90)).toBe(true);
    expect(canSave("jpeg", 270)).toBe(true);
    expect(canSave("png", 180)).toBe(true);
    expect(canSave("webp", 90)).toBe(true);
    expect(canSave("jpg", 0)).toBe(false);
    expect(canSave("jpg", 360)).toBe(false);
    expect(canSave("gif", 90)).toBe(false);
    expect(canSave("heic", 90)).toBe(false);
    expect(canSave("bmp", 90)).toBe(false);
  });
});

describe("saveAsName", () => {
  it("appends _edited, keeping re-encodable extensions", () => {
    expect(saveAsName("photo.jpg")).toBe("photo_edited.jpg");
    expect(saveAsName("shot.PNG")).toBe("shot_edited.png");
  });
  it("falls back to png for formats canvas cannot encode", () => {
    expect(saveAsName("anim.gif")).toBe("anim_edited.png");
    expect(saveAsName("old.bmp")).toBe("old_edited.png");
    expect(saveAsName("pic.heic")).toBe("pic_edited.png");
  });
});

describe("mimeFor", () => {
  it("maps extensions to encoder mime types", () => {
    expect(mimeFor("jpg")).toBe("image/jpeg");
    expect(mimeFor("jpeg")).toBe("image/jpeg");
    expect(mimeFor("png")).toBe("image/png");
    expect(mimeFor("webp")).toBe("image/webp");
    expect(mimeFor("gif")).toBe("image/png");
  });
});
