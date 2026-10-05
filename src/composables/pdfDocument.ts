import { getDocument, GlobalWorkerOptions, RenderingCancelledException } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "./pdfWorkerUrl";
import type { Size } from "./pdfLayout";

// a slice of one page to rasterize: scale in css px per point, x/y/w/h the
// slice in css px measured from the page's top-left
export interface RenderRegion {
  scale: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderJob {
  done: Promise<void>;
  cancel(): void;
}

// page numbers are 1-based, as in pdf.js
export interface PdfHandle {
  pageCount: number;
  pageSize(n: number): Promise<Size>;
  render(n: number, canvas: HTMLCanvasElement, region: RenderRegion, dpr: number): RenderJob;
  // drops a page's operator list and decoded images; a later use fetches it again
  release(n: number): void;
  close(): Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<PdfHandle> {
  GlobalWorkerOptions.workerSrc = workerUrl;
  // decoders, cmaps and fonts ship beside the app (see vite.config.ts); pdf.js
  // needs each url to end with a slash
  const base = new URL("pdfjs/", document.baseURI).href;
  const loading: PDFDocumentLoadingTask = getDocument({
    data,
    wasmUrl: base + "wasm/",
    cMapUrl: base + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: base + "standard_fonts/",
  });
  const doc = await loading.promise;
  const pages = new Map<number, Promise<PDFPageProxy>>();
  const loaded = new Map<number, PDFPageProxy>();
  function getPage(n: number): Promise<PDFPageProxy> {
    let p = pages.get(n);
    if (!p) {
      const q = doc.getPage(n);
      p = q;
      pages.set(n, q);
      q.then(
        (page) => {
          if (pages.get(n) === q) loaded.set(n, page);
        },
        () => {},
      );
    }
    return p;
  }
  return {
    pageCount: doc.numPages,
    async pageSize(n) {
      const vp = (await getPage(n)).getViewport({ scale: 1 });
      return { w: vp.width, h: vp.height };
    },
    render(n, canvas, region, dpr) {
      let task: RenderTask | null = null;
      let cancelled = false;
      const done = getPage(n)
        .then((page) => {
          if (cancelled) return;
          canvas.width = Math.ceil(region.w * dpr);
          canvas.height = Math.ceil(region.h * dpr);
          // offsets are in output pixels, so they scale with dpr too
          const viewport = page.getViewport({
            scale: region.scale * dpr,
            offsetX: -region.x * dpr,
            offsetY: -region.y * dpr,
          });
          task = page.render({ canvas, viewport });
          return task.promise;
        })
        .catch((e) => {
          if (!(e instanceof RenderingCancelledException)) throw e;
        });
      return {
        done,
        cancel() {
          cancelled = true;
          task?.cancel();
        },
      };
    },
    release(n) {
      const page = loaded.get(n);
      if (!page) return;
      // pdf.js defers this until an in-flight (cancelled) render has wound down
      page.cleanup();
      loaded.delete(n);
      pages.delete(n);
    },
    close: () => loading.destroy(),
  };
}
