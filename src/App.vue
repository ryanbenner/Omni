<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getMatches } from "@tauri-apps/plugin-cli";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { exists } from "@tauri-apps/plugin-fs";
import Titlebar from "./components/Titlebar.vue";
import Viewer from "./components/Viewer.vue";
import Sidebar from "./components/Sidebar.vue";
import { useMediaList } from "./composables/useMediaList";
import { useKeyboard } from "./composables/useKeyboard";
import { parentDir } from "./composables/pathUtils";
import { extOf } from "./composables/useImageSave";
import { emptyDoc, readCollage, COLLAGE_EXT } from "./composables/collageFile";
import type { Command } from "./composables/keymap";
import type { CollageDoc, ViewerAction } from "./types";

// loaded on first entry so the viewer's startup never pays for the wall
const CollageWall = defineAsyncComponent(() => import("./components/CollageWall.vue"));

const list = useMediaList();
const viewer = ref<InstanceType<typeof Viewer> | null>(null);
const sidebar = ref<InstanceType<typeof Sidebar> | null>(null);
const sidebarOpen = ref(true);

interface WallHandle {
  addPaths(paths: string[]): Promise<void>;
  requestLeave(closing: boolean): Promise<boolean>;
  handleAction(a: ViewerAction): boolean;
  isDirty(): boolean;
  lastPath(): string | null;
}
const wall = ref<WallHandle | null>(null);
const collageInit = ref<{ doc: CollageDoc; path: string | null; seedPaths?: string[] } | null>(null);
const collageOpen = computed(() => collageInit.value !== null);
const collageStatus = ref("");
const collageError = ref<string | null>(null);
const LAST_COLLAGE_KEY = "mv-last-collage";
const resumePath = ref<string | null>(null);

const currentFolder = computed(() =>
  list.current.value ? parentDir(list.current.value.path) : null,
);

function applyApp(action: { type: "prevFile" | "nextFile" }) {
  if (collageOpen.value) return;
  if (action.type === "prevFile") list.prev();
  else list.next();
}

function onCommand(cmd: Command) {
  if (cmd.target === "app") {
    applyApp(cmd.action);
    return;
  }
  if (cmd.action.type === "exitCollage") {
    leaveCollage();
    return;
  }
  if (cmd.action.type === "enterCollage") {
    enterCollage(list.current.value ? [list.current.value.path] : []);
    return;
  }
  const stage = collageOpen.value ? wall.value : viewer.value;
  const handled = stage?.handleAction(cmd.action) ?? false;
  if (!handled && cmd.fallback) applyApp(cmd.fallback);
}

useKeyboard(() => (collageOpen.value ? "collage" : (list.current.value?.kind ?? null)), onCommand);

// ---- collage mode ----

function enterCollage(seedPaths: string[]) {
  collageError.value = null;
  collageInit.value = { doc: emptyDoc(), path: null, seedPaths };
}

async function openCollage(path: string) {
  if (wall.value && !(await wall.value.requestLeave(false))) return;
  try {
    const doc = await readCollage(path);
    collageError.value = null;
    collageInit.value = { doc, path };
  } catch (e) {
    collageInit.value = null;
    collageError.value = `Couldn't open ${path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)}: ${e instanceof Error ? e.message : e}`;
  }
}

async function leaveCollage(): Promise<boolean> {
  if (!wall.value) return true;
  if (!(await wall.value.requestLeave(false))) return false;
  const last = wall.value.lastPath();
  collageInit.value = null;
  collageStatus.value = "";
  if (last) await list.openFile(last);
  return true;
}

function onWallExit(lastPath: string | null) {
  // the wall already ran its own gate before emitting
  collageInit.value = null;
  collageStatus.value = "";
  if (lastPath) list.openFile(lastPath);
}

async function openFile(path: string) {
  const ext = extOf(path);
  if (ext === COLLAGE_EXT) {
    await openCollage(path);
    return;
  }
  if (collageOpen.value) {
    const isVideo = ["mp4", "mkv", "mov"].includes(ext);
    if (!isVideo) {
      await wall.value?.addPaths([path]);
      return;
    }
    if (!(await wall.value?.requestLeave(false))) return;
    collageInit.value = null;
    collageStatus.value = "";
  }
  await list.openFile(path);
}

function onAddToCollage(path: string) {
  if (collageOpen.value) {
    wall.value?.addPaths([path]);
    return;
  }
  const cur = list.current.value;
  const seed = cur && cur.kind === "image" && cur.path !== path ? [cur.path, path] : [path];
  enterCollage(seed);
}

