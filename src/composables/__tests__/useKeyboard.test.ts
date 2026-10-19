import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { useKeyboard } from "../useKeyboard";
import { settings, loadSettings } from "../settings";

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

const down = (key: string, code: string, shiftKey = false) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, code, shiftKey }));
const up = (key: string, code: string) =>
  window.dispatchEvent(new KeyboardEvent("keyup", { key, code }));
const stop = (direction: 1 | -1) => ({
  target: "viewer",
  action: { type: "stepStop", direction },
});

describe("useKeyboard", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("handles keydown when enabled", () => {
    const { w, handler } = host(() => true);
    down("m", "KeyM");
    expect(handler).toHaveBeenCalledWith({ target: "viewer", action: { type: "toggleMute" } });
    w.unmount();
  });

  it("a held step stops on keyup of the same physical key even if the character changed", () => {
    settings.keybinds.stepForward = "shift+<";
    const { w, handler } = host(() => true);
    down("<", "Comma", true);
    expect(handler).toHaveBeenCalledWith({
      target: "viewer",
      action: { type: "stepStart", direction: 1 },
    });
    up(",", "Comma");
    expect(handler).toHaveBeenLastCalledWith(stop(1));
    w.unmount();
  });

  it("a repeat that resolves to another step does not replace the held direction", () => {
    settings.keybinds.stepForward = "shift+<";
    settings.keybinds.stepBack = ",";
    const { w, handler } = host(() => true);
    down("<", "Comma", true);
    handler.mockClear();
    down(",", "Comma");
    expect(handler).not.toHaveBeenCalled();
    up(",", "Comma");
    expect(handler.mock.calls).toEqual([[stop(1)]]);
    w.unmount();
  });

  it("a held step stops when its key is released inside a text field", () => {
    const { w, handler } = host(() => true);
    down(",", "Comma");
    handler.mockClear();
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: ",", code: "Comma", bubbles: true }));
    expect(handler).toHaveBeenCalledWith(stop(-1));
    input.remove();
    w.unmount();
  });

  it("window blur stops every held step", () => {
    const { w, handler } = host(() => true);
    down(",", "Comma");
    down(".", "Period");
    handler.mockClear();
    window.dispatchEvent(new Event("blur"));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(stop(-1));
    expect(handler).toHaveBeenCalledWith(stop(1));
    window.dispatchEvent(new Event("blur"));
    expect(handler).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("releasing one step key leaves the other held", () => {
    const { w, handler } = host(() => true);
    down(",", "Comma");
    down(".", "Period");
    handler.mockClear();
    up(",", "Comma");
    expect(handler.mock.calls).toEqual([[stop(-1)]]);
    up(".", "Period");
    expect(handler.mock.calls).toEqual([[stop(-1)], [stop(1)]]);
    w.unmount();
  });

  it("keyup still releases a step while disabled", () => {
    let on = true;
    const { w, handler } = host(() => on);
    down(".", "Period");
    on = false;
    handler.mockClear();
    down("m", "KeyM");
    expect(handler).not.toHaveBeenCalled();
    up(".", "Period");
    expect(handler).toHaveBeenCalledWith(stop(1));
    w.unmount();
  });
});
