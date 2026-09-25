import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const saveDialogMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: (...a: unknown[]) => saveDialogMock(...a) }));
const nextFreeMock = vi.fn();
vi.mock("../../composables/collageFile", async (orig) => ({
  ...(await orig<typeof import("../../composables/collageFile")>()),
  nextFreeCompositionPath: (...a: unknown[]) => nextFreeMock(...a),
}));
const exportMock = vi.fn();
const renderMock = vi.fn();
vi.mock("../../composables/collageExport", async (orig) => ({
  ...(await orig<typeof import("../../composables/collageExport")>()),
  exportArea: (...a: unknown[]) => exportMock(...a),
  renderArea: (...a: unknown[]) => renderMock(...a),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn() }));

import ExportPreview from "../ExportPreview.vue";

const rect = { x: 0, y: 0, w: 3840, h: 2160 };

describe("ExportPreview", () => {
  beforeEach(() => {
    saveDialogMock.mockReset();
    nextFreeMock.mockReset().mockResolvedValue("C:\\Pics\\collage1.png");
    exportMock.mockReset().mockResolvedValue({ missing: [] });
    renderMock.mockReset().mockResolvedValue({
      canvas: { convertToBlob: async () => new Blob([new Uint8Array([1])]) },
      missing: ["/p/gone.jpg"],
    });
    (globalThis as { URL: typeof URL }).URL.createObjectURL = vi.fn(() => "blob:x");
    (globalThis as { URL: typeof URL }).URL.revokeObjectURL = vi.fn();
  });

  function mountIt() {
    return mount(ExportPreview, {
      props: { rect, items: [], format: "png", folder: "C:\\Pics" },
      attachTo: document.body,
    });
  }

  it("renders a preview, shows the size and missing notice", async () => {
    const w = mountIt();
    await flushPromises();
    expect(renderMock).toHaveBeenCalled();
    expect(w.find(".preview-size").text()).toBe("3840 × 2160");
    expect(w.find(".preview-missing").text()).toContain("gone.jpg");
    expect(w.find("img.preview-img").attributes("src")).toBe("blob:x");
    w.unmount();
  });

  it("Save writes the next free name without a dialog and emits saved", async () => {
    const w = mountIt();
    await flushPromises();
    await w.find(".btn-accent.save").trigger("click");
    await flushPromises();
    expect(nextFreeMock).toHaveBeenCalledWith("C:\\Pics", "png");
    expect(exportMock.mock.calls[0][3]).toBe("C:\\Pics\\collage1.png");
    expect(saveDialogMock).not.toHaveBeenCalled();
    expect(w.emitted("saved")).toEqual([["C:\\Pics\\collage1.png"]]);
    w.unmount();
  });

  it("Save As opens the dialog with the free name and writes where chosen", async () => {
    saveDialogMock.mockResolvedValue("D:\\out.png");
    const w = mountIt();
    await flushPromises();
    await w.find(".btn-accent.save-as").trigger("click");
    await flushPromises();
    expect(saveDialogMock.mock.calls[0][0].defaultPath).toBe("C:\\Pics\\collage1.png");
    expect(exportMock.mock.calls[0][3]).toBe("D:\\out.png");
    expect(w.emitted("saved")).toEqual([["D:\\out.png"]]);
    w.unmount();
  });

  it("a cancelled Save As writes nothing and keeps the preview open", async () => {
    saveDialogMock.mockResolvedValue(null);
    const w = mountIt();
    await flushPromises();
    await w.find(".btn-accent.save-as").trigger("click");
    await flushPromises();
    expect(exportMock).not.toHaveBeenCalled();
    expect(w.emitted("close")).toBeUndefined();
    w.unmount();
  });

  it("Discard and Escape close without writing; the format switch re-renders and emits", async () => {
    const w = mountIt();
    await flushPromises();
    await w.find(".fmt-jpg").trigger("click");
    await flushPromises();
    expect(w.emitted("formatChange")).toEqual([["jpg"]]);
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock.mock.calls[1][2]).toBe("jpg");
    await w.find(".btn-outline").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.emitted("close")).toHaveLength(2);
    expect(exportMock).not.toHaveBeenCalled();
    w.unmount();
  });
});
