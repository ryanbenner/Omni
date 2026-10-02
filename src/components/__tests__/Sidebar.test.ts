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
    expect(names(w)).toEqual(["A", "B", "C"]);
    // the pin opens the chain down to it: the drive and the folder row appear
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual(["C:", "A", "B", "C"]);
    expect(w.findAll(".tree-row")[2].classes()).toContain("persist");
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

  it("the drive, the parent folder and the current folder stay put with stacked offsets", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    const tops = () =>
      w.findAll(".tree-row").map((r) =>
        r.classes().includes("persist") ? (r.element as HTMLElement).style.top : null,
      );
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toEqual([
      "C:", "Pics", "Sub", "x.jpg", "a.jpg", "b.jpg",
    ]);
    expect(tops()).toEqual(["0px", "26px", "52px", null, null, null]);
    // a file straight under a drive child: the folder sits right below the drive
    await w.setProps({ currentPath: "C:\\Pics\\a.jpg", currentFolder: "C:\\Pics" });
    await flushPromises();
    expect(tops()).toEqual(["0px", "26px", null, null, null, null]);
    w.unmount();
  });

  it("closing a persistent folder drops it out and scrolls it to just under the rest", async () => {
    Element.prototype.scrollBy = vi.fn();
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    const rows = w.findAll(".tree-row");
    (w.find(".scroll").element as HTMLElement).getBoundingClientRect = () => ({ top: 28 }) as DOMRect;
    (rows[2].element as HTMLElement).getBoundingClientRect = () => ({ top: 80 }) as DOMRect;
    await rows[2].trigger("click"); // collapse Sub
    await flushPromises();
    expect(w.findAll(".tree-row")[2].classes()).not.toContain("persist");
    // 80 - 28 = 52 below the scroll top; the drive and Pics still occupy 52
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(0, 0);
    await w.findAll(".tree-row")[1].trigger("click"); // collapse Pics, stuck under the drive
    await flushPromises();
    expect(w.findAll(".tree-row").map((r) => r.classes().includes("persist"))).toEqual([true, false]);
    w.unmount();
  });

  it("opening a pin holds the drive, its parent and the pin, with its contents right under", async () => {
    Element.prototype.scrollBy = vi.fn();
    localStorage.setItem("mv-pins", JSON.stringify([{ path: "C:\\Pics\\Sub", name: "Sub", count: 0 }]));
    const w = mount(Sidebar, { props: { currentPath: null, currentFolder: null }, attachTo: document.body });
    await flushPromises();
    await w.find(".pin-row").trigger("click");
    await flushPromises();
    const rows = w.findAll(".tree-row");
    expect(rows.map((r) => r.attributes("title"))).toEqual(["C:", "Pics", "Sub", "x.jpg", "a.jpg", "b.jpg"]);
    expect(rows.map((r) => (r.element as HTMLElement).style.top)).toEqual(["0px", "26px", "52px", "", "", ""]);
    expect(Element.prototype.scrollBy).toHaveBeenCalled();
    w.unmount();
  });

  it("rows pinned at the top get the stuck look, the lowest one carrying the line", async () => {
    const w = mount(Sidebar, {
      props: { currentPath: "C:\\Pics\\Sub\\x.jpg", currentFolder: "C:\\Pics\\Sub" },
      attachTo: document.body,
    });
    await flushPromises();
    const scroller = w.find(".scroll").element as HTMLElement;
    expect(scroller.style.getPropertyValue("--held")).toBe("78px");
    const rows = w.findAll(".tree-row");
    scroller.getBoundingClientRect = () => ({ top: 28 }) as DOMRect;
    const tops = [28, 54, 200];
    rows.slice(0, 3).forEach((r, i) => {
      (r.element as HTMLElement).getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect;
    });
    Object.defineProperty(scroller, "scrollTop", { value: 120, configurable: true });
    await w.find(".scroll").trigger("scroll");
    const cls = () => w.findAll(".tree-row").slice(0, 3).map((r) => [r.classes().includes("stuck"), r.classes().includes("stuck-last")]);
    expect(cls()).toEqual([[true, false], [true, true], [false, false]]);
    Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true });
    await w.find(".scroll").trigger("scroll");
    expect(cls()).toEqual([[false, false], [false, false], [false, false]]);
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
