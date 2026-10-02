import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import UnsavedSettingsDialog from "../settings/UnsavedSettingsDialog.vue";
import { onEscape } from "../../composables/dialogStack";

describe("UnsavedSettingsDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the copy, focuses Apply, and emits apply or discard from the buttons", async () => {
    const w = mount(UnsavedSettingsDialog, { attachTo: document.body });
    expect(w.find(".dialog-title").text()).toBe("Unsaved changes");
    expect(w.find(".dialog-body").text()).toBe("Your changes will be lost unless you apply them.");
    expect(w.findAll(".dialog-actions button").map((b) => b.text())).toEqual(["Don't Save", "Apply"]);
    expect(document.activeElement).toBe(w.find(".btn-apply").element);
    await w.find(".btn-revert").trigger("click");
    expect(w.emitted("discard")).toHaveLength(1);
    await w.find(".btn-apply").trigger("click");
    expect(w.emitted("apply")).toHaveLength(1);
    w.unmount();
  });

  it("the X, Escape and a backdrop press all mean stay; a press inside the box does not", async () => {
    const w = mount(UnsavedSettingsDialog, { attachTo: document.body });
    await w.find(".dialog-x").trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.find(".dialog-backdrop").trigger("pointerdown");
    await w.find(".dialog").trigger("pointerdown");
    expect(w.emitted("stay")).toHaveLength(3);
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
