import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

const minimize = vi.fn();
const toggleMaximize = vi.fn();
const close = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ minimize, toggleMaximize, close }),
}));

import Titlebar from "../Titlebar.vue";

describe("Titlebar", () => {
  it("emits toggleSidebar from the sidebar button", async () => {
    const w = mount(Titlebar, { props: { sidebarOpen: true } });
    await w.find(".tb-sidebar").trigger("click");
    expect(w.emitted("toggleSidebar")).toHaveLength(1);
  });

  it("wires window controls", async () => {
    const w = mount(Titlebar, { props: { sidebarOpen: true } });
    await w.find(".tb-min").trigger("click");
    await w.find(".tb-max").trigger("click");
    await w.find(".tb-close").trigger("click");
    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("has a drag region", () => {
    const w = mount(Titlebar, { props: { sidebarOpen: true } });
    expect(w.find("[data-tauri-drag-region]").exists()).toBe(true);
  });
});
