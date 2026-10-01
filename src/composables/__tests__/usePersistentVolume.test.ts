import { describe, it, expect, beforeEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { usePersistentVolume } from "../usePersistentVolume";
import { settings, loadSettings } from "../settings";

function player(volume = 1, muted = false) {
  const v = ref(volume);
  const m = ref(muted);
  const scope = effectScope();
  scope.run(() => usePersistentVolume(v, m));
  return { volume: v, muted: m, stop: () => scope.stop() };
}

describe("usePersistentVolume", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("seeds the player from the store when on", () => {
    settings.video.persistentVolume = true;
    settings.video.volume = 0.3;
    settings.video.muted = true;
    const p = player();
    expect(p.volume.value).toBe(0.3);
    expect(p.muted.value).toBe(true);
    p.stop();
  });

  it("leaves the player alone and writes nothing when off", async () => {
    settings.video.volume = 0.3;
    const p = player();
    expect(p.volume.value).toBe(1);
    p.volume.value = 0.5;
    p.muted.value = true;
    await nextTick();
    expect(settings.video.volume).toBe(0.3);
    expect(settings.video.muted).toBe(false);
    settings.video.volume = 0.9;
    await nextTick();
    expect(p.volume.value).toBe(0.5);
    p.stop();
  });

  it("mirrors player changes into the store and store changes into the player when on", async () => {
    settings.video.persistentVolume = true;
    const p = player();
    p.volume.value = 0.5;
    p.muted.value = true;
    await nextTick();
    expect(settings.video.volume).toBe(0.5);
    expect(settings.video.muted).toBe(true);
    settings.video.volume = 0.2;
    settings.video.muted = false;
    await nextTick();
    expect(p.volume.value).toBe(0.2);
    expect(p.muted.value).toBe(false);
    p.stop();
  });

  it("flipping the toggle on copies the player's current values into the store", async () => {
    settings.video.volume = 0.9;
    const p = player(0.2, true);
    settings.video.persistentVolume = true;
    await nextTick();
    expect(settings.video.volume).toBe(0.2);
    expect(settings.video.muted).toBe(true);
    p.stop();
  });

  it("a volume applied together with turning the toggle on wins over the player's current volume", async () => {
    const p = player(0.7, false);
    settings.video.persistentVolume = true;
    settings.video.volume = 0.4;
    await nextTick();
    expect(p.volume.value).toBe(0.4);
    expect(settings.video.volume).toBe(0.4);
    p.stop();
  });

  it("flipping the toggle off stops the mirroring", async () => {
    settings.video.persistentVolume = true;
    const p = player();
    settings.video.persistentVolume = false;
    await nextTick();
    p.volume.value = 0.4;
    await nextTick();
    expect(settings.video.volume).toBe(1);
    p.stop();
  });

  it("stopping the scope stops the mirroring", async () => {
    settings.video.persistentVolume = true;
    const p = player();
    p.stop();
    p.volume.value = 0.4;
    await nextTick();
    expect(settings.video.volume).toBe(1);
  });
});
