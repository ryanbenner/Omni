import { describe, it, expect, beforeEach } from "vitest";
import { resolveKey, keyHint } from "../keymap";
import { settings, loadSettings } from "../settings";

type Mods = { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };
const k = (key: string, mods: Mods = {}) => ({ key, shiftKey: false, ...mods });

const prev = { target: "app", action: { type: "prevFile" } };
const next = { target: "app", action: { type: "nextFile" } };
const viewer = (action: object) => ({ target: "viewer", action });

describe("resolveKey", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("returns null with no stage", () => {
    expect(resolveKey(k("ArrowLeft"), null)).toBeNull();
  });

  it("arrows change files on video, image and pdf, not collage", () => {
    for (const kind of ["video", "image", "pdf"] as const) {
      expect(resolveKey(k("ArrowLeft"), kind)).toEqual(prev);
      expect(resolveKey(k("ArrowRight"), kind)).toEqual(next);
    }
    expect(resolveKey(k("ArrowLeft"), "collage")).toBeNull();
  });

  it("pgup/pgdn do nothing by default", () => {
    for (const kind of ["video", "image", "pdf"] as const) {
      expect(resolveKey(k("PageUp"), kind)).toBeNull();
      expect(resolveKey(k("PageDown"), kind)).toBeNull();
    }
  });

  it("q/e seek by the skip step, shift doubles", () => {
    expect(resolveKey(k("q"), "video")).toEqual(viewer({ type: "seek", seconds: -5 }));
    expect(resolveKey(k("Q", { shiftKey: true }), "video")).toEqual(
      viewer({ type: "seek", seconds: -10 }),
    );
    settings.video.skipStep = 3;
    expect(resolveKey(k("e"), "video")).toEqual(viewer({ type: "seek", seconds: 3 }));
    expect(resolveKey(k("E", { shiftKey: true }), "video")).toEqual(
      viewer({ type: "seek", seconds: 6 }),
    );
  });

  it("comma and period start a step", () => {
    expect(resolveKey(k(","), "video")).toEqual(viewer({ type: "stepStart", direction: -1 }));
    expect(resolveKey(k("."), "video")).toEqual(viewer({ type: "stepStart", direction: 1 }));
    expect(resolveKey(k("<", { shiftKey: true }), "video")).toBeNull();
  });

  it("up/down turn pdf pages, home/end jump", () => {
    expect(resolveKey(k("ArrowUp"), "pdf")).toEqual(viewer({ type: "pageStep", pages: -1 }));
    expect(resolveKey(k("ArrowDown"), "pdf")).toEqual(viewer({ type: "pageStep", pages: 1 }));
    expect(resolveKey(k("Home"), "pdf")).toEqual(viewer({ type: "pageJump", to: "first" }));
    expect(resolveKey(k("End"), "pdf")).toEqual(viewer({ type: "pageJump", to: "last" }));
  });

  it("maps the other per-screen actions", () => {
    expect(resolveKey(k(" "), "video")).toEqual(viewer({ type: "playPause" }));
    expect(resolveKey(k("f"), "video")).toEqual(viewer({ type: "toggleFullscreen" }));
    expect(resolveKey(k("i"), "video")).toEqual(viewer({ type: "setIn" }));
    expect(resolveKey(k("o"), "video")).toEqual(viewer({ type: "setOut" }));
    expect(resolveKey(k("Escape"), "video")).toEqual(viewer({ type: "exitTrim" }));
    expect(resolveKey(k("f"), "image")).toEqual(viewer({ type: "fit" }));
    expect(resolveKey(k("0"), "image")).toEqual(viewer({ type: "resetZoom" }));
    expect(resolveKey(k("r"), "image")).toEqual(viewer({ type: "rotate" }));
    expect(resolveKey(k("c"), "image")).toEqual(viewer({ type: "enterCollage" }));
    expect(resolveKey(k("f"), "pdf")).toEqual(viewer({ type: "fit" }));
    expect(resolveKey(k("l"), "collage")).toEqual(viewer({ type: "toggleLock" }));
    expect(resolveKey(k("r"), "collage")).toEqual(viewer({ type: "rotate" }));
    expect(resolveKey(k("Delete"), "collage")).toEqual(viewer({ type: "removeSelected" }));
    expect(resolveKey(k("Escape"), "collage")).toEqual(viewer({ type: "deselect" }));
    expect(resolveKey(k("f"), "collage")).toEqual(viewer({ type: "fitAll" }));
    expect(resolveKey(k("0"), "collage")).toEqual(viewer({ type: "resetZoom" }));
    expect(resolveKey(k("e"), "collage")).toEqual(viewer({ type: "exportArea" }));
    expect(resolveKey(k("m"), "collage")).toEqual(viewer({ type: "toggleMemory" }));
    expect(resolveKey(k("c"), "collage")).toEqual(viewer({ type: "exitCollage" }));
  });

  it("a rebound key takes effect and the old key stops working", () => {
    settings.keybinds.mute = "j";
    expect(resolveKey(k("j"), "video")).toEqual(viewer({ type: "toggleMute" }));
    expect(resolveKey(k("m"), "video")).toBeNull();
  });

  it("an unset action has no key", () => {
    settings.keybinds.fullscreen = null;
    expect(resolveKey(k("f"), "video")).toBeNull();
  });

  it("ctrl and cmd both save the collage", () => {
    expect(resolveKey(k("s", { ctrlKey: true }), "collage")).toEqual(viewer({ type: "save" }));
    expect(resolveKey(k("s", { metaKey: true }), "collage")).toEqual(viewer({ type: "save" }));
    expect(resolveKey(k("S", { ctrlKey: true, shiftKey: true }), "collage")).toEqual(
      viewer({ type: "saveAs" }),
    );
  });

  it("modifiers must match exactly", () => {
    expect(resolveKey(k("M", { shiftKey: true }), "video")).toBeNull();
    expect(resolveKey(k("f", { ctrlKey: true }), "collage")).toBeNull();
  });

  it("shift-retry on a rebound seek key doubles it", () => {
    settings.keybinds.seekBack = "ctrl+q";
    expect(resolveKey(k("Q", { ctrlKey: true, shiftKey: true }), "video")).toEqual(
      viewer({ type: "seek", seconds: -10 }),
    );
  });
});

describe("keyHint", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("shows the applied key or nothing", () => {
    expect(keyHint("imageFit")).toBe(" (F)");
    expect(keyHint("collageSaveAs")).toBe(" (Ctrl+Shift+S)");
    settings.keybinds.imageFit = null;
    expect(keyHint("imageFit")).toBe("");
  });
});
