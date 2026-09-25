import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
  convertFileSrc: (p: string) => `asset://${p}`,
}));
vi.mock("@tauri-apps/plugin-cli", () => ({ getMatches: vi.fn(() => Promise.reject("no cli")) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn(), save: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
const closeHandlers: ((e: { preventDefault: () => void }) => Promise<void>)[] = [];
const destroyMock = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (h: (e: { preventDefault: () => void }) => Promise<void>) => {
      closeHandlers.push(h);
      return Promise.resolve(() => {});
    },
    destroy: destroyMock,
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(() => Promise.resolve(true)),
  watch: vi.fn(() => Promise.resolve(() => {})),
}));
const readCollageMock = vi.fn();
vi.mock("../../composables/collageFile", async (orig) => ({
  ...(await orig<typeof import("../../composables/collageFile")>()),
  readCollage: (...a: unknown[]) => readCollageMock(...a),
}));

// the wall's own behavior is covered in CollageWall.test.ts; here it is a
// stub that records what App asks of it
const wallSpies = { addPaths: vi.fn(), requestLeave: vi.fn(), dirty: false, lastPath: "/p/last.jpg" };
const WallStub = defineComponent({
  name: "CollageWall",
  props: ["init"],
  emits: ["exit", "status", "selected", "reveal"],
  setup(_, { expose }) {
    expose({
      addPaths: wallSpies.addPaths,
      requestLeave: wallSpies.requestLeave,
      handleAction: () => true,
      isDirty: () => wallSpies.dirty,
      lastPath: () => wallSpies.lastPath,
    });
    return () => h("div", { class: "wall-stub" });
  },
});
// __esModule so defineAsyncComponent unwraps default from the mocked namespace
vi.mock("../CollageWall.vue", () => ({ __esModule: true, default: WallStub }));

import App from "../../App.vue";
import Sidebar from "../Sidebar.vue";
import { message } from "@tauri-apps/plugin-dialog";
import { emptyDoc } from "../../composables/collageFile";

const scan = (path: string) => ({
  items: [{ path, kind: path.endsWith(".mp4") ? "video" : "image", name: path.slice(3), mtime: 1, size: 0 }],
  startIndex: 0,
});

