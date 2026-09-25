import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CollageTabs from "../CollageTabs.vue";
import type { CollageItem } from "../../types";

const TAB = 120;
const it_ = (id: string, name: string): CollageItem => ({
  id,
  kind: "image",
  path: `/p/${name}`,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  nw: 10,
  nh: 10,
  rotation: 0,
  z: 1,
});
const items = [it_("a", "Game 2025.01.01 - x.jpg"), it_("b", "b.png"), it_("c", "c.jpg")];

function mountTabs() {
  const w = mount(CollageTabs, {
    props: { items, selectedId: "b", missing: new Set(["c"]) },
    attachTo: document.body,
  });
  // jsdom has no layout: give tabs a horizontal extent
  w.findAll(".tab").forEach((t, i) => {
    (t.element as HTMLElement).getBoundingClientRect = () =>
      ({ left: i * TAB, right: (i + 1) * TAB, width: TAB }) as DOMRect;
  });
  return w;
}

async function fire(el: Element | Window, type: string, init: MouseEventInit) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  await Promise.resolve();
}

describe("CollageTabs", () => {
  it("renders trimmed names, highlights the selection, flags missing items", () => {
    const w = mountTabs();
    expect(w.findAll(".tab .tab-name").map((n) => n.text())).toEqual(["2025.01.01 - x.jpg", "b.png", "c.jpg"]);
    expect(w.findAll(".tab")[1].classes()).toContain("active");
    expect(w.findAll(".tab")[2].find(".tab-warn").exists()).toBe(true);
    w.unmount();
  });

  it("click selects, close button closes without selecting", async () => {
    const w = mountTabs();
    await w.findAll(".tab")[0].trigger("click");
    expect(w.emitted("select")).toEqual([["a"]]);
    await w.findAll(".tab-close")[2].trigger("click");
    expect(w.emitted("close")).toEqual([["c"]]);
    expect(w.emitted("select")).toHaveLength(1);
    w.unmount();
  });

  it("dragging a tab past another emits a reorder slot", async () => {
    const w = mountTabs();
    const tabs = w.findAll(".tab");
    await fire(tabs[0].element, "pointerdown", { button: 0, clientX: 30 });
    await fire(window, "pointermove", { clientX: 320 }); // past the middle of tab c (300): slot 3
    await fire(window, "pointerup", { clientX: 320 });
    expect(w.emitted("reorder")).toEqual([[0, 3]]);
    expect(w.emitted("select")).toBeUndefined(); // a drag is not a click
    w.unmount();
  });
});
