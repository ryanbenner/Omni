<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, ViewerAction } from "../types";
import { useImageTransform } from "../composables/useImageTransform";

const props = defineProps<{ item: MediaItem }>();

const src = computed(() => convertFileSrc(props.item.path));
const failed = ref(false);
const t = useImageTransform();

watch(src, () => {
  failed.value = false;
  t.reset();
  t.rotation.value = 0;
});

const ZOOM_STEP = 1.1;

function onWheel(e: WheelEvent) {
  e.preventDefault();
  t.zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
}

const dragging = ref(false);
let lastX = 0;
let lastY = 0;

function onPointerDown(e: PointerEvent) {
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
    class="image-viewer"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
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
  </div>
</template>

<style scoped>
.image-viewer {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
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
  color: #999;
  max-width: 40ch;
  text-align: center;
}
</style>
