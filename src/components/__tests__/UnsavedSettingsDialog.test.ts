import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import UnsavedSettingsDialog from "../settings/UnsavedSettingsDialog.vue";
import { onEscape } from "../../composables/dialogStack";

describe("UnsavedSettingsDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("offers Revert, Continue editing and Apply, and no X", async () => {
    const w = mount(UnsavedSettingsDialog, { attachTo: document.body });
    expect(w.find(".dialog-title").text()).toBe("Unsaved changes");
    expect(w.find(".dialog-body").text()).toBe("Your changes will be lost unless you apply them.");
    expect(w.findAll(".dialog-actions button").map((b) => b.text())).toEqual(["Revert", "Continue editing", "Apply"]);
    expect(document.activeElement).toBe(w.find(".btn-apply").element);
    expect(w.find(".dialog-x").exists()).toBe(false);
    const [revert, keep] = w.findAll(".dialog-actions button");
    await revert.trigger("click");
    expect(w.emitted("discard")).toHaveLength(1);
    await keep.trigger("click");
    expect(w.emitted("stay")).toHaveLength(1);
    await w.find(".btn-apply").trigger("click");
    expect(w.emitted("apply")).toHaveLength(1);
    w.unmount();
  });

  it("Escape and a backdrop press mean stay; a press inside the box does not", async () => {
    const w = mount(UnsavedSettingsDialog, { attachTo: document.body });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.find(".dialog-backdrop").trigger("pointerdown");
    await w.find(".dialog").trigger("pointerdown");
    expect(w.emitted("stay")).toHaveLength(2);
    w.unmount();
  });

  it("releases its Escape handler on unmount", () => {
    const sentinel = vi.fn();
    const off = onEscape(sentinel);
    const w = mount(UnsavedSettingsDialog, { attachTo: document.body });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sentinel).not.toHaveBeenCalled();
    expect(w.emitted("stay")).toHaveLength(1);
    w.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sentinel).toHaveBeenCalledTimes(1);
    off();
  });
});
