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
});
