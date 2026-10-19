import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  actionHint,
  bindableCombo,
  comboFromEvent,
  defaultKeybinds,
  findConflict,
  formatCombo,
  validateKeybinds,
} from "../keybinds";

describe("keybinds", () => {
  it("defaults cover every action and match the table", () => {
    const d = defaultKeybinds();
    expect(Object.keys(d)).toHaveLength(ACTIONS.length);
    expect(d.prevFile).toBe("ArrowLeft");
    expect(d.seekBack).toBe("q");
    expect(d.pdfNextPage).toBe("ArrowDown");
    expect(d.collageSaveAs).toBe("ctrl+shift+s");
    expect(d.collageRemove).toBe("Delete");
  });
  it("the defaults have no conflicts", () => {
    const d = defaultKeybinds();
    for (const a of ACTIONS) expect(findConflict(d, a.id, d[a.id]!)).toBeNull();
  });
  it("builds canonical combos from events", () => {
    expect(comboFromEvent({ key: " ", shiftKey: false })).toBe("Space");
    expect(comboFromEvent({ key: "S", shiftKey: true, ctrlKey: true })).toBe("ctrl+shift+s");
    expect(comboFromEvent({ key: "s", shiftKey: false, metaKey: true })).toBe("ctrl+s");
    expect(comboFromEvent({ key: "q", shiftKey: false, altKey: true })).toBe("alt+q");
    expect(comboFromEvent({ key: "Shift", shiftKey: true })).toBeNull();
    expect(comboFromEvent({ key: "Control", shiftKey: false, ctrlKey: true })).toBeNull();
  });
  it("formats combos for display", () => {
    expect(formatCombo("ctrl+shift+s")).toBe("Ctrl+Shift+S");
    expect(formatCombo("ArrowLeft")).toBe("←");
    expect(formatCombo("ArrowDown")).toBe("↓");
    expect(formatCombo("PageUp")).toBe("PgUp");
    expect(formatCombo("Escape")).toBe("Esc");
    expect(formatCombo("Space")).toBe("Space");
    expect(formatCombo(",")).toBe(",");
    expect(formatCombo("q")).toBe("Q");
  });
  it("escape is never bindable and seek drops shift", () => {
    expect(bindableCombo("mute", "Escape")).toBeNull();
    expect(bindableCombo("mute", "shift+Escape")).toBeNull();
    expect(bindableCombo("seekBack", "shift+j")).toBe("j");
    expect(bindableCombo("mute", "shift+j")).toBe("shift+j");
  });
  it("conflicts only on a shared screen", () => {
    const d = defaultKeybinds();
    expect(findConflict(d, "mute", "f")).toBe("fullscreen");
    expect(findConflict(d, "imageFit", "m")).toBeNull();
    expect(findConflict(d, "nextFile", "q")).toBe("seekBack");
    expect(findConflict(d, "nextFile", "c")).toBe("enterCollage");
    expect(findConflict(d, "collageExit", "ArrowLeft")).toBeNull();
  });
  it("shift plus a seek key counts as taken in video only", () => {
    const d = defaultKeybinds();
    expect(findConflict(d, "mute", "shift+q")).toBe("seekBack");
    expect(findConflict(d, "nextFile", "shift+e")).toBe("seekForward");
    expect(findConflict(d, "imageRotate", "shift+q")).toBeNull();
    expect(findConflict({ ...d, mute: "shift+j" }, "seekBack", "j")).toBe("mute");
  });
  it("hints follow the skip step", () => {
    expect(actionHint("seekBack", 3)).toBe("3s, hold Shift for 6s");
    expect(actionHint("stepForward", 5)).toBe("tap for one frame, hold for slow motion");
    expect(actionHint("mute", 5)).toBeUndefined();
  });
  it("validation keeps good binds and nulls, drops junk", () => {
    const v = validateKeybinds({ mute: "j", fullscreen: null, playPause: 7, trimIn: "Escape", bogus: "x" });
    expect(v.mute).toBe("j");
    expect(v.fullscreen).toBeNull();
    expect(v.playPause).toBe("Space");
    expect(v.trimIn).toBe("i");
    expect(v.exitTrim).toBe("Escape");
    expect(validateKeybinds("nope")).toEqual(defaultKeybinds());
  });
  it("validation resolves saved conflicts deterministically, earlier action wins", () => {
    const v = validateKeybinds({ playPause: "m", mute: "m" });
    expect(v.playPause).toBe("m");
    expect(v.mute).toBeNull(); // its default "m" is taken too
    const w = validateKeybinds({ mute: "f" });
    expect(w.mute).toBe("f");
    expect(w.fullscreen).toBeNull();
    for (const a of ACTIONS) if (v[a.id]) expect(findConflict(v, a.id, v[a.id]!)).toBeNull();
  });
  it("validation rejects non-canonical and junk combos", () => {
    const v = validateKeybinds({
      mute: "Ctrl+S",
      fullscreen: "shift+ctrl+a",
      trimIn: "Q",
      trimOut: "Shift",
      playPause: "ctrl+",
      stepBack: "",
      stepForward: "ctrl+ctrl+a",
    });
    const d = defaultKeybinds();
    for (const id of ["mute", "fullscreen", "trimIn", "trimOut", "playPause", "stepBack", "stepForward"] as const) {
      expect(v[id]).toBe(d[id]);
    }
  });
  it("validation still accepts valid plus and modified keys", () => {
    const v = validateKeybinds({ mute: "shift++", trimIn: "ctrl+shift+q" });
    expect(v.mute).toBe("shift++");
    expect(v.trimIn).toBe("ctrl+shift+q");
  });
});
