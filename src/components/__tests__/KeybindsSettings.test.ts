import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SettingsModal from "../settings/SettingsModal.vue";
import { selectedSection } from "../settings/sections";
import { keybindPromptOpen } from "../settings/settingsState";
import { settings, loadSettings } from "../../composables/settings";
import { draft, openDraft } from "../../composables/settingsDraft";
import { ACTIONS, type Scope } from "../../composables/keybinds";

let w: VueWrapper | null = null;

function open(onClose = vi.fn()) {
  w = mount(SettingsModal, { attachTo: document.body, props: { onClose } });
  return w;
}

function row(scope: Scope, label: string) {
  const r = w!
    .findAll(`section[data-scope=${scope}] .keybind-row`)
    .find((x) => x.find(".keybind-label").text() === label);
  if (!r) throw new Error(`no row ${scope} ${label}`);
  return r;
}

function chip(scope: Scope, label: string) {
  return row(scope, label).find(".key-chip");
}

async function press(init: KeyboardEventInit) {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(ev);
  await nextTick();
  return ev;
}

describe("KeybindsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    openDraft();
    selectedSection.value = "keybinds";
    document.body.innerHTML = "";
  });
  afterEach(() => {
    w?.unmount();
    w = null;
  });

  it("shows the five groups in order with every action and its key", () => {
    open();
    expect(w!.findAll(".keybinds section h3").map((h) => h.text())).toEqual([
      "General Keybinds",
      "Video Keybinds",
      "Image Keybinds",
      "PDF Keybinds",
      "Collage Keybinds",
    ]);
    expect(w!.findAll(".keybind-row")).toHaveLength(ACTIONS.length);
    expect(chip("general", "Next file").text()).toBe("→");
    expect(chip("collage", "Save as").text()).toBe("Ctrl+Shift+S");
    expect(w!.find(".page-title").text()).toBe("Keybinds");
  });

  it("seek hints follow the skip step in the draft", async () => {
    open();
    draft.video.skipStep = 3;
    await nextTick();
    expect(row("video", "Seek back").find(".keybind-hint").text()).toBe("3s, hold Shift for 6s");
    expect(row("video", "Mute").find(".keybind-hint").exists()).toBe(false);
  });

  it("click a row, press a key, and the draft takes it", async () => {
    open();
    expect(w!.find(".page-footer").exists()).toBe(false);
    await row("video", "Mute").trigger("click");
    expect(row("video", "Mute").classes()).toContain("listening");
    expect(chip("video", "Mute").text()).toBe("Press a key…");
    const ev = await press({ key: "j" });
    expect(ev.defaultPrevented).toBe(true);
    expect(draft.keybinds.mute).toBe("j");
    expect(settings.keybinds.mute).toBe("m");
    expect(row("video", "Mute").classes()).not.toContain("listening");
    expect(chip("video", "Mute").text()).toBe("J");
    expect(w!.find(".page-footer").exists()).toBe(true);
  });

  it("clicking another row moves listening there", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await row("video", "Fullscreen").trigger("click");
    expect(w!.findAll(".keybind-row.listening")).toHaveLength(1);
    expect(chip("video", "Mute").text()).toBe("M");
    await press({ key: "g" });
    expect(draft.keybinds.fullscreen).toBe("g");
    expect(draft.keybinds.mute).toBe("m");
  });

  it("escape cancels listening and does not close settings", async () => {
    const onClose = vi.fn();
    open(onClose);
    await row("video", "Mute").trigger("click");
    await press({ key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(chip("video", "Mute").text()).toBe("M");
    expect(draft.keybinds.mute).toBe("m");
    // listening is over, so the next escape is the modal's again
    await press({ key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lone modifiers are ignored while listening", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await press({ key: "Shift", shiftKey: true });
    await press({ key: "Control", ctrlKey: true });
    expect(chip("video", "Mute").text()).toBe("Press a key…");
    expect(draft.keybinds.mute).toBe("m");
    await press({ key: "J", shiftKey: true, ctrlKey: true });
    expect(draft.keybinds.mute).toBe("ctrl+shift+j");
  });

  it("shift is dropped for seek", async () => {
    open();
    await row("video", "Seek back").trigger("click");
    await press({ key: "J", shiftKey: true });
    expect(draft.keybinds.seekBack).toBe("j");
  });

  it("a conflict asks, and Overwrite moves the key", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await press({ key: "f" });
    expect(w!.find(".dialog-body").text()).toBe(
      "F is already bound to Fullscreen. Overwrite it? Fullscreen will be left with no key.",
    );
    expect(keybindPromptOpen.value).toBe(true);
    expect(w!.find(".keybinds").attributes("inert")).toBeDefined();
    expect(draft.keybinds.mute).toBe("m");
    await w!.find(".dialog .btn-apply").trigger("click");
    expect(w!.find(".dialog").exists()).toBe(false);
    expect(keybindPromptOpen.value).toBe(false);
    expect(w!.find(".keybinds").attributes("inert")).toBeUndefined();
    expect(draft.keybinds.mute).toBe("f");
    expect(draft.keybinds.fullscreen).toBeNull();
    expect(chip("video", "Fullscreen").text()).toBe("Not set");
    expect(chip("video", "Fullscreen").classes()).toContain("unset");
    expect(w!.findAll(".keybind-row.listening")).toHaveLength(0);
    // the prompt ended the listening: further keys go nowhere
    await press({ key: "k" });
    expect(draft.keybinds.mute).toBe("f");
  });

  it("a seek key that collides twice clears both on Overwrite", async () => {
    open();
    draft.keybinds.mute = "j";
    draft.keybinds.nextFile = "shift+j";
    await row("video", "Seek back").trigger("click");
    await press({ key: "j" });
    expect(w!.find(".dialog").exists()).toBe(true);
    await w!.find(".dialog .btn-apply").trigger("click");
    expect(draft.keybinds).toMatchObject({ seekBack: "j", mute: null, nextFile: null });
  });

  it("No and Escape in the prompt change nothing", async () => {
    const onClose = vi.fn();
    open(onClose);
    await row("video", "Mute").trigger("click");
    await press({ key: "f" });
    await w!.find(".dialog .btn-revert").trigger("click");
    expect(w!.find(".dialog").exists()).toBe(false);
    expect(draft.keybinds).toMatchObject({ mute: "m", fullscreen: "f" });
    expect(chip("video", "Mute").text()).toBe("M");

    await row("video", "Mute").trigger("click");
    await press({ key: "f" });
    expect(w!.find(".dialog").exists()).toBe(true);
    await press({ key: "Escape" });
    expect(w!.find(".dialog").exists()).toBe(false);
    expect(keybindPromptOpen.value).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(draft.keybinds).toMatchObject({ mute: "m", fullscreen: "f" });
    expect(w!.find(".page-footer").exists()).toBe(false);
  });

  it("a key used on another screen does not ask", async () => {
    open();
    await row("image", "Fit to window").trigger("click");
    await press({ key: "m" });
    expect(w!.find(".dialog").exists()).toBe(false);
    expect(draft.keybinds.imageFit).toBe("m");
    expect(draft.keybinds.mute).toBe("m");
  });

  it("general keys clash with video's shift+seek", async () => {
    open();
    await row("general", "Next file").trigger("click");
    await press({ key: "Q", shiftKey: true });
    expect(w!.find(".dialog-body").text()).toBe(
      "Shift+Q is already bound to Seek back. Overwrite it? Seek back will be left with no key.",
    );
  });

  it("pressing the current key again just stops listening", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await press({ key: "m" });
    expect(w!.find(".dialog").exists()).toBe(false);
    expect(w!.findAll(".keybind-row.listening")).toHaveLength(0);
    expect(w!.find(".page-footer").exists()).toBe(false);
  });

  it("leaving while listening leaves no key capture behind", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await w!.findAll(".nav-item")[0].trigger("click"); // general
    expect(w!.find(".page-title").text()).toBe("General");
    let ev = await press({ key: "j" });
    expect(ev.defaultPrevented).toBe(false);
    expect(draft.keybinds.mute).toBe("m");

    await w!.findAll(".nav-item")[6].trigger("click"); // back to keybinds
    await row("video", "Mute").trigger("click");
    w!.unmount();
    w = null;
    ev = await press({ key: "j" });
    expect(ev.defaultPrevented).toBe(false);
    expect(draft.keybinds.mute).toBe("m");
  });

  it("leaving with the prompt up clears it", async () => {
    open();
    await row("video", "Mute").trigger("click");
    await press({ key: "f" });
    expect(keybindPromptOpen.value).toBe(true);
    w!.unmount();
    w = null;
    expect(keybindPromptOpen.value).toBe(false);
    expect(document.querySelector(".dialog")).toBeNull();
  });
});
