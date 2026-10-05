import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { PdfHandle } from "../../composables/pdfDocument";
import { GAP, MARGIN } from "../../composables/pdfLayout";

const readFileMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: (...a: unknown[]) => readFileMock(...a) }));

const openPdfMock = vi.fn();
vi.mock("../../composables/pdfDocument", () => ({ openPdf: (...a: unknown[]) => openPdfMock(...a) }));

import PdfViewer from "../PdfViewer.vue";
import { settings, loadSettings } from "../../composables/settings";

const VP = { w: 1000, h: 800 };
const letter = { w: 612, h: 792 };
// fit-width scale for the letter page in the stub viewport
const FIT = (VP.w - 2 * MARGIN) / letter.w;

function fakeHandle(count = 3, sizes: { w: number; h: number }[] = []) {
  const handle: PdfHandle & { renders: { n: number; scale: number }[] } = {
    pageCount: count,
    renders: [],
    pageSize: vi.fn((n: number) => Promise.resolve(sizes[n - 1] ?? letter)),
    render: vi.fn((n: number, _c: HTMLCanvasElement, region: { scale: number }) => {
      handle.renders.push({ n, scale: region.scale });
      return { done: Promise.resolve(), cancel: vi.fn() };
    }),
    release: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  };
  return handle;
}

const item = (path = "/p/doc.pdf") => ({ path, kind: "pdf" as const, name: path.slice(3), mtime: 1, size: 0 });

type Exposed = { handleAction: (a: { type: string; pages?: number; to?: string }) => boolean };

const originalRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  localStorage.clear();
  loadSettings();
  vi.useFakeTimers();
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: VP.w, height: VP.h, right: VP.w, bottom: VP.h, x: 0, y: 0, toJSON() {} }) as DOMRect;
  HTMLElement.prototype.setPointerCapture = () => {};
  readFileMock.mockReset().mockResolvedValue(new Uint8Array([1]));
  openPdfMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

async function mountViewer(
  handle = fakeHandle(),
  props: { hasPrev?: boolean; hasNext?: boolean } = {},
  attach = false,
) {
  openPdfMock.mockResolvedValue(handle);
  const w = mount(PdfViewer, { props: { item: item(), ...props }, ...(attach ? { attachTo: document.body } : {}) });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
  return w;
}

const scroller = (w: ReturnType<typeof mount>) => w.find(".scroller").element as HTMLElement;
const pct = (w: ReturnType<typeof mount>) => w.find(".pill-pct").text();
const exposed = (w: ReturnType<typeof mount>) => w.vm as unknown as Exposed;

