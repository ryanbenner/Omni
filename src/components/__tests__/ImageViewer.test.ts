import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

import ImageViewer from "../ImageViewer.vue";
import { settings, loadSettings } from "../../composables/settings";

const item = { path: "/p/a.jpg", kind: "image" as const, name: "a.jpg", mtime: 1, size: 0 };

describe("ImageViewer pill", () => {
  it("labels pill buttons with instant tooltips instead of title", () => {
    const w = mount(ImageViewer, { props: { item } });
    const tips = w.findAll(".pill-btn").map((b) => b.attributes("data-tip"));
    expect(tips).toContain("Rotate (R)");
    expect(tips).toContain("Fit to window (F)");
    expect(w.findAll(".pill-btn[title]")).toHaveLength(0);
  });

  it("has a collage mode button and emits collage on click and on the key action", async () => {
    const w = mount(ImageViewer, { props: { item } });
    const btn = w.find(".pill-btn[data-tip='Collage mode (C)']");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(w.emitted("collage")).toHaveLength(1);
    const vm = w.vm as unknown as { handleAction: (a: { type: string }) => boolean };
    expect(vm.handleAction({ type: "enterCollage" })).toBe(true);
    expect(w.emitted("collage")).toHaveLength(2);
  });
});

describe("ImageViewer zoom step", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
  });

  it("scroll and the pill buttons use the configured step", async () => {
    settings.image.zoomStep = "coarse";
    const w = mount(ImageViewer, { props: { item } });
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    expect(w.find(".pill-pct").text()).toBe("120%");
    await w.find(".pill-btn[data-tip='Zoom out']").trigger("click");
    expect(w.find(".pill-pct").text()).toBe("100%");
    settings.image.zoomStep = "fine";
    await w.vm.$nextTick();
    await w.find(".image-viewer").trigger("wheel", { deltaY: -100 });
    expect(w.find(".pill-pct").text()).toBe("105%");
  });
});

describe("ImageViewer delete", () => {
  beforeEach(() => {
    localStorage.clear();
    loadSettings();
    document.body.innerHTML = "";
  });

  it("has a trash button first in the pill, followed by a divider", () => {
    const w = mount(ImageViewer, { props: { item } });
    const pill = w.find(".pill").element;
    const first = pill.children[0];
    expect(first.querySelector(".pill-btn[data-tip='Delete file'] .ph-trash")).not.toBeNull();
    expect(pill.children[1].classList.contains("pill-div")).toBe(true);
  });

  it("asks in a popover and emits deleteFile only on Yes", async () => {
    const w = mount(ImageViewer, { props: { item }, attachTo: document.body });
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    expect(w.find(".confirm-pop").text()).toContain("Are you sure?");
    expect(w.emitted("deleteFile")).toBeUndefined();
    await w.find(".confirm-pop .btn-no").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    await w.find(".confirm-pop .btn-yes").trigger("click");
    expect(w.emitted("deleteFile")).toHaveLength(1);
    expect(w.find(".confirm-pop").exists()).toBe(false);
    w.unmount();
  });

  it("a press elsewhere, another pill button, or Escape closes it with no action", async () => {
    const w = mount(ImageViewer, { props: { item }, attachTo: document.body });
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    window.dispatchEvent(new Event("pointerdown"));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("pointerdown");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(w.emitted("deleteFile")).toBeUndefined();
    w.unmount();
  });

  it("deletes at once when confirmation is off", async () => {
    settings.general.confirmDelete = false;
    const w = mount(ImageViewer, { props: { item } });
    await w.find(".pill-btn[data-tip='Delete file']").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(w.emitted("deleteFile")).toHaveLength(1);
  });
});
