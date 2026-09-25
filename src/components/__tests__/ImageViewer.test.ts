import { describe, it, expect, vi } from "vitest";
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
