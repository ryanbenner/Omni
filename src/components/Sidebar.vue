<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useFileTree, type TreeRow } from "../composables/useFileTree";
import { settings } from "../composables/settings";
import { onEscape } from "../composables/dialogStack";
import { parentDir } from "../composables/pathUtils";
import { extOf } from "../composables/useImageSave";
import { filePreview, videoThumbnail } from "../composables/dragPreview";
import type { MediaKind, Pin } from "../types";

const props = defineProps<{
  currentPath: string | null;
  currentFolder: string | null;
  revealFolder?: string | null;
}>();
const emit = defineEmits<{
  openFile: [path: string];
  fileDeleted: [path: string];
  fileRenamed: [oldPath: string, newPath: string, newName: string];
  addToCollage: [path: string];
  folderRevealed: [];
}>();

const tree = useFileTree((p) => emit("openFile", p));
tree.init().then(() => {
  if (props.currentPath) tree.reveal(props.currentPath);
});

const root = ref<HTMLElement | null>(null);

// a tree that appears with a file already open (launch, or shown mid-session)
// lands that file in the middle; any file opened afterwards moves the tree the
// minimum, which is not at all when its row is already in view
let initial = true;

watch(
  () => props.currentPath,
  async (p) => {
    const block = initial ? "center" : "nearest";
    initial = false;
    tree.setCurrent(p);
    if (p) {
      await tree.reveal(p);
      await nextTick();
      root.value?.querySelector(".tree-row.selected")?.scrollIntoView({ block });
    }
  },
  { immediate: true },
);

