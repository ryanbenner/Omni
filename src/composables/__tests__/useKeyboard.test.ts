import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { useKeyboard } from "../useKeyboard";

function host(enabled: () => boolean) {
  const handler = vi.fn();
  const Comp = defineComponent({
    setup() {
      useKeyboard(() => "video", handler, enabled);
      return () => h("div");
    },
  });
  return { w: mount(Comp), handler };
}

describe("useKeyboard", () => {
  it("handles keydown when enabled", () => {
    const { w, handler } = host(() => true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    expect(handler).toHaveBeenCalledWith({ target: "viewer", action: { type: "toggleMute" } });
    w.unmount();
  });

  it("drops keydown while disabled but still resolves keyup, so a held shuttle key releases", () => {
    const { w, handler } = host(() => false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    expect(handler).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keyup", { key: ">" }));
    expect(handler).toHaveBeenCalledWith({
      target: "viewer",
      action: { type: "shuttleStop", direction: 1 },
    });
    w.unmount();
  });
});
