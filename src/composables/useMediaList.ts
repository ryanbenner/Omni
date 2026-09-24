import { computed, ref, watch } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { watch as watchDir, type UnwatchFn } from "@tauri-apps/plugin-fs";
import type { DirListing, MediaItem, ScanResult } from "../types";
import { parentDir } from "./pathUtils";

const WATCH_DEBOUNCE_MS = 300;

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
      watchFolder(parentDir(path));
    } catch (e) {
      items.value = [];
      currentIndex.value = 0;
      error.value = String(e);
    }
  }

  // the open file's folder is watched so clips recorded mid-session join
  // the next/prev list; the current file is re-found by path so the viewer
  // stays put. if it vanished, the next-older file slides into its slot,
  // matching removeItem
  let watched: { dir: string; unwatch: Promise<UnwatchFn> } | null = null;

  async function resync() {
    if (!watched) return;
    const dir = watched.dir;
    const curPath = current.value?.path;
    let listing: DirListing;
    try {
      listing = await invoke<DirListing>("read_dir_entries", { path: dir });
    } catch {
      return; // folder unreadable right now: keep the list as it was
    }
    if (watched?.dir !== dir) return; // user moved on during the read
    const found = listing.files.findIndex((it) => it.path === curPath);
    items.value = listing.files;
    currentIndex.value =
      found >= 0 ? found : Math.max(0, Math.min(currentIndex.value, items.value.length - 1));
  }

  function watchFolder(dir: string) {
    if (watched?.dir === dir) return;
    watched?.unwatch.then((u) => u()).catch(() => {});
    const unwatch = watchDir(dir, () => resync(), {
      recursive: false,
      delayMs: WATCH_DEBOUNCE_MS,
    });
    unwatch.catch(() => {}); // unwatchable folder: focus resync still works
    watched = { dir, unwatch };
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
    resync,
  };
}