// a folder to show with nothing open (reopen at launch); immediate so a
// sidebar mounted later in the session still honors a pending folder
watch(
  () => props.revealFolder,
  async (dir) => {
    if (!dir) return;
    await tree.revealDir(dir);
    await nextTick();
    // the folder at the top, so its files read down from it
    const i = tree.rows.value.findIndex((r) => r.path === dir);
    if (i >= 0) root.value?.querySelectorAll(".tree-row")[i]?.scrollIntoView({ block: "start" });
    emit("folderRevealed");
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

// the wall decodes through the browser, which cannot read heic on windows
const COLLAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
function canCollage(name: string): boolean {
  return COLLAGE_EXTS.includes(extOf(name));
}

function collageFromMenu() {
  const m = menu.value;
  if (!m) return;
  emit("addToCollage", m.path);
  menu.value = null;
}

watch(menu, (m) => {
  // window-level listener so clicking anywhere (stage included) dismisses
  if (m) window.addEventListener("pointerdown", closeMenu);
  else window.removeEventListener("pointerdown", closeMenu);
});

// catches what the fs watcher misses (network volumes, sleep)
const onFocus = () => tree.resync();
onMounted(() => window.addEventListener("focus", onFocus));

onUnmounted(() => {
  window.removeEventListener("pointerdown", closeMenu);
  window.removeEventListener("focus", onFocus);
  endPinDrag();
  closeConfirm();
});

const ROW_H = 26;
function scroller(): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>(".scroll") ?? null;
}

// the open folders enclosing the first row visible in the tree, drive first:
// shown as one breadcrumb row above the tree once they have scrolled out of
// view. the row takes its own space above the tree so the row at the top
// edge is never covered and the chain never flips
const stack = ref<TreeRow[]>([]);
// middle segments hidden behind an ellipsis so the drive and the innermost
// folder always fit on the one row
const hiddenMid = ref(0);
const crumbs = ref<HTMLElement | null>(null);
async function fitCrumbs() {
  hiddenMid.value = 0;
  await nextTick();
  const el = crumbs.value;
  // middle folders fold first; only then does the last name get cut short
  const tight = () => {
    const last = el?.querySelector<HTMLElement>(".crumb.last");
    return !!el && (el.scrollWidth > el.clientWidth || (!!last && last.scrollWidth > last.clientWidth));
  };
  while (tight() && hiddenMid.value < stack.value.length - 2) {
    hiddenMid.value++;
    await nextTick();
  }
}
const shown = computed(() => {
  const s = stack.value;
  const n = hiddenMid.value;
  if (!n) return s.map((row) => ({ row, more: false }));
  // the drive, then an ellipsis standing for the next n folders, then the rest
  return [{ row: s[0], more: false }, { row: s[1 + n], more: true }, ...s.slice(2 + n).map((row) => ({ row, more: false }))];
});
function chainAbove(i: number, includeSelf: boolean): TreeRow[] {
  const rows = tree.rows.value;
  const out: TreeRow[] = [];
  const self = rows[i];
  if (!self) return out;
  let need = self.depth - 1;
  if (includeSelf && self.kind !== "file" && self.open) out.push(self);
  for (let j = i - 1; j >= 0 && need >= 0; j--) {
    const r = rows[j];
    if (r.kind !== "file" && r.depth === need) {
      out.unshift(r);
      need--;
    }
  }
  return out;
}
function updateStack() {
  const el = scroller();
  const first = el?.querySelector<HTMLElement>(".tree-row");
  let next: TreeRow[] = [];
  if (el && first) {
    // rows are a fixed height, so the row at the top edge is arithmetic
    const start = first.getBoundingClientRect().top - el.getBoundingClientRect().top;
    const hidden = Math.max(0, -start);
    const i = Math.min(Math.floor(hidden / ROW_H), tree.rows.value.length - 1);
    next = chainAbove(i, hidden > i * ROW_H);
  }
  if (next.map((r) => r.path).join("\0") !== stack.value.map((r) => r.path).join("\0")) {
    stack.value = next;
    fitCrumbs();
  }
}
watch(tree.rows, () => nextTick(updateStack));

// a notch that would carry an open folder's first row past the top edge stops
// with that row flush under the stack; the notch after a catch always runs free
let caught = false;
function onTreeWheel(e: WheelEvent) {
  const el = scroller();
  const first = el?.querySelector<HTMLElement>(".tree-row");
  if (!el || !first || !e.deltaY || e.ctrlKey) return;
  if (caught) {
    caught = false;
    return;
  }
  const from = el.scrollTop;
  const to = from + e.deltaY;
  const base = first.getBoundingClientRect().top - el.getBoundingClientRect().top + from;
  const rows = tree.rows.value;
  // scroll offsets that put each open folder's first row at the edge, top down
  const catches = rows.flatMap((r, i) =>
    r.kind !== "file" && rows[i + 1]?.depth > r.depth ? [base + (i + 1) * ROW_H] : [],
  );
  // the 1 px slack keeps a fractional scrollTop from catching on the row it sits on
  const at =
    e.deltaY > 0
      ? catches.find((c) => c > from + 1 && c < to)
      : catches.reverse().find((c) => c < from - 1 && c > to);
  if (at === undefined) return;
  e.preventDefault();
  el.scrollTop = at;
  caught = true;
}

// puts a row's top edge `y` px below the top of the tree
function scrollRowTo(path: string, y: number) {
  const i = tree.rows.value.findIndex((r) => r.path === path);
  const el = scroller();
  const rowEl = el?.querySelectorAll<HTMLElement>(".tree-row")[i];
  if (i < 0 || !el || !rowEl) return;
  el.scrollBy(0, rowEl.getBoundingClientRect().top - el.getBoundingClientRect().top - y);
}

// closing a folder from the stack leaves it as the first row under the rest
async function stackClick(row: TreeRow) {
  await tree.toggle(row.path);
  await nextTick();
  scrollRowTo(row.path, 0);
}

// the pin list stays open until its caret folds it
const pinsOpen = ref(true);

async function rowClick(row: TreeRow) {
  if (row.kind === "file") {
    // the click that ends a drag-out must not open the file
    if (fileDragged) {
      fileDragged = false;
      return;
    }
    emit("openFile", row.path);
    return;
  }
  await tree.toggle(row.path);
}

function onRowContext(e: MouseEvent, row: { kind: string; path: string; name: string }) {
  if (row.kind === "drive") return;
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY, path: row.path, name: row.name, kind: row.kind };
}

function onPinContext(e: MouseEvent, pin: Pin) {
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY, path: pin.path, name: pin.name, kind: "folder" };
}

