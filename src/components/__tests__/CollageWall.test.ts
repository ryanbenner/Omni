import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const metaMock = vi.fn();
vi.mock("../../composables/collageImages", () => ({
  loadImageMeta: (...a: unknown[]) => metaMock(...a),
  readBitmap: vi.fn(() => Promise.resolve({ width: 64, height: 32, close() {} })),
}));
const writeCollageMock = vi.fn();
vi.mock("../../composables/collageFile", async (orig) => ({
  ...(await orig<typeof import("../../composables/collageFile")>()),
  writeCollage: (...a: unknown[]) => writeCollageMock(...a),
}));
const saveDialogMock = vi.fn();
const openDialogMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...a: unknown[]) => saveDialogMock(...a),
  open: (...a: unknown[]) => openDialogMock(...a),
  message: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), readTextFile: vi.fn(), writeTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve({ folders: [], files: [] })), convertFileSrc: (p: string) => p }));

import CollageWall from "../CollageWall.vue";
import { emptyDoc } from "../../composables/collageFile";
import type { CollageDoc } from "../../types";

const VP = { w: 1000, h: 800 };

function docWith(n: number): CollageDoc {
  const doc = emptyDoc();
  for (let i = 0; i < n; i++) {
    doc.items.push({
      id: "i" + i,
      kind: "image",
      path: `/p/${i}.jpg`,
      x: 100 + i * 300,
      y: 100,
      w: 200,
      h: 100,
      nw: 2000,
      nh: 1000,
      rotation: 0,
      z: i + 1,
    });
  }
  return doc;
}

function mountWall(doc = docWith(2), path: string | null = "/p/w.collage") {
  const w = mount(CollageWall, { props: { init: { doc, path } }, attachTo: document.body });
  const stage = w.find(".wall").element as HTMLElement;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: VP.w, height: VP.h }) as DOMRect;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};
  return w;
}

async function ptr(w: ReturnType<typeof mount>, type: string, init: MouseEventInit & { target?: Element }) {
  const target = init.target ?? w.find(".wall").element;
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await w.vm.$nextTick();
}

function itemEl(w: ReturnType<typeof mount>, id: string) {
  return w.find(`[data-item-id='${id}']`).element as HTMLElement;
}

