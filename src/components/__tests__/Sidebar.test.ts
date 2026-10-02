import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ watch: () => Promise.resolve(() => {}) }));

import { ask } from "@tauri-apps/plugin-dialog";
import { settings, loadSettings } from "../../composables/settings";
import Sidebar from "../Sidebar.vue";

const ROW = 26;

function wire() {
  invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
    if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
    if (cmd === "read_dir_entries") {
      if (args?.path === "C:\\")
        return Promise.resolve({
          folders: [
            { path: "C:\\A", name: "A" },
            { path: "C:\\B", name: "B" },
            { path: "C:\\C", name: "C" },
          ],
          files: [],
        });
      return Promise.resolve({ folders: [], files: [] });
    }
    return Promise.reject(`unexpected ${cmd}`);
  });
}

async function mountWithPins() {
  localStorage.setItem(
    "mv-pins",
    JSON.stringify([
      { path: "C:\\A", name: "A", count: 0 },
      { path: "C:\\B", name: "B", count: 0 },
      { path: "C:\\C", name: "C", count: 0 },
    ]),
  );
  // attached so pointer events bubble up to the window-level drag listeners
  const w = mount(Sidebar, {
    props: { currentPath: null, currentFolder: null },
    attachTo: document.body,
  });
  await flushPromises();
  // jsdom has no layout: give each pin row a real vertical extent
  w.findAll(".pin-row").forEach((r, i) => {
    (r.element as HTMLElement).getBoundingClientRect = () =>
      ({ top: i * ROW, bottom: (i + 1) * ROW, height: ROW }) as DOMRect;
  });
  return w;
}

// jsdom lacks PointerEvent and its MouseEvent has read-only fields, so the
// pointer sequence is dispatched by hand instead of through trigger()
async function fire(w: ReturnType<typeof mount>, el: Element, type: string, init: MouseEventInit) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await w.vm.$nextTick();
}

function names(w: ReturnType<typeof mount>) {
  return w.findAll(".pin-row .row-name").map((n) => n.text());
}

describe("Sidebar pin drag", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    wire();
    // jsdom has no scrollBy; opening a pin scrolls its contents under it
    Element.prototype.scrollBy = vi.fn();
  });

  it("dragging a pin shows a drop bar and reorders on release", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[0].element, "pointerdown", { button: 0, clientY: 13 });
    expect(w.find(".drop-bar").exists()).toBe(false);
    // into the lower half of row B: slot is after B
    await fire(w, rows[0].element, "pointermove", { clientY: 45 });
    expect(w.find(".drop-bar").exists()).toBe(true);
    await fire(w, rows[0].element, "pointerup", { clientY: 45 });
    expect(w.find(".drop-bar").exists()).toBe(false);
    expect(names(w)).toEqual(["B", "A", "C"]);
  });

  it("a ghost pill with the held pin's name follows the pointer", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[0].element, "pointerdown", { button: 0, clientX: 20, clientY: 13 });
    expect(w.find(".drag-ghost").exists()).toBe(false);
    await fire(w, rows[0].element, "pointermove", { clientX: 30, clientY: 45 });
    const ghost = w.find(".drag-ghost");
    expect(ghost.exists()).toBe(true);
    expect(ghost.text()).toBe("A");
    expect((ghost.element as HTMLElement).style.transform).toBe("translate(30px, 45px)");
    await fire(w, rows[0].element, "pointerup", { clientX: 30, clientY: 45 });
    expect(w.find(".drag-ghost").exists()).toBe(false);
  });

  it("no drop bar is shown at a slot that would not move the pin", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[1].element, "pointerdown", { button: 0, clientY: 39 });
    // upper half of B itself: slot 1, directly above the held row
    await fire(w, rows[1].element, "pointermove", { clientY: 30 });
    expect(w.find(".drop-bar").exists()).toBe(false);
    // lower half of B: slot 2, directly below the held row
    await fire(w, rows[1].element, "pointermove", { clientY: 48 });
    expect(w.find(".drop-bar").exists()).toBe(false);
    // lower half of C: slot 3, a real move
    await fire(w, rows[1].element, "pointermove", { clientY: 70 });
    expect(w.find(".drop-bar").exists()).toBe(true);
    await fire(w, rows[1].element, "pointerup", { clientY: 48 });
    expect(names(w)).toEqual(["A", "B", "C"]);
  });

  it("a plain click still opens the pin and does not reorder", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[1].element, "pointerdown", { button: 0, clientY: 39 });
    await fire(w, rows[1].element, "pointerup", { clientY: 40 });
    await fire(w, rows[1].element, "click", {  });
    await flushPromises();
    // the pin opens the chain down to it; the pin list stays open
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:", "A", "B", "C"]);
    expect(w.find(".pins-head").classes()).toContain("open");
    expect(w.find(".pins-head").text()).toBe("PINNED");
    expect(names(w)).toEqual(["A", "B", "C"]);
    // only the caret folds it, to a single row, and brings it back
    await w.find(".pins-head").trigger("click");
    expect(w.find(".pins-head").classes()).toContain("closed");
    expect(w.find(".pins-list").exists()).toBe(false);
    await w.find(".pins-head").trigger("click");
    expect(names(w)).toEqual(["A", "B", "C"]);
  });

  it("the click that ends a drag does not open the pin", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[2].element, "pointerdown", { button: 0, clientY: 65 });
    await fire(w, rows[2].element, "pointermove", { clientY: 5 });
    await fire(w, rows[2].element, "pointerup", { clientY: 5 });
    await fire(w, rows[2].element, "click", {  });
    await flushPromises();
    expect(names(w)).toEqual(["C", "A", "B"]);
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:"]);
  });
});

