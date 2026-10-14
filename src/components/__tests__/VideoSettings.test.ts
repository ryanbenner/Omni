import { describe, it, expect, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import VideoSettings from "../settings/VideoSettings.vue";
import { settings, loadSettings } from "../../composables/settings";
import { draft, openDraft } from "../../composables/settingsDraft";

function row(w: VueWrapper, label: string) {
  const r = w.findAll(".setting-row").find((x) => x.find(".setting-label").text() === label);
  if (!r) throw new Error(`no row ${label}`);
  return r;
}

describe("VideoSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
  });

  it("lists the rows in order", () => {
    const w = mount(VideoSettings);
    const labels = w
      .findAll(".setting-row")
      .filter((r) => !r.classes("indent"))
      .map((r) => r.find(".setting-label").text());
    expect(labels).toEqual([
      "Default playback speed",
      "Skip step",
      "Start paused",
      "Loop",
      "Hold to speed up",
      "Hide controls after",
      "Default volume",
      "Cap clip size by default",
    ]);
  });

  it("offers the player's speeds and writes the choice to the draft", async () => {
    const w = mount(VideoSettings);
    const select = row(w, "Default playback speed").find("select");
    expect(select.findAll("option").map((o) => o.text())).toEqual(["0.25x", "0.5x", "1x", "1.5x", "2x"]);
    await select.setValue(2);
    expect(draft.video.defaultSpeed).toBe(2);
    expect(settings.video.defaultSpeed).toBe(1);
  });

  it("offers the skip, hold and hide choices and writes them to the draft", async () => {
    const w = mount(VideoSettings);
    const skip = row(w, "Skip step").find("select");
    expect(skip.findAll("option").map((o) => o.text())).toEqual(["3 s", "5 s", "10 s", "15 s"]);
    await skip.setValue(15);
    expect(draft.video.skipStep).toBe(15);
    const hold = row(w, "Hold to speed up").find("select");
    expect(hold.findAll("option").map((o) => o.text())).toEqual(["1.5x", "2x", "3x", "Off"]);
    await hold.setValue(0);
    expect(draft.video.holdRate).toBe(0);
    const hide = row(w, "Hide controls after").find("select");
    expect(hide.findAll("option").map((o) => o.text())).toEqual(["1.5 s", "2.5 s", "4 s", "8 s", "Never"]);
    await hide.setValue(0);
    expect(draft.video.hideControlsMs).toBe(0);
    expect(settings.video).toMatchObject({ skipStep: 5, holdRate: 2, hideControlsMs: 2500 });
  });

  it("start paused and loop toggle the draft", async () => {
    const w = mount(VideoSettings);
    await row(w, "Start paused").find("[role=switch]").trigger("click");
    await row(w, "Loop").find("[role=switch]").trigger("click");
    expect(draft.video.startPaused).toBe(true);
    expect(draft.video.loop).toBe(true);
    expect(settings.video.startPaused).toBe(false);
  });

  it("shows the indented volume slider only while default volume is on, writing the draft", async () => {
    const w = mount(VideoSettings);
    expect(w.find(".setting-row.indent").exists()).toBe(false);
    await row(w, "Default volume").find("[role=switch]").trigger("click");
    expect(draft.video.persistentVolume).toBe(true);
    const r = w.find(".setting-row.indent");
    expect(r.find(".setting-label").text()).toBe("Volume");
    await r.find("input[type=range]").setValue("40");
    expect(draft.video.volume).toBeCloseTo(0.4);
    expect(settings.video.volume).toBe(1);
  });

  it("shows a 10 to 100 MB size slider only while the cap is on by default, with its value", async () => {
    const w = mount(VideoSettings);
    expect(w.find(".setting-row.indent").exists()).toBe(false);
    await row(w, "Cap clip size by default").find("[role=switch]").trigger("click");
    expect(draft.video.capByDefault).toBe(true);
    const r = w.find(".setting-row.indent");
    expect(r.find(".setting-label").text()).toBe("Max size");
    const slider = r.find("input[type=range]");
    expect([slider.attributes("min"), slider.attributes("max")]).toEqual(["10", "100"]);
    expect(r.findAll(".cap-end").map((e) => e.text())).toEqual(["10 MB", "100 MB"]);
    expect(r.find(".cap-value").text()).toBe("50 MB");
    await slider.setValue("25");
    expect(draft.video.clipCapMb).toBe(25);
    expect(r.find(".cap-value").text()).toBe("25 MB");
    expect(settings.video.clipCapMb).toBe(50);
  });
});
