import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import VideoSettings from "../settings/VideoSettings.vue";
import { settings, loadSettings } from "../../composables/settings";

describe("VideoSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("offers the player's speeds and writes the choice to the store", async () => {
    const w = mount(VideoSettings);
    const labels = w.findAll("option").map((o) => o.text());
    expect(labels).toEqual(["0.25x", "0.5x", "1x", "1.5x", "2x"]);
    await w.find("select").setValue(2);
    expect(settings.video.defaultSpeed).toBe(2);
  });

  it("shows the indented volume slider only while persistent volume is on", async () => {
    const w = mount(VideoSettings);
    expect(w.find("input[type=range]").exists()).toBe(false);
    await w.find("[role=switch]").trigger("click");
    expect(settings.video.persistentVolume).toBe(true);
    const row = w.find(".setting-row.indent");
    expect(row.exists()).toBe(true);
    expect(row.find(".setting-label").text()).toBe("Volume");
    await row.find("input[type=range]").setValue("40");
    expect(settings.video.volume).toBeCloseTo(0.4);
  });
});