describe("App collage routing", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "scan_media") return Promise.resolve(scan(args!.path!));
      if (cmd === "list_drives") return Promise.resolve([]);
      if (cmd === "read_dir_entries") return Promise.resolve({ folders: [], files: [] });
      return Promise.reject(`unexpected ${cmd}`);
    });
    readCollageMock.mockReset().mockResolvedValue(emptyDoc());
    wallSpies.addPaths.mockReset();
    wallSpies.requestLeave.mockReset().mockResolvedValue(true);
    wallSpies.dirty = false;
    closeHandlers.length = 0;
    destroyMock.mockReset();
    vi.mocked(message).mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  async function mountApp() {
    const w = mount(App, { attachTo: document.body });
    await flushPromises();
    return w;
  }
  const app = (w: ReturnType<typeof mount>) =>
    w.vm as unknown as { openFile: (p: string) => Promise<void>; enterCollage: (seed: string[]) => void };

  it("opening a .collage path shows the wall instead of the viewer", async () => {
    const w = await mountApp();
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(readCollageMock).toHaveBeenCalledWith("/p/w.collage");
    expect(w.find(".wall-stub").exists()).toBe(true);
    expect(invokeMock).not.toHaveBeenCalledWith("scan_media", expect.anything());
    w.unmount();
  });

  it("a bad collage file shows an error and stays out of collage mode", async () => {
    readCollageMock.mockRejectedValue(new Error("unsupported collage version 9"));
    const w = await mountApp();
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(w.find(".wall-stub").exists()).toBe(false);
    expect(w.find(".error-text").text()).toContain("unsupported collage version 9");
    w.unmount();
  });

  it("entering from the viewer seeds the wall with the open picture, and later image opens add to it", async () => {
    const w = await mountApp();
    await app(w).openFile("/p/a.jpg");
    await flushPromises();
    app(w).enterCollage(["/p/a.jpg"]);
    await flushPromises();
    const init = w.findComponent(WallStub).props("init");
    expect(init.seedPaths).toEqual(["/p/a.jpg"]);
    await app(w).openFile("/p/b.png");
    expect(wallSpies.addPaths).toHaveBeenCalledWith(["/p/b.png"]);
    w.unmount();
  });

  it("opening a video on the wall asks to leave first; a refusal stays", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await flushPromises();
    wallSpies.requestLeave.mockResolvedValue(false);
    await app(w).openFile("/p/v.mp4");
    await flushPromises();
    expect(wallSpies.requestLeave).toHaveBeenCalledWith(false);
    expect(w.find(".wall-stub").exists()).toBe(true);
    wallSpies.requestLeave.mockResolvedValue(true);
    await app(w).openFile("/p/v.mp4");
    await flushPromises();
    expect(w.find(".wall-stub").exists()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("scan_media", { path: "/p/v.mp4" });
    w.unmount();
  });

  it("closing the window with a dirty wall asks, and destroys only on yes", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await flushPromises();
    wallSpies.dirty = true;
    const prevent = vi.fn();
    wallSpies.requestLeave.mockResolvedValue(false);
    await closeHandlers[0]({ preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(wallSpies.requestLeave).toHaveBeenCalledWith(true);
    expect(destroyMock).not.toHaveBeenCalled();
    wallSpies.requestLeave.mockResolvedValue(true);
    await closeHandlers[0]({ preventDefault: vi.fn() });
    expect(destroyMock).toHaveBeenCalled();
    w.unmount();
  });

  it("offers to resume the last collage on the empty screen", async () => {
    localStorage.setItem("mv-last-collage", "/p/weekend.collage");
    const w = await mountApp();
    const btn = w.find(".resume-btn");
    expect(btn.text()).toBe("Resume weekend.collage");
    await btn.trigger("click");
    await flushPromises();
    expect(readCollageMock).toHaveBeenCalledWith("/p/weekend.collage");
    expect(w.find(".wall-stub").exists()).toBe(true);
    w.unmount();
  });

  it("the wall's exit event runs the leave gate; a refusal stays, a yes reopens the last picture", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await flushPromises();
    wallSpies.requestLeave.mockResolvedValue(false);
    w.findComponent(WallStub).vm.$emit("exit", "/p/last.jpg");
    await flushPromises();
    expect(wallSpies.requestLeave).toHaveBeenCalledWith(false);
    expect(w.find(".wall-stub").exists()).toBe(true);
    wallSpies.requestLeave.mockResolvedValue(true);
    w.findComponent(WallStub).vm.$emit("exit", "/p/last.jpg");
    await flushPromises();
    expect(w.find(".wall-stub").exists()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("scan_media", { path: "/p/last.jpg" });
    w.unmount();
  });

  it("the c key on the wall leaves through the gate and reopens the last picture", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    await flushPromises();
    expect(wallSpies.requestLeave).toHaveBeenCalledWith(false);
    expect(w.find(".wall-stub").exists()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("scan_media", { path: "/p/last.jpg" });
    w.unmount();
  });

  it("the viewer's collage button seeds the wall with the open picture", async () => {
    const w = await mountApp();
    await app(w).openFile("/p/a.jpg");
    await flushPromises();
    await w.find(".pill-btn[data-tip='Collage mode (C)']").trigger("click");
    await flushPromises();
    expect(w.findComponent(WallStub).props("init").seedPaths).toEqual(["/p/a.jpg"]);
    w.unmount();
  });

  it("the sidebar's Collage entry seeds with the open picture, alone when nothing is open, and adds once open", async () => {
    const w = await mountApp();
    w.findComponent(Sidebar).vm.$emit("addToCollage", "/p/b.png");
    await flushPromises();
    expect(w.findComponent(WallStub).props("init").seedPaths).toEqual(["/p/b.png"]);
    w.findComponent(Sidebar).vm.$emit("addToCollage", "/p/c.png");
    expect(wallSpies.addPaths).toHaveBeenCalledWith(["/p/c.png"]);
    w.unmount();

    const w2 = await mountApp();
    await app(w2).openFile("/p/a.jpg");
    await flushPromises();
    w2.findComponent(Sidebar).vm.$emit("addToCollage", "/p/b.png");
    await flushPromises();
    expect(w2.findComponent(WallStub).props("init").seedPaths).toEqual(["/p/a.jpg", "/p/b.png"]);
    w2.unmount();
  });

  it("closing the window with a clean wall lets the close through", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await flushPromises();
    const prevent = vi.fn();
    await closeHandlers[0]({ preventDefault: prevent });
    expect(prevent).not.toHaveBeenCalled();
    expect(wallSpies.requestLeave).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
    w.unmount();
  });

  it("a bad collage opened over a picture reports through a dialog", async () => {
    readCollageMock.mockRejectedValue(new Error("unsupported collage version 9"));
    const w = await mountApp();
    await app(w).openFile("/p/a.jpg");
    await flushPromises();
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(message).toHaveBeenCalledWith(expect.stringContaining("unsupported collage version 9"), {
      title: "Couldn't open collage",
      kind: "error",
    });
    w.unmount();
  });

  it("a collage error does not outlive the next file open", async () => {
    readCollageMock.mockRejectedValue(new Error("unsupported collage version 9"));
    const w = await mountApp();
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "scan_media") return Promise.reject("scan failed");
      if (cmd === "list_drives") return Promise.resolve([]);
      if (cmd === "read_dir_entries") return Promise.resolve({ folders: [], files: [] });
      return Promise.reject(`unexpected ${cmd}`);
    });
    await app(w).openFile("/p/x.jpg");
    await flushPromises();
    expect(w.find(".error-text").text()).toBe("scan failed");
    w.unmount();
  });

  it("before the wall chunk mounts, a video open or the c key still leaves", async () => {
    const w = await mountApp();
    app(w).enterCollage([]);
    await app(w).openFile("/p/v.mp4");
    await flushPromises();
    expect(w.find(".wall-stub").exists()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("scan_media", { path: "/p/v.mp4" });

    app(w).enterCollage([]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    await flushPromises();
    expect(w.find(".wall-stub").exists()).toBe(false);
    w.unmount();
  });

  it("a bad collage opened over a dirty wall reports without asking to leave and keeps the wall", async () => {
    const w = await mountApp();
    app(w).enterCollage(["/p/a.jpg"]);
    await flushPromises();
    wallSpies.dirty = true;
    readCollageMock.mockRejectedValue(new Error("unsupported collage version 9"));
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(wallSpies.requestLeave).not.toHaveBeenCalled();
    expect(w.find(".wall-stub").exists()).toBe(true);
    expect(w.findComponent(WallStub).props("init").seedPaths).toEqual(["/p/a.jpg"]);
    expect(message).toHaveBeenCalledWith(expect.stringContaining("unsupported collage version 9"), {
      title: "Couldn't open collage",
      kind: "error",
    });
    w.unmount();
  });

  it("a good collage opened over the wall reads first, then gates; a refusal keeps the current wall", async () => {
    const w = await mountApp();
    app(w).enterCollage(["/p/a.jpg"]);
    await flushPromises();
    wallSpies.requestLeave.mockResolvedValue(false);
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(readCollageMock).toHaveBeenCalledWith("/p/w.collage");
    expect(wallSpies.requestLeave).toHaveBeenCalledWith(false);
    expect(w.findComponent(WallStub).props("init").seedPaths).toEqual(["/p/a.jpg"]);
    wallSpies.requestLeave.mockResolvedValue(true);
    await app(w).openFile("/p/w.collage");
    await flushPromises();
    expect(w.findComponent(WallStub).props("init").path).toBe("/p/w.collage");
    w.unmount();
  });

  it("on the wall, the sidebar highlights the selected item and re-reveals on request", async () => {
    const w = await mountApp();
    await app(w).openFile("/p/a.jpg");
    await flushPromises();
    app(w).enterCollage(["/p/a.jpg"]);
    await flushPromises();
    expect(w.findComponent(Sidebar).props("currentPath")).toBeNull();
    w.findComponent(WallStub).vm.$emit("selected", "/p/b.png");
    await flushPromises();
    expect(w.findComponent(Sidebar).props("currentPath")).toBe("/p/b.png");
    w.findComponent(WallStub).vm.$emit("reveal", "/p/c.png");
    await flushPromises();
    expect(w.findComponent(Sidebar).props("currentPath")).toBe("/p/c.png");
    w.findComponent(WallStub).vm.$emit("selected", null);
    await flushPromises();
    expect(w.findComponent(Sidebar).props("currentPath")).toBeNull();
    w.unmount();
  });
});
