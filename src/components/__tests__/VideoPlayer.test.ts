import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import VideoPlayer from "../VideoPlayer.vue";
import type { MediaItem } from "../../types";

const item: MediaItem = { path: "/f/a.mp4", kind: "video", name: "a.mp4", mtime: 1, size: 0 };

function mountPlayer(paused: boolean) {
  const w = mount(VideoPlayer, { props: { item } });
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
