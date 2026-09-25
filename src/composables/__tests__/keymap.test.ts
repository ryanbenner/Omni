import { describe, it, expect } from "vitest";
import { resolveKey, resolveKeyUp, type Command } from "../keymap";

const k = (key: string, shiftKey = false) => ({ key, shiftKey });

describe("resolveKey", () => {
  it("pgup/pgdn always navigate files regardless of kind", () => {
    expect(resolveKey(k("PageUp"), "video")).toEqual({
      target: "app",
      action: { type: "prevFile" },
    });
    expect(resolveKey(k("PageDown"), "image")).toEqual({
      target: "app",
      action: { type: "nextFile" },
    });
  });

  it("arrows on images navigate files", () => {
    expect(resolveKey(k("ArrowLeft"), "image")).toEqual({
      target: "app",
      action: { type: "prevFile" },
    });
    expect(resolveKey(k("ArrowRight"), "image")).toEqual({
      target: "app",
      action: { type: "nextFile" },
    });
  });

  it("arrows on video seek 5s with file-nav fallback", () => {
    expect(resolveKey(k("ArrowRight"), "video")).toEqual({
      target: "viewer",
      action: { type: "seek", seconds: 5 },
      fallback: { type: "nextFile" },
    });
    expect(resolveKey(k("ArrowLeft"), "video")).toEqual({
      target: "viewer",
      action: { type: "seek", seconds: -5 },
      fallback: { type: "prevFile" },
    });
  });

  it("shift+arrows on video seek 10s", () => {
    const cmd = resolveKey(k("ArrowRight", true), "video") as Command;
    expect(cmd).toMatchObject({ action: { type: "seek", seconds: 10 } });
  });

  it("space toggles play on video only", () => {
    expect(resolveKey(k(" "), "video")).toEqual({
      target: "viewer",
      action: { type: "playPause" },
    });
    expect(resolveKey(k(" "), "image")).toBeNull();
  });

  it("comma/period frame-step, angle brackets start shuttle", () => {
    expect(resolveKey(k(","), "video")).toEqual({
      target: "viewer",
      action: { type: "frameStep", frames: -1 },
    });
    expect(resolveKey(k("."), "video")).toEqual({
      target: "viewer",
      action: { type: "frameStep", frames: 1 },
    });
    expect(resolveKey(k("<", true), "video")).toEqual({
      target: "viewer",
      action: { type: "shuttleStart", direction: -1 },
    });
    expect(resolveKey(k(">", true), "video")).toEqual({
      target: "viewer",
      action: { type: "shuttleStart", direction: 1 },
    });
  });

  it("releasing angle brackets stops the shuttle on video only", () => {
    expect(resolveKeyUp(k("<", true), "video")).toEqual({
      target: "viewer",
      action: { type: "shuttleStop", direction: -1 },
    });
    expect(resolveKeyUp(k(">", true), "video")).toEqual({
      target: "viewer",
      action: { type: "shuttleStop", direction: 1 },
    });
    expect(resolveKeyUp(k(">", true), "image")).toBeNull();
    expect(resolveKeyUp(k("m"), "video")).toBeNull();
  });

  it("m mutes and f fullscreens video; f fits image", () => {
    expect(resolveKey(k("m"), "video")).toEqual({
      target: "viewer",
      action: { type: "toggleMute" },
    });
    expect(resolveKey(k("F"), "video")).toEqual({
      target: "viewer",
      action: { type: "toggleFullscreen" },
    });
    expect(resolveKey(k("f"), "image")).toEqual({
      target: "viewer",
      action: { type: "fit" },
    });
  });

  it("image zoom/rotate keys", () => {
    expect(resolveKey(k("0"), "image")).toEqual({
      target: "viewer",
      action: { type: "resetZoom" },
    });
    expect(resolveKey(k("r"), "image")).toEqual({
      target: "viewer",
      action: { type: "rotate" },
    });
    expect(resolveKey(k("r"), "video")).toBeNull();
  });

  it("returns null with no media loaded or for unmapped keys", () => {
    expect(resolveKey(k("ArrowRight"), null)).toBeNull();
    expect(resolveKey(k("q"), "video")).toBeNull();
  });

  it("i, o and escape map to trim actions on video only", () => {
    expect(resolveKey(k("i"), "video")).toEqual({
      target: "viewer",
      action: { type: "setIn" },
    });
    expect(resolveKey(k("O"), "video")).toEqual({
      target: "viewer",
      action: { type: "setOut" },
    });
    expect(resolveKey(k("Escape"), "video")).toEqual({
      target: "viewer",
      action: { type: "exitTrim" },
    });
    expect(resolveKey(k("i"), "image")).toBeNull();
    expect(resolveKey(k("Escape"), "image")).toBeNull();
  });
});

describe("collage keys", () => {
  const c = (key: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean }> = {}) => ({
    key,
    shiftKey: false,
    ...mods,
  });
  const viewer = (type: string) => ({ target: "viewer", action: { type } });

  it("maps the wall's single keys", () => {
    expect(resolveKey(c("l"), "collage")).toEqual(viewer("toggleLock"));
    expect(resolveKey(c("r"), "collage")).toEqual(viewer("rotate"));
    expect(resolveKey(c("Delete"), "collage")).toEqual(viewer("removeSelected"));
    expect(resolveKey(c("Backspace"), "collage")).toEqual(viewer("removeSelected"));
    expect(resolveKey(c("Escape"), "collage")).toEqual(viewer("deselect"));
    expect(resolveKey(c("f"), "collage")).toEqual(viewer("fitAll"));
    expect(resolveKey(c("0"), "collage")).toEqual(viewer("resetZoom"));
    expect(resolveKey(c("e"), "collage")).toEqual(viewer("exportArea"));
    expect(resolveKey(c("m"), "collage")).toEqual(viewer("toggleMemory"));
    expect(resolveKey(c("c"), "collage")).toEqual(viewer("exitCollage"));
  });

  it("maps ctrl+s and ctrl+shift+s to save and save as", () => {
    expect(resolveKey(c("s", { ctrlKey: true }), "collage")).toEqual(viewer("save"));
    expect(resolveKey(c("S", { ctrlKey: true, shiftKey: true }), "collage")).toEqual(viewer("saveAs"));
    expect(resolveKey(c("s"), "collage")).toBeNull();
  });

  it("does not navigate files on the wall and does not leak into other kinds", () => {
    expect(resolveKey(c("PageDown"), "collage")).toBeNull();
    expect(resolveKey(c("ArrowRight"), "collage")).toBeNull();
    expect(resolveKey(c("e"), "image")).toBeNull();
    expect(resolveKey(c("l"), "video")).toBeNull();
    expect(resolveKeyUp(c("<"), "collage")).toBeNull();
  });
});
