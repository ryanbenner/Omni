import { describe, it, expect, vi, beforeAll, type Mock } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CollageItem from "../CollageItem.vue";
import type { CollageItem as Item } from "../../types";
import type { DecodeBudget } from "../../composables/useDecodeBudget";

const item: Item = {
  id: "a",
  kind: "image",
  path: "/p/a.jpg",
  x: 10,
  y: 20,
  w: 400,
  h: 200,
  nw: 4000,
  nh: 2000,
  rotation: 0,
  z: 3,
  thumb: "data:image/jpeg;base64,x",
};

function fakeBudget(result: ImageBitmap | null = { width: 512, height: 256, close() {} } as ImageBitmap) {
  return {
    bytes: { value: 0 },
    loaded: { value: 0 },
    version: { value: 0 },
    request: vi.fn(() => Promise.resolve(result)),
    release: vi.fn(),
    setVisible: vi.fn(),
    forget: vi.fn(),
    levelOf: vi.fn(() => 0),
  } as unknown as DecodeBudget;
}

describe("CollageItem", () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  });

  it("positions itself at its footprint and z, and requests a decode sized to the screen", async () => {
    const budget = fakeBudget();
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 0.5, visible: true, budget, missing: false } });
    await flushPromises();
    const el = w.find("[data-item-id='a']").element as HTMLElement;
    expect(el.style.left).toBe("10px");
    expect(el.style.width).toBe("400px");
    expect(el.style.zIndex).toBe("3");
    // 400 wall px * 0.5 zoom * dpr 1 = 200 on screen -> level 256
    expect(budget.request).toHaveBeenCalledWith("a", "/p/a.jpg", 256, { w: 4000, h: 2000 });
    expect(w.find("canvas").exists()).toBe(true);
  });

  it("shows handles and the pixel size only when selected", async () => {
    const budget = fakeBudget();
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 1, visible: true, budget, missing: false } });
    expect(w.findAll("[data-handle]")).toHaveLength(0);
    await w.setProps({ selected: true });
    expect(w.findAll("[data-handle]").map((h) => h.attributes("data-handle")).sort()).toEqual(
      ["e", "n", "ne", "nw", "s", "se", "sw", "w"],
    );
    expect(w.find(".size-label").text()).toBe("400 × 200");
  });

  it("releases its decode when it leaves the view and forgets on unmount", async () => {
    const budget = fakeBudget();
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 1, visible: true, budget, missing: false } });
    await flushPromises();
    await w.setProps({ visible: false });
    expect(budget.setVisible).toHaveBeenLastCalledWith("a", false);
    expect(budget.release).toHaveBeenCalledWith("a");
    w.unmount();
    expect(budget.forget).toHaveBeenCalledWith("a");
  });

  it("emits missing when decoding fails and shows the dimmed thumbnail with a relink button", async () => {
    const budget = fakeBudget(null);
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 1, visible: true, budget, missing: false } });
    await flushPromises();
    expect(w.emitted("missing")).toEqual([["a"]]);
    await w.setProps({ missing: true });
    expect(w.find("img.thumb").exists()).toBe(true);
    expect(w.classes()).toContain("missing");
    await w.find(".relink").trigger("click");
    expect(w.emitted("relink")).toEqual([["a"]]);
  });

  it("draws a rotated item with the picture box transposed inside the footprint", () => {
    const budget = fakeBudget();
    const rotated = { ...item, rotation: 90 as const, w: 200, h: 400 };
    const w = mount(CollageItem, { props: { item: rotated, selected: false, zoom: 1, visible: true, budget, missing: false } });
    const pic = w.find(".pic").element as HTMLElement;
    expect(pic.style.width).toBe("400px");
    expect(pic.style.height).toBe("200px");
    expect(pic.style.transform).toBe("rotate(90deg)");
  });

  it("ignores a decode that resolves null after the item left the view", async () => {
    let resolve!: (b: ImageBitmap | null) => void;
    const budget = fakeBudget();
    (budget.request as Mock).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 1, visible: true, budget, missing: false } });
    await w.setProps({ visible: false });
    resolve(null);
    await flushPromises();
    expect(w.emitted("missing")).toBeUndefined();
  });

  it("emits found when a missing item decodes again", async () => {
    const budget = fakeBudget(null);
    const w = mount(CollageItem, { props: { item, selected: false, zoom: 1, visible: true, budget, missing: false } });
    await flushPromises();
    expect(w.emitted("missing")).toEqual([["a"]]);
    (budget.request as Mock).mockResolvedValue({ width: 512, height: 256, close() {} });
    await w.setProps({ missing: true, visible: false });
    await w.setProps({ visible: true });
    await flushPromises();
    expect(w.emitted("found")).toEqual([["a"]]);
  });
});
