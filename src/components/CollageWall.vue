<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { CollageDoc, CollageItem as Item, ExportFormat, Rect, ViewerAction } from "../types";
import { useCollage } from "../composables/useCollage";
import { useWallView, ZOOM_STEP } from "../composables/useWallView";
import { useDecodeBudget } from "../composables/useDecodeBudget";
import { loadImageMeta, readBitmap } from "../composables/collageImages";
import { resizeRect, rectsOverlap, type Handle } from "../composables/collageGeometry";
import { validateArea } from "../composables/collageExport";
import { writeCollage, COLLAGE_EXT } from "../composables/collageFile";
import { joinPath, parentDir } from "../composables/pathUtils";
import CollageItem from "./CollageItem.vue";
import CollageTabs from "./CollageTabs.vue";
import ExportPreview from "./ExportPreview.vue";
import UnsavedDialog from "./UnsavedDialog.vue";

const props = defineProps<{ init: { doc: CollageDoc; path: string | null; seedPaths?: string[] } }>();
const emit = defineEmits<{
  exit: [lastPath: string | null];
  status: [text: string];
  selected: [path: string | null];
  reveal: [path: string];
}>();

const LAST_COLLAGE_KEY = "mv-last-collage";
const CLICK_SLOP = 4;

const collage = useCollage();
const view = useWallView();
const budget = useDecodeBudget((path, level, natural) => readBitmap(path, level, natural));

const stage = ref<HTMLElement | null>(null);
const viewport = ref({ w: 1, h: 1 });
const missing = reactive(new Set<string>());
const showMemory = ref(false);
const flashMsg = ref<string | null>(null);
let flashTimer = 0;

function flash(msg: string) {
  flashMsg.value = msg;
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => (flashMsg.value = null), 4000);
}

// ---- document lifecycle ----

function fileName(p: string): string {
  return p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
}

function emitStatus() {
  const name = collage.filePath.value ? fileName(collage.filePath.value) : "Unsaved collage";
  emit("status", collage.dirty.value ? `${name} •` : name);
}
watch([collage.filePath, collage.dirty], emitStatus);
// the sidebar's current-file highlight follows the selected item
watch(collage.selectedId, () => emit("selected", collage.selected.value?.path ?? null));

function applyInit() {
  collage.load(props.init.doc, props.init.path);
  view.set(props.init.doc.view);
  missing.clear();
  emitStatus();
  if (props.init.seedPaths?.length) addPaths(props.init.seedPaths);
}
watch(() => props.init, applyInit);

function defaultFolder(): string {
  if (collage.filePath.value) return parentDir(collage.filePath.value);
  const first = collage.items.value[0];
  return first ? parentDir(first.path) : "";
}

function remember(path: string) {
  try {
    localStorage.setItem(LAST_COLLAGE_KEY, path);
  } catch {
    // storage unavailable: resume just is not offered
  }
}

async function writeTo(path: string): Promise<boolean> {
  try {
    await writeCollage(path, collage.toDoc(view.get()));
  } catch (e) {
    flash("Save failed: " + e);
    return false;
  }
  collage.markClean(path);
  remember(path);
  flash("Saved");
  return true;
}

async function saveAs(): Promise<boolean> {
  const dest = await saveDialog({
    defaultPath: joinPath(defaultFolder(), `untitled.${COLLAGE_EXT}`),
    filters: [{ name: "Omni collage", extensions: [COLLAGE_EXT] }],
  });
  if (!dest) return false;
  return writeTo(dest);
}

async function save(): Promise<boolean> {
  const p = collage.filePath.value;
  return p ? writeTo(p) : saveAs();
}

// ---- unsaved-changes gate ----

const leave = ref<{ closing: boolean; resolve: (ok: boolean) => void } | null>(null);
let pendingLeave: Promise<boolean> | null = null;

// a second request while the dialog is up shares the first one's outcome
function requestLeave(closing: boolean): Promise<boolean> {
  if (!collage.dirty.value) return Promise.resolve(true);
  pendingLeave ??= new Promise((resolve) => (leave.value = { closing, resolve }));
  return pendingLeave;
}

function settleLeave(ok: boolean) {
  leave.value?.resolve(ok);
  leave.value = null;
  pendingLeave = null;
}

async function leaveAfter(saver: () => Promise<boolean>) {
  const ok = await saver();
  if (ok) settleLeave(true);
  // a cancelled save dialog keeps the unsaved dialog open
}

// ---- adding pictures ----

const visibleRect = computed(() => view.visibleRect(viewport.value, 1));

