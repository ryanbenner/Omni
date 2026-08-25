<script setup lang="ts">
import { ref } from "vue";
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
</script>

<template>
  <main class="app">
    <Sidebar
      v-if="sidebarOpen && list.items.value.length"
      :items="list.items.value"
      :current-index="list.currentIndex.value"
      @select="list.jumpTo"
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
      <div v-else class="empty">
        <p v-if="list.error.value" class="error-text">{{ list.error.value }}</p>
        <p v-else class="empty-hint">
          No file loaded. Open a video or image with Media Viewer
          (right-click a file, then "Open with").
        </p>
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
</style>
