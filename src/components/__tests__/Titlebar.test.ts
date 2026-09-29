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

  it("orders brand, file tree toggle, gear, then the window controls", () => {
    const w = mount(Titlebar, { props: { sidebarOpen: true } });
    const names = ["tb-brand", "tb-sidebar", "tb-gear", "tb-controls"];
    const order = w
      .findAll(".tb-brand, .tb-sidebar, .tb-gear, .tb-controls")
      .map((n) => names.find((c) => n.classes().includes(c)));
    expect(order).toEqual(names);
  });

  it("the gear emits toggleSettings and shows active while open", async () => {
    const w = mount(Titlebar, { props: { sidebarOpen: true, settingsOpen: false } });
    expect(w.find(".tb-gear").classes()).not.toContain("active");
    expect(w.find(".tb-gear i").classes()).toContain("ph-gear");
    await w.find(".tb-gear").trigger("click");
    expect(w.emitted("toggleSettings")).toHaveLength(1);
    await w.setProps({ settingsOpen: true });
    expect(w.find(".tb-gear").classes()).toContain("active");
  });
});
