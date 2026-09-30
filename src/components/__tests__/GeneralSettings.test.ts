import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GeneralSettings from "../settings/GeneralSettings.vue";
import { settings, loadSettings } from "../../composables/settings";

describe("GeneralSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
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

  it("the reopen select offers the three modes and writes the store", async () => {
    const w = mount(GeneralSettings);
    const sel = w.find("select");
    expect(sel.findAll("option").map((o) => o.text())).toEqual(["Nothing", "Last folder", "Last folder and file"]);
    await sel.setValue("folder");
    expect(settings.general.reopen).toBe("folder");
  });

  it("the new toggles write the store", async () => {
    const w = mount(GeneralSettings);
    const switches = w.findAll("[role=switch]");
    expect(switches).toHaveLength(5);
    await switches[2].trigger("click");
    await switches[3].trigger("click");
    await switches[4].trigger("click");
    expect(settings.general.wrapAround).toBe(true);
    expect(settings.general.showHidden).toBe(true);
    expect(settings.general.confirmDelete).toBe(false);
  });
});
