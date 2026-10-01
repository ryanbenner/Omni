import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import VideoSettings from "../settings/VideoSettings.vue";
import { settings, loadSettings } from "../../composables/settings";
import { draft, openDraft } from "../../composables/settingsDraft";

describe("VideoSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
  });

  it("offers the player's speeds and writes the choice to the draft", async () => {
    const w = mount(VideoSettings);
    const labels = w.findAll("option").map((o) => o.text());
    expect(labels).toEqual(["0.25x", "0.5x", "1x", "1.5x", "2x"]);
    await w.find("select").setValue(2);
    expect(draft.video.defaultSpeed).toBe(2);
    expect(settings.video.defaultSpeed).toBe(1);
  });

  it("shows the indented volume slider only while persistent volume is on, writing the draft", async () => {
    const w = mount(VideoSettings);
    expect(w.find("input[type=range]").exists()).toBe(false);
    await w.find("[role=switch]").trigger("click");
    expect(draft.video.persistentVolume).toBe(true);
    const row = w.find(".setting-row.indent");
    expect(row.exists()).toBe(true);
    expect(row.find(".setting-label").text()).toBe("Volume");
    await row.find("input[type=range]").setValue("40");
    expect(draft.video.volume).toBeCloseTo(0.4);
    expect(settings.video.volume).toBe(1);
  });

  it("describes the clip cap in plain app language", () => {
    const w = mount(VideoSettings);
    const descs = w.findAll(".setting-desc");
    expect(descs[descs.length - 1].text()).toBe("Discord clips are encoded to stay under this size.");
  });
});
