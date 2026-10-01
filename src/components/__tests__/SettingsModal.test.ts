import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SettingsModal from "../settings/SettingsModal.vue";
import { selectedSection } from "../settings/sections";
import { settings, loadSettings } from "../../composables/settings";
import { openDraft } from "../../composables/settingsDraft";

describe("SettingsModal", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
    selectedSection.value = "general";
    document.body.innerHTML = "";
  });

  it("lists the six sections with their icons", () => {
    const w = mount(SettingsModal);
    const items = w.findAll(".nav-item");
    expect(items.map((i) => i.text())).toEqual([
      "General",
      "Video Player",
      "Image Viewer",
      "Collages",
      "PDF Viewer",
      "Markdown Editor",
    ]);
    expect(items[0].find("i").classes()).toContain("ph-sliders-horizontal");
    expect(items[1].find("i").classes()).toContain("ph-film-strip");
    expect(items[2].find("i").classes()).toContain("ph-image");
    expect(items[3].find("i").classes()).toContain("ph-squares-four");
    expect(items[4].find("i").classes()).toContain("ph-file-pdf");
    expect(items[5].find("i").classes()).toContain("ph-markdown-logo");
  });

  it("clicking a section swaps the page and records the selection", async () => {
    const w = mount(SettingsModal);
    expect(w.find(".page-title").text()).toBe("General");
    expect(w.findAll(".nav-item")[0].classes()).toContain("active");
    await w.findAll(".nav-item")[3].trigger("click");
    expect(w.find(".page-title").text()).toBe("Collages");
    expect(selectedSection.value).toBe("collage");
    expect(w.findAll(".nav-item")[3].classes()).toContain("active");
    expect(w.findAll(".nav-item")[0].classes()).not.toContain("active");
  });

  it("reopens on the section chosen last time", () => {
    selectedSection.value = "image";
    const w = mount(SettingsModal);
    expect(w.find(".page-title").text()).toBe("Image Viewer");
  });

  it("placeholder sections say so without repeating the title", async () => {
    const w = mount(SettingsModal);
    await w.findAll(".nav-item")[4].trigger("click");
    expect(w.find(".page-body").text()).toBe("Not built yet.");
  });

  it("the X and Escape both emit close, and Escape stops after unmount", async () => {
    const onClose = vi.fn();
    const w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
    await w.find(".settings-close").trigger("click");
    expect(onClose).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    w.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("focuses the active section on open and blocks the native context menu", () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    expect(document.activeElement).toBe(w.find(".nav-item.active").element);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    w.find(".page-body").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    w.unmount();
  });

  it("the footer appears only once something changed, and Apply writes the store", async () => {
    const w = mount(SettingsModal);
    expect(w.find(".page-footer").exists()).toBe(false);
    await w.findAll("[role=switch]")[2].trigger("click"); // wrap around
    expect(w.find(".page-footer").exists()).toBe(true);
    expect(w.findAll(".page-footer button").map((b) => b.text())).toEqual(["Revert", "Apply"]);
    expect(settings.general.wrapAround).toBe(false);
    await w.find(".page-footer .btn-apply").trigger("click");
    expect(settings.general.wrapAround).toBe(true);
    expect(w.find(".page-footer").exists()).toBe(false);
  });

  it("Revert restores the draft and hides the footer", async () => {
    const w = mount(SettingsModal);
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.find(".page-footer .btn-revert").trigger("click");
    expect(w.findAll("[role=switch]")[2].attributes("aria-checked")).toBe("false");
    expect(w.find(".page-footer").exists()).toBe(false);
    expect(settings.general.wrapAround).toBe(false);
  });

  it("a reopened modal shows the applied values and no footer", async () => {
    const w = mount(SettingsModal);
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.find(".page-footer .btn-apply").trigger("click");
    w.unmount();
    const again = mount(SettingsModal);
    expect(again.findAll("[role=switch]")[2].attributes("aria-checked")).toBe("true");
    expect(again.find(".page-footer").exists()).toBe(false);
  });

  it("a stale draft from a previous open is replaced when the modal opens", async () => {
    const w = mount(SettingsModal);
    await w.findAll("[role=switch]")[2].trigger("click");
    w.unmount(); // closed without apply or revert
    const again = mount(SettingsModal);
    expect(again.findAll("[role=switch]")[2].attributes("aria-checked")).toBe("false");
    expect(again.find(".page-footer").exists()).toBe(false);
  });

  it("with pending edits, switching tab, the X and Escape prompt and change nothing yet", async () => {
    const onClose = vi.fn();
    const w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.findAll(".nav-item")[1].trigger("click");
    expect(w.find(".dialog").exists()).toBe(true);
    expect(w.find(".page-title").text()).toBe("General");
    await w.find(".dialog-x").trigger("click");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(w.find(".page-title").text()).toBe("General");
    await w.find(".settings-close").trigger("click");
    expect(w.find(".dialog").exists()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    // the prompt owns escape: this one dismisses it and must not close the modal
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(w.find(".dialog").exists()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    // the modal's escape: prompts again
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(w.find(".dialog").exists()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(settings.general.wrapAround).toBe(false);
    expect(w.find(".page-footer").exists()).toBe(true);
    w.unmount();
  });

  it("a backdrop press on the prompt stays put", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.findAll(".nav-item")[1].trigger("click");
    await w.find(".dialog-backdrop").trigger("pointerdown");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(w.find(".page-title").text()).toBe("General");
    expect(w.find(".page-footer").exists()).toBe(true);
    w.unmount();
  });

  it("Exit without saving reverts and continues; Apply applies and continues", async () => {
    const onClose = vi.fn();
    const w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.findAll(".nav-item")[1].trigger("click");
    await w.find(".dialog .btn-revert").trigger("click");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(w.find(".page-title").text()).toBe("Video Player");
    expect(settings.general.wrapAround).toBe(false);
    expect(w.find(".page-footer").exists()).toBe(false);
    await w.findAll(".nav-item")[0].trigger("click");
    await w.findAll("[role=switch]")[2].trigger("click");
    await w.find(".settings-close").trigger("click");
    await w.find(".dialog .btn-apply").trigger("click");
    expect(settings.general.wrapAround).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("requestClose resolves true when clean, false on stay, true after apply", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    const vm = w.vm as unknown as { requestClose: () => Promise<boolean> };
    await expect(vm.requestClose()).resolves.toBe(true);
    await w.findAll("[role=switch]")[2].trigger("click");
    const stay = vm.requestClose();
    await nextTick();
    expect(w.find(".dialog").exists()).toBe(true);
    await w.find(".dialog-x").trigger("click");
    await expect(stay).resolves.toBe(false);
    expect(w.find(".page-footer").exists()).toBe(true);
    const apply = vm.requestClose();
    await nextTick();
    await w.find(".dialog .btn-apply").trigger("click");
    await expect(apply).resolves.toBe(true);
    expect(settings.general.wrapAround).toBe(true);
    w.unmount();
  });

  it("a second requestClose while the prompt is up resolves the first as false", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    const vm = w.vm as unknown as { requestClose: () => Promise<boolean> };
    await w.findAll("[role=switch]")[2].trigger("click");
    const first = vm.requestClose();
    await nextTick();
    const second = vm.requestClose();
    await expect(first).resolves.toBe(false);
    await nextTick();
    await w.find(".dialog .btn-revert").trigger("click");
    await expect(second).resolves.toBe(true);
    w.unmount();
  });

  it("escape with a typed, uncommitted number prompts instead of dropping it", async () => {
    const onClose = vi.fn();
    const w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
    await w.findAll(".nav-item")[1].trigger("click"); // video player
    const input = w.find("input.number");
    (input.element as HTMLInputElement).focus();
    (input.element as HTMLInputElement).value = "25";
    await input.trigger("input");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(onClose).not.toHaveBeenCalled();
    expect(w.find(".dialog").exists()).toBe(true);
    await w.find(".dialog .btn-apply").trigger("click");
    expect(settings.video.clipCapMb).toBe(25);
    expect(onClose).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});