describe("Sidebar focus resync", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    wire();
  });

  // a pin path no other test uses, so sidebars left mounted by earlier
  // tests cannot answer the focus event for it
  it("re-reads pinned folders when the window regains focus", async () => {
    localStorage.setItem("mv-pins", JSON.stringify([{ path: "C:\\Z", name: "Z", count: 0 }]));
    const w = mount(Sidebar, { props: { currentPath: null, currentFolder: null } });
    await flushPromises();
    const readsOfZ = () =>
      invokeMock.mock.calls.filter((c) => c[0] === "read_dir_entries" && c[1].path === "C:\\Z")
        .length;
    invokeMock.mockClear();
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(readsOfZ()).toBe(1);
    w.unmount();
    invokeMock.mockClear();
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(readsOfZ()).toBe(0);
  });
});

describe("Sidebar collage entry", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
      if (cmd === "read_dir_entries")
        return Promise.resolve({
          folders: [],
          files: [
            { path: "C:\\a.jpg", kind: "image", name: "a.jpg", mtime: 2, size: 0 },
            { path: "C:\\b.heic", kind: "image", name: "b.heic", mtime: 1, size: 0 },
            { path: "C:\\v.mp4", kind: "video", name: "v.mp4", mtime: 0, size: 0 },
          ],
        });
      return Promise.reject(`unexpected ${cmd}`);
    });
  });

  it("offers Collage for encodable images only and emits addToCollage", async () => {
    const w = mount(Sidebar, { props: { currentPath: null, currentFolder: null }, attachTo: document.body });
    await flushPromises();
    await w.find(".tree-row").trigger("click"); // expand C:
    await flushPromises();
    const rows = w.findAll(".tree-row");
    await rows[1].trigger("contextmenu", { clientX: 5, clientY: 5 }); // a.jpg
    const entry = w.findAll(".menu-item").find((m) => m.text() === "Collage");
    expect(entry).toBeDefined();
    await entry!.trigger("click");
    expect(w.emitted("addToCollage")).toEqual([["C:\\a.jpg"]]);
    await rows[2].trigger("contextmenu", { clientX: 5, clientY: 5 }); // b.heic
    expect(w.findAll(".menu-item").some((m) => m.text() === "Collage")).toBe(false);
    await rows[3].trigger("contextmenu", { clientX: 5, clientY: 5 }); // v.mp4
    expect(w.findAll(".menu-item").some((m) => m.text() === "Collage")).toBe(false);
    w.unmount();
  });
});

