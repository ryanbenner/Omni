<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { CollageItem } from "../types";
import { levelFor, type DecodeBudget } from "../composables/useDecodeBudget";
import type { Handle } from "../composables/collageGeometry";

const props = defineProps<{
  item: CollageItem;
  selected: boolean;
  zoom: number;
  visible: boolean;
  budget: DecodeBudget;
  missing: boolean;
}>();
const emit = defineEmits<{ missing: [id: string]; relink: [id: string] }>();

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_PX = 10;

const canvas = ref<HTMLCanvasElement | null>(null);
const hasBitmap = ref(false);
const dpr = window.devicePixelRatio || 1;

const swap = computed(() => props.item.rotation === 90 || props.item.rotation === 270);

const rootStyle = computed(() => ({
  left: props.item.x + "px",
  top: props.item.y + "px",
  width: props.item.w + "px",
  height: props.item.h + "px",
  zIndex: props.item.z,
}));

// the footprint is post-rotation; the picture box is the unrotated size,
// centered in the footprint, then turned
const picStyle = computed(() => {
  const pw = swap.value ? props.item.h : props.item.w;
  const ph = swap.value ? props.item.w : props.item.h;
  return {
    width: pw + "px",
    height: ph + "px",
    left: (props.item.w - pw) / 2 + "px",
    top: (props.item.h - ph) / 2 + "px",
    transform: `rotate(${props.item.rotation}deg)`,
  };
});

// handles and outline keep a constant screen size while the plane scales
const handleStyle = computed(() => ({
  width: HANDLE_PX / props.zoom + "px",
  height: HANDLE_PX / props.zoom + "px",
  borderWidth: 1 / props.zoom + "px",
}));
const outlineStyle = computed(() => ({ outlineWidth: 2 / props.zoom + "px" }));
const labelStyle = computed(() => ({
  transform: `translateX(-50%) scale(${1 / props.zoom})`,
  bottom: -(8 / props.zoom) + "px",
}));

const required = computed(() =>
  levelFor(Math.max(props.item.w, props.item.h) * props.zoom * dpr, Math.max(props.item.nw, props.item.nh)),
);

function draw(bmp: ImageBitmap) {
  const c = canvas.value;
  if (!c) return;
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")?.drawImage(bmp, 0, 0, bmp.width, bmp.height);
  hasBitmap.value = true;
}

// budget.version bumps when the budget dropped a visible decode to make
// room; re-requesting lets it come back one level lower
watch(
  [() => props.visible, required, () => props.item.path, () => props.budget.version.value],
  async ([vis, level, path]) => {
    props.budget.setVisible(props.item.id, vis);
    if (!vis) {
      props.budget.release(props.item.id);
      hasBitmap.value = false;
      return;
    }
    const bmp = await props.budget.request(props.item.id, path, level, { w: props.item.nw, h: props.item.nh });
    if (!bmp) {
      hasBitmap.value = false;
      emit("missing", props.item.id);
      return;
    }
    draw(bmp);
  },
  { immediate: true },
);

onUnmounted(() => props.budget.forget(props.item.id));
</script>

<template>
  <div
    class="item"
    :class="{ selected, missing }"
    :data-item-id="item.id"
    :style="[rootStyle, selected ? outlineStyle : {}]"
  >
    <div class="pic" :style="picStyle">
      <canvas ref="canvas" v-show="!missing && hasBitmap" class="bitmap" />
      <img
        v-if="item.thumb && (missing || !hasBitmap)"
        :src="item.thumb"
        class="thumb"
        draggable="false"
      />
    </div>
    <button v-if="missing" class="relink" @pointerdown.stop @click.stop="emit('relink', item.id)">
      <i class="ph ph-link-break" /> Relink
    </button>
    <template v-if="selected">
      <span
        v-for="h in HANDLES"
        :key="h"
        class="handle"
        :class="'h-' + h"
        :data-handle="h"
        :style="handleStyle"
      />
      <span class="size-label" :style="labelStyle">{{ Math.round(item.w) }} × {{ Math.round(item.h) }}</span>
    </template>
  </div>
</template>

<style scoped>
.item {
  position: absolute;
  box-sizing: border-box;
}
.item.selected {
  outline: 2px solid var(--color-accent);
  outline-offset: 0;
}
.pic {
  position: absolute;
  transform-origin: center;
}
.bitmap,
.thumb {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}
.missing .thumb {
  opacity: 0.4;
  filter: grayscale(1);
}
.relink {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-accent);
  color: var(--color-accent-200);
  font-size: 12px;
  cursor: pointer;
}
.handle {
  position: absolute;
  box-sizing: border-box;
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  border-radius: 2px;
  transform: translate(-50%, -50%);
}
.h-nw { left: 0; top: 0; cursor: nwse-resize; }
.h-n { left: 50%; top: 0; cursor: ns-resize; }
.h-ne { left: 100%; top: 0; cursor: nesw-resize; }
.h-e { left: 100%; top: 50%; cursor: ew-resize; }
.h-se { left: 100%; top: 100%; cursor: nwse-resize; }
.h-s { left: 50%; top: 100%; cursor: ns-resize; }
.h-sw { left: 0; top: 100%; cursor: nesw-resize; }
.h-w { left: 0; top: 50%; cursor: ew-resize; }
.size-label {
  position: absolute;
  left: 50%;
  transform-origin: top center;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  color: var(--color-neutral-300);
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
