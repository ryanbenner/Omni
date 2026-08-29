<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, ViewerAction } from "../types";
import { useImageTransform } from "../composables/useImageTransform";

const props = defineProps<{ item: MediaItem }>();

const src = computed(() => convertFileSrc(props.item.path));
const failed = ref(false);
const t = useImageTransform();
const container = ref<HTMLElement | null>(null);

const zoomPct = computed(() => Math.round(t.scale.value * 100) + "%");

watch(src, () => {
  failed.value = false;
  t.reset();
  t.rotation.value = 0;
  menu.value = null;
});

const ZOOM_STEP = 1.1;

function onWheel(e: WheelEvent) {
  e.preventDefault();
  t.zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
}

const dragging = ref(false);
let lastX = 0;
let lastY = 0;

const menu = ref<{ x: number; y: number } | null>(null);

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY };
}

function resetView() {
  t.reset();
  t.rotation.value = 0;
  menu.value = null;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else container.value?.requestFullscreen();
}

function onPointerDown(e: PointerEvent) {
  if (menu.value) {
    // any click outside the menu closes it without starting a drag
    menu.value = null;
    return;
  }
  if (e.button !== 0) return;
  dragging.value = true;
  lastX = e.clientX;
  lastY = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  t.panBy(e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX;
  lastY = e.clientY;
}

function onPointerUp() {
  dragging.value = false;
}

function handleAction(action: ViewerAction): boolean {
  switch (action.type) {
    case "rotate":
      t.rotate();
      return true;
    case "resetZoom":
    case "fit":
      // baseline css already fits the window, so both reset the transform
      t.reset();
      return true;
    default:
      return false;
  }
}

defineExpose({ handleAction });
</script>

<template>
  <div
    ref="container"
    class="image-viewer"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @contextmenu="onContextMenu"
  >
    <div v-if="failed" class="image-error">
      <p>Couldn't display {{ item.name }}.</p>
      <p class="hint">
        If this is an HEIC photo, install "HEIF Image Extensions" from the
        Microsoft Store, then reopen the file.
      </p>
    </div>
    <img
      v-else
      :src="src"
      :style="t.style.value"
      class="image-el"
      draggable="false"
      @error="failed = true"
    />
    <div v-if="!failed" class="pill" @pointerdown.stop="menu = null">
      <button class="pill-btn" title="Zoom out" @click="t.zoomBy(1 / ZOOM_STEP)">
        <i class="ph ph-magnifying-glass-minus" />
      </button>
      <span class="pill-pct">{{ zoomPct }}</span>
      <button class="pill-btn" title="Zoom in" @click="t.zoomBy(ZOOM_STEP)">
        <i class="ph ph-magnifying-glass-plus" />
      </button>
      <span class="pill-div" />
      <button class="pill-btn" title="Fit to window (F)" @click="t.reset()">
        <i class="ph ph-frame-corners" />
      </button>
      <button class="pill-btn" title="Rotate (R)" @click="t.rotate()">
        <i class="ph ph-arrow-clockwise" />
      </button>
      <button class="pill-btn" title="Fullscreen" @click="toggleFullscreen">
        <i class="ph ph-corners-out" />
      </button>
    </div>
    <div
      v-if="menu"
      class="context-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @pointerdown.stop
    >
      <button class="menu-item" @click="resetView">Reset view</button>
    </div>
  </div>
</template>

<style scoped>
.image-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f0f0f;
  cursor: grab;
  touch-action: none;
}
.image-viewer:active {
  cursor: grabbing;
}
.image-el {
  max-width: 100%;
  max-height: 100%;
  /* exif-rotated phone photos should display upright */
  image-orientation: from-image;
  user-select: none;
}
.image-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.image-error .hint {
  color: var(--color-neutral-500);
  max-width: 40ch;
  text-align: center;
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
  background: #1e1e1ed9;
  border: 1px solid var(--color-neutral-900);
  backdrop-filter: blur(8px);
  cursor: default;
}
.pill-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 16px;
}
.pill-btn:hover {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.pill-pct {
  min-width: 46px;
  text-align: center;
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
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
}
.menu-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #ddd;
  padding: 0.35rem 1rem;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
}
.menu-item:hover {
  background: var(--color-accent-900);
}
</style>
