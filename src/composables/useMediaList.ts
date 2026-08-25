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

  return { items, currentIndex, current, error, openFile, next, prev, jumpTo };
}
