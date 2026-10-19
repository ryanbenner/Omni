import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";
import { settings, loadSettings, DEFAULTS } from "../settings";
import { defaultKeybinds } from "../keybinds";

const KEY = "mv-settings";

describe("settings store", () => {
  beforeEach(() => localStorage.clear());

  it("keybinds start at the defaults when nothing is saved", () => {
    loadSettings();
    expect(settings.keybinds).toEqual(defaultKeybinds());
  });

  it("loads saved keybinds through validation", () => {
    localStorage.setItem(KEY, JSON.stringify({ keybinds: { mute: "f", seekBack: "shift+j" } }));
    loadSettings();
    expect(settings.keybinds.mute).toBe("f");
    expect(settings.keybinds.fullscreen).toBeNull();
    expect(settings.keybinds.seekBack).toBe("q"); // shift on seek is invalid, default kept
  });

  it("a keybinds section that is not an object gives the defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({ keybinds: [] }));
    loadSettings();
    expect(settings.keybinds).toEqual(defaultKeybinds());
  });

  it("starts from the defaults when nothing is saved", () => {
    loadSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("merges a partial save over the defaults and drops unknown keys", () => {
    localStorage.setItem(KEY, JSON.stringify({ video: { defaultSpeed: 2, extra: 1 }, nope: { a: 1 } }));
    loadSettings();
    expect(settings.video.defaultSpeed).toBe(2);
    expect(settings.video.clipCapMb).toBe(50);
    expect(settings.general).toEqual(DEFAULTS.general);
    expect("nope" in settings).toBe(false);
    expect("extra" in settings.video).toBe(false);
  });

  it("ignores bad json", () => {
    localStorage.setItem(KEY, "{not json");
    loadSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("rejects wrong types, out-of-range, non-integer and non-listed values field by field", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        general: { sidebarAtLaunch: "yes", offerResume: false },
        video: { defaultSpeed: 0.75, volume: 1.5, clipCapMb: 2.5, muted: 1 },
        image: { zoomStep: "huge" },
        collage: { memoryCapGb: 0, jpgQuality: 101 },
      }),
    );
    loadSettings();
    expect(settings.general.sidebarAtLaunch).toBe(true);
    expect(settings.general.offerResume).toBe(false);
    expect(settings.video.defaultSpeed).toBe(1);
    expect(settings.video.volume).toBe(1);
    expect(settings.video.clipCapMb).toBe(50);
    expect(settings.video.muted).toBe(false);
    expect(settings.image.zoomStep).toBe("normal");
    expect(settings.collage.memoryCapGb).toBe(6);
    expect(settings.collage.jpgQuality).toBe(92);
  });

  it("accepts a zero volume", () => {
    localStorage.setItem(KEY, JSON.stringify({ video: { volume: 0 } }));
    loadSettings();
    expect(settings.video.volume).toBe(0);
  });

  it("a section that is not an object is skipped", () => {
    localStorage.setItem(KEY, JSON.stringify({ general: "nope", image: 5, collage: null }));
    loadSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("resets in place, so a second load forgets the first", () => {
    localStorage.setItem(KEY, JSON.stringify({ image: { zoomStep: "fine" } }));
    loadSettings();
    expect(settings.image.zoomStep).toBe("fine");
    localStorage.clear();
    loadSettings();
    expect(settings.image.zoomStep).toBe("normal");
  });

  it("does not write while loading, and writes the whole object after a change", async () => {
    localStorage.setItem(KEY, JSON.stringify({ collage: { jpgQuality: 80 } }));
    loadSettings();
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ collage: { jpgQuality: 80 } });
    settings.collage.jpgQuality = 70;
    await nextTick();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.collage.jpgQuality).toBe(70);
    expect(saved.general).toEqual(DEFAULTS.general);
  });

  it("survives a storage that throws", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => loadSettings()).not.toThrow();
    expect(settings).toEqual(DEFAULTS);
    settings.general.offerResume = true;
    await nextTick();
    expect(set).toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });

  it("general gains wrap, hidden, reopen and confirm fields with today's defaults", () => {
    loadSettings();
    expect(settings.general).toEqual({
      sidebarAtLaunch: true,
      offerResume: false,
      wrapAround: false,
      showHidden: false,
      reopen: "off",
      confirmDelete: true,
      openPinFirst: false,
    });
  });

  it("video gains skip, start, loop, hold, hide and cap fields with today's defaults", () => {
    loadSettings();
    expect(settings.video).toEqual({
      defaultSpeed: 1,
      persistentVolume: false,
      volume: 1,
      muted: false,
      clipCapMb: 50,
      skipStep: 5,
      startPaused: false,
      loop: false,
      holdRate: 2,
      hideControlsMs: 2500,
      capByDefault: false,
    });
  });

  it("validates the new video fields one by one", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        video: { skipStep: 15, startPaused: true, loop: "yes", holdRate: 0, hideControlsMs: 0, capByDefault: true, clipCapMb: 100 },
      }),
    );
    loadSettings();
    expect(settings.video.skipStep).toBe(15);
    expect(settings.video.startPaused).toBe(true);
    expect(settings.video.loop).toBe(false);
    expect(settings.video.holdRate).toBe(0);
    expect(settings.video.hideControlsMs).toBe(0);
    expect(settings.video.capByDefault).toBe(true);
    expect(settings.video.clipCapMb).toBe(100);
    localStorage.setItem(
      KEY,
      JSON.stringify({ video: { skipStep: 7, holdRate: 4, hideControlsMs: 3000, clipCapMb: 9 } }),
    );
    loadSettings();
    expect(settings.video.skipStep).toBe(5);
    expect(settings.video.holdRate).toBe(2);
    expect(settings.video.hideControlsMs).toBe(2500);
    expect(settings.video.clipCapMb).toBe(50);
    localStorage.setItem(KEY, JSON.stringify({ video: { clipCapMb: 101 } }));
    loadSettings();
    expect(settings.video.clipCapMb).toBe(50);
  });

  it("validates the new general fields one by one", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        general: { wrapAround: true, showHidden: "yes", reopen: "file", confirmDelete: 0, openPinFirst: true },
      }),
    );
    loadSettings();
    expect(settings.general.openPinFirst).toBe(true);
    expect(settings.general.wrapAround).toBe(true);
    expect(settings.general.showHidden).toBe(false);
    expect(settings.general.reopen).toBe("file");
    expect(settings.general.confirmDelete).toBe(true);
    localStorage.setItem(KEY, JSON.stringify({ general: { reopen: "always" } }));
    loadSettings();
    expect(settings.general.reopen).toBe("off");
  });
});