describe("Sidebar delete", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.mocked(ask).mockReset();
    localStorage.clear();
    loadSettings();
    document.body.innerHTML = "";
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
      if (cmd === "read_dir_entries")
        return Promise.resolve({
          folders: [],
          files: [{ path: "C:\\a.jpg", kind: "image", name: "a.jpg", mtime: 2, size: 0 }],
        });
      if (cmd === "delete_file") return Promise.resolve();
      return Promise.reject(`unexpected ${cmd}`);
    });
  });

  async function openMenuOnA() {
    const w = mount(Sidebar, { props: { currentPath: null, currentFolder: null }, attachTo: document.body });
    await flushPromises();
    await w.find(".tree-row").trigger("click"); // expand C:
    await flushPromises();
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 });
    return w;
  }

  it("sidebar delete without confirmation still emits fileDeleted", async () => {
    settings.general.confirmDelete = false;
    const w = await openMenuOnA();
    await w.findAll(".menu-item").find((m) => m.text().startsWith("Delete"))!.trigger("click");
    await flushPromises();
    expect(ask).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("delete_file", { path: "C:\\a.jpg" });
    expect(w.emitted("fileDeleted")).toEqual([["C:\\a.jpg"]]);
    w.unmount();
  });

  it("asks in a pill above the row when confirmation is on and deletes only on Yes", async () => {
    const w = await openMenuOnA();
    const row = w.findAll(".tree-row")[1].element as HTMLElement;
    row.getBoundingClientRect = () => ({ left: 12, top: 100 }) as DOMRect;
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 });
    await w.findAll(".menu-item").find((m) => m.text().startsWith("Delete"))!.trigger("click");
    expect(w.find(".context-menu").exists()).toBe(false);
    const pop = w.find(".confirm-pop");
    expect(pop.text()).toContain("Are you sure?");
    expect((pop.element as HTMLElement).style.left).toBe("20px");
    expect((pop.element as HTMLElement).style.bottom).toBe(`${window.innerHeight - 100 + 4}px`);
    expect(ask).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("delete_file", expect.anything());
    await pop.find(".btn-no").trigger("click");
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith("delete_file", expect.anything());
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 });
    await w.findAll(".menu-item").find((m) => m.text().startsWith("Delete"))!.trigger("click");
    await w.find(".confirm-pop .btn-yes").trigger("click");
    await flushPromises();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("delete_file", { path: "C:\\a.jpg" });
    expect(w.emitted("fileDeleted")).toEqual([["C:\\a.jpg"]]);
    w.unmount();
  });

  it("a press elsewhere or Escape closes the pill with no action", async () => {
    const w = await openMenuOnA();
    await w.findAll(".menu-item").find((m) => m.text().startsWith("Delete"))!.trigger("click");
    window.dispatchEvent(new Event("pointerdown"));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 });
    await w.findAll(".menu-item").find((m) => m.text().startsWith("Delete"))!.trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(w.find(".confirm-pop").exists()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith("delete_file", expect.anything());
    w.unmount();
  });
});

