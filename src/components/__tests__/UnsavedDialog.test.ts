import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UnsavedDialog from "../UnsavedDialog.vue";

describe("UnsavedDialog", () => {
  it("labels discard by trigger and emits each choice", async () => {
    const w = mount(UnsavedDialog, { props: { closing: false }, attachTo: document.body });
    const texts = () => w.findAll("button").map((b) => b.text());
    expect(texts()).toEqual(["Discard", "Save As", "Save", "Cancel"]);
    await w.find(".btn-outline").trigger("click");
    expect(w.emitted("discard")).toHaveLength(1);
    const accents = w.findAll(".btn-accent");
    await accents[0].trigger("click");
    await accents[1].trigger("click");
    expect(w.emitted("saveAs")).toHaveLength(1);
    expect(w.emitted("save")).toHaveLength(1);
    await w.find(".dialog-cancel").trigger("click");
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
  });

  it("says Discard and Close when the window is closing, and Escape cancels", async () => {
    const w = mount(UnsavedDialog, { props: { closing: true }, attachTo: document.body });
    expect(w.find(".btn-outline").text()).toBe("Discard and Close");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
  });

  it("focuses Save by default", () => {
    const w = mount(UnsavedDialog, { attachTo: document.body });
    expect(document.activeElement?.textContent).toBe("Save");
    w.unmount();
  });

  it("with two dialogs stacked, one Escape only cancels the top one", () => {
    const bottom = mount(UnsavedDialog, { attachTo: document.body });
    const top = mount(UnsavedDialog, { attachTo: document.body });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(top.emitted("cancel")).toHaveLength(1);
    expect(bottom.emitted("cancel")).toBeUndefined();
    top.unmount();
    bottom.unmount();
  });
});
