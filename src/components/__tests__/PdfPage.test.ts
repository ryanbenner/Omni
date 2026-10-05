import { describe, it, expect, vi, type Mock } from "vitest";
import { mount } from "@vue/test-utils";
import PdfPage from "../PdfPage.vue";
import type { PdfHandle, RenderRegion } from "../../composables/pdfDocument";

interface Job {
  n: number;
  canvas: HTMLCanvasElement;
  region: RenderRegion;
  dpr: number;
  resolve: () => void;
  reject: (e: Error) => void;
  cancel: Mock<() => void>;
}

function fakeHandle() {
  const jobs: Job[] = [];
  const handle: PdfHandle = {
    pageCount: 1,
    pageSize: vi.fn(),
    close: vi.fn(),
    release: vi.fn(),
    render: vi.fn((n: number, canvas: HTMLCanvasElement, region: RenderRegion, dpr: number) => {
      let resolve!: () => void;
      let reject!: (e: Error) => void;
      const done = new Promise<void>((r, j) => {
        resolve = r;
        reject = j;
      });
      const job: Job = { n, canvas, region, dpr, resolve, reject, cancel: vi.fn() };
      jobs.push(job);
      return { done, cancel: job.cancel };
    }),
  };
  return { handle, jobs };
}

const letter = { w: 612, h: 792 };
const box = (scale: number) => ({ top: 24, left: 100, w: letter.w * scale, h: letter.h * scale });

function visible(el: Element): boolean {
  return (el as HTMLElement).style.display !== "none";
}

async function settle(w: ReturnType<typeof mount>, jobs: Job[], i: number) {
  jobs[i].resolve();
  await new Promise((r) => setTimeout(r, 0));
  await w.vm.$nextTick();
}

