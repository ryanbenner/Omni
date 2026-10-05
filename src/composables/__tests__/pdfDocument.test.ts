import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pdfWorkerUrl", () => ({ default: "worker.mjs" }));

const { renderTask, page, doc, loading, getDocument, workerOptions, Cancelled } = vi.hoisted(() => {
  class Cancelled extends Error {}

  const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
  const page = {
    getViewport: vi.fn((o: { scale: number; offsetX?: number; offsetY?: number }) => ({
      width: 612 * o.scale,
      height: 792 * o.scale,
      ...o,
    })),
    render: vi.fn(() => renderTask),
    cleanup: vi.fn(() => true),
  };
  const doc = { numPages: 3, getPage: vi.fn(() => Promise.resolve(page)) };
  const loading = { promise: Promise.resolve(doc), destroy: vi.fn(() => Promise.resolve()) };
  const getDocument = vi.fn((_src: unknown) => loading);
  const workerOptions = { workerSrc: "" };

  return { renderTask, page, doc, loading, getDocument, workerOptions, Cancelled };
});

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (src: unknown) => getDocument(src),
  GlobalWorkerOptions: workerOptions,
  RenderingCancelledException: Cancelled,
}));

import { openPdf } from "../pdfDocument";

beforeEach(() => {
  vi.clearAllMocks();
  renderTask.promise = Promise.resolve();
  workerOptions.workerSrc = "";
});

describe("openPdf", () => {
  it("points pdf.js at the bundled worker and opens from bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const h = await openPdf(bytes);
    expect(workerOptions.workerSrc).toBe("worker.mjs");
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: bytes, cMapPacked: true }));
    const src = getDocument.mock.calls[0][0] as Record<string, string>;
    for (const key of ["wasmUrl", "cMapUrl", "standardFontDataUrl"]) {
      expect(src[key]).toMatch(/\/pdfjs\/[a-z_]+\/$/);
    }
    expect(h.pageCount).toBe(3);
  });

  it("reports page sizes at scale 1 and fetches each page once", async () => {
    const h = await openPdf(new Uint8Array());
    expect(await h.pageSize(2)).toEqual({ w: 612, h: 792 });
    await h.pageSize(2);
    expect(doc.getPage).toHaveBeenCalledTimes(1);
    expect(doc.getPage).toHaveBeenCalledWith(2);
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1 });
  });

  it("sizes the canvas to the slice in device pixels and offsets the viewport", async () => {
    const h = await openPdf(new Uint8Array());
    const canvas = document.createElement("canvas");
    const job = h.render(1, canvas, { scale: 2, x: 10, y: 20.4, w: 300.2, h: 400 }, 2);
    await job.done;
    expect(canvas.width).toBe(601);
    expect(canvas.height).toBe(800);
    expect(page.getViewport).toHaveBeenLastCalledWith({ scale: 4, offsetX: -20, offsetY: -40.8 });
    expect(page.render).toHaveBeenCalledWith({
      canvas,
      viewport: expect.objectContaining({ scale: 4 }),
    });
  });

  it("cancel before the page arrives skips the render; after, it cancels the task", async () => {
    const h = await openPdf(new Uint8Array());
    const canvas = document.createElement("canvas");
    const early = h.render(1, canvas, { scale: 1, x: 0, y: 0, w: 10, h: 10 }, 1);
    early.cancel();
    await early.done;
    expect(page.render).not.toHaveBeenCalled();

    const late = h.render(1, canvas, { scale: 1, x: 0, y: 0, w: 10, h: 10 }, 1);
    await Promise.resolve();
    await Promise.resolve();
    late.cancel();
    expect(renderTask.cancel).toHaveBeenCalled();
  });

  it("swallows pdf.js cancellation but surfaces other render errors", async () => {
    const h = await openPdf(new Uint8Array());
    const canvas = document.createElement("canvas");
    // a catch marks each rejection handled so node never reports it before the wrapper attaches
    const cancelled = Promise.reject(new Cancelled("cancelled"));
    cancelled.catch(() => {});
    renderTask.promise = cancelled;
    await expect(h.render(1, canvas, { scale: 1, x: 0, y: 0, w: 10, h: 10 }, 1).done).resolves.toBeUndefined();
    const boom = Promise.reject(new Error("boom"));
    boom.catch(() => {});
    renderTask.promise = boom;
    await expect(h.render(1, canvas, { scale: 1, x: 0, y: 0, w: 10, h: 10 }, 1).done).rejects.toThrow("boom");
  });

  it("release cleans up a fetched page and a later use fetches it again", async () => {
    const h = await openPdf(new Uint8Array());
    h.release(2); // never fetched: nothing to do
    expect(page.cleanup).not.toHaveBeenCalled();
    await h.pageSize(2);
    h.release(2);
    expect(page.cleanup).toHaveBeenCalledTimes(1);
    await h.pageSize(2);
    expect(doc.getPage).toHaveBeenCalledTimes(2);
  });

  it("close destroys the loading task", async () => {
    const h = await openPdf(new Uint8Array());
    await h.close();
    expect(loading.destroy).toHaveBeenCalled();
  });
});
