import { computed, ref, watch } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { MediaItem, ScanResult } from "../types";

export function useMediaList() {
  const items = ref<MediaItem[]>([]);
  const currentIndex = ref(0);
  const error = ref<string | null>(null);
  const current = computed<MediaItem | null>(
    () => items.value[currentIndex.value] ?? null,
  );

  async function openFile(path: string) {
    try {
      const result = await invoke<ScanResult>("scan_media", { path });
      items.value = result.items;
      currentIndex.value = result.startIndex;
      error.value = null;
    } catch (e) {
      items.value = [];
      currentIndex.value = 0;
      error.value = String(e);
    }
  }

  function jumpTo(index: number) {
    if (index >= 0 && index < items.value.length) {
      currentIndex.value = index;
    }
  }

  function next() {
    jumpTo(currentIndex.value + 1);
  }

  function prev() {
    jumpTo(currentIndex.value - 1);
  }

  function removeItem(path: string) {
    const i = items.value.findIndex((it) => it.path === path);
    if (i === -1) return;
    items.value.splice(i, 1);
    // keep the index pointing at a real item; the file after the removed
    // one slides into its slot, so only clamp at the tail
    if (currentIndex.value > i || currentIndex.value >= items.value.length) {
      currentIndex.value = Math.max(0, Math.min(currentIndex.value - 1, items.value.length - 1));
    }
  }

  function renameItem(oldPath: string, newPath: string, newName: string) {
    const it = items.value.find((x) => x.path === oldPath);
    if (!it) return;
    it.path = newPath;
    it.name = newName;
  }

  // preload immediate image neighbors for instant flipping; large 4k
  // screenshots make preloading beyond +-1 too expensive, and videos
  // must never be preloaded
  watch([items, currentIndex], () => {
    for (const offset of [-1, 1]) {
      const neighbor = items.value[currentIndex.value + offset];
      if (neighbor?.kind === "image") {
        new Image().src = convertFileSrc(neighbor.path);
      }
    }
  });

  return {
    items,
    currentIndex,
    current,
    error,
    openFile,
    next,
    prev,
    jumpTo,
    removeItem,
    renameItem,
  };
}