describe("PdfPage", () => {
  it("positions itself by the box and renders nothing before the first settle", () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(1), scale: 1, baseScale: 1, settled: null, dpr: 1 },
    });
    const el = w.element as HTMLElement;
    expect(el.style.left).toBe("100px");
    expect(el.style.top).toBe("24px");
    expect(el.style.width).toBe("612px");
    expect(el.style.height).toBe("792px");
    expect(jobs).toHaveLength(0);
    expect(w.findAll("canvas.base")).toHaveLength(2);
    expect(w.findAll("canvas.detail")).toHaveLength(2);
  });

  it("renders the base over the whole page at fit resolution and shows it when done", async () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 2, box: box(1.5), scale: 1.5, baseScale: 1.5, settled: { scale: 1.5, slice: { x: 0, y: 0, w: 918, h: 500 } }, dpr: 2 },
    });
    await w.vm.$nextTick();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].n).toBe(2);
    expect(jobs[0].dpr).toBe(2);
    expect(jobs[0].region).toEqual({ scale: 1.5, x: 0, y: 0, w: 918, h: 1188 });
    expect(w.findAll("canvas.base").some((c) => visible(c.element))).toBe(false);
    await settle(w, jobs, 0);
    expect(w.findAll("canvas.base").filter((c) => visible(c.element))).toHaveLength(1);
    // at fit scale there is no detail to render
    expect(jobs).toHaveLength(1);
  });

  it("renders the visible slice as detail when zoomed past fit and hides it while the live scale differs", async () => {
    const { handle, jobs } = fakeHandle();
    const slice = { x: 10, y: 20, w: 300, h: 400 };
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice }, dpr: 1 },
    });
    await w.vm.$nextTick();
    expect(jobs.map((j) => j.region.scale)).toEqual([1, 3]);
    expect(jobs[1].region).toEqual({ scale: 3, ...slice });
    await settle(w, jobs, 1);
    const detail = w.findAll("canvas.detail").find((c) => visible(c.element))!;
    expect(detail).toBeDefined();
    expect((detail.element as HTMLElement).style.left).toBe("10px");
    expect((detail.element as HTMLElement).style.top).toBe("20px");
    expect((detail.element as HTMLElement).style.width).toBe("300px");
    expect((detail.element as HTMLElement).style.height).toBe("400px");

    await w.setProps({ scale: 3.3, box: box(3.3) });
    expect(w.findAll("canvas.detail").some((c) => visible(c.element))).toBe(false);
  });

  it("keeps the old detail visible until the new slice lands, then swaps", async () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice: { x: 0, y: 0, w: 300, h: 400 } }, dpr: 1 },
    });
    await w.vm.$nextTick();
    await settle(w, jobs, 1);
    const first = w.findAll("canvas.detail").find((c) => visible(c.element))!.element;

    await w.setProps({ settled: { scale: 3, slice: { x: 0, y: 500, w: 300, h: 400 } } });
    expect(jobs).toHaveLength(3);
    expect(w.findAll("canvas.detail").find((c) => visible(c.element))!.element).toBe(first);
    await settle(w, jobs, 2);
    const second = w.findAll("canvas.detail").find((c) => visible(c.element))!.element;
    expect(second).not.toBe(first);
    expect((second as HTMLElement).style.top).toBe("500px");
  });

  it("does not re-request a detail the layer already shows", async () => {
    const { handle, jobs } = fakeHandle();
    const slice = { x: 0, y: 0, w: 300, h: 400 };
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice }, dpr: 1 },
    });
    await w.vm.$nextTick();
    await settle(w, jobs, 1);
    await w.setProps({ settled: { scale: 3, slice: { ...slice } } });
    expect(jobs).toHaveLength(2);
  });

  it("a new request cancels the in-flight one", async () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice: { x: 0, y: 0, w: 300, h: 400 } }, dpr: 1 },
    });
    await w.vm.$nextTick();
    await w.setProps({ settled: { scale: 3, slice: { x: 0, y: 100, w: 300, h: 400 } } });
    expect(jobs[1].cancel).toHaveBeenCalled();
    expect(jobs).toHaveLength(3);
  });

  it("re-renders the base at the lower resolution when zoomed well below fit", async () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(1), scale: 1, baseScale: 1, settled: { scale: 1, slice: { x: 0, y: 0, w: 612, h: 792 } }, dpr: 1 },
    });
    await w.vm.$nextTick();
    await settle(w, jobs, 0);
    await w.setProps({ scale: 0.4, box: box(0.4), settled: { scale: 0.4, slice: { x: 0, y: 0, w: 244.8, h: 316.8 } } });
    expect(jobs).toHaveLength(2);
    expect(jobs[1].region.scale).toBe(0.4);
    expect(jobs[1].region.w).toBeCloseTo(244.8);
    await settle(w, jobs, 1);
    // a settle slightly further out keeps the base it has
    await w.setProps({ scale: 0.38, box: box(0.38), settled: { scale: 0.38, slice: { x: 0, y: 0, w: 232.56, h: 300.96 } } });
    expect(jobs).toHaveLength(2);
  });

  it("cancels jobs and releases canvases on unmount", async () => {
    const { handle, jobs } = fakeHandle();
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice: { x: 0, y: 0, w: 300, h: 400 } }, dpr: 1 },
    });
    await w.vm.$nextTick();
    const canvases = w.findAll("canvas").map((c) => c.element as HTMLCanvasElement);
    w.unmount();
    expect(jobs[0].cancel).toHaveBeenCalled();
    expect(jobs[1].cancel).toHaveBeenCalled();
    for (const c of canvases) expect(c.width).toBe(0);
    expect(handle.release).toHaveBeenCalledWith(1);
  });

  it("retries a region after its render rejected", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handle, jobs } = fakeHandle();
    const slice = { x: 0, y: 0, w: 300, h: 400 };
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: box(3), scale: 3, baseScale: 1, settled: { scale: 3, slice }, dpr: 1 },
    });
    await w.vm.$nextTick();
    jobs[1].reject(new Error("boom"));
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    await w.setProps({ settled: { scale: 3, slice: { ...slice } } });
    expect(jobs).toHaveLength(3);
    expect(jobs[2].region).toEqual({ scale: 3, ...slice });
    warn.mockRestore();
  });

  it("caps the base canvas at 16 megapixels and lets the detail sharpen the view", async () => {
    const { handle, jobs } = fakeHandle();
    const huge = { top: 0, left: 0, w: 10000, h: 10000 };
    const slice = { x: 0, y: 0, w: 800, h: 600 };
    const w = mount(PdfPage, {
      props: { handle, page: 1, box: huge, scale: 1, baseScale: 1, settled: { scale: 1, slice }, dpr: 2 },
    });
    await w.vm.$nextTick();
    const r = jobs[0].region;
    expect(r.w * r.h * 2 * 2).toBeLessThanOrEqual(16e6 * 1.01);
    expect(r.w / r.h).toBeCloseTo(1);
    expect(jobs[1].region).toEqual({ scale: 1, ...slice });
  });
});
