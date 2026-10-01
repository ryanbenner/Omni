import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GeneralSettings from "../settings/GeneralSettings.vue";
import { settings, loadSettings } from "../../composables/settings";
import { draft, openDraft } from "../../composables/settingsDraft";

describe("GeneralSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
  });

  it("renders the six rows in order", () => {
    const w = mount(GeneralSettings);
    expect(w.findAll(".setting-label").map((l) => l.text())).toEqual([
      "Show file tree at launch",
      "Offer to resume the last collage",
      "Wrap around at the end of a folder",
      "Show hidden files",
      "Reopen at launch",
      "Confirm before moving to the Recycle Bin",
    ]);
  });

  it("describes reopen in plain app language", () => {
    const w = mount(GeneralSettings);
    expect(w.findAll(".setting-desc")[4].text()).toBe(
      "Applies the next time Omni starts. Opening a file directly takes priority.",
    );
  });

  it("the reopen select offers the three modes and writes the draft, not the store", async () => {
    const w = mount(GeneralSettings);
    const sel = w.find("select");
    expect(sel.findAll("option").map((o) => o.text())).toEqual(["Nothing", "Last folder", "Last folder and file"]);
    await sel.setValue("folder");
    expect(draft.general.reopen).toBe("folder");
    expect(settings.general.reopen).toBe("off");
  });

  it("the toggles write the draft, not the store", async () => {
    const w = mount(GeneralSettings);
    const switches = w.findAll("[role=switch]");
    expect(switches).toHaveLength(5);
    await switches[2].trigger("click");
    await switches[3].trigger("click");
    await switches[4].trigger("click");
    expect(draft.general.wrapAround).toBe(true);
    expect(draft.general.showHidden).toBe(true);
    expect(draft.general.confirmDelete).toBe(false);
    expect(settings.general.wrapAround).toBe(false);
    expect(settings.general.showHidden).toBe(false);
    expect(settings.general.confirmDelete).toBe(true);
  });
});