function resumeName(): string {
  const p = resumePath.value ?? "";
  return p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
}

async function checkResume() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LAST_COLLAGE_KEY);
  } catch {
    return;
  }
  if (!stored) return;
  try {
    if (await exists(stored)) resumePath.value = stored;
  } catch {
    // fs unavailable: no resume offer
  }
}

function pathFromArgv(argv: string[]): string | null {
  // argv[0] is the exe; first remaining non-flag arg is the file
  const arg = argv.slice(1).find((a) => !a.startsWith("-"));
  return arg ?? null;
}

onMounted(async () => {
  window.addEventListener("focus", () => list.resync());
  getCurrentWindow().onCloseRequested(async (e) => {
    if (!wall.value?.isDirty()) return;
    e.preventDefault();
    if (await wall.value.requestLeave(true)) await getCurrentWindow().destroy();
  });
  await listen<string[]>("single-instance", (e) => {
    const path = pathFromArgv(e.payload);
    if (path) openFile(path);
  });
  try {
    const matches = await getMatches();
    const fileArg = matches.args.file;
    if (fileArg && typeof fileArg.value === "string") {
      await openFile(fileArg.value);
    }
  } catch {
    // cli plugin unavailable (e.g. dev on mac without args); stay on empty state
  }
  if (!list.current.value && !collageOpen.value) checkResume();
});

function openDefaultApps() {
  openUrl("ms-settings:defaultapps").catch(() => {});
}

function onClipSaved(path: string) {
  list.openFile(path);
  sidebar.value?.refreshDir(parentDir(path));
}

async function deleteCurrent() {
  const cur = list.current.value;
  if (!cur) return;
  const yes = await ask(`Delete ${cur.name}? It will be moved to the Recycle Bin.`, {
    title: "Delete file",
    kind: "warning",
  });
  if (!yes) return;
  try {
    await invoke("delete_file", { path: cur.path });
    list.removeItem(cur.path);
    sidebar.value?.refreshDir(parentDir(cur.path));
  } catch (e) {
    await message(String(e), { title: "Delete failed", kind: "error" });
  }
}

defineExpose({ openFile, enterCollage });
</script>

<template>
  <main class="app">
    <Titlebar
      :sidebar-open="sidebarOpen"
      :subtitle="collageOpen ? collageStatus : undefined"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
    />
    <div class="body-row">
      <Sidebar
        v-if="sidebarOpen"
        ref="sidebar"
        :current-path="collageOpen ? null : (list.current.value?.path ?? null)"
        :current-folder="currentFolder"
        @open-file="openFile"
        @add-to-collage="onAddToCollage"
        @file-deleted="list.removeItem"
        @file-renamed="list.renameItem"
      />
      <div class="stage">
        <CollageWall
          v-if="collageInit"
          ref="wall"
          :init="collageInit"
          @exit="onWallExit"
          @status="collageStatus = $event"
        />
        <Viewer
          v-else-if="list.current.value"
          ref="viewer"
          :item="list.current.value"
          :has-prev="list.currentIndex.value > 0"
          :has-next="list.currentIndex.value < list.items.value.length - 1"
          @delete-file="deleteCurrent"
          @clip-saved="onClipSaved"
          @collage="enterCollage([list.current.value.path])"
          @navigate="applyApp({ type: $event === -1 ? 'prevFile' : 'nextFile' })"
        />
        <div v-else class="empty">
          <p v-if="collageError" class="error-text">{{ collageError }}</p>
          <p v-else-if="list.error.value" class="error-text">{{ list.error.value }}</p>
          <p v-else class="empty-hint">No file open. Open one to begin.</p>
          <button v-if="resumePath" class="resume-btn" @click="openCollage(resumePath)">
            Resume {{ resumeName() }}
          </button>
          <button
            class="settings-btn"
            title="Choose default apps in Windows Settings"
            @click="openDefaultApps"
          >
            Set Default
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
}
.body-row {
  flex: 1;
  min-height: 0;
  display: flex;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #0a0b0c;
}
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}
.empty-hint {
  color: var(--color-neutral-600);
  max-width: 48ch;
}
.error-text {
  color: #d66;
}
.settings-btn {
  /* anchored to the stage corner, not the centered text column */
  position: absolute;
  right: 14px;
  bottom: 14px;
  background: transparent;
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-family: var(--font-body);
}
.settings-btn:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.resume-btn {
  margin-top: 14px;
  padding: 0.45rem 1rem;
  border-radius: 8px;
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  color: #fff;
  cursor: pointer;
  font-family: var(--font-body);
}
.resume-btn:hover {
  background: var(--color-accent-600);
}
</style>
