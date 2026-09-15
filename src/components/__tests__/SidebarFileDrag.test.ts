import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (p: string) => `asset://${p}`,
}));
const messageMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  message: (...args: unknown[]) => messageMock(...args),
}));

const startDragMock = vi.fn();
vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: (...args: unknown[]) => startDragMock(...args),
}));

const thumbMock = vi.fn();
vi.mock("../../composables/dragPreview", () => ({
  filePreview: (name: string) => `pill:${name}`,
  videoThumbnail: (url: string) => thumbMock(url),
}));

import Sidebar from "../Sidebar.vue";

const VIDEO = "C:\\clips\\a_clip.mp4";
const IMAGE = "C:\\clips\\shot.png";

function wire() {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
    if (cmd === "read_dir_entries")
      return Promise.resolve({
        folders: [],
        files: [
          { path: VIDEO, name: "a_clip.mp4", kind: "video", mtime: 0, size: 1 },
          { path: IMAGE, name: "shot.png", kind: "image", mtime: 0, size: 1 },
        ],
      });
    return Promise.reject(`unexpected ${cmd}`);
  });
}

async function mountOpen() {
  const w = mount(Sidebar, {
    props: { currentPath: VIDEO, currentFolder: "C:\\clips" },
    attachTo: document.body,
  });
  await flushPromises();
  return w;
}

async function fire(w: ReturnType<typeof mount>, el: Element, type: string, init: MouseEventInit) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await w.vm.$nextTick();
}

// the browser fires dragstart once the held pointer moves; jsdom has no
// DragEvent, a cancelable Event carries what the handler needs
async function dragStart(w: ReturnType<typeof mount>, el: Element) {
  const e = new Event("dragstart", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  await w.vm.$nextTick();
  return e;
}

function row(w: ReturnType<typeof mount>, name: string) {
  return w.findAll(".tree-row").find((r) => r.attributes("title") === name)!.element;
}

async function holdAndDrag(w: ReturnType<typeof mount>, el: Element) {
  await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
  const e = await dragStart(w, el);
  await flushPromises();
  return e;
}

describe("Sidebar file drag out", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    startDragMock.mockReset();
    startDragMock.mockResolvedValue(undefined);
    thumbMock.mockReset();
    thumbMock.mockResolvedValue("thumb");
    messageMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    // jsdom has no scrollIntoView; the sidebar calls it after revealing the open file
    Element.prototype.scrollIntoView = vi.fn();
    wire();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("file rows are draggable, folder rows are not", async () => {
    const w = await mountOpen();
    expect(row(w, "shot.png").getAttribute("draggable")).toBe("true");
    expect(w.findAll(".tree-row")[0].attributes("draggable")).not.toBe("true");
  });

  it("dragstart on an image row cancels the browser drag and starts a native copy drag", async () => {
    const w = await mountOpen();
    const el = row(w, "shot.png");
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    const e = await dragStart(w, el);
    expect(e.defaultPrevented).toBe(true);
    // requested synchronously so the os drag begins where the pointer is now
    expect(startDragMock).toHaveBeenCalledTimes(1);
    expect(startDragMock.mock.calls[0][0]).toEqual({
      item: [IMAGE],
      icon: "pill:shot.png",
      mode: "copy",
    });
    expect(thumbMock).not.toHaveBeenCalled();
  });

  it("hovering a video row warms a frame thumbnail that the drag then uses", async () => {
    const w = await mountOpen();
    const el = row(w, "a_clip.mp4");
    await fire(w, el, "pointerenter", {});
    await flushPromises();
    expect(thumbMock).toHaveBeenCalledWith(`asset://${VIDEO}`);
    await holdAndDrag(w, el);
    expect(startDragMock.mock.calls[0][0]).toEqual({ item: [VIDEO], icon: "thumb", mode: "copy" });
    // cached: a second hover or drag does not decode the video again
    await fire(w, el, "pointerenter", {});
    await holdAndDrag(w, el);
    expect(thumbMock).toHaveBeenCalledTimes(1);
    expect(startDragMock.mock.calls[1][0].icon).toBe("thumb");
  });

  it("starts the drag immediately with the pill when the thumbnail is not ready yet", async () => {
    let resolveThumb: (s: string) => void = () => {};
    thumbMock.mockReturnValue(new Promise<string>((r) => (resolveThumb = r)));
    const w = await mountOpen();
    const el = row(w, "a_clip.mp4");
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await dragStart(w, el);
    // no awaiting: the native drag is requested within the dragstart turn
    expect(startDragMock).toHaveBeenCalledTimes(1);
    expect(startDragMock.mock.calls[0][0].icon).toBe("pill:a_clip.mp4");
    resolveThumb("thumb");
    await flushPromises();
    // the late thumbnail is kept for the next drag
    await holdAndDrag(w, el);
    expect(startDragMock.mock.calls[1][0].icon).toBe("thumb");
  });

  it("pressing on a video row also warms the thumbnail", async () => {
    const w = await mountOpen();
    await fire(w, row(w, "a_clip.mp4"), "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    expect(thumbMock).toHaveBeenCalledWith(`asset://${VIDEO}`);
  });

  it("a thumbnail that cannot be read is retried later and the pill is used meanwhile", async () => {
    thumbMock.mockRejectedValueOnce(new Error("nope"));
    const w = await mountOpen();
    const el = row(w, "a_clip.mp4");
    await fire(w, el, "pointerenter", {});
    await flushPromises();
    await dragStart(w, el);
    expect(startDragMock.mock.calls[0][0].icon).toBe("pill:a_clip.mp4");
    await fire(w, el, "pointerenter", {});
    await flushPromises();
    expect(thumbMock).toHaveBeenCalledTimes(2);
    await dragStart(w, el);
    expect(startDragMock.mock.calls[1][0].icon).toBe("thumb");
  });

  it("the release that ends a drag does not open the file, later clicks do", async () => {
    vi.useFakeTimers();
    const w = await mountOpen();
    const el = row(w, "shot.png");
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await dragStart(w, el);
    await vi.advanceTimersByTimeAsync(0);
    expect(startDragMock).toHaveBeenCalledTimes(1);
    await fire(w, el, "click", {});
    expect(w.emitted("openFile")).toBeUndefined();
    // the drag was cancelled with no click at all: the next real click opens
    await vi.advanceTimersByTimeAsync(400);
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, el, "pointerup", { clientX: 10, clientY: 10 });
    await fire(w, el, "click", {});
    expect(w.emitted("openFile")).toEqual([[IMAGE]]);
  });

  it("a plain click opens the file without dragging", async () => {
    const w = await mountOpen();
    const el = row(w, "shot.png");
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, el, "pointerup", { clientX: 11, clientY: 10 });
    await fire(w, el, "click", {});
    await flushPromises();
    expect(startDragMock).not.toHaveBeenCalled();
    expect(w.emitted("openFile")).toEqual([[IMAGE]]);
  });

  it("a failed drag shows an error dialog and leaves clicks working", async () => {
    vi.useFakeTimers();
    startDragMock.mockRejectedValue("os said no");
    const w = await mountOpen();
    const el = row(w, "shot.png");
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await dragStart(w, el);
    await vi.advanceTimersByTimeAsync(0);
    expect(messageMock).toHaveBeenCalledWith("os said no", { title: "Drag failed", kind: "error" });
    await vi.advanceTimersByTimeAsync(400);
    await fire(w, el, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await fire(w, el, "pointerup", { clientX: 10, clientY: 10 });
    await fire(w, el, "click", {});
    expect(w.emitted("openFile")).toEqual([[IMAGE]]);
  });
});
