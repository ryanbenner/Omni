<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useFileTree } from "../composables/useFileTree";
import type { Pin } from "../types";

const props = defineProps<{ currentPath: string | null; currentFolder: string | null }>();
const emit = defineEmits<{ openFile: [path: string] }>();

const tree = useFileTree((p) => emit("openFile", p));
tree.init().then(() => {
  if (props.currentPath) tree.reveal(props.currentPath);
});

watch(
  () => props.currentPath,
  (p) => {
    tree.setCurrent(p);
    if (p) tree.reveal(p);
  },
  { immediate: true },
);

const menu = ref<{ x: number; y: number; path: string; name: string } | null>(null);

function closeMenu() {
  menu.value = null;
}

watch(menu, (m) => {
  // window-level listener so clicking anywhere (stage included) dismisses
  if (m) window.addEventListener("pointerdown", closeMenu);
  else window.removeEventListener("pointerdown", closeMenu);
});

onUnmounted(() => window.removeEventListener("pointerdown", closeMenu));

function rowClick(row: { kind: string; path: string }) {
  if (row.kind === "file") emit("openFile", row.path);
  else tree.toggle(row.path);
}

function onRowContext(e: MouseEvent, row: { kind: string; path: string; name: string }) {
  if (row.kind === "file") return;
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY, path: row.path, name: row.name };
}

function togglePinFromMenu() {
  const m = menu.value;
  if (!m) return;
  if (tree.isPinned(m.path)) tree.removePin(m.path);
  else tree.addPin(m.path, m.name);
  menu.value = null;
}

function pinClick(pin: Pin) {
  tree.pinClick(pin);
}
</script>

<template>
  <aside class="sidebar">
    <div class="scroll">
      <template v-if="tree.pins.value.length">
        <div class="section-label">PINNED</div>
        <div
          v-for="p in tree.pins.value"
          :key="p.path"
          class="pin-row"
          @click="pinClick(p)"
        >
          <i class="ph ph-push-pin pin-icon" />
          <span class="row-name">{{ p.name }}</span>
          <span class="pin-count">{{ p.count }}</span>
        </div>
        <div class="section-divider" />
      </template>

      <div class="section-label">THIS PC</div>
      <div
        v-for="row in tree.rows.value"
        :key="row.path"
        class="tree-row"
        :class="{ selected: row.selected }"
        :title="row.name"
        @click="rowClick(row)"
        @contextmenu="onRowContext($event, row)"
      >
        <span v-for="g in row.guides" :key="g" class="guide" />
        <template v-if="row.kind !== 'file'">
          <i class="ph caret" :class="row.open ? 'ph-caret-down' : 'ph-caret-right'" />
          <i
            class="ph folder-icon"
            :class="
              row.kind === 'drive'
                ? 'ph-hard-drive'
                : row.open
                  ? 'ph-folder-open'
                  : 'ph-folder'
            "
          />
        </template>
        <template v-else>
          <span class="thumb-chip">
            <i
              class="ph"
              :class="row.mediaKind === 'video' ? 'ph-film-slate' : 'ph-image'"
              :style="{
                color:
                  row.mediaKind === 'video'
                    ? 'var(--color-accent-400)'
                    : 'var(--color-neutral-500)',
              }"
            />
          </span>
        </template>
        <span class="row-name" :class="{ rtl: row.kind === 'file' }">{{ row.label }}</span>
        <span v-if="row.selected" class="sel-bar" />
      </div>
    </div>

    <div class="footer">
      <i class="ph ph-hard-drives" />
      <span class="footer-path">{{ currentFolder ?? "No file open" }}</span>
    </div>

    <div
      v-if="menu"
      class="context-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @pointerdown.stop
    >
      <button class="menu-item" @click="togglePinFromMenu">
        {{ tree.isPinned(menu.path) ? "Unpin folder" : "Pin folder" }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 232px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-neutral-900);
  background: #1d1d1d;
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 8px 14px;
}
.section-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--color-neutral-600);
  padding: 6px 8px 4px;
}
.section-divider {
  height: 1px;
  margin: 10px 8px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-neutral-900) 20%,
    var(--color-neutral-900) 80%,
    transparent
  );
}
.pin-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 7px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--color-neutral-300);
}
.pin-row:hover {
  background: var(--color-neutral-900);
}
.pin-icon {
  font-size: 13px;
  color: var(--color-accent-400);
}
.pin-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-neutral-700);
  font-variant-numeric: tabular-nums;
}
.tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 4px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--color-neutral-300);
}
.tree-row:hover {
  background: var(--color-neutral-900);
}
.tree-row.selected {
  background: var(--color-accent-900);
  color: var(--color-accent-100);
}
.guide {
  width: 6px;
  height: 26px;
  flex: none;
  border-left: 1px solid var(--color-neutral-900);
}
.caret {
  font-size: 11px;
  width: 11px;
  flex: none;
  color: var(--color-neutral-600);
}
.folder-icon {
  font-size: 14px;
  flex: none;
  color: var(--color-accent-400);
}
.thumb-chip {
  width: 24px;
  height: 16px;
  flex: none;
  border-radius: 3px;
  background: #121212;
  border: 1px solid var(--color-neutral-900);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 10px;
}
.row-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.row-name.rtl {
  direction: rtl;
  text-align: left;
}
.sel-bar {
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 2px;
  border-radius: 2px;
  background: var(--color-accent);
}
.footer {
  flex: none;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-top: 1px solid var(--color-neutral-900);
  color: var(--color-neutral-600);
  font-size: 11.5px;
}
.footer i {
  font-size: 13px;
}
.footer-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.context-menu {
  position: fixed;
  z-index: 20;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  border-radius: 4px;
  padding: 2px;
  box-shadow: 0 4px 12px #0008;
}
.menu-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.35rem 1rem;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
}
.menu-item:hover {
  background: var(--color-accent-900);
}
</style>