async function addPaths(paths: string[]) {
  let last: Item | null = null;
  for (const path of paths) {
    let meta;
    try {
      meta = await loadImageMeta(path);
    } catch (e) {
      flash(`Couldn't open ${fileName(path)}: ${e}`);
      continue;
    }
    const vis = view.visibleRect(viewport.value);
    last = collage.add(
      { path, nw: meta.w, nh: meta.h, thumb: meta.thumb },
      { center: { x: vis.x + vis.w / 2, y: vis.y + vis.h / 2 }, visible: vis },
    );
  }
  if (last && !rectsOverlap(last, view.visibleRect(viewport.value))) {
    view.centerOn(last, viewport.value);
  }
}

async function relink(id: string) {
  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"] }],
  });
  if (typeof picked !== "string") return;
  let meta;
  try {
    meta = await loadImageMeta(picked);
  } catch (e) {
    flash(`Couldn't open ${fileName(picked)}: ${e}`);
    return;
  }
  collage.relink(id, picked, { nw: meta.w, nh: meta.h, thumb: meta.thumb });
  missing.delete(id);
}

// ---- pointer routing ----

type Drag =
  | { mode: "pan"; lastX: number; lastY: number; moved: boolean; onEmpty: boolean }
  | { mode: "move"; id: string; lastX: number; lastY: number }
  | { mode: "resize"; id: string; handle: Handle; start: Rect }
  | { mode: "area"; origin: { x: number; y: number } };
let drag: Drag | null = null;
let dragPointer = 0;
const arming = ref(false);
const area = ref<Rect | null>(null);
const preview = ref<Rect | null>(null);

function local(e: MouseEvent) {
  const r = stage.value?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
}

function itemIdAt(target: EventTarget | null): string | null {
  return (target as HTMLElement | null)?.closest?.("[data-item-id]")?.getAttribute("data-item-id") ?? null;
}

function onPointerDown(e: PointerEvent) {
  if (menu.value) {
    // any click outside the menu closes it without starting a drag
    menu.value = null;
    return;
  }
  if (e.button !== 0) return;
  const s = local(e);
  const wall = view.toWall(s.x, s.y);
  if (arming.value) {
    drag = { mode: "area", origin: wall };
    area.value = { x: wall.x, y: wall.y, w: 0, h: 0 };
  } else {
    const handle = (e.target as HTMLElement).closest?.("[data-handle]")?.getAttribute("data-handle") as Handle | null;
    const id = itemIdAt(e.target);
    const sel = collage.selected.value;
    if (handle && sel && id === sel.id) {
      drag = { mode: "resize", id: sel.id, handle, start: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } };
    } else if (id && sel && id === sel.id) {
      drag = { mode: "move", id, lastX: s.x, lastY: s.y };
    } else {
      drag = { mode: "pan", lastX: s.x, lastY: s.y, moved: false, onEmpty: !id };
    }
  }
  dragPointer = e.pointerId;
  stage.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  const s = local(e);
  switch (drag.mode) {
    case "pan": {
      const dx = s.x - drag.lastX;
      const dy = s.y - drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) drag.moved = true;
      view.panBy(dx, dy);
      drag.lastX = s.x;
      drag.lastY = s.y;
      break;
    }
    case "move": {
      collage.moveBy(drag.id, (s.x - drag.lastX) / view.zoom.value, (s.y - drag.lastY) / view.zoom.value);
      drag.lastX = s.x;
      drag.lastY = s.y;
      break;
    }
    case "resize": {
      const p = view.toWall(s.x, s.y);
      collage.setRect(drag.id, resizeRect(drag.start, drag.handle, p.x, p.y, collage.lockAspect.value));
      break;
    }
    case "area": {
      const p = view.toWall(s.x, s.y);
      area.value = {
        x: Math.min(drag.origin.x, p.x),
        y: Math.min(drag.origin.y, p.y),
        w: Math.abs(p.x - drag.origin.x),
        h: Math.abs(p.y - drag.origin.y),
      };
      break;
    }
  }
}

function onPointerUp(e: PointerEvent) {
  const d = drag;
  drag = null;
  stage.value?.releasePointerCapture?.(e.pointerId);
  if (!d) return;
  if (d.mode === "pan" && !d.moved && d.onEmpty) collage.select(null);
  if (d.mode === "area") {
    arming.value = false;
    const r = area.value;
    area.value = null;
    if (!r || r.w < 1 || r.h < 1) return; // a click without a drag cancels
    const problem = validateArea(r);
    if (problem) {
      flash(problem);
      return;
    }
    preview.value = { x: r.x, y: r.y, w: Math.round(r.w), h: Math.round(r.h) };
  }
}

function cancelArea() {
  if (drag?.mode === "area") stage.value?.releasePointerCapture?.(dragPointer);
  drag = null;
  area.value = null;
  arming.value = false;
}