describe("Sidebar pin list scrolling", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    wire();
    Element.prototype.scrollBy = vi.fn();
  });

  it("pinning a folder scrolls the list to the bottom", async () => {
    const w = await mountWithPins();
    const list = w.find(".pins-list").element as HTMLElement;
    const set = vi.fn();
    Object.defineProperty(list, "scrollHeight", { value: 300, configurable: true });
    Object.defineProperty(list, "scrollTop", { get: () => 0, set, configurable: true });
    await w.find(".tree-row").trigger("click"); // expand C:
    await flushPromises();
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 }); // A, already pinned
    expect(w.findAll(".menu-item").find((m) => m.text() === "Unpin folder")).toBeDefined();
    await w.findAll(".menu-item").find((m) => m.text() === "Unpin folder")!.trigger("click");
    expect(set).not.toHaveBeenCalled();
    await w.findAll(".tree-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 }); // pin A again
    await w.findAll(".menu-item").find((m) => m.text() === "Pin folder")!.trigger("click");
    await flushPromises();
    expect(names(w)).toEqual(["B", "C", "A"]);
    expect(set).toHaveBeenCalledWith(300);
    w.unmount();
  });

  it("the drop slot follows the pointer when the list scrolls under a held pin", async () => {
    const w = await mountWithPins();
    const rows = w.findAll(".pin-row");
    await fire(w, rows[0].element, "pointerdown", { button: 0, clientY: 13 });
    await fire(w, rows[0].element, "pointermove", { clientY: 45 });
    expect(w.findAll(".pin-row")[1].element.previousElementSibling?.classList.contains("drop-bar")).toBe(false);
    // the list scrolled up by one row: the same pointer now sits over C
    w.findAll(".pin-row").forEach((r, i) => {
      (r.element as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * ROW - ROW, bottom: (i + 1) * ROW - ROW, height: ROW }) as DOMRect;
    });
    await w.find(".pins-list").trigger("scroll");
    // lower half of C now: the slot is after it
    const bars = w.findAll(".drop-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0].element.previousElementSibling).toBe(w.findAll(".pin-row")[2].element);
    await fire(w, rows[0].element, "pointerup", { clientY: 45 });
    w.unmount();
  });
});

describe("Sidebar pin context menu", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    wire();
  });

  it("right-clicking a pinned row offers Unpin folder and removes the pin", async () => {
    const w = await mountWithPins();
    await w.findAll(".pin-row")[1].trigger("contextmenu", { clientX: 5, clientY: 5 });
    const entry = w.findAll(".menu-item").find((m) => m.text() === "Unpin folder");
    expect(entry).toBeDefined();
    await entry!.trigger("click");
    expect(names(w)).toEqual(["A", "C"]);
    expect(w.find(".context-menu").exists()).toBe(false);
    w.unmount();
  });
});

