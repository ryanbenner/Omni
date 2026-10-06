import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import { invoke } from "@tauri-apps/api/core";
import VideoPlayer from "../VideoPlayer.vue";
import type { MediaItem } from "../../types";
import { settings, loadSettings } from "../../composables/settings";

const item: MediaItem = { path: "/f/a.mp4", kind: "video", name: "a.mp4", mtime: 1, size: 0 };

const mounted: ReturnType<typeof mount>[] = [];

// leaked players answer store watchers
afterEach(() => {
  mounted.forEach((w) => w.unmount());
  mounted.length = 0;
});

function mountPlayer(paused: boolean) {
  const w = mount(VideoPlayer, { props: { item } });
  mounted.push(w);
  const el = w.find("video").element as HTMLVideoElement;
  // jsdom media elements never play: fake the state the feature keys off
  Object.defineProperty(el, "paused", { value: paused, configurable: true });
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  el.play = play;
  el.pause = pause;
  return { w, el, play, pause };
}

// jsdom lacks PointerEvent and its MouseEvent has read-only fields, so the
// pointer sequence is dispatched by hand instead of through trigger()
async function fire(w: ReturnType<typeof mount>, el: Element, type: string, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await w.vm.$nextTick();
}

describe("VideoPlayer hold to speed up", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holding left click on a playing video runs at 2x until release", async () => {
    const { w, el, pause } = mountPlayer(false);
    const video = w.find("video");
    await fire(w, video.element, "pointerdown", { button: 0 });
    expect(el.playbackRate).toBe(1);
    vi.advanceTimersByTime(300);
    await w.vm.$nextTick();
    expect(el.playbackRate).toBe(2);
    expect(w.find(".speed-chip").text()).toBe("2x");
    await fire(w, video.element, "pointerup");
    await fire(w, video.element, "click");
    expect(el.playbackRate).toBe(1);
    expect(w.find(".speed-chip").text()).toBe("1x");
    expect(pause).not.toHaveBeenCalled();
  });

  it("a short click still toggles play/pause", async () => {
    const { w, pause } = mountPlayer(false);
    const video = w.find("video");
    await fire(w, video.element, "pointerdown", { button: 0 });
    vi.advanceTimersByTime(100);
    await fire(w, video.element, "pointerup");
    await fire(w, video.element, "click");
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("holding on a paused video does nothing and release plays", async () => {
    const { w, el, play } = mountPlayer(true);
    const video = w.find("video");
    await fire(w, video.element, "pointerdown", { button: 0 });
    vi.advanceTimersByTime(300);
    expect(el.playbackRate).toBe(1);
    await fire(w, video.element, "pointerup");
    await fire(w, video.element, "click");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("restores a non-default chosen speed after the hold", async () => {
    const { w, el } = mountPlayer(false);
    await w.find(".speed-chip").trigger("click");
    const opts = w.findAll(".speed-opt");
    await opts.find((o) => o.text() === "0.5x")!.trigger("click");
    expect(el.playbackRate).toBe(0.5);
    const video = w.find("video");
    await fire(w, video.element, "pointerdown", { button: 0 });
    vi.advanceTimersByTime(300);
    expect(el.playbackRate).toBe(2);
    await fire(w, video.element, "pointerup");
    expect(el.playbackRate).toBe(0.5);
  });
});

describe("VideoPlayer settings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("starts at the configured default and returns to it on a new file", async () => {
    settings.video.defaultSpeed = 1.5;
    const { w, el } = mountPlayer(false);
    expect(w.find(".speed-chip").text()).toBe("1.5x");
    el.dispatchEvent(new Event("loadedmetadata"));
    expect(el.playbackRate).toBe(1.5);
    await w.find(".speed-chip").trigger("click");
    await w.findAll(".speed-opt").find((o) => o.text() === "0.5x")!.trigger("click");
    expect(el.playbackRate).toBe(0.5);
    await w.setProps({ item: { ...item, path: "/f/b.mp4", name: "b.mp4" } });
    expect(w.find(".speed-chip").text()).toBe("1.5x");
  });

  it("the export panel shows the configured cap", async () => {
    settings.video.clipCapMb = 25;
    const { w, el } = mountPlayer(true);
    Object.defineProperty(el, "duration", { value: 30, configurable: true });
    await w.find("button[title='Trim clip']").trigger("click");
    expect(w.find(".cap").text()).toContain("25 MB");
  });

  it("with persistent volume on, seeds from the store and mirrors both ways", async () => {
    settings.video.persistentVolume = true;
    settings.video.volume = 0.4;
    settings.video.muted = true;
    const { w, el } = mountPlayer(false);
    el.dispatchEvent(new Event("loadedmetadata"));
    expect(el.volume).toBe(0.4);
    expect(el.muted).toBe(true);
    await w.find(".volume").setValue("0.7");
    await w.vm.$nextTick();
    expect(settings.video.volume).toBe(0.7);
    settings.video.volume = 0.2;
    settings.video.muted = false;
    await w.vm.$nextTick();
    expect(el.volume).toBe(0.2);
    expect(el.muted).toBe(false);
  });

  it("clip name checks read the folder with hidden files included", async () => {
    const { w, el } = mountPlayer(true);
    Object.defineProperty(el, "duration", { value: 30, configurable: true });
    await w.find("button[title='Trim clip']").trigger("click");
    await w.find(".btn-primary").trigger("click");
    await w.vm.$nextTick();
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("read_dir_entries", { path: "/f", showHidden: true });
  });
});

