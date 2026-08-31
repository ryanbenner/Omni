<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";

defineProps<{ sidebarOpen: boolean }>();
defineEmits<{ toggleSidebar: [] }>();

const win = getCurrentWindow();
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <button
      class="tb-sidebar"
      :title="sidebarOpen ? 'Hide file tree' : 'Show file tree'"
      @click="$emit('toggleSidebar')"
    >
      <i class="ph ph-sidebar-simple" />
    </button>
    <div class="tb-brand" data-tauri-drag-region>
      <span class="tb-logo-prism" data-tauri-drag-region />
      <span class="tb-name" data-tauri-drag-region>Omni</span>
    </div>
    <div class="tb-spacer" data-tauri-drag-region />
    <div class="tb-controls">
      <button class="tb-btn tb-min" title="Minimize" @click="win.minimize()">
        <i class="ph ph-minus" />
      </button>
      <button class="tb-btn tb-max" title="Maximize" @click="win.toggleMaximize()">
        <i class="ph ph-square" />
      </button>
      <button class="tb-btn tb-close" title="Close" @click="win.close()">
        <i class="ph ph-x" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding-left: 6px;
  border-bottom: 1px solid var(--color-neutral-900);
  background: #131416;
  user-select: none;
}
.tb-sidebar {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 15px;
}
.tb-sidebar:hover {
  background: var(--color-neutral-900);
  color: var(--color-accent-300);
}
.tb-brand {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tb-logo-prism {
  /* tiny gem matching the crystal app icon: rotated square, lit corner */
  width: 9px;
  height: 9px;
  border-radius: 2px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #f2d4fa 0%, var(--color-accent) 55%, var(--color-accent-700) 100%);
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--color-accent) 60%, transparent));
}
.tb-name {
  font-size: 12px;
  letter-spacing: 0.03em;
  color: var(--color-neutral-500);
}
.tb-spacer {
  flex: 1;
  align-self: stretch;
}
.tb-controls {
  display: flex;
  align-items: stretch;
  height: 28px;
}
.tb-btn {
  width: 40px;
  display: grid;
  place-items: center;
  border: none;
  background: none;
  color: var(--color-neutral-600);
  cursor: pointer;
  font-size: 13px;
}
.tb-max i {
  font-size: 11px;
}
.tb-btn:hover {
  background: var(--color-neutral-900);
  color: var(--color-text);
}
.tb-close:hover {
  background: #7a2b3a;
  color: var(--color-neutral-100);
}
</style>
