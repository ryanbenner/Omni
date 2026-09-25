import { ref, type Ref } from "vue";

// future settings page: Collage section, "wall memory cap"
export const WALL_MEMORY_CAP_BYTES = 6 * 1024 ** 3;
export const MIN_LEVEL = 64;
// the budget's bitmap plus the item's canvas copy
const HELD_COPIES = 2;
const MAX_CONCURRENT_DECODES = 4;

export function levelFor(requiredLongSide: number, naturalLongSide: number): number {
  let level = MIN_LEVEL;
  while (level < requiredLongSide && level < naturalLongSide) level *= 2;
  return Math.min(level, naturalLongSide);
}

export function bytesAt(level: number, natural: { w: number; h: number }): number {
  const s = level / Math.max(natural.w, natural.h);
  return Math.round(natural.w * s) * Math.round(natural.h * s) * 4 * HELD_COPIES;
}

// largest power of two strictly below `level`, floored at MIN_LEVEL; a natural-size
// level (not itself a power of two) steps down to the largest power of two below it
function stepDownLevel(level: number): number {
  if (level <= MIN_LEVEL) return MIN_LEVEL;
  let p = MIN_LEVEL;
  while (p * 2 < level) p *= 2;
  return p;
}

export type Decoder = (
  path: string,
  level: number,
  natural: { w: number; h: number },
) => Promise<ImageBitmap>;

interface Entry {
  path: string;
  natural: { w: number; h: number };
  bitmap: ImageBitmap | null;
  level: number;
  bytes: number;
  maxLevel: number; // 0 = uncapped; set when stepped down to make room
  visible: boolean;
  hiddenAt: number; // tick when it went off-screen; lower evicts first
  reservedBytes: number; // bytes claimed for an in-flight decode, before it commits
  generation: number; // bumped by release/forget to void a decode already in flight
  pendingLevel: number | null;
  pendingPromise: Promise<ImageBitmap | null> | null;
  wantedLevel: number; // latest level asked for; requests queued behind a pending decode for any other level resolve null
}

export interface DecodeBudget {
  bytes: Ref<number>;
  loaded: Ref<number>;
  version: Ref<number>;
  request(id: string, path: string, level: number, natural: { w: number; h: number }): Promise<ImageBitmap | null>;
  release(id: string): void;
  setVisible(id: string, visible: boolean): void;
  forget(id: string): void;
  levelOf(id: string): number;
}