function togglePinFromMenu() {
  const m = menu.value;
  if (!m) return;
  if (tree.isPinned(m.path)) tree.removePin(m.path);
  else {
    tree.addPin(m.path, m.name);
    // the new pin lands at the end: bring it into view
    nextTick(() => {
      const list = pinsList.value;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }
  menu.value = null;
}

// file rows are draggable so the browser fires dragstart once the held
// pointer moves; the handler cancels the browser's own drag and hands the
// file to the os as a native drag (the plugin's documented pattern, and the
// only trigger that works in webview2). starting from raw pointer events
// does nothing on windows
interface FileRow {
  path: string;
  name: string;
  mediaKind?: MediaKind;
  mtime?: number;
  size?: number;
}
let fileDragged = false;
const thumbCache = new Map<string, string>();
const thumbInFlight = new Set<string>();

// a replace rewrites the file at the same path, so the frame is cached per
// version and the url carries it too, keeping webview's media cache out of it
function thumbUrl(row: FileRow) {
  return `${convertFileSrc(row.path)}?v=${row.mtime}-${row.size}`;
}

// video rows drag with a frame thumbnail, decoded ahead of time on hover or
// press. dragstart must not wait for it: the os drag has to begin while the
// pointer is still here, or the app under the cursor only notices the drop
// once the mouse moves again
function warmThumbnail(row: FileRow) {
  if (row.mediaKind !== "video") return;
  const url = thumbUrl(row);
  if (thumbCache.has(url) || thumbInFlight.has(url)) return;
  thumbInFlight.add(url);
  videoThumbnail(url)
    .then((t) => thumbCache.set(url, t))
    .catch(() => {
      // unreadable now: the pill is used and a later hover tries again
    })
    .finally(() => thumbInFlight.delete(url));
}

function onFileDown(e: PointerEvent, row: FileRow) {
  if (e.button !== 0) return;
  warmThumbnail(row);
  fileDragged = false;
}

async function onFileDragStart(e: Event, row: FileRow) {
  // must come first: with the browser drag cancelled the pointer is free for
  // the os drag session
  e.preventDefault();
  const icon = thumbCache.get(thumbUrl(row)) ?? filePreview(row.name);
  fileDragged = true;
  try {
    // copy: the destination gets a copy and the source file stays put
    await startDrag({ item: [row.path], icon, mode: "copy" });
  } catch (err) {
    await message(String(err), { title: "Drag failed", kind: "error" });
  } finally {
    // the drag has ended (dropped or cancelled); swallow only the click, if
    // any, that the same button release produces, then arm clicks again
    setTimeout(() => {
      fileDragged = false;
    }, 300);
  }
}

// hold-and-drag reorders pins; the drop bar renders at slot `to` and a ghost
// pill with the pin's name follows the pointer at (x, y)
const DRAG_THRESHOLD = 4;
const drag = ref<{
  from: number;
  to: number;
  startY: number;
  active: boolean;
  x: number;
  y: number;
} | null>(null);
let dragMoved = false;

// a slot directly above or below the held row would not move it
function isMove(d: { from: number; to: number }) {
  return d.to !== d.from && d.to !== d.from + 1;
}

async function pinClick(pin: Pin) {
  // the click that ends a drag must not open the pin
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  if (!(await tree.pinClick(pin))) return;
  await nextTick();
  // the pin's row scrolls just out of view so it heads the breadcrumb with
  // its contents right under
  scrollRowTo(pin.path, -ROW_H);
  if (settings.general.openPinFirst) {
    const first = firstFileIn(pin.path);
    if (first) emit("openFile", first);
  }
}

// the first file row directly inside a folder, in the tree's order
function firstFileIn(dir: string): string | null {
  const rows = tree.rows.value;
  const i = rows.findIndex((r) => r.path === dir);
  if (i < 0) return null;
  const depth = rows[i].depth;
  for (let j = i + 1; j < rows.length && rows[j].depth > depth; j++) {
    if (rows[j].kind === "file" && rows[j].depth === depth + 1) return rows[j].path;
  }
  return null;
}

const pinsList = ref<HTMLElement | null>(null);

// dragging near the top or bottom of the pin list scrolls it, so a pin can
// be moved past what is visible
const EDGE = 18;
const SCROLL_STEP = 4;
let autoScroll = 0;
function autoScrollTick() {
  const d = drag.value;
  const list = pinsList.value;
  if (!d || !list) {
    autoScroll = 0;
    return;
  }
  const r = list.getBoundingClientRect();
  const dir = d.y < r.top + EDGE ? -1 : d.y > r.bottom - EDGE ? 1 : 0;
  if (dir) list.scrollTop += dir * SCROLL_STEP;
  autoScroll = dir ? requestAnimationFrame(autoScrollTick) : 0;
}
// the list moved under a held pin: the drop slot follows the pointer
function onPinsScroll() {
  const d = drag.value;
  if (d?.active) d.to = slotAt(d.y);
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
  drag.value = {
    from: index,
    to: index,
    startY: e.clientY,
    active: false,
    x: e.clientX,
    y: e.clientY,
  };
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
  d.x = e.clientX;
  d.y = e.clientY;
  if (!autoScroll) autoScroll = requestAnimationFrame(autoScrollTick);
}

function onPinUp(e: PointerEvent) {
  const d = drag.value;
  if (d?.active) tree.movePin(d.from, slotAt(e.clientY));
  endPinDrag();
}

function endPinDrag() {
  drag.value = null;
  cancelAnimationFrame(autoScroll);
  autoScroll = 0;
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
// re-reads every expanded folder and pin, e.g. when the hidden-files setting flips
function reloadOpen() {
  tree.resync();
}
defineExpose({ refreshDir, reloadOpen });

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

// delete asks in a pill where the menu was; a press anywhere else or escape
// closes it with nothing done
const confirm = ref<{ path: string; left: number; top: number } | null>(null);
let offConfirmEscape: (() => void) | null = null;
function closeConfirm() {
  confirm.value = null;
  window.removeEventListener("pointerdown", closeConfirm);
  offConfirmEscape?.();
  offConfirmEscape = null;
}

function deleteFromMenu() {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  if (!settings.general.confirmDelete) {
    deleteFile(m.path);
    return;
  }
  confirm.value = { path: m.path, left: m.x, top: m.y };
  window.addEventListener("pointerdown", closeConfirm);
  offConfirmEscape = onEscape(closeConfirm);
}

function confirmDelete() {
  const path = confirm.value?.path;
  closeConfirm();
  if (path) deleteFile(path);
}

async function deleteFile(path: string) {
  try {
    await invoke("delete_file", { path });
    await tree.refresh(parentDir(path));
    emit("fileDeleted", path);
  } catch (e) {
    await message(String(e), { title: "Delete failed", kind: "error" });
  }
}
</script>

<template>
  <aside class="sidebar" ref="root">
    <div v-if="tree.pins.value.length" class="pins" :class="{ open: pinsOpen }">
      <div class="pins-head" :class="pinsOpen ? 'open' : 'closed'" @click="pinsOpen = !pinsOpen">
        <i class="ph caret" :class="pinsOpen ? 'ph-caret-down' : 'ph-caret-right'" />
        <i v-if="!pinsOpen" class="ph ph-push-pin pin-icon" />
        <span class="row-name">{{ pinsOpen ? "PINNED" : "Pinned" }}</span>
      </div>
      <div v-if="pinsOpen" ref="pinsList" class="pins-list" @scroll.passive="onPinsScroll">
        <template v-for="(p, i) in tree.pins.value" :key="p.path">
          <div v-if="drag?.active && drag.to === i && isMove(drag)" class="drop-bar" />
          <div
            class="pin-row"
            :class="{ dragging: drag?.active && drag.from === i }"
            @pointerdown="onPinDown($event, i)"
            @click="pinClick(p)"
            @contextmenu="onPinContext($event, p)"
          >
            <i class="ph ph-push-pin pin-icon" />
            <span class="row-name">{{ p.name }}</span>
            <span class="pin-count">{{ p.count }}</span>
          </div>
        </template>
        <div
          v-if="drag?.active && drag.to === tree.pins.value.length && isMove(drag)"
          class="drop-bar"
        />
      </div>
    </div>
    <div v-if="stack.length" ref="crumbs" class="crumbs">
      <template v-for="(c, i) in shown" :key="c.row.path">
        <span v-if="i" class="crumb-sep">›</span>
        <span v-if="c.more" class="crumb-more">…</span>
        <span v-if="c.more" class="crumb-sep">›</span>
        <button
          class="crumb"
          :class="{ last: i === shown.length - 1 }"
          :title="c.row.name"
          @click="stackClick(c.row)"
          @contextmenu="onRowContext($event, c.row)"
        >
          {{ c.row.name }}
        </button>
      </template>
    </div>
    <div class="scroll" @scroll.passive="updateStack" @wheel="onTreeWheel">
      <div class="section-label">THIS PC</div>
      <div
        v-for="row in tree.rows.value"
        :key="row.path"
        class="tree-row"
        :class="{ selected: row.selected }"
        :title="row.name"
        @click="rowClick(row)"
        @contextmenu="onRowContext($event, row)"
        :draggable="row.kind === 'file' && renaming?.path !== row.path"
        @pointerenter="row.kind === 'file' && warmThumbnail(row)"
        @pointerdown="row.kind === 'file' && onFileDown($event, row)"
        @dragstart="row.kind === 'file' && onFileDragStart($event, row)"
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
              :class="
                row.mediaKind === 'video'
                  ? 'ph-film-slate'
                  : row.mediaKind === 'collage'
                    ? 'ph-images'
                    : row.mediaKind === 'pdf'
                      ? 'ph-file-pdf'
                      : 'ph-image'
              "
              :style="{
                color:
                  row.mediaKind === 'video'
                    ? 'var(--color-accent-400)'
                    : row.mediaKind === 'collage'
                      ? 'var(--color-accent-300)'
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
        <button v-if="canCollage(menu.name)" class="menu-item" @click="collageFromMenu">
          <i class="ph ph-images" />
          Collage
        </button>
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
    <div
      v-if="confirm"
      class="confirm-pop tree-confirm"
      :style="{ left: confirm.left + 'px', top: confirm.top + 'px' }"
      @pointerdown.stop
    >
      <span class="confirm-text">Are you sure?</span>
      <button class="btn-yes" @click="confirmDelete">Yes</button>
      <button class="btn-no" @click="closeConfirm">No</button>
    </div>
    <div
      v-if="drag?.active"
      class="drag-ghost"
      :style="{ transform: `translate(${drag.x}px, ${drag.y}px)` }"
    >
      {{ tree.pins.value[drag.from]?.name }}
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
  /* no top padding: chromium insets sticky rows by it, and the held rows
     must sit flush under the titlebar */
  padding: 0 8px 14px;
}
.scroll > :first-child {
  margin-top: 8px;
}
.section-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--color-neutral-600);
  padding: 6px 8px 4px;
}
/* pins sit above the tree; the open list ends in a line, the folded row does not */
.pins {
  flex: none;
}
.pins.open {
  border-bottom: 1px solid var(--color-neutral-900);
}
/* with the pin list open, the tree's heading stays put above the stack */
.pins-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.pins-head.open {
  padding: 14px 16px 4px 14px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--color-neutral-600);
}
.pins-head.open .caret {
  color: inherit;
  width: auto;
}
.pins-head.closed {
  height: 26px;
  padding: 0 6px 0 12px;
  font-size: 13px;
  color: var(--color-neutral-300);
}
.pins-head.closed:hover {
  background: var(--color-neutral-900);
}
/* six pins show; the rest scroll inside the list without moving the tree */
.pins-list {
  max-height: calc(6 * 26px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 8px;
}
/* open folders enclosing the top of the view, drive first, on one row */
.crumbs {
  flex: none;
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 8px 0 12px;
  overflow: hidden;
  white-space: nowrap;
  font-size: 13px;
  border-bottom: 1px solid var(--color-neutral-900);
}
.crumb {
  flex: none;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: none;
  font: inherit;
  color: var(--color-neutral-500);
  cursor: pointer;
}
.crumb.last {
  /* the only segment allowed to give way: it shortens with an ellipsis */
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-neutral-200);
}
.crumb:hover {
  background: var(--color-neutral-900);
  color: var(--color-neutral-200);
}
.crumb-sep,
.crumb-more {
  flex: none;
  padding: 0 1px;
  color: var(--color-neutral-700);
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
  box-shadow: 0 0 6px var(--color-accent-700);
  position: relative;
  z-index: 1;
  pointer-events: none;
}
.drag-ghost {
  position: fixed;
  top: 0;
  left: 0;
  /* sit just below and right of the pointer so the cursor never covers it */
  margin: 12px 0 0 14px;
  z-index: 100;
  max-width: 180px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-accent-900);
  border: 1px solid var(--color-accent-700);
  color: var(--color-accent-100);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  user-select: none;
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
.tree-confirm {
  position: fixed;
  z-index: 20;
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
