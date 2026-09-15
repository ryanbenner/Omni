<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useFileTree } from "../composables/useFileTree";
import { parentDir } from "../composables/pathUtils";
import { filePreview } from "../composables/dragPreview";
import type { Pin } from "../types";

const props = defineProps<{ currentPath: string | null; currentFolder: string | null }>();
const emit = defineEmits<{
  openFile: [path: string];
  fileDeleted: [path: string];
  fileRenamed: [oldPath: string, newPath: string, newName: string];
}>();

const tree = useFileTree((p) => emit("openFile", p));
tree.init().then(() => {
  if (props.currentPath) tree.reveal(props.currentPath);
});

const root = ref<HTMLElement | null>(null);

watch(
  () => props.currentPath,
  async (p) => {
    tree.setCurrent(p);
    if (p) {
      await tree.reveal(p);
      await nextTick();
      root.value?.querySelector(".tree-row.selected")?.scrollIntoView({ block: "nearest" });
    }
  },
  { immediate: true },
);

const menu = ref<{
  x: number;
  y: number;
  path: string;
  name: string;
  kind: string;
} | null>(null);

function closeMenu() {
  menu.value = null;
}

watch(menu, (m) => {
  // window-level listener so clicking anywhere (stage included) dismisses
  if (m) window.addEventListener("pointerdown", closeMenu);
  else window.removeEventListener("pointerdown", closeMenu);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", closeMenu);
  endPinDrag();
  endFileDrag();
});

async function rowClick(row: { kind: string; path: string }) {
  if (row.kind === "file") {
    // the click that ends a drag-out must not open the file
    if (fileDragged) {
      fileDragged = false;
      return;
    }
    emit("openFile", row.path);
    return;
  }
  // in a pin-scoped view the drive row is the way back to the full tree
  if (row.kind === "drive" && tree.scope.value) {
    tree.clearScope();
    if (props.currentPath) {
      await tree.reveal(props.currentPath);
      await nextTick();
      root.value?.querySelector(".tree-row.selected")?.scrollIntoView({ block: "nearest" });
    }
    return;
  }
  tree.toggle(row.path);
}

function onRowContext(e: MouseEvent, row: { kind: string; path: string; name: string }) {
  if (row.kind === "drive") return;
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY, path: row.path, name: row.name, kind: row.kind };
}

function togglePinFromMenu() {
  const m = menu.value;
  if (!m) return;
  if (tree.isPinned(m.path)) tree.removePin(m.path);
  else tree.addPin(m.path, m.name);
  menu.value = null;
}

const DRAG_THRESHOLD = 4;

// hold-and-drag on a file row hands it to the os as a native drag so it can
// be dropped into other apps (discord, explorer...). html5 dragstart is not
// an option: tauri's own drag-drop handling swallows it on windows
let fileDrag: { path: string; name: string; startX: number; startY: number } | null = null;
let fileDragged = false;

function onFileDown(e: PointerEvent, row: { path: string; name: string }) {
  if (e.button !== 0) return;
  fileDrag = { path: row.path, name: row.name, startX: e.clientX, startY: e.clientY };
  fileDragged = false;
  window.addEventListener("pointermove", onFileMove);
  window.addEventListener("pointerup", endFileDrag);
  window.addEventListener("pointercancel", endFileDrag);
}

function onFileMove(e: PointerEvent) {
  const d = fileDrag;
  if (!d) return;
  const moved = Math.max(Math.abs(e.clientX - d.startX), Math.abs(e.clientY - d.startY));
  if (moved < DRAG_THRESHOLD) return;
  // the os owns the pointer from here; no further move/up events arrive
  endFileDrag();
  fileDragged = true;
  startDrag({ item: [d.path], icon: filePreview(d.name) }).catch(() => {
    fileDragged = false;
  });
}

function endFileDrag() {
  fileDrag = null;
  window.removeEventListener("pointermove", onFileMove);
  window.removeEventListener("pointerup", endFileDrag);
  window.removeEventListener("pointercancel", endFileDrag);
}

// hold-and-drag reorders pins; the drop bar renders at slot `to`
const drag = ref<{ from: number; to: number; startY: number; active: boolean } | null>(null);
let dragMoved = false;

function pinClick(pin: Pin) {
  // the click that ends a drag must not open the pin
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  tree.pinClick(pin);
}

function slotAt(y: number): number {
  const rows = root.value?.querySelectorAll<HTMLElement>(".pin-row") ?? [];
  let slot = rows.length;
  rows.forEach((row, i) => {
    const r = row.getBoundingClientRect();
    if (slot === rows.length && y < r.top + r.height / 2) slot = i;
  });
  return slot;
}

function onPinDown(e: PointerEvent, index: number) {
  if (e.button !== 0) return;
  drag.value = { from: index, to: index, startY: e.clientY, active: false };
  dragMoved = false;
  window.addEventListener("pointermove", onPinMove);
  window.addEventListener("pointerup", onPinUp);
  window.addEventListener("pointercancel", endPinDrag);
}

function onPinMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  if (!d.active && Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
  d.active = true;
  dragMoved = true;
  d.to = slotAt(e.clientY);
}

