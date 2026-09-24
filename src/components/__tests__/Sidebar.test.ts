import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ watch: () => Promise.resolve(() => {}) }));

import Sidebar from "../Sidebar.vue";

const ROW = 26;

function wire() {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_drives") return Promise.resolve([{ path: "C:\\", name: "C:" }]);
    if (cmd === "read_dir_entries") return Promise.resolve({ folders: [], files: [] });
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
    // pinClick scopes the tree to the pin: the folder row appears in the tree
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).toContain("B");
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
    expect(w.findAll(".tree-row").map((r) => r.attributes("title"))).not.toContain("C");
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
