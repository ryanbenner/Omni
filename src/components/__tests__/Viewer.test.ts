import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import Viewer from "../Viewer.vue";
import type { MediaItem } from "../../types";

const videoItem: MediaItem = {
  path: "/f/a.mp4",
  kind: "video",
  name: "a.mp4",
  mtime: 1,
};
const imageItem: MediaItem = {
  path: "/f/b.jpg",
  kind: "image",
  name: "b.jpg",
  mtime: 2,
};

describe("Viewer", () => {
  it("renders VideoPlayer for videos", () => {
    const w = mount(Viewer, { props: { item: videoItem } });
    expect(w.find("video").exists()).toBe(true);
    expect(w.find("img").exists()).toBe(false);
  });

  it("renders ImageViewer for images", () => {
    const w = mount(Viewer, { props: { item: imageItem } });
    expect(w.find("img").exists()).toBe(true);
    expect(w.find("video").exists()).toBe(false);
  });

  it("forwards handleAction to the mounted child", () => {
    const w = mount(Viewer, { props: { item: imageItem } });
    const exposed = w.vm as unknown as {
      handleAction: (a: { type: string }) => boolean;
    };
    expect(exposed.handleAction({ type: "rotate" })).toBe(true);
    expect(exposed.handleAction({ type: "playPause" })).toBe(false);
  });
});
