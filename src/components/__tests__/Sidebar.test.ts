import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));

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