describe("PdfViewer loading", () => {
  it("reads the file, opens it, and mounts only the pages near the viewport", async () => {
    const h = fakeHandle(3);
    const w = await mountViewer(h);
    expect(readFileMock).toHaveBeenCalledWith("/p/doc.pdf");
    expect(openPdfMock).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(w.find(".pill-page").text()).toBe("1 / 3");
    expect(pct(w)).toBe("100%");
    // page 3 starts at 24 + 2 * (792 * FIT + 12) = well beyond viewport + one viewport margin
    expect(w.findAll(".pdf-page")).toHaveLength(2);
    const content = w.find(".content").element as HTMLElement;
    expect(content.style.width).toBe("1000px");
    expect(parseFloat(content.style.height)).toBeCloseTo(MARGIN + 3 * letter.h * FIT + 2 * GAP + MARGIN);
  });

  it("renders the visible pages at fit resolution once the view settles", async () => {
    const h = fakeHandle(3);
    const w = await mountViewer(h);
    expect(h.renders.map((r) => r.n)).toEqual([1, 2]);
    expect(h.renders[0].scale).toBeCloseTo(FIT);
    w.unmount();
  });

  it("shows the error panel with the message when the file cannot be opened", async () => {
    openPdfMock.mockRejectedValue(new Error("No password given"));
    const w = mount(PdfViewer, { props: { item: item() } });
    await flushPromises();
    expect(w.find(".pdf-error").text()).toContain("Couldn't display doc.pdf.");
    expect(w.find(".pdf-error").text()).toContain("No password given");
    expect(w.find(".pill").exists()).toBe(false);
    expect(w.find(".nav-arrow.nav-prev").exists()).toBe(true);
  });

  it("switching files closes the old document and ignores a late result", async () => {
    const first = fakeHandle(3);
    const w = await mountViewer(first);
    let resolveSecond!: (h: PdfHandle) => void;
    openPdfMock.mockImplementationOnce(() => new Promise<PdfHandle>((r) => (resolveSecond = r)));
    const third = fakeHandle(5);
    await w.setProps({ item: item("/p/second.pdf") });
    await flushPromises();
    expect(first.close).toHaveBeenCalled();
    openPdfMock.mockResolvedValueOnce(third);
    await w.setProps({ item: item("/p/third.pdf") });
    await flushPromises();
    const second = fakeHandle(9);
    resolveSecond(second);
    await flushPromises();
    expect(second.close).toHaveBeenCalled();
    expect(w.find(".pill-page").text()).toBe("1 / 5");
  });

  it("keeps measuring later pages when one page's size fails", async () => {
    const h = fakeHandle(3, [letter, letter, { w: 1224, h: 792 }]);
    (h.pageSize as ReturnType<typeof vi.fn>).mockImplementation((n: number) =>
      n === 2 ? Promise.reject(new Error("bad page")) : Promise.resolve(n === 3 ? { w: 1224, h: 792 } : letter),
    );
    const w = await mountViewer(h);
    const content = w.find(".content").element as HTMLElement;
    // the wide third page sets the column width
    expect(parseFloat(content.style.width)).toBeCloseTo(1224 * FIT + 2 * MARGIN);
    w.unmount();
  });

  it("stops measuring the old document after a file switch", async () => {
    const slow = fakeHandle(40);
    let release!: () => void;
    // the gate rejects, as a destroyed document's pageSize would, so the old
    // catch-and-continue would otherwise race through every remaining page
    const gate = new Promise<void>((_, reject) => (release = () => reject(new Error("destroyed"))));
    (slow.pageSize as ReturnType<typeof vi.fn>).mockImplementation(async (n: number) => {
      if (n > 1) await gate;
      return letter;
    });
    const w = await mountViewer(slow);
    openPdfMock.mockResolvedValueOnce(fakeHandle(2));
    await w.setProps({ item: item("/p/next.pdf") });
    await flushPromises();
    release();
    await flushPromises();
    await flushPromises();
    // page 1 at load, page 2 before the switch landed; nothing after
    expect(slow.pageSize).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("keeps the page in view when background sizes land", async () => {
    const h = fakeHandle(5);
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    // page 1 is measured at load; page 2 turns out three times as tall
    (h.pageSize as ReturnType<typeof vi.fn>).mockImplementation(async (n: number) => {
      if (n === 1) return letter;
      await gate;
      return n === 2 ? { w: letter.w, h: letter.h * 3 } : letter;
    });
    const w = await mountViewer(h);
    const el = scroller(w);
    exposed(w).handleAction({ type: "pageStep", pages: 1 });
    await w.vm.$nextTick();
    exposed(w).handleAction({ type: "pageStep", pages: 1 });
    await w.vm.$nextTick();
    expect(w.find(".pill-page").text()).toBe("3 / 5");
    const before = el.scrollTop;
    const pageH = letter.h * FIT;
    expect(before).toBeCloseTo(MARGIN + 2 * (pageH + GAP) - GAP);
    open();
    await flushPromises();
    await w.vm.$nextTick();
    // page 3 now starts two page heights lower; the view moves with it and
    // keeps the same sliver of gap above it that the page step left
    const page3Top = MARGIN + pageH + GAP + 3 * pageH + GAP;
    expect(Math.abs(el.scrollTop - (page3Top - GAP))).toBeLessThan(1);
    expect(w.find(".pill-page").text()).toBe("3 / 5");
    w.unmount();
  });

  it("shows no page count until the document has loaded", async () => {
    let resolveOpen!: (h: PdfHandle) => void;
    openPdfMock.mockImplementationOnce(() => new Promise<PdfHandle>((r) => (resolveOpen = r)));
    const w = mount(PdfViewer, { props: { item: item() } });
    await flushPromises();
    expect(w.find(".pill").exists()).toBe(true);
    expect(w.find(".pill-page").exists()).toBe(false);
    resolveOpen(fakeHandle(4));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);
    expect(w.find(".pill-page").text()).toBe("1 / 4");
  });
});

describe("PdfViewer pixel ratio", () => {
  it("re-renders at the new ratio when the window moves to another display", async () => {
    const lists: { media: string; fire: () => void; removed: boolean }[] = [];
    vi.stubGlobal("matchMedia", (media: string) => {
      let cb: (() => void) | null = null;
      const entry = { media, fire: () => cb?.(), removed: false };
      lists.push(entry);
      return {
        addEventListener: (_: string, f: () => void) => (cb = f),
        removeEventListener: () => (entry.removed = true),
      };
    });
    const ratio = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
    const h = fakeHandle(3);
    const w = await mountViewer(h);
    expect(lists.map((l) => l.media)).toEqual(["(resolution: 1dppx)"]);
    expect((h.render as ReturnType<typeof vi.fn>).mock.calls.every((c) => c[3] === 1)).toBe(true);
    ratio.mockReturnValue(2);
    lists[0].fire();
    await flushPromises();
    expect(lists[0].removed).toBe(true);
    expect(lists[1].media).toBe("(resolution: 2dppx)");
    expect((h.render as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[3] === 2)).toBe(true);
    w.unmount();
    expect(lists[1].removed).toBe(true);
    ratio.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("PdfViewer zoom", () => {
  it("pill buttons zoom by the configured step about the viewport center", async () => {
    const w = await mountViewer();
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    await flushPromises();
    expect(pct(w)).toBe("110%");
    settings.image.zoomStep = "coarse";
    await w.vm.$nextTick();
    await w.find(".pill-btn[data-tip='Zoom out']").trigger("click");
    await flushPromises();
    expect(pct(w)).toBe("92%");
  });

  it("ctrl+wheel zooms and prevents the default; a plain wheel is left to the browser", async () => {
    const w = await mountViewer();
    const plain = new WheelEvent("wheel", { deltaY: -100, cancelable: true, bubbles: true });
    scroller(w).dispatchEvent(plain);
    await flushPromises();
    expect(plain.defaultPrevented).toBe(false);
    expect(pct(w)).toBe("100%");
    const ctrl = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true });
    scroller(w).dispatchEvent(ctrl);
    await flushPromises();
    expect(ctrl.defaultPrevented).toBe(true);
    expect(pct(w)).toBe("110%");
  });

  it("fit and resetZoom return to 100%", async () => {
    const w = await mountViewer();
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    await flushPromises();
    expect(pct(w)).toBe("121%");
    expect(exposed(w).handleAction({ type: "fit" })).toBe(true);
    await flushPromises();
    expect(pct(w)).toBe("100%");
    expect(exposed(w).handleAction({ type: "rotate" })).toBe(false);
  });

  it("zooming past the clamp leaves the scroll position alone", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    for (let i = 0; i < 40; i++) {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true }));
      await flushPromises();
    }
    expect(pct(w)).toBe("800%");
    const left = el.scrollLeft;
    const top = el.scrollTop;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true }));
    await flushPromises();
    expect(el.scrollLeft).toBe(left);
    expect(el.scrollTop).toBe(top);
  });

  it("zooming keeps the document point under the cursor fixed", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    el.scrollTop = 300;
    el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, clientX: 500, clientY: 200, cancelable: true, bubbles: true }));
    await flushPromises();
    // doc point before: (300 + 200 - MARGIN) / FIT; after at 1.1x it must sit 200px below the viewport top again
    const docY = (300 + 200 - MARGIN) / FIT;
    expect(el.scrollTop).toBeCloseTo(MARGIN + docY * FIT * 1.1 - 200, 5);
  });
});