describe("Sidebar reveal folder", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    // jsdom has no scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
      if (cmd === "read_dir_entries") {
        if (args?.path === "C:\\") return Promise.resolve({ folders: [{ path: "C:\\Pics", name: "Pics" }], files: [] });
        if (args?.path === "C:\\Pics\\Sub")
          return Promise.resolve({
            folders: [],
            files: [{ path: "C:\\Pics\\Sub\\x.jpg", kind: "image", name: "x.jpg", mtime: 3, size: 0 }],
          });
        if (args?.path === "C:\\Pics")
          return Promise.resolve({
            folders: [{ path: "C:\\Pics\\Sub", name: "Sub" }],
            files: [
              { path: "C:\\Pics\\a.jpg", kind: "image", name: "a.jpg", mtime: 2, size: 0 },
              { path: "C:\\Pics\\b.jpg", kind: "image", name: "b.jpg", mtime: 1, size: 0 },
            ],
          });
      }
      return Promise.reject(`unexpected ${cmd} ${args?.path}`);
    });
  });

  it("expands the folder, scrolls it to the top and emits folderRevealed", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: null, currentFolder: null, revealFolder: "C:\\Pics" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:", "Pics", "Sub", "a.jpg", "b.jpg"]);
    expect(w.findAll(".tree-row.selected")).toHaveLength(0);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(w.emitted("folderRevealed")).toHaveLength(1);
    w.unmount();
  });

  it("the first file reveal centers the file; later ones scroll the minimum", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\b.jpg", currentFolder: "C:\\Pics" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.find(".tree-row.selected").attributes("title")).toBe("b.jpg");
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: "center" });
    await w.setProps({ currentPath: "C:\\Pics\\a.jpg" });
    await flushPromises();
    expect(w.find(".tree-row.selected").attributes("title")).toBe("a.jpg");
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
    w.unmount();
  });

  // jsdom has no layout: place the tree's first row `hidden` px above the top edge
  function scrolledBy(w: ReturnType<typeof mount>, hidden: number) {
    (w.find(".scroll").element as HTMLElement).getBoundingClientRect = () => ({ top: 28 }) as DOMRect;
    (w.find(".tree-row").element as HTMLElement).getBoundingClientRect = () =>
      ({ top: 28 - hidden }) as DOMRect;
  }
  const stackNames = (w: ReturnType<typeof mount>) => w.findAll(".stack-row").map((r) => r.text());

  it("the open folders above the first visible row stack over the tree, drive first", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual([
      "C:", "Pics", "Sub", "x.jpg", "a.jpg", "b.jpg",
    ]);
    expect(w.find(".stack").exists()).toBe(false);
    // rows C:, Pics and part of Sub are above the edge: all three stack
    scrolledBy(w, 60);
    await w.find(".scroll").trigger("scroll");
    expect(stackNames(w)).toEqual(["C:", "Pics", "Sub"]);
    // a.jpg at the edge: Sub has ended, only C: and Pics enclose it
    scrolledBy(w, 26 * 4);
    await w.find(".scroll").trigger("scroll");
    expect(stackNames(w)).toEqual(["C:", "Pics"]);
    // the drive row exactly at the edge is still visible: nothing stacks
    scrolledBy(w, 0);
    await w.find(".scroll").trigger("scroll");
    expect(w.find(".stack").exists()).toBe(false);
    w.unmount();
  });

  it("with the pin list open, a THIS PC heading stays above the stack", async () => {
    localStorage.setItem("mv-pins", JSON.stringify([{ path: "C:\\Pics", name: "Pics", count: 0 }]));
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.find(".head-label").exists()).toBe(false);
    scrolledBy(w, 60);
    await w.find(".scroll").trigger("scroll");
    expect(w.find(".head-label").text()).toBe("THIS PC");
    expect(w.find(".pins").classes()).toContain("open");
    await w.find(".pins-head").trigger("click"); // fold the list: heading goes with it
    expect(w.find(".head-label").exists()).toBe(false);
    expect(w.find(".pins").classes()).not.toContain("open");
    expect(stackNames(w)).toEqual(["C:", "Pics", "Sub"]);
    w.unmount();
  });

  it("clicking a stacked folder closes it, and what was inside, and scrolls it to the top", async () => {
    Element.prototype.scrollBy = vi.fn();
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    scrolledBy(w, 60);
    await w.find(".scroll").trigger("scroll");
    await w.findAll(".stack-row")[1].trigger("click"); // Pics
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:", "Pics"]);
    expect(Element.prototype.scrollBy).toHaveBeenCalled();
    await w.findAll(".tree-row")[1].trigger("click"); // reopen Pics: Sub stayed closed
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual([
      "C:", "Pics", "Sub", "a.jpg", "b.jpg",
    ]);
    w.unmount();
  });

  it("opening a pin reveals its chain and scrolls its row just out of view", async () => {
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy;
    localStorage.setItem("mv-pins", JSON.stringify([{ path: "C:\\Pics\\Sub", name: "Sub", count: 0 }]));
    const w = mount(Sidebar, { props: { currentPath: null, currentFolder: null }, attachTo: document.body });
    await flushPromises();
    await w.find(".pin-row").trigger("click");
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual([
      "C:", "Pics", "Sub", "x.jpg", "a.jpg", "b.jpg",
    ]);
    // rects are all zero in jsdom, so the move is just the requested -26 offset
    expect(scrollBy).toHaveBeenLastCalledWith(0, 26);
    w.unmount();
  });

  it("a folder set after mount is revealed too", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: null, currentFolder: null, revealFolder: null },
      attachTo: document.body,
    });
    await flushPromises();
    await w.setProps({ revealFolder: "C:\\Pics" });
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:", "Pics", "Sub", "a.jpg", "b.jpg"]);
    expect(w.emitted("folderRevealed")).toHaveLength(1);
    w.unmount();
  });
});
