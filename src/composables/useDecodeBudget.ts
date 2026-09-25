import { ref, type Ref } from "vue";

// future settings page: Collage section, "wall memory cap"
export const WALL_MEMORY_CAP_BYTES = 6 * 1024 ** 3;
export const MIN_LEVEL = 64;

export function levelFor(requiredLongSide: number, naturalLongSide: number): number {
  let level = MIN_LEVEL;
  while (level < requiredLongSide && level < naturalLongSide) level *= 2;
  return Math.min(level, naturalLongSide);
}

export function bytesAt(level: number, natural: { w: number; h: number }): number {
  const s = level / Math.max(natural.w, natural.h);
  return Math.round(natural.w * s) * Math.round(natural.h * s) * 4;
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
  pending: Promise<ImageBitmap | null> | null;
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

  function entry(id: string, path: string, natural: { w: number; h: number }): Entry {
    let e = entries.get(id);
    if (!e) {
      e = { path, natural, bitmap: null, level: 0, bytes: 0, maxLevel: 0, visible: false, hiddenAt: 0, pending: null };
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

  function held(): number {
    return bytes.value;
  }

  function fits(self: Entry, level: number): boolean {
    return held() - self.bytes + bytesAt(level, self.natural) <= cap;
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
      e.maxLevel = Math.max(MIN_LEVEL, e.level / 2);
      drop(e);
      version.value++;
      if (fits(self, level)) return;
    }
  }

  function grantedLevel(self: Entry, level: number): number {
    let l = self.maxLevel ? Math.min(level, self.maxLevel) : level;
    while (l > MIN_LEVEL && !fits(self, l)) l /= 2;
    return l;
  }

  async function request(id: string, path: string, level: number, natural: { w: number; h: number }) {
    const e = entry(id, path, natural);
    // setVisible may have created a placeholder entry with dummy dims before
    // the first request; always refresh to the real natural size here
    e.path = path;
    e.natural = natural;
    if (e.bitmap && e.level === level) return e.bitmap;
    if (e.pending) return e.pending;
    const run = (async () => {
      evictHidden(e, level);
      const l = grantedLevel(e, level);
      if (!fits(e, l)) stepDownVisible(e, l);
      if (e.bitmap && e.level === l) return e.bitmap;
      let bmp: ImageBitmap;
      try {
        bmp = await decode(path, l, natural);
      } catch {
        drop(e);
        return null;
      }
      drop(e);
      e.bitmap = bmp;
      e.level = l;
      e.bytes = bmp.width * bmp.height * 4;
      bytes.value += e.bytes;
      loaded.value++;
      return bmp;
    })();
    e.pending = run;
    try {
      return await run;
    } finally {
      e.pending = null;
    }
  }

  function release(id: string) {
    const e = entries.get(id);
    if (!e) return;
    drop(e);
    e.maxLevel = 0;
  }

  function setVisible(id: string, visible: boolean) {
    const e = entries.get(id) ?? entry(id, "", { w: 1, h: 1 });
    if (e.visible && !visible) e.hiddenAt = ++tick;
    e.visible = visible;
  }

  function forget(id: string) {
    const e = entries.get(id);
    if (!e) return;
    drop(e);
    entries.delete(id);
  }

  function levelOf(id: string): number {
    const e = entries.get(id);
    return e?.bitmap ? e.level : 0;
  }

  return { bytes, loaded, version, request, release, setVisible, forget, levelOf };
}
