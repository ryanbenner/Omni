// @vitest-environment node
import { describe, it, expect } from "vitest";

// a minimal one-page 612x792 pdf with a correct xref table
function tinyPdf(): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("pdf.js legacy build", () => {
  it("ships the polyfills the modern build relies on and opens a real pdf", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(typeof (Map.prototype as { getOrInsertComputed?: unknown }).getOrInsertComputed).toBe("function");
    expect(typeof (Math as { sumPrecise?: unknown }).sumPrecise).toBe("function");

    const loading = getDocument({ data: tinyPdf() });
    const doc = await loading.promise;
    expect(doc.numPages).toBe(1);
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    expect(vp.width).toBe(612);
    expect(vp.height).toBe(792);
    await loading.destroy();
  });
});