describe("VideoPlayer volume bar", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("drops the slider to zero while muted and restores it on unmute", async () => {
    const { w, el } = mountPlayer(false);
    await w.find(".volume").setValue("0.6");
    expect((w.find(".volume").element as HTMLInputElement).value).toBe("0.6");
    await w.find("button[title='Mute (M)']").trigger("click");
    expect(el.muted).toBe(true);
    expect((w.find(".volume").element as HTMLInputElement).value).toBe("0");
    await w.find("button[title='Mute (M)']").trigger("click");
    expect(el.muted).toBe(false);
    expect((w.find(".volume").element as HTMLInputElement).value).toBe("0.6");
  });

  it("dragging the slider while muted unmutes", async () => {
    const { w, el } = mountPlayer(false);
    await w.find("button[title='Mute (M)']").trigger("click");
    expect(el.muted).toBe(true);
    await w.find(".volume").setValue("0.3");
    expect(el.muted).toBe(false);
    expect(el.volume).toBeCloseTo(0.3);
  });
});

describe("VideoPlayer play/pause flash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    loadSettings();
  });
  afterEach(() => vi.useRealTimers());

  it("a paused video shows no badge until something toggles it", () => {
    const { w } = mountPlayer(true);
    expect(w.find(".play-badge").exists()).toBe(false);
  });

  it("starting playback flashes the play icon and it is gone after 200 ms", async () => {
    const { w, el } = mountPlayer(true);
    await w.find(".play-btn").trigger("click");
    expect(el.play).toHaveBeenCalledOnce();
    const badge = w.find(".play-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.find("i").classes()).toContain("ph-play");
    vi.advanceTimersByTime(199);
    await w.vm.$nextTick();
    expect(w.find(".play-badge").exists()).toBe(true);
    vi.advanceTimersByTime(1);
    await w.vm.$nextTick();
    expect(w.find(".play-badge").exists()).toBe(false);
  });

  it("pausing flashes the pause icon, and a click on the video flashes too", async () => {
    const { w, el, pause } = mountPlayer(false);
    await w.find(".play-btn").trigger("click");
    expect(pause).toHaveBeenCalledOnce();
    expect(w.find(".play-badge i").classes()).toContain("ph-pause");
    vi.advanceTimersByTime(200);
    await w.vm.$nextTick();
    expect(w.find(".play-badge").exists()).toBe(false);
    Object.defineProperty(el, "paused", { value: true, configurable: true });
    await w.find("video").trigger("click");
    expect(w.find(".play-badge i").classes()).toContain("ph-play");
  });
});

