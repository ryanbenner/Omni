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

function deferredBitmap() {
  let resolve!: (b: ImageBitmap) => void;
  const promise = new Promise<ImageBitmap>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

  it("does not call the decoder again when the granted level, after eviction, matches what is already held", async () => {
    const cap = bytesAt(512, nat) + 10;
    const b = useDecodeBudget(decoder, cap);
    decoder.mockClear();
    b.setVisible("a", true);
    await b.request("a", "/a.jpg", 512, nat);
    expect(decoder).toHaveBeenCalledTimes(1);
    const got = await b.request("a", "/a.jpg", 1024, nat); // won't fit; steps back to what's already held
    expect(got?.width).toBe(512);
    expect(decoder).toHaveBeenCalledTimes(1);
  });

  it("reserves bytes for concurrent requests, so the cap holds before either decode resolves", async () => {
    const cap = bytesAt(512, nat) + bytesAt(256, nat) + 10;
    const b = useDecodeBudget(decoder, cap);
    b.setVisible("a", true);
    b.setVisible("b", true);
    const [gotA, gotB] = await Promise.all([
      b.request("a", "/a.jpg", 512, nat),
      b.request("b", "/b.jpg", 512, nat),
    ]);
    expect(gotA?.width).toBe(512);
    expect(gotB?.width).toBe(256);
    expect(b.bytes.value).toBeLessThanOrEqual(cap);
  });

  it("forget during a pending decode discards the result and closes the bitmap", async () => {
    const { promise, resolve } = deferredBitmap();
    const slow = vi.fn(() => promise);
    const b = useDecodeBudget(slow);
    b.setVisible("a", true);
    const p = b.request("a", "/a.jpg", 512, nat);
    b.forget("a");
    const decoded = bmp(512, nat);
    resolve(decoded);
    expect(await p).toBeNull();
    expect(b.bytes.value).toBe(0);
    expect(b.loaded.value).toBe(0);
    expect((decoded as unknown as { close: () => void }).close).toHaveBeenCalled();
  });

  it("release during a pending decode discards the result and closes the bitmap", async () => {
    const { promise, resolve } = deferredBitmap();
    const slow = vi.fn(() => promise);
    const b = useDecodeBudget(slow);
    b.setVisible("a", true);
    const p = b.request("a", "/a.jpg", 512, nat);
    b.release("a");
    const decoded = bmp(512, nat);
    resolve(decoded);
    expect(await p).toBeNull();
    expect(b.bytes.value).toBe(0);
    expect(b.loaded.value).toBe(0);
    expect((decoded as unknown as { close: () => void }).close).toHaveBeenCalled();
  });

  it("release during a pending decode, then a same-level request, still resolves with a real bitmap", async () => {
    const { promise, resolve } = deferredBitmap();
    const slow = vi.fn(() => promise);
    const b = useDecodeBudget(slow);
    b.setVisible("a", true);
    const first = b.request("a", "/a.jpg", 512, nat);
    b.release("a");
    const second = b.request("a", "/a.jpg", 512, nat); // must not coalesce onto the cancelled decode
    const decoded = bmp(512, nat);
    resolve(decoded);
    expect(await first).toBeNull(); // the cancelled decode still resolves null
    const got = await second;
    expect(got?.width).toBe(512);
    expect(b.levelOf("a")).toBe(512);
    expect(b.bytes.value).toBe(bytesAt(512, nat));
    expect(b.loaded.value).toBe(1);
  });

  it("forget during a pending decode, then a same-level request, still resolves with a real bitmap", async () => {
    const { promise, resolve } = deferredBitmap();
    const slow = vi.fn(() => promise);
    const b = useDecodeBudget(slow);
    b.setVisible("a", true);
    const first = b.request("a", "/a.jpg", 512, nat);
    b.forget("a");
    const second = b.request("a", "/a.jpg", 512, nat);
    const decoded = bmp(512, nat);
    resolve(decoded);
    expect(await first).toBeNull();
    const got = await second;
    expect(got?.width).toBe(512);
    expect(b.levelOf("a")).toBe(512);
    expect(b.bytes.value).toBe(bytesAt(512, nat));
    expect(b.loaded.value).toBe(1);
  });

  it("steps a non-power-of-two natural-size request down through powers of two, not fractional levels", async () => {
    const cap = bytesAt(MIN_LEVEL, nat) + 10;
    const b = useDecodeBudget(decoder, cap);
    decoder.mockClear();
    b.setVisible("x", true);
    await b.request("x", "/x.jpg", 4000, nat);
    expect(decoder).toHaveBeenCalledWith("/x.jpg", MIN_LEVEL, nat);
    expect(b.levelOf("x")).toBe(MIN_LEVEL);
  });

  it("the first step down from a natural, non-power-of-two level lands on the largest power of two below it", async () => {
    const cap = bytesAt(2048, nat) + 10;
    const b = useDecodeBudget(decoder, cap);
    decoder.mockClear();
    b.setVisible("x", true);
    await b.request("x", "/x.jpg", 4000, nat);
    expect(decoder).toHaveBeenCalledWith("/x.jpg", 2048, nat);
  });

  it("stepping down a visible decode from its natural (non-power-of-two) level lands on the largest power of two below it", async () => {
    const cap = bytesAt(4000, nat) + bytesAt(MIN_LEVEL, nat) - 1;
    const b = useDecodeBudget(decoder, cap);
    b.setVisible("a", true);
    b.setVisible("b", true);
    await b.request("a", "/a.jpg", 4000, nat);
    await b.request("b", "/b.jpg", MIN_LEVEL, nat);
    expect(b.levelOf("a")).toBe(0);
    expect(b.levelOf("b")).toBe(MIN_LEVEL);
    const again = await b.request("a", "/a.jpg", 4000, nat);
    expect(again?.width).toBe(2048);
  });

  it("re-clamps a pending upgrade if the cap tightens under it before the decode resolves", async () => {
    const { promise, resolve } = deferredBitmap();
    let calls = 0;
    const flaky = vi.fn((_p: string, level: number, natural: { w: number; h: number }) => {
      calls++;
      return calls === 2 ? promise : Promise.resolve(bmp(level, natural));
    });
    const cap = bytesAt(1024, nat) + bytesAt(MIN_LEVEL, nat) + 10;
    const b = useDecodeBudget(flaky, cap);
    b.setVisible("a", true);
    await b.request("a", "/a.jpg", 512, nat);
    const upgrade = b.request("a", "/a.jpg", 1024, nat); // call 2: held open until we resolve it
    b.setVisible("c", true);
    const cReq = b.request("c", "/c.jpg", MIN_LEVEL, nat); // forces a's held bitmap down, tightening a's cap
    expect(b.levelOf("a")).toBe(0); // a's held bitmap already sacrificed for c
    resolve(bmp(1024, nat));
    const gotA = await upgrade;
    expect(gotA?.width).toBe(256); // re-clamped to a's new cap, not the stale 1024
    expect(b.levelOf("a")).toBe(256);
    expect((await cReq)?.width).toBe(MIN_LEVEL);
    expect(b.bytes.value).toBeLessThanOrEqual(cap);
  });
});