// ---- item menu ----

const menu = ref<{ x: number; y: number; id: string } | null>(null);

function onContextMenu(e: MouseEvent) {
  const id = itemIdAt(e.target);
  if (!id) return;
  collage.select(id);
  menu.value = { x: e.clientX, y: e.clientY, id };
}

function menuRotate() {
  if (menu.value) collage.rotate(menu.value.id);
  menu.value = null;
}

function menuRemove() {
  if (menu.value) removeItem(menu.value.id);
  menu.value = null;
}

function menuReveal() {
  const it = menu.value && collage.items.value.find((i) => i.id === menu.value!.id);
  if (it) emit("reveal", it.path);
  menu.value = null;
}

function onDblClick(e: MouseEvent) {
  const id = itemIdAt(e.target);
  if (!id) return;
  collage.select(id);
  collage.bringToFront(id);
}

// zoom about the cursor at any time; a move in progress tracks wall
// coordinates, so the held item stays under the cursor by construction
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const s = local(e);
  view.zoomAt(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, s.x, s.y);
}

const areaStyle = computed(() => {
  const r = area.value;
  if (!r) return {};
  const tl = view.toScreen(r.x, r.y);
  return { left: tl.x + "px", top: tl.y + "px", width: r.w * view.zoom.value + "px", height: r.h * view.zoom.value + "px" };
});

// ---- actions ----

function fitAll() {
  view.fitAll(collage.items.value, viewport.value);
}

function handleAction(action: ViewerAction): boolean {
  if (leave.value || preview.value) return false;
  switch (action.type) {
    case "toggleLock":
      collage.toggleLock();
      return true;
    case "rotate":
      if (collage.selectedId.value) collage.rotate(collage.selectedId.value);
      return true;
    case "removeSelected":
      if (collage.selectedId.value) removeItem(collage.selectedId.value);
      return true;
    case "deselect":
      if (arming.value || drag?.mode === "area") cancelArea();
      else collage.select(null);
      return true;
    case "fitAll":
      fitAll();
      return true;
    case "resetZoom":
      view.zoomAt(1 / view.zoom.value, viewport.value.w / 2, viewport.value.h / 2);
      return true;
    case "exportArea":
      arming.value = true;
      return true;
    case "save":
      save();
      return true;
    case "saveAs":
      saveAs();
      return true;
    case "toggleMemory":
      showMemory.value = !showMemory.value;
      return true;
    default:
      return false;
  }
}

function removeItem(id: string) {
  if (menu.value?.id === id) menu.value = null;
  collage.remove(id);
  budget.forget(id);
  missing.delete(id);
}

function tabSelect(id: string) {
  const it = collage.items.value.find((i) => i.id === id);
  if (!it) return;
  collage.select(id);
  view.centerOn(it, viewport.value);
}

function isVisible(it: Item): boolean {
  return rectsOverlap(it, visibleRect.value);
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(1) + " GB";
  if (n >= 1024 ** 2) return Math.round(n / 1024 ** 2) + " MB";
  return Math.round(n / 1024) + " KB";
}

function lastPath(): string | null {
  return collage.selected.value?.path ?? collage.items.value.slice(-1)[0]?.path ?? null;
}

// ---- lifecycle ----

let ro: ResizeObserver | null = null;
function measure() {
  const r = stage.value?.getBoundingClientRect();
  if (r && r.width > 0) viewport.value = { w: r.width, h: r.height };
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && stage.value) {
    ro = new ResizeObserver(measure);
    ro.observe(stage.value);
  }
  applyInit();
});
onUnmounted(() => ro?.disconnect());

defineExpose({
  addPaths,
  requestLeave,
  handleAction,
  isDirty: () => collage.dirty.value,
  lastPath,
});
</script>