describe("PdfViewer navigation", () => {
  it("page step and jump scroll to the page top and update the indicator", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    const pageH = letter.h * FIT;
    expect(exposed(w).handleAction({ type: "pageStep", pages: 1 })).toBe(true);
    expect(el.scrollTop).toBeCloseTo(MARGIN + pageH + GAP - GAP);
    await w.vm.$nextTick();
    expect(w.find(".pill-page").text()).toBe("2 / 3");
    expect(exposed(w).handleAction({ type: "pageJump", to: "last" })).toBe(true);
    await w.vm.$nextTick();
    expect(w.find(".pill-page").text()).toBe("3 / 3");
    expect(exposed(w).handleAction({ type: "pageJump", to: "first" })).toBe(true);
    expect(el.scrollTop).toBe(0);
    expect(exposed(w).handleAction({ type: "pageStep", pages: -1 })).toBe(true);
    expect(el.scrollTop).toBe(0);
  });

  it("dragging pans the scroll container", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    // dispatched directly: @vue/test-utils' trigger() tries to assign MouseEvent
    // getter-only properties (clientX etc.) post-construction, which jsdom rejects
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 500, clientY: 400, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: 500, clientY: 300, pointerId: 1 }));
    expect(el.scrollTop).toBe(100);
    el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: 500, clientY: 100, pointerId: 1 }));
    expect(el.scrollTop).toBe(100);
  });

  it("nav arrows emit navigate and reflect hasPrev/hasNext", async () => {
    const w = await mountViewer(fakeHandle(), { hasPrev: false, hasNext: true });
    expect(w.find(".nav-arrow.nav-prev").attributes("disabled")).toBeDefined();
    await w.find(".nav-arrow.nav-next").trigger("click");
    expect(w.emitted("navigate")).toEqual([[1]]);
  });

  it("scrolling updates the page indicator and settles a render of the new pages", async () => {
    const h = fakeHandle(6);
    const w = await mountViewer(h);
    const el = scroller(w);
    el.scrollTop = 5 * (letter.h * FIT + GAP);
    el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(w.find(".pill-page").text()).toBe("6 / 6");
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(h.renders.some((r) => r.n === 6)).toBe(true);
    w.unmount();
  });

  it("keeps keyboard focus on the scroller after an arrow click and after recovering from an error", async () => {
    const w = await mountViewer(fakeHandle(), { hasNext: true }, true);
    expect(document.activeElement).toBe(scroller(w));
    await w.find(".nav-arrow.nav-next").trigger("click");
    expect(document.activeElement).toBe(scroller(w));
    openPdfMock.mockRejectedValueOnce(new Error("bad"));
    await w.setProps({ item: item("/p/bad.pdf") });
    await flushPromises();
    expect(w.find(".pdf-error").exists()).toBe(true);
    openPdfMock.mockResolvedValueOnce(fakeHandle());
    await w.setProps({ item: item("/p/good.pdf") });
    await flushPromises();
    await flushPromises();
    expect(w.find(".scroller").exists()).toBe(true);
    expect(document.activeElement).toBe(scroller(w));
    w.unmount();
  });
});

