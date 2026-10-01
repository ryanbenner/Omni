import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { settings, loadSettings } from "../settings";
import { draft, dirty, openDraft, applyDraft, revertDraft } from "../settingsDraft";

describe("settingsDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
  });

  it("opens as a copy of the store and is clean", () => {
    expect(draft).toEqual(settings);
    expect(dirty.value).toBe(false);
  });

  it("a draft change is dirty and leaves the store alone", () => {
    draft.general.wrapAround = true;
    expect(dirty.value).toBe(true);
    expect(settings.general.wrapAround).toBe(false);
  });

  it("apply writes every section into the store and keeps section identity", () => {
    const general = settings.general;
    const video = settings.video;
    draft.general.wrapAround = true;
    draft.video.clipCapMb = 25;
    draft.image.zoomStep = "fine";
    draft.collage.jpgQuality = 80;
    applyDraft();
    expect(settings.general.wrapAround).toBe(true);
    expect(settings.video.clipCapMb).toBe(25);
    expect(settings.image.zoomStep).toBe("fine");
    expect(settings.collage.jpgQuality).toBe(80);
    expect(settings.general).toBe(general);
    expect(settings.video).toBe(video);
    expect(dirty.value).toBe(false);
  });

  it("revert restores the draft from the store", () => {
    draft.general.showHidden = true;
    revertDraft();
    expect(draft.general.showHidden).toBe(false);
    expect(dirty.value).toBe(false);
  });

  it("open after a store change picks up the new values", () => {
    settings.general.confirmDelete = false;
    openDraft();
    expect(draft.general.confirmDelete).toBe(false);
    expect(dirty.value).toBe(false);
  });

  it("applying the draft persists through the store's save", async () => {
    draft.collage.memoryCapGb = 8;
    applyDraft();
    await nextTick();
    expect(JSON.parse(localStorage.getItem("mv-settings")!).collage.memoryCapGb).toBe(8);
  });
});
