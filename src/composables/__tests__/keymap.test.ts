import { describe, it, expect } from "vitest";
import { resolveKey, type Command } from "../keymap";

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

  it("comma/period frame-step, angle brackets cycle speed", () => {
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
      action: { type: "cycleSpeed", direction: -1 },
    });
    expect(resolveKey(k(">", true), "video")).toEqual({
      target: "viewer",
      action: { type: "cycleSpeed", direction: 1 },
    });
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
});