describe("VideoPlayer file name in the letterbox band", () => {
  const rectStub = (w: number, h: number) => () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const original = HTMLElement.prototype.getBoundingClientRect;
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
  });

  function mountWithBand(showName: boolean, wrapW: number, wrapH: number) {
    HTMLElement.prototype.getBoundingClientRect = rectStub(wrapW, wrapH);
    const w = mount(VideoPlayer, { props: { item, showName } });
    const el = w.find("video").element as HTMLVideoElement;
    Object.defineProperty(el, "videoWidth", { value: 1920, configurable: true });
    Object.defineProperty(el, "videoHeight", { value: 1080, configurable: true });
    el.play = vi.fn().mockResolvedValue(undefined);
    return { w, el };
  }

  it("shows the full name when the tree is open and the video leaves a band above it", async () => {
    const { w, el } = mountWithBand(true, 800, 900); // 16:9 in a tall wrap: 225px band each side
    el.dispatchEvent(new Event("loadedmetadata"));
    await w.vm.$nextTick();
    const name = w.find(".file-name");
    expect(name.exists()).toBe(true);
    expect(name.text()).toBe("a.mp4");
  });

  it("hides it when the video fills the wrap", async () => {
    const { w, el } = mountWithBand(true, 800, 450); // exact 16:9: no band
    el.dispatchEvent(new Event("loadedmetadata"));
    await w.vm.$nextTick();
    expect(w.find(".file-name").exists()).toBe(false);
  });

  it("hides it when the band is too thin or the tree is hidden", async () => {
    const thin = mountWithBand(true, 800, 480); // 15px band
    thin.el.dispatchEvent(new Event("loadedmetadata"));
    await thin.w.vm.$nextTick();
    expect(thin.w.find(".file-name").exists()).toBe(false);
    const noTree = mountWithBand(false, 800, 900);
    noTree.el.dispatchEvent(new Event("loadedmetadata"));
    await noTree.w.vm.$nextTick();
    expect(noTree.w.find(".file-name").exists()).toBe(false);
  });
});

describe("VideoPlayer delete confirmation", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    document.body.innerHTML = "";
  });

  it("asks in a popover next to the trash icon and deletes only on Yes", async () => {
    const { w } = mountPlayer(true);
    await w.find("button[title='Delete file']").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(true);
    expect(w.find(".confirm-pop").text()).toContain("Are you sure?");
    expect(w.emitted("deleteFile")).toBeUndefined();
    await w.find(".confirm-pop .btn-no").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(w.emitted("deleteFile")).toBeUndefined();
    await w.find("button[title='Delete file']").trigger("click");
    await w.find(".confirm-pop .btn-yes").trigger("click");
    expect(w.emitted("deleteFile")).toHaveLength(1);
    expect(w.find(".confirm-pop").exists()).toBe(false);
  });

  it("a press elsewhere or Escape closes it with no action", async () => {
    const { w } = mountPlayer(true);
    await w.find("button[title='Delete file']").trigger("click");
    window.dispatchEvent(new Event("pointerdown"));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    await w.find("button[title='Delete file']").trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(w.emitted("deleteFile")).toBeUndefined();
  });

  it("keeps the controls visible while open", async () => {
    const { w } = mountPlayer(true);
    await w.find("button[title='Delete file']").trigger("click");
    expect(w.find(".controls").classes()).not.toContain("hidden");
  });

  it("deletes at once when confirmation is off", async () => {
    settings.general.confirmDelete = false;
    const { w } = mountPlayer(true);
    await w.find("button[title='Delete file']").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(w.emitted("deleteFile")).toHaveLength(1);
  });
});

describe("VideoPlayer after a replace", () => {
  it("reloads a file rewritten at the same path", async () => {
    const w = mount(VideoPlayer, { props: { item } });
    mounted.push(w);
    const before = w.find("video").attributes("src");
    // the stale stream errors out against the rewritten bytes
    w.find("video").element.dispatchEvent(new Event("error"));
    await w.vm.$nextTick();
    expect(w.find(".video-error").exists()).toBe(true);
    await w.setProps({ item: { ...item, mtime: 2, size: 10 } });
    expect(w.find(".video-error").exists()).toBe(false);
    expect(w.find("video").attributes("src")).not.toBe(before);
  });
});