function onPinUp(e: PointerEvent) {
  const d = drag.value;
  if (d?.active) tree.movePin(d.from, slotAt(e.clientY));
  endPinDrag();
}

function endPinDrag() {
  drag.value = null;
  window.removeEventListener("pointermove", onPinMove);
  window.removeEventListener("pointerup", onPinUp);
  window.removeEventListener("pointercancel", endPinDrag);
}

const renaming = ref<{ path: string; name: string; draft: string } | null>(null);

function startRename() {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  renaming.value = { path: m.path, name: m.name, draft: m.name };
  nextTick(() => {
    const input = root.value?.querySelector<HTMLInputElement>(".rename-input");
    input?.focus();
    // preselect the stem so typing replaces the name but keeps the extension
    const dot = (renaming.value?.draft ?? "").lastIndexOf(".");
    input?.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  });
}

function cancelRename() {
  renaming.value = null;
}

async function commitRename() {
  const r = renaming.value;
  renaming.value = null;
  if (!r) return;
  const newName = r.draft.trim();
  if (!newName || newName === r.name) return;
  try {
    const newPath = await invoke<string>("rename_file", { path: r.path, newName });
    await tree.refresh(parentDir(r.path));
    emit("fileRenamed", r.path, newPath, newName);
  } catch (e) {
    await message(String(e), { title: "Rename failed", kind: "error" });
  }
}

// the app calls this after deleting the open file from the player controls
function refreshDir(dirPath: string) {
  tree.refresh(dirPath);
}
defineExpose({ refreshDir });

async function copyToClipboard() {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  try {
    await invoke("copy_file_to_clipboard", { path: m.path });
  } catch (e) {
    await message(String(e), { title: "Copy failed", kind: "error" });
  }
}

async function deleteFromMenu() {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  const yes = await ask(`Delete ${m.name}? It will be moved to the Recycle Bin.`, {
    title: "Delete file",
    kind: "warning",
  });
  if (!yes) return;
  try {
    await invoke("delete_file", { path: m.path });
    await tree.refresh(parentDir(m.path));
    emit("fileDeleted", m.path);
  } catch (e) {
    await message(String(e), { title: "Delete failed", kind: "error" });
  }
}
</script>

<template>
  <aside class="sidebar" ref="root">
    <div class="scroll">
      <template v-if="tree.pins.value.length">
        <div class="section-label">PINNED</div>
        <template v-for="(p, i) in tree.pins.value" :key="p.path">
          <div v-if="drag?.active && drag.to === i" class="drop-bar" />
          <div
            class="pin-row"
            :class="{ dragging: drag?.active && drag.from === i }"
            @pointerdown="onPinDown($event, i)"
            @click="pinClick(p)"
          >
            <i class="ph ph-push-pin pin-icon" />
            <span class="row-name">{{ p.name }}</span>
            <span class="pin-count">{{ p.count }}</span>
          </div>
        </template>
        <div v-if="drag?.active && drag.to === tree.pins.value.length" class="drop-bar" />
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
        @pointerdown="row.kind === 'file' && onFileDown($event, row)"
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
        <input
          v-if="renaming && renaming.path === row.path"
          v-model="renaming.draft"
          class="rename-input"
          spellcheck="false"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
          @blur="cancelRename"
          @click.stop
          @pointerdown.stop
        />
        <span v-else class="row-name" :class="{ rtl: row.kind === 'file' }">{{
          row.label
        }}</span>
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
      <template v-if="menu.kind === 'folder'">
        <button class="menu-item" @click="togglePinFromMenu">
          <i class="ph ph-push-pin" />
          {{ tree.isPinned(menu.path) ? "Unpin folder" : "Pin folder" }}
        </button>
      </template>
      <template v-else>
        <button class="menu-item" @click="copyToClipboard">
          <i class="ph ph-copy" />
          Copy to clipboard
        </button>
        <button class="menu-item" @click="startRename">
          <i class="ph ph-pencil-simple" />
          Rename
        </button>
        <button class="menu-item" @click="deleteFromMenu">
          <i class="ph ph-trash" />
          Delete
        </button>
      </template>
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
  background: #121315;
  /* rapid clicks on rows must not select text */
  user-select: none;
}
.rename-input {
  user-select: text;
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 8px 14px;
}
.section-label {
  font-size: 11px;
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
.pin-row.dragging {
  opacity: 0.4;
}
/* zero net height so rows do not shift while the bar is shown */
.drop-bar {
  height: 2px;
  margin: -1px 8px;
  border-radius: 1px;
  background: var(--color-accent);
  position: relative;
  z-index: 1;
  pointer-events: none;
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
  background: #101113;
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
  font-size: 13px;
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
  font-size: 12px;
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
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.35rem 1rem 0.35rem 0.7rem;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
  font-size: 13px;
}
.menu-item i {
  font-size: 13px;
  color: var(--color-neutral-400);
}
.menu-item:hover {
  background: var(--color-accent-900);
}
.rename-input {
  min-width: 0;
  flex: 1;
  height: 20px;
  padding: 0 4px;
  font: inherit;
  font-size: 13px;
  color: var(--color-text);
  background: #101113;
  border: 1px solid var(--color-accent-700);
  border-radius: 3px;
  outline: none;
}
</style>