describe("PdfViewer bars", () => {
  it("shows the horizontal bar only when the column is wider than the viewport", async () => {
    const w = await mountViewer();
    expect(w.find(".hbar").exists()).toBe(false);
    expect(w.find(".vbar").exists()).toBe(true);
    await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    await flushPromises();
    expect(w.find(".hbar").exists()).toBe(true);
    expect((w.find(".hbar").element as HTMLElement).style.width).toBe(VP.w * 0.6 + "px");
    expect(exposed(w).handleAction({ type: "fit" })).toBe(true);
    await flushPromises();
    expect(w.find(".hbar").exists()).toBe(false);
  });

  it("sizes the vertical thumb to the visible fraction and moves it with the scroll", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    const thumbEl = () => w.find(".vbar .thumb").element as HTMLElement;
    const contentH = parseFloat((w.find(".content").element as HTMLElement).style.height);
    const track = VP.h - 24;
    expect(parseFloat(thumbEl().style.height)).toBeCloseTo((track * VP.h) / contentH);
    expect(thumbEl().style.top).toBe("0px");
    el.scrollTop = contentH - VP.h;
    el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(parseFloat(thumbEl().style.top)).toBeCloseTo(track - parseFloat(thumbEl().style.height));
  });

  it("dragging the horizontal thumb scrolls sideways; a track press jumps there", async () => {
    const w = await mountViewer();
    const el = scroller(w);
    for (let i = 0; i < 8; i++) await w.find(".pill-btn[data-tip='Zoom in']").trigger("click");
    await flushPromises();
    const contentW = parseFloat((w.find(".content").element as HTMLElement).style.width);
    expect(contentW).toBeGreaterThan(VP.w);
    el.scrollLeft = 0;
    el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    const bar = w.find(".hbar");
    const thumbW = parseFloat((w.find(".hbar .thumb").element as HTMLElement).style.width);
    // the thumb starts at the track's left edge (the stub rect puts the track at x=0)
    bar.element.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, clientX: thumbW / 2, clientY: 0, pointerId: 2, bubbles: true, cancelable: true }),
    );
    bar.element.dispatchEvent(
      new PointerEvent("pointermove", { clientX: thumbW / 2 + 60, clientY: 0, pointerId: 2, bubbles: true, cancelable: true }),
    );
    const track = VP.w * 0.6;
    expect(el.scrollLeft).toBeCloseTo((60 / (track - thumbW)) * (contentW - VP.w));
    bar.element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, bubbles: true, cancelable: true }));

    const before = el.scrollLeft;
    bar.element.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, clientX: track - 1, clientY: 0, pointerId: 3, bubbles: true, cancelable: true }),
    );
    expect(el.scrollLeft).toBeGreaterThan(before);
    expect(el.scrollLeft).toBeCloseTo(contentW - VP.w);
  });
});
