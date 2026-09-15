import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));

const startDragMock = vi.fn();
vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: (...args: unknown[]) => startDragMock(...args),
}));

vi.mock("../../composables/dragPreview", () => ({
  filePreview: (name: string) => `data:image/png;base64,${name}`,
}));

import Sidebar from "../Sidebar.vue";

const FILE = "C:\\clips\\a_clip.mp4";

function wire() {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
    if (cmd === "read_dir_entries")
      return Promise.resolve({
        folders: [],
        files: [{ path: FILE, name: "a_clip.mp4", kind: "video", mtime: 0, size: 1 }],
      });
    return Promise.reject(`unexpected ${cmd}`);
  });
}

async function mountOpen() {
  const w = mount(Sidebar, {
    props: { currentPath: FILE, currentFolder: "C:\\clips" },
    attachTo: document.body,
  });
  await flushPromises();
  return w;
}

async function fire(w: ReturnType<typeof mount>, el: Element, type: string, init: MouseEventInit) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await w.vm.$nextTick();
}

function fileRow(w: ReturnType<typeof mount>) {
  return w.findAll(".tree-row").find((r) => r.attributes("title") === "a_clip.mp4")!.element;
}

describe("Sidebar file drag out", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    startDragMock.mockReset();
    startDragMock.mockResolvedValue(undefined);
    localStorage.clear();
    document.body.innerHTML = "";
    // jsdom has no scrollIntoView; the sidebar calls it after revealing the open file
    Element.prototype.scrollIntoView = vi.fn();
    wire();
  });

  it("hold and move on a file row starts a native drag with the file path", async () => {
    const w = await mountOpen();
    const row = fileRow(w);
    await fire(w, row, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    expect(startDragMock).not.toHaveBeenCalled();
    await fire(w, row, "pointermove", { clientX: 12, clientY: 10 });
    expect(startDragMock).not.toHaveBeenCalled();
    await fire(w, row, "pointermove", { clientX: 20, clientY: 10 });
    expect(startDragMock).toHaveBeenCalledTimes(1);
    expect(startDragMock.mock.calls[0][0]).toEqual({
      item: [FILE],
      icon: "data:image/png;base64,a_clip.mp4",
    });
    // further movement in the same hold does not start a second drag
    await fire(w, row, "pointermove", { clientX: 40, clientY: 10 });
    expect(startDragMock).toHaveBeenCalledTimes(1);
  });

  it("the click that ends a drag does not open the file", async () => {
    const w = await mountOpen();
    const row = fileRow(w);
    await fire(w, row, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, row, "pointermove", { clientX: 30, clientY: 10 });
    await fire(w, row, "pointerup", { clientX: 30, clientY: 10 });
    await fire(w, row, "click", {});
    expect(w.emitted("openFile")).toBeUndefined();
    // a fresh plain click afterwards opens it
    await fire(w, row, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, row, "pointerup", { clientX: 10, clientY: 10 });
    await fire(w, row, "click", {});
    expect(w.emitted("openFile")).toEqual([[FILE]]);
  });

  it("a plain click opens the file without dragging", async () => {
    const w = await mountOpen();
    const row = fileRow(w);
    await fire(w, row, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, row, "pointerup", { clientX: 11, clientY: 10 });
    await fire(w, row, "click", {});
    expect(startDragMock).not.toHaveBeenCalled();
    expect(w.emitted("openFile")).toEqual([[FILE]]);
  });

  it("folder rows do not start a drag", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
      if (cmd === "read_dir_entries")
        return Promise.resolve({ folders: [{ path: "C:\\clips", name: "clips" }], files: [] });
      return Promise.reject(`unexpected ${cmd}`);
    });
    const w = mount(Sidebar, {
      props: { currentPath: null, currentFolder: null },
      attachTo: document.body,
    });
    await flushPromises();
    await fire(w, w.findAll(".tree-row")[0].element, "click", {});
    await flushPromises();
    const row = w.findAll(".tree-row").find((r) => r.attributes("title") === "clips")!.element;
    await fire(w, row, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, row, "pointermove", { clientX: 30, clientY: 10 });
    expect(startDragMock).not.toHaveBeenCalled();
  });
});
