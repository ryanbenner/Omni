import { describe, it, expect, vi } from "vitest";
import { onEscape } from "../dialogStack";

function esc() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

describe("dialogStack onEscape", () => {
  it("a single handler runs on Escape", () => {
    const h = vi.fn();
    const off = onEscape(h);
    esc();
    expect(h).toHaveBeenCalledTimes(1);
    off();
  });

  it("with two registered only the second runs", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off1 = onEscape(h1);
    const off2 = onEscape(h2);
    esc();
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
    off2();
    off1();
  });

  it("after the second unregisters the first runs again", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off1 = onEscape(h1);
    const off2 = onEscape(h2);
    off2();
    esc();
    expect(h1).toHaveBeenCalledTimes(1);
    off1();
  });

  it("other keys do nothing", () => {
    const h = vi.fn();
    const off = onEscape(h);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(h).not.toHaveBeenCalled();
    off();
  });

  it("after all unregister an Escape calls nothing", () => {
    const h = vi.fn();
    const off = onEscape(h);
    off();
    esc();
    expect(h).not.toHaveBeenCalled();
  });
});