export function useDecodeBudget(decode: Decoder, cap = WALL_MEMORY_CAP_BYTES): DecodeBudget {
  const bytes = ref(0);
  const loaded = ref(0);
  const version = ref(0);
  const entries = new Map<string, Entry>();
  let tick = 0;
  let reservedTotal = 0; // bytes claimed by decodes in flight, not yet committed
  let running = 0;
  const queued: (() => void)[] = [];

  // fifo slots; a finished decode hands its slot straight to the next in line
  async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (running < MAX_CONCURRENT_DECODES) running++;
    else await new Promise<void>((r) => queued.push(r));
    try {
      return await fn();
    } finally {
      const next = queued.shift();
      if (next) next();
      else running--;
    }
  }

  function entry(id: string, path: string, natural: { w: number; h: number }): Entry {
    let e = entries.get(id);
    if (!e) {
      e = {
        path,
        natural,
        bitmap: null,
        level: 0,
        bytes: 0,
        maxLevel: 0,
        visible: false,
        hiddenAt: 0,
        reservedBytes: 0,
        generation: 0,
        pendingLevel: null,
        pendingPromise: null,
        wantedLevel: 0,
      };
      entries.set(id, e);
    }
    return e;
  }

  function drop(e: Entry) {
    if (!e.bitmap) return;
    e.bitmap.close();
    e.bitmap = null;
    bytes.value -= e.bytes;
    loaded.value--;
    e.bytes = 0;
    e.level = 0;
  }

  function reserve(e: Entry, level: number) {
    e.reservedBytes = bytesAt(level, e.natural);
    reservedTotal += e.reservedBytes;
  }

  function unreserve(e: Entry) {
    reservedTotal -= e.reservedBytes;
    e.reservedBytes = 0;
  }

  // committed bytes plus everything reserved for decodes in flight, so a batch of
  // concurrent requests can't all pass this check before any of them has committed
  function fits(self: Entry, level: number): boolean {
    const total = bytes.value + reservedTotal - self.bytes - self.reservedBytes;
    return total + bytesAt(level, self.natural) <= cap;
  }

  // off-screen decodes go first, oldest hidden first
  function evictHidden(self: Entry, level: number): void {
    if (fits(self, level)) return;
    const hidden = [...entries.values()]
      .filter((e) => e !== self && e.bitmap && !e.visible)
      .sort((a, b) => a.hiddenAt - b.hiddenAt);
    for (const e of hidden) {
      drop(e);
      if (fits(self, level)) return;
    }
  }

  // last resort: drop the largest visible decodes and cap each one level
  // lower; version tells their components to ask again
  function stepDownVisible(self: Entry, level: number): void {
    const visible = [...entries.values()]
      .filter((e) => e !== self && e.bitmap && e.visible && e.level > MIN_LEVEL)
      .sort((a, b) => b.bytes - a.bytes);
    for (const e of visible) {
      e.maxLevel = stepDownLevel(e.level);
      drop(e);
      version.value++;
      if (fits(self, level)) return;
    }
  }

  function grantedLevel(self: Entry, level: number): number {
    let l = self.maxLevel ? Math.min(level, self.maxLevel) : level;
    while (l > MIN_LEVEL && !fits(self, l)) l = stepDownLevel(l);
    return l;
  }

  function startDecode(
    e: Entry,
    id: string,
    path: string,
    level: number,
    natural: { w: number; h: number },
  ): Promise<ImageBitmap | null> {
    const gen = e.generation;
    const run = (async (): Promise<ImageBitmap | null> => {
      evictHidden(e, level);
      const l = grantedLevel(e, level);
      if (!fits(e, l)) stepDownVisible(e, l);
      // even after sacrificing other visible decodes there may be no room left
      // (nothing above 64 to drop); grant the minimum anyway, a small overshoot,
      // rather than resolving null, which the wall reads as "missing"
      if (e.bitmap && e.level === l) return e.bitmap;
      reserve(e, l);
      let bmp: ImageBitmap;
      try {
        // a decode released while it waited for a slot is not worth running
        bmp = await limited(() =>
          e.generation === gen ? decode(path, l, natural) : Promise.reject(new Error("released")),
        );
      } catch {
        unreserve(e);
        if (e.generation === gen && entries.get(id) === e) drop(e);
        return null;
      }
      unreserve(e);
      if (e.generation !== gen || entries.get(id) !== e) {
        // id was released or forgotten while this decode was in flight
        bmp.close();
        return null;
      }
      if (e.maxLevel && l > e.maxLevel) {
        // the cap tightened under us while we were decoding; redo at the new cap
        bmp.close();
        return startDecode(e, id, path, e.maxLevel, natural);
      }
      drop(e);
      e.bitmap = bmp;
      e.level = l;
      e.bytes = bmp.width * bmp.height * 4 * HELD_COPIES;
      bytes.value += e.bytes;
      loaded.value++;
      return bmp;
    })();
    e.pendingLevel = level;
    e.pendingPromise = run;
    run.finally(() => {
      if (e.pendingPromise === run) {
        e.pendingPromise = null;
        e.pendingLevel = null;
      }
    });
    return run;
  }

  async function request(
    id: string,
    path: string,
    level: number,
    natural: { w: number; h: number },
  ): Promise<ImageBitmap | null> {
    const e = entry(id, path, natural);
    // setVisible may have created a placeholder entry with dummy dims before
    // the first request; always refresh to the real natural size here
    e.path = path;
    e.natural = natural;
    e.wantedLevel = level;
    if (e.bitmap && e.level === level) return e.bitmap;
    if (e.pendingPromise) {
      if (e.pendingLevel === level) return e.pendingPromise;
      // a different level is wanted: let the in-flight decode settle, then run
      // only the latest wanted level; anything replaced meanwhile resolves null
      const gen = e.generation;
      await e.pendingPromise;
      if (e.wantedLevel !== level || e.generation !== gen) return null;
      return request(id, path, level, natural);
    }
    return startDecode(e, id, path, level, natural);
  }

  function release(id: string) {
    const e = entries.get(id);
    if (!e) return;
    e.generation++;
    unreserve(e);
    drop(e);
    e.maxLevel = 0;
    // don't leave a cancelled decode coalescable: a same-level re-request must
    // start fresh, not adopt the now-stale pending promise
    e.pendingPromise = null;
    e.pendingLevel = null;
  }

  function setVisible(id: string, visible: boolean) {
    const e = entries.get(id) ?? entry(id, "", { w: 1, h: 1 });
    if (e.visible && !visible) e.hiddenAt = ++tick;
    e.visible = visible;
  }

  function forget(id: string) {
    const e = entries.get(id);
    if (!e) return;
    e.generation++;
    unreserve(e);
    drop(e);
    entries.delete(id);
    // tidiness: the entry is discarded, but leave no coalescable pending state on it
    e.pendingPromise = null;
    e.pendingLevel = null;
  }

  function levelOf(id: string): number {
    const e = entries.get(id);
    return e?.bitmap ? e.level : 0;
  }

  return { bytes, loaded, version, request, release, setVisible, forget, levelOf };
}