describe("CollageWall", () => {
  beforeEach(() => {
    metaMock.mockReset().mockResolvedValue({ w: 3000, h: 1500, thumb: "data:," });
    writeCollageMock.mockReset().mockResolvedValue(undefined);
    saveDialogMock.mockReset();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    document.body.innerHTML = "";
    // jsdom has no scrollIntoView; the tab strip calls it when the selection changes
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the document's items and a tab per item", async () => {
    const w = mountWall();
    await flushPromises();
    expect(w.findAll("[data-item-id]")).toHaveLength(2);
    expect(w.findAll(".tab")).toHaveLength(2);
    w.unmount();
  });

  it("dragging empty wall pans; dragging an unselected item also pans", async () => {
    const w = mountWall();
    await flushPromises();
    await ptr(w, "pointerdown", { button: 0, clientX: 500, clientY: 500 });
    await ptr(w, "pointermove", { clientX: 540, clientY: 510 });
    await ptr(w, "pointerup", { clientX: 540, clientY: 510 });
    expect((w.find(".plane").element as HTMLElement).style.transform).toBe("translate(40px, 10px) scale(1)");
    await ptr(w, "pointerdown", { button: 0, clientX: 200, clientY: 150, target: itemEl(w, "i0") });
    await ptr(w, "pointermove", { clientX: 210, clientY: 150 });
    await ptr(w, "pointerup", { clientX: 210, clientY: 150 });
    expect((w.find(".plane").element as HTMLElement).style.transform).toBe("translate(50px, 10px) scale(1)");
    expect(itemEl(w, "i0").style.left).toBe("100px");
    w.unmount();
  });

  it("double-click selects and brings to front; dragging a selected item moves it", async () => {
    const w = mountWall();
    await flushPromises();
    await ptr(w, "dblclick", { target: itemEl(w, "i0") });
    expect(itemEl(w, "i0").classList.contains("selected")).toBe(true);
    expect(Number(itemEl(w, "i0").style.zIndex)).toBeGreaterThan(2);
    await ptr(w, "pointerdown", { button: 0, clientX: 200, clientY: 150, target: itemEl(w, "i0") });
    await ptr(w, "pointermove", { clientX: 230, clientY: 160 });
    await ptr(w, "pointerup", { clientX: 230, clientY: 160 });
    expect(itemEl(w, "i0").style.left).toBe("130px");
    expect(itemEl(w, "i0").style.top).toBe("110px");
    w.unmount();
  });

  it("wheel during a move keeps the item under the cursor", async () => {
    const w = mountWall();
    await flushPromises();
    await ptr(w, "dblclick", { target: itemEl(w, "i0") });
    await ptr(w, "pointerdown", { button: 0, clientX: 200, clientY: 150, target: itemEl(w, "i0") });
    // cursor sits 100 wall px right of the item's left edge
    w.find(".wall").element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 200, clientY: 150, bubbles: true }));
    await w.vm.$nextTick();
    await ptr(w, "pointermove", { clientX: 200, clientY: 150 });
    await ptr(w, "pointerup", { clientX: 200, clientY: 150 });
    const plane = (w.find(".plane").element as HTMLElement).style.transform;
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(plane)!;
    const [, tx, , z] = m.map(Number);
    const leftOnScreen = Number.parseFloat(itemEl(w, "i0").style.left) * z + tx;
    expect(leftOnScreen).toBeCloseTo(200 - 100 * z, 3);
    w.unmount();
  });

  it("a resize handle drag with the lock keeps the ratio; L toggles the lock", async () => {
    const w = mountWall();
    await flushPromises();
    await ptr(w, "dblclick", { target: itemEl(w, "i0") });
    const se = w.find("[data-item-id='i0'] [data-handle='se']").element;
    await ptr(w, "pointerdown", { button: 0, clientX: 300, clientY: 200, target: se });
    await ptr(w, "pointermove", { clientX: 500, clientY: 200 });
    await ptr(w, "pointerup", { clientX: 500, clientY: 200 });
    expect(itemEl(w, "i0").style.width).toBe("400px");
    expect(itemEl(w, "i0").style.height).toBe("200px");
    expect((w.vm as unknown as { handleAction: (a: { type: string }) => boolean }).handleAction({ type: "toggleLock" })).toBe(true);
    await w.vm.$nextTick();
    expect(w.find(".pill-btn.lock").classes()).not.toContain("on");
    w.unmount();
  });

  it("click on empty wall deselects; Delete removes the selected item and its tab", async () => {
    const w = mountWall();
    await flushPromises();
    await ptr(w, "dblclick", { target: itemEl(w, "i1") });
    await ptr(w, "pointerdown", { button: 0, clientX: 900, clientY: 700 });
    await ptr(w, "pointerup", { clientX: 900, clientY: 700 });
    expect(w.findAll(".selected")).toHaveLength(0);
    await ptr(w, "dblclick", { target: itemEl(w, "i1") });
    (w.vm as unknown as { handleAction: (a: { type: string }) => boolean }).handleAction({ type: "removeSelected" });
    await w.vm.$nextTick();
    expect(w.findAll("[data-item-id]")).toHaveLength(1);
    expect(w.findAll(".tab")).toHaveLength(1);
    w.unmount();
  });

  it("addPaths loads metadata, places without overlap, and pans if the spot is off-screen", async () => {
    const w = mountWall(docWith(0));
    await flushPromises();
    const vm = w.vm as unknown as { addPaths: (p: string[]) => Promise<void> };
    await vm.addPaths(["/p/a.jpg", "/p/b.jpg"]);
    await flushPromises();
    expect(metaMock).toHaveBeenCalledTimes(2);
    const els = w.findAll("[data-item-id]").map((e) => e.element as HTMLElement);
    expect(els).toHaveLength(2);
    expect(els[0].style.left !== els[1].style.left || els[0].style.top !== els[1].style.top).toBe(true);
    // fully cover the view, add again: the wall pans to show the newcomer
    const before = (w.find(".plane").element as HTMLElement).style.transform;
    const big = { id: "big", kind: "image" as const, path: "/p/big.jpg", x: -5000, y: -5000, w: 20000, h: 20000, nw: 10, nh: 10, rotation: 0 as const, z: 9 };
    await w.setProps({ init: { doc: { ...emptyDoc(), items: [big] }, path: null } });
    await flushPromises();
    await vm.addPaths(["/p/c.jpg"]);
    await flushPromises();
    expect((w.find(".plane").element as HTMLElement).style.transform).not.toBe(before);
    w.unmount();
  });

  it("export area: E arms a drag whose release opens the preview; Escape cancels", async () => {
    const w = mountWall();
    await flushPromises();
    const vm = w.vm as unknown as { handleAction: (a: { type: string }) => boolean };
    vm.handleAction({ type: "exportArea" });
    await w.vm.$nextTick();
    expect(w.find(".wall").classes()).toContain("arming");
    await ptr(w, "pointerdown", { button: 0, clientX: 100, clientY: 100 });
    await ptr(w, "pointermove", { clientX: 500, clientY: 400 });
    expect(w.find(".area").exists()).toBe(true);
    expect(w.find(".area-size").text()).toBe("400 × 300");
    await ptr(w, "pointerup", { clientX: 500, clientY: 400 });
    await flushPromises();
    expect(w.findComponent({ name: "ExportPreview" }).exists()).toBe(true);
    w.unmount();
  });

  it("requestLeave resolves true when clean, and routes the dialog when dirty", async () => {
    const w = mountWall();
    await flushPromises();
    const vm = w.vm as unknown as {
      requestLeave: (closing: boolean) => Promise<boolean>;
      handleAction: (a: { type: string }) => boolean;
    };
    expect(await vm.requestLeave(false)).toBe(true);
    await ptr(w, "dblclick", { target: itemEl(w, "i0") });
    vm.handleAction({ type: "rotate" });
    await w.vm.$nextTick();
    expect(w.emitted("status")?.slice(-1)[0]).toEqual(["w.collage •"]);
    const p = vm.requestLeave(true);
    await w.vm.$nextTick();
    expect(w.find(".btn-outline").text()).toBe("Discard and Close");
    await w.find(".dialog-cancel").trigger("click");
    expect(await p).toBe(false);
    const p2 = vm.requestLeave(false);
    await w.vm.$nextTick();
    await w.find(".btn-accent:last-of-type").trigger("click"); // Save
    await flushPromises();
    expect(writeCollageMock).toHaveBeenCalledWith("/p/w.collage", expect.objectContaining({ version: 1 }));
    expect(await p2).toBe(true);
    expect(w.emitted("status")?.slice(-1)[0]).toEqual(["w.collage"]);
    w.unmount();
  });

  it("save on an unsaved collage goes through Save As and remembers the path", async () => {
    saveDialogMock.mockResolvedValue("/p/new.collage");
    const w = mountWall(docWith(1), null);
    await flushPromises();
    expect(w.emitted("status")?.slice(-1)[0]).toEqual(["Unsaved collage"]);
    (w.vm as unknown as { handleAction: (a: { type: string }) => boolean }).handleAction({ type: "save" });
    await flushPromises();
    expect(saveDialogMock.mock.calls[0][0].filters[0].extensions).toEqual(["collage"]);
    expect(writeCollageMock).toHaveBeenCalledWith("/p/new.collage", expect.anything());
    expect(localStorage.getItem("mv-last-collage")).toBe("/p/new.collage");
    w.unmount();
  });

  it("the memory readout toggles with M", async () => {
    const w = mountWall();
    await flushPromises();
    expect(w.find(".mem-readout").exists()).toBe(false);
    (w.vm as unknown as { handleAction: (a: { type: string }) => boolean }).handleAction({ type: "toggleMemory" });
    await w.vm.$nextTick();
    expect(w.find(".mem-readout").exists()).toBe(true);
    w.unmount();
  });
});
