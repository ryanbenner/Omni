<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getMatches } from "@tauri-apps/plugin-cli";
import { listen } from "@tauri-apps/api/event";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import Titlebar from "./components/Titlebar.vue";
import Viewer from "./components/Viewer.vue";
import Sidebar from "./components/Sidebar.vue";
import { useMediaList } from "./composables/useMediaList";
import { useKeyboard } from "./composables/useKeyboard";
import { parentDir } from "./composables/pathUtils";
import type { Command } from "./composables/keymap";

const list = useMediaList();
const viewer = ref<InstanceType<typeof Viewer> | null>(null);
const sidebar = ref<InstanceType<typeof Sidebar> | null>(null);
const sidebarOpen = ref(true);

const currentFolder = computed(() =>
  list.current.value ? parentDir(list.current.value.path) : null,
);

function applyApp(action: { type: "prevFile" | "nextFile" }) {
  if (action.type === "prevFile") list.prev();
  else list.next();
}

function onCommand(cmd: Command) {
  if (cmd.target === "app") {
    applyApp(cmd.action);
    return;
  }
  const handled = viewer.value?.handleAction(cmd.action) ?? false;
  if (!handled && cmd.fallback) applyApp(cmd.fallback);
}

useKeyboard(() => list.current.value?.kind ?? null, onCommand);

function pathFromArgv(argv: string[]): string | null {
  // argv[0] is the exe; first remaining non-flag arg is the file
  const arg = argv.slice(1).find((a) => !a.startsWith("-"));
  return arg ?? null;
}

onMounted(async () => {
  await listen<string[]>("single-instance", (e) => {
    const path = pathFromArgv(e.payload);
    if (path) list.openFile(path);
  });
  try {
    const matches = await getMatches();
    const fileArg = matches.args.file;
    if (fileArg && typeof fileArg.value === "string") {
      await list.openFile(fileArg.value);
    }
  } catch {
    // cli plugin unavailable (e.g. dev on mac without args); stay on empty state
  }
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

</script>

<template>
  <main class="app">
    <Titlebar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
    <div class="body-row">
      <Sidebar
        v-if="sidebarOpen"
        ref="sidebar"
        :current-path="list.current.value?.path ?? null"
        :current-folder="currentFolder"
        @open-file="list.openFile"
        @file-deleted="list.removeItem"
        @file-renamed="list.renameItem"
      />
      <div class="stage">
        <Viewer
          v-if="list.current.value"
          ref="viewer"
          :item="list.current.value"
          :has-prev="list.currentIndex.value > 0"
          :has-next="list.currentIndex.value < list.items.value.length - 1"
          @delete-file="deleteCurrent"
          @clip-saved="onClipSaved"
          @navigate="applyApp({ type: $event === -1 ? 'prevFile' : 'nextFile' })"
        />
        <div v-else class="empty">
          <p v-if="list.error.value" class="error-text">{{ list.error.value }}</p>
          <p v-else class="empty-hint">No file open. Open one to begin.</p>
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
</style>
