<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getMatches } from "@tauri-apps/plugin-cli";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import Viewer from "./components/Viewer.vue";
import Sidebar from "./components/Sidebar.vue";
import { useMediaList } from "./composables/useMediaList";
import { useKeyboard } from "./composables/useKeyboard";
import type { Command } from "./composables/keymap";

const list = useMediaList();
const viewer = ref<InstanceType<typeof Viewer> | null>(null);
const sidebarOpen = ref(true);

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

function navClick(dir: -1 | 1, e: MouseEvent) {
  if (dir === -1) list.prev();
  else list.next();
  // drop focus so space keeps controlling the video, not this button
  (e.currentTarget as HTMLElement).blur();
}
</script>

<template>
  <main class="app">
    <Sidebar
      v-if="sidebarOpen"
      :current-path="list.current.value?.path ?? null"
      @open-file="list.openFile"
    />
    <div class="stage">
      <button
        v-if="list.items.value.length"
        class="sidebar-toggle"
        :title="sidebarOpen ? 'Hide file list' : 'Show file list'"
        @click="sidebarOpen = !sidebarOpen"
      >
        {{ sidebarOpen ? "«" : "»" }}
      </button>
      <Viewer v-if="list.current.value" ref="viewer" :item="list.current.value" />
      <template v-if="list.items.value.length > 1">
        <button
          class="nav-arrow nav-prev"
          :disabled="list.currentIndex.value === 0"
          title="Previous file"
          @click="navClick(-1, $event)"
        >
          &lt;
        </button>
        <button
          class="nav-arrow nav-next"
          :disabled="list.currentIndex.value === list.items.value.length - 1"
          title="Next file"
          @click="navClick(1, $event)"
        >
          &gt;
        </button>
      </template>
      <div v-else class="empty">
        <p v-if="list.error.value" class="error-text">{{ list.error.value }}</p>
        <p v-else class="empty-hint">
          No file loaded. Open a video or image with Media Viewer
          (right-click a file, then "Open with").
        </p>
        <button class="ctl settings-btn" @click="openDefaultApps">
          Set as default in Windows Settings
        </button>
      </div>
    </div>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
}
body {
  margin: 0;
  background: #111;
  color: #ddd;
  font-family: system-ui, sans-serif;
  overflow: hidden;
}
.app {
  display: flex;
  height: 100vh;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
}
.sidebar-toggle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: #222a;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 4px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}
.empty-hint {
  color: #777;
  max-width: 48ch;
}
.error-text {
  color: #d66;
}
.settings-btn {
  margin-top: 1rem;
  background: #222;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 40px;
  height: 64px;
  background: #0006;
  color: #ddd;
  border: none;
  border-radius: 6px;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.15s;
}
.nav-arrow:hover {
  opacity: 0.9;
}
.nav-arrow:disabled {
  opacity: 0.1;
  cursor: default;
}
.nav-prev {
  left: 10px;
}
.nav-next {
  right: 10px;
}
</style>
