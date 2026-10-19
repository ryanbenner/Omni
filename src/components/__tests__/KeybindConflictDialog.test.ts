import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import KeybindConflictDialog from "../settings/KeybindConflictDialog.vue";

describe("KeybindConflictDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("names the key and the action it would take it from, and focuses No", () => {
    const w = mount(KeybindConflictDialog, {
      attachTo: document.body,
      props: { keyLabel: "F", other: "Fullscreen" },
    });
    expect(w.find(".dialog-body").text()).toBe(
      "F is already bound to Fullscreen. Overwrite it? Fullscreen will be left with no key.",
    );
    expect(w.findAll(".dialog-actions button").map((b) => b.text())).toEqual(["No", "Overwrite"]);
    expect(document.activeElement).toBe(w.find(".btn-revert").element);
    w.unmount();
  });

  it("Overwrite emits overwrite", async () => {
    const w = mount(KeybindConflictDialog, { attachTo: document.body, props: { keyLabel: "F", other: "Fullscreen" } });
    await w.find(".btn-apply").trigger("click");
    expect(w.emitted("overwrite")).toHaveLength(1);
    expect(w.emitted("cancel")).toBeUndefined();
    w.unmount();
  });

  it("No, Escape and a backdrop press emit cancel; a press inside the box does not", async () => {
    const w = mount(KeybindConflictDialog, { attachTo: document.body, props: { keyLabel: "F", other: "Fullscreen" } });
    await w.find(".btn-revert").trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.find(".dialog-backdrop").trigger("pointerdown");
    await w.find(".dialog").trigger("pointerdown");
    expect(w.emitted("cancel")).toHaveLength(3);
    expect(w.emitted("overwrite")).toBeUndefined();
    w.unmount();
  });
});
