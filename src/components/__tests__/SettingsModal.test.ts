import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SettingsModal from "../settings/SettingsModal.vue";
import { selectedSection } from "../settings/sections";
import { settings, loadSettings } from "../../composables/settings";
import { openDraft, draft } from "../../composables/settingsDraft";
import { defaultKeybinds } from "../../composables/keybinds";
import { keybindGroup, keybindJump, keybindPromptOpen, settingsBlocked } from "../settings/settingsState";

// a leaked keybinds page would answer the next test's jump
enableAutoUnmount(afterEach);

// top-level sections only; the keybinds groups nest under their section
const top = (w: { findAll: (s: string) => any[] }) => w.findAll(".nav-item:not(.nav-sub)");

describe("SettingsModal", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
    selectedSection.value = "general";
    document.body.innerHTML = "";
  });

  it("lists the seven sections with their icons", () => {
    const w = mount(SettingsModal);
    const items = w.findAll(".nav-item:not(.nav-sub)");
    expect(items.map((i) => i.text())).toEqual([
      "General",
      "Keybinds",
      "Video Player",
      "Image Viewer",
      "PDF Viewer",
      "Markdown Editor",
      "Collages",
    ]);
    expect(items[0].find("i").classes()).toContain("ph-sliders-horizontal");
    expect(items[1].find("i").classes()).toContain("ph-keyboard");
    expect(items[2].find("i").classes()).toContain("ph-film-strip");
    expect(items[3].find("i").classes()).toContain("ph-image");
    expect(items[4].find("i").classes()).toContain("ph-file-pdf");
    expect(items[5].find("i").classes()).toContain("ph-markdown-logo");
    expect(items[6].find("i").classes()).toContain("ph-squares-four");
  });

  it("clicking a section swaps the page and records the selection", async () => {
    const w = mount(SettingsModal);
    expect(w.find(".page-title").text()).toBe("General");
    expect(top(w)[0].classes()).toContain("active");
    await top(w)[6].trigger("click");
    expect(w.find(".page-title").text()).toBe("Collages");
    expect(selectedSection.value).toBe("collage");
    expect(top(w)[6].classes()).toContain("active");
    expect(top(w)[0].classes()).not.toContain("active");
  });

  it("reopens on the section chosen last time", () => {
    selectedSection.value = "image";
    const w = mount(SettingsModal);
    expect(w.find(".page-title").text()).toBe("Image Viewer");
  });

  it("placeholder sections say so without repeating the title", async () => {
    const w = mount(SettingsModal);
    await top(w)[4].trigger("click");
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
    await top(w)[2].trigger("click");
    expect(w.find(".dialog").exists()).toBe(true);
    expect(w.find(".page-title").text()).toBe("General");
    await w.find(".dialog .btn-stay").trigger("click");
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

  it("the unsaved prompt marks settings blocked until answered", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    await w.findAll("[role=switch]")[2].trigger("click");
    expect(settingsBlocked.value).toBe(false);
    await top(w)[2].trigger("click");
    expect(settingsBlocked.value).toBe(true);
    await w.find(".dialog .btn-stay").trigger("click");
    expect(settingsBlocked.value).toBe(false);
    await top(w)[2].trigger("click");
    expect(settingsBlocked.value).toBe(true);
    w.unmount();
    expect(settingsBlocked.value).toBe(false);
  });

  it("a backdrop press on the prompt stays put", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    await w.findAll("[role=switch]")[2].trigger("click");
    await top(w)[2].trigger("click");
    await w.find(".dialog-backdrop").trigger("pointerdown");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(w.find(".page-title").text()).toBe("General");
    expect(w.find(".page-footer").exists()).toBe(true);
    w.unmount();
  });

  it("Don't Save reverts and continues; Apply applies and continues", async () => {
    const onClose = vi.fn();
    const w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
    await w.findAll("[role=switch]")[2].trigger("click");
    await top(w)[2].trigger("click");
    await w.find(".dialog .btn-revert").trigger("click");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(w.find(".page-title").text()).toBe("Video Player");
    expect(settings.general.wrapAround).toBe(false);
    expect(w.find(".page-footer").exists()).toBe(false);
    await top(w)[0].trigger("click");
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
    await w.find(".dialog .btn-stay").trigger("click");
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
    await top(w)[6].trigger("click"); // collages
    const input = w.find("input.number");
    (input.element as HTMLInputElement).focus();
    (input.element as HTMLInputElement).value = "12";
    await input.trigger("input");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(onClose).not.toHaveBeenCalled();
    expect(w.find(".dialog").exists()).toBe(true);
    await w.find(".dialog .btn-apply").trigger("click");
    expect(settings.collage.memoryCapGb).toBe(12);
    expect(onClose).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("the nav and page go inert while the prompt is up", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    await w.findAll("[role=switch]")[2].trigger("click");
    expect(w.find(".settings-nav").attributes("inert")).toBeUndefined();
    await top(w)[2].trigger("click");
    expect(w.find(".settings-nav").attributes("inert")).toBeDefined();
    expect(w.find(".settings-page").attributes("inert")).toBeDefined();
    await w.find(".dialog .btn-stay").trigger("click");
    expect(w.find(".settings-nav").attributes("inert")).toBeUndefined();
    w.unmount();
  });

  it("keybinds has five nested group items right after it", () => {
    const w = mount(SettingsModal);
    const texts = w.findAll(".nav-item").map((i) => i.text());
    expect(texts.slice(1, 7)).toEqual([
      "Keybinds",
      "General Keybinds",
      "Video Keybinds",
      "Image Keybinds",
      "PDF Keybinds",
      "Collage Keybinds",
    ]);
    expect(w.findAll(".nav-sub").length).toBe(5);
  });

  it("nested items stay folded away until the keybinds page opens", async () => {
    keybindGroup.value = "general";
    const w = mount(SettingsModal);
    expect(w.find(".nav-subs").classes()).not.toContain("open");
    expect(w.find(".nav-subs").attributes("inert")).toBeDefined();
    await top(w)[1].trigger("click");
    expect(w.find(".nav-subs").classes()).toContain("open");
    expect(w.find(".nav-subs").attributes("inert")).toBeUndefined();
    expect(w.findAll(".nav-sub.active").map((a) => a.text())).toEqual(["General Keybinds"]);
    await top(w)[0].trigger("click");
    expect(w.find(".nav-subs").classes()).not.toContain("open");
  });

  it("a nested item on the keybinds page scrolls without asking, keeping the edit", async () => {
    selectedSection.value = "keybinds";
    keybindJump.value = null;
    const w = mount(SettingsModal, { attachTo: document.body });
    draft.keybinds.mute = "j";
    await nextTick();
    const video = w.findAll(".nav-sub").find((n) => n.text() === "Video Keybinds")!;
    await video.trigger("click");
    expect(w.find(".dialog").exists()).toBe(false);
    expect(keybindGroup.value).toBe("video");
    expect(draft.keybinds.mute).toBe("j");
    w.unmount();
  });

  it("revert to defaults shows only on keybinds and resets just the keybinds", async () => {
    const w = mount(SettingsModal);
    expect(w.find(".btn-revert").exists()).toBe(false);
    await top(w)[1].trigger("click");
    draft.keybinds.mute = "j";
    await nextTick();
    expect(w.find(".page-footer .btn-revert").exists()).toBe(true);
    await w.find(".page-footer-left .btn-defaults").trigger("click");
    expect(draft.keybinds).toEqual(defaultKeybinds());
    expect(w.find(".page-footer").exists()).toBe(false);
  });

  it("the nav and page go inert while a keybind overwrite prompt is up", async () => {
    const w = mount(SettingsModal);
    expect(w.find(".settings-nav").attributes("inert")).toBeUndefined();
    keybindPromptOpen.value = true;
    await nextTick();
    expect(w.find(".settings-nav").attributes("inert")).toBeDefined();
    expect(w.find(".settings-page").attributes("inert")).toBeDefined();
    keybindPromptOpen.value = false;
    await nextTick();
    expect(w.find(".settings-nav").attributes("inert")).toBeUndefined();
    expect(w.find(".settings-page").attributes("inert")).toBeUndefined();
  });

  it("unmounting mid-prompt settles a waiting requestClose as false", async () => {
    const w = mount(SettingsModal, { attachTo: document.body });
    const vm = w.vm as unknown as { requestClose: () => Promise<boolean> };
    await w.findAll("[role=switch]")[2].trigger("click");
    const waiting = vm.requestClose();
    await nextTick();
    w.unmount();
    await expect(waiting).resolves.toBe(false);
  });
});
