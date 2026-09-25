import { computed, ref } from "vue";
import type { CollageDoc, CollageItem, ExportFormat, Rect } from "../types";
import { emptyDoc } from "./collageFile";
import { findEmptySpot, initialSize } from "./collageGeometry";

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useCollage() {
  const items = ref<CollageItem[]>([]);
  const selectedId = ref<string | null>(null);
  const dirty = ref(false);
  const lockAspect = ref(true);
  const exportFormat = ref<ExportFormat>("png");
  const filePath = ref<string | null>(null);

  const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);

  function find(id: string): CollageItem | undefined {
    return items.value.find((i) => i.id === id);
  }

  function touch() {
    dirty.value = true;
  }

  function load(doc: CollageDoc, path: string | null) {
    items.value = doc.items.map((i) => ({ ...i }));
    lockAspect.value = doc.lockAspect;
    exportFormat.value = doc.exportFormat;
    filePath.value = path;
    selectedId.value = null;
    dirty.value = false;
  }

  function toDoc(view: { x: number; y: number; zoom: number }): CollageDoc {
    return {
      ...emptyDoc(),
      items: items.value.map((i) => ({ ...i })),
      view: { ...view },
      lockAspect: lockAspect.value,
      exportFormat: exportFormat.value,
    };
  }

  function add(
    pic: { path: string; nw: number; nh: number; thumb?: string },
    view: { center: { x: number; y: number }; visible: Rect },
  ): CollageItem {
    const size = initialSize(pic.nw, pic.nh, view.visible);
    const spot = findEmptySpot(size, view.center, items.value);
    const z = items.value.reduce((m, i) => Math.max(m, i.z), 0) + 1;
    const item: CollageItem = {
      id: newId(),
      kind: "image",
      path: pic.path,
      x: spot.x,
      y: spot.y,
      w: size.w,
      h: size.h,
      nw: pic.nw,
      nh: pic.nh,
      rotation: 0,
      z,
      thumb: pic.thumb,
    };
    items.value.push(item);
    touch();
    return item;
  }

  function remove(id: string) {
    items.value = items.value.filter((i) => i.id !== id);
    if (selectedId.value === id) selectedId.value = null;
    touch();
  }

  function select(id: string | null) {
    selectedId.value = id;
  }

  function bringToFront(id: string) {
    const it = find(id);
    if (!it) return;
    const top = items.value.reduce((m, i) => Math.max(m, i.z), 0);
    if (it.z === top) return;
    it.z = top + 1;
    touch();
  }

  function moveBy(id: string, dx: number, dy: number) {
    const it = find(id);
    if (!it) return;
    it.x += dx;
    it.y += dy;
    touch();
  }

  function setRect(id: string, r: Rect) {
    const it = find(id);
    if (!it) return;
    Object.assign(it, r);
    touch();
  }

  function rotate(id: string) {
    const it = find(id);
    if (!it) return;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    it.rotation = ((it.rotation + 90) % 360) as CollageItem["rotation"];
    [it.w, it.h] = [it.h, it.w];
    it.x = cx - it.w / 2;
    it.y = cy - it.h / 2;
    touch();
  }

  // `to` is an insertion slot, same reading as movePin in useFileTree
  function reorder(from: number, to: number) {
    if (to === from || to === from + 1) return;
    const next = items.value.slice();
    const [it] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, it);
    items.value = next;
    touch();
  }

  function relink(id: string, path: string, meta: { nw: number; nh: number; thumb?: string }) {
    const it = find(id);
    if (!it) return;
    it.path = path;
    it.nw = meta.nw;
    it.nh = meta.nh;
    it.thumb = meta.thumb;
    touch();
  }

  function toggleLock() {
    lockAspect.value = !lockAspect.value;
    touch();
  }

  function setFormat(f: ExportFormat) {
    if (exportFormat.value === f) return;
    exportFormat.value = f;
    touch();
  }

  function markClean(path: string) {
    filePath.value = path;
    dirty.value = false;
  }

  return {
    items,
    selectedId,
    selected,
    dirty,
    lockAspect,
    exportFormat,
    filePath,
    load,
    toDoc,
    add,
    remove,
    select,
    bringToFront,
    moveBy,
    setRect,
    rotate,
    reorder,
    relink,
    toggleLock,
    setFormat,
    markClean,
  };
}
