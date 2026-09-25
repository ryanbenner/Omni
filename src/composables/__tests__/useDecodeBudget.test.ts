import { describe, it, expect, vi } from "vitest";
import { bytesAt, levelFor, useDecodeBudget, MIN_LEVEL, WALL_MEMORY_CAP_BYTES } from "../useDecodeBudget";

function bmp(level: number, natural: { w: number; h: number }) {
  const s = level / Math.max(natural.w, natural.h);
  return {
    width: Math.round(natural.w * s),
    height: Math.round(natural.h * s),
    close: vi.fn(),
  } as unknown as ImageBitmap;
}
const decoder = vi.fn((_p: string, level: number, natural: { w: number; h: number }) =>
  Promise.resolve(bmp(level, natural)),
);
const nat = { w: 4000, h: 2000 };

describe("levelFor and bytesAt", () => {
  it("rounds up to a power of two, floors at 64, caps at natural", () => {
    expect(levelFor(1, 4000)).toBe(MIN_LEVEL);
    expect(levelFor(300, 4000)).toBe(512);
    expect(levelFor(512, 4000)).toBe(512);
    expect(levelFor(9000, 4000)).toBe(4000);
  });

  it("bytesAt is width times height times four at that level", () => {
    expect(bytesAt(512, nat)).toBe(512 * 256 * 4);
    expect(bytesAt(4000, nat)).toBe(4000 * 2000 * 4);
  });

  it("the cap is 6 GB", () => {
    expect(WALL_MEMORY_CAP_BYTES).toBe(6 * 1024 ** 3);
  });
});

describe("useDecodeBudget", () => {
  it("holds a decode per id and accounts bytes", async () => {
    decoder.mockClear();
    const b = useDecodeBudget(decoder);
    b.setVisible("a", true);
    const got = await b.request("a", "/a.jpg", 512, nat);
    expect(got?.width).toBe(512);
    expect(b.bytes.value).toBe(bytesAt(512, nat));
    expect(b.loaded.value).toBe(1);
    expect(b.levelOf("a")).toBe(512);
    await b.request("a", "/a.jpg", 512, nat);
    expect(decoder).toHaveBeenCalledTimes(1);
  });

  it("release drops the decode and closes the bitmap", async () => {
    const b = useDecodeBudget(decoder);
    const got = await b.request("a", "/a.jpg", 512, nat);
    b.release("a");
    expect(b.bytes.value).toBe(0);
    expect(b.loaded.value).toBe(0);
    expect((got as unknown as { close: () => void }).close).toHaveBeenCalled();
  });

  it("evicts off-screen decodes, least recently visible first, before granting", async () => {
    const cap = bytesAt(512, nat) * 2 + 10;
    const b = useDecodeBudget(decoder, cap);
    b.setVisible("a", true);
    await b.request("a", "/a.jpg", 512, nat);
    b.setVisible("b", true);
    await b.request("b", "/b.jpg", 512, nat);
    b.setVisible("a", false);
    b.setVisible("b", false);
    b.setVisible("c", true);
    await b.request("c", "/c.jpg", 512, nat);
    expect(b.levelOf("a")).toBe(0); // evicted first: it went off-screen first
    expect(b.levelOf("b")).toBe(512);
    expect(b.levelOf("c")).toBe(512);
  });

  it("serves a lower level when visible items alone fill the cap", async () => {
    const cap = bytesAt(512, nat) + bytesAt(256, nat) + 10;
    const b = useDecodeBudget(decoder, cap);
    b.setVisible("a", true);
    b.setVisible("b", true);
    await b.request("a", "/a.jpg", 512, nat);
    const got = await b.request("b", "/b.jpg", 512, nat);
    expect(got?.width).toBe(256);
    expect(b.levelOf("b")).toBe(256);
    expect(b.bytes.value).toBeLessThanOrEqual(cap);
  });

  it("steps a larger visible decode down when even the minimum will not fit", async () => {
    const cap = bytesAt(512, nat) + bytesAt(MIN_LEVEL, nat) - 1;
    const b = useDecodeBudget(decoder, cap);
    b.setVisible("a", true);
    b.setVisible("b", true);
    await b.request("a", "/a.jpg", 512, nat);
    const v = b.version.value;
    await b.request("b", "/b.jpg", MIN_LEVEL, nat);
    expect(b.levelOf("a")).toBeLessThan(512);
    expect(b.levelOf("b")).toBe(MIN_LEVEL);
    expect(b.bytes.value).toBeLessThanOrEqual(cap);
    expect(b.version.value).toBe(v + 1);
    // a re-requests at its old level and is capped one level lower
    const again = await b.request("a", "/a.jpg", 512, nat);
    expect(again?.width).toBe(256);
    b.release("b");
    b.forget("b");
    b.release("a");
    expect((await b.request("a", "/a.jpg", 512, nat))?.width).toBe(512); // release lifted the cap
  });

  it("resolves null and holds nothing when decoding fails", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("gone")));
    const b = useDecodeBudget(failing);
    expect(await b.request("a", "/a.jpg", 512, nat)).toBeNull();
    expect(b.loaded.value).toBe(0);
  });

  it("forget removes all trace of an id", async () => {
    const b = useDecodeBudget(decoder);
    await b.request("a", "/a.jpg", 512, nat);
    b.forget("a");
    expect(b.bytes.value).toBe(0);
    expect(b.levelOf("a")).toBe(0);
  });
});