<template>
  <div class="collage">
    <CollageTabs
      :items="collage.items.value"
      :selected-id="collage.selectedId.value"
      :missing="missing"
      @select="tabSelect"
      @close="removeItem"
      @reorder="collage.reorder"
    />
    <div
      ref="stage"
      class="wall"
      :class="{ arming }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDblClick"
      @wheel="onWheel"
      @contextmenu.prevent="onContextMenu"
    >
      <div class="plane" :style="view.style.value">
        <CollageItem
          v-for="it in collage.items.value"
          :key="it.id"
          :item="it"
          :selected="it.id === collage.selectedId.value"
          :zoom="view.zoom.value"
          :visible="isVisible(it)"
          :budget="budget"
          :missing="missing.has(it.id)"
          @missing="missing.add($event)"
          @found="missing.delete($event)"
          @relink="relink"
        />
      </div>
      <div v-if="area" class="area" :style="areaStyle">
        <span class="area-size">{{ Math.round(area.w) }} × {{ Math.round(area.h) }}</span>
      </div>

      <div class="pill" @pointerdown.stop="menu = null" @dblclick.stop>
        <button
          class="pill-btn lock"
          :class="{ on: collage.lockAspect.value }"
          :data-tip="collage.lockAspect.value ? 'Unlock aspect ratio (L)' : 'Lock aspect ratio (L)'"
          @click="collage.toggleLock()"
        >
          <i class="ph" :class="collage.lockAspect.value ? 'ph-lock' : 'ph-lock-open'" />
        </button>
        <button class="pill-btn" data-tip="Fit all (F)" @click="fitAll">
          <i class="ph ph-frame-corners" />
        </button>
        <button
          class="pill-btn"
          data-tip="Rotate selected (R)"
          :disabled="!collage.selectedId.value"
          @click="handleAction({ type: 'rotate' })"
        >
          <i class="ph ph-arrow-clockwise" />
        </button>
        <span class="pill-div" />
        <button class="pill-btn" :class="{ on: arming }" data-tip="Export area (E)" @click="arming = !arming">
          <i class="ph ph-selection" />
        </button>
        <span class="pill-div" />
        <button class="pill-btn" data-tip="Save collage (Ctrl+S)" @click="save">
          <i class="ph ph-floppy-disk" />
        </button>
        <button class="pill-btn" data-tip="Save collage as (Ctrl+Shift+S)" @click="saveAs">
          <i class="ph ph-floppy-disk-back" />
        </button>
        <span class="pill-div" />
        <button class="pill-btn" :class="{ on: showMemory }" data-tip="Wall memory (M)" @click="showMemory = !showMemory">
          <span v-if="showMemory" class="mem-readout">
            {{ fmtBytes(budget.bytes.value) }} · {{ budget.loaded.value }} loaded
          </span>
          <i v-else class="ph ph-memory" />
        </button>
        <button class="pill-btn on" data-tip="Exit collage mode (C)" @click="emit('exit', lastPath())">
          <i class="ph ph-images" />
        </button>
      </div>
      <div v-if="flashMsg" class="save-msg">{{ flashMsg }}</div>
      <div
        v-if="menu"
        class="context-menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @pointerdown.stop
        @dblclick.stop
      >
        <button class="menu-item" @click="menuRotate">Rotate</button>
        <button class="menu-item" @click="menuRemove">Remove from wall</button>
        <div class="menu-sep" />
        <button class="menu-item" @click="menuReveal">Reveal in sidebar</button>
      </div>

      <ExportPreview
        v-if="preview"
        :rect="preview"
        :items="collage.items.value"
        :format="collage.exportFormat.value"
        :folder="defaultFolder()"
        @format-change="collage.setFormat"
        @close="preview = null"
        @saved="(p) => { preview = null; flash('Saved to ' + p); }"
      />
      <UnsavedDialog
        v-if="leave"
        :closing="leave.closing"
        @discard="settleLeave(true)"
        @cancel="settleLeave(false)"
        @save="leaveAfter(save)"
        @save-as="leaveAfter(saveAs)"
      />
    </div>
  </div>
</template>

<style scoped>
.collage {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.wall {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #0a0b0c;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.wall:active {
  cursor: grabbing;
}
.wall.arming {
  cursor: crosshair;
}
.plane {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.area {
  position: absolute;
  border: 1px dashed var(--color-accent-300);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  pointer-events: none;
}
.area-size {
  position: absolute;
  right: 0;
  top: -20px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-accent-200);
  font-size: 11px;
  white-space: nowrap;
}
.pill {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border-radius: 9px;
  background: #17181ad9;
  border: 1px solid var(--color-neutral-900);
  backdrop-filter: blur(8px);
  cursor: default;
}
.pill-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 16px;
}
.pill-btn:hover:not(:disabled) {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.pill-btn.on {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.pill-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.pill-div {
  width: 1px;
  height: 18px;
  margin: 0 5px;
  background: var(--color-neutral-900);
}
.context-menu {
  position: fixed;
  z-index: 20;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  border-radius: 4px;
  padding: 2px;
  box-shadow: 0 4px 12px #0008;
  cursor: default;
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
}
.menu-item:hover {
  background: var(--color-accent-900);
}
.menu-sep {
  height: 1px;
  margin: 2px 6px;
  background: var(--color-neutral-800);
}
.mem-readout {
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.save-msg {
  position: absolute;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  z-index: 7;
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  color: var(--color-accent-200);
  font-size: 12px;
}
</style>
