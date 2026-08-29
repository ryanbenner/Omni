<script setup lang="ts">
import { computed, ref } from "vue";
import { formatTimeTenths, type useTrim } from "../composables/useTrim";

const props = defineProps<{
  trim: ReturnType<typeof useTrim>;
  currentTime: number;
}>();
const emit = defineEmits<{ scrub: [t: number] }>();

const bar = ref<HTMLElement | null>(null);
const dragging = ref<"in" | "out" | "seek" | null>(null);

function fracFromEvent(e: PointerEvent): number {
  const rect = bar.value!.getBoundingClientRect();
  return (e.clientX - rect.left) / rect.width;
}

function startDrag(which: "in" | "out" | "seek", e: PointerEvent) {
  dragging.value = which;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  moveDrag(e);
}

function moveDrag(e: PointerEvent) {
  if (!dragging.value || !bar.value) return;
  const t = props.trim.fromFraction(fracFromEvent(e));
  if (dragging.value === "in") {
    props.trim.setIn(t);
    emit("scrub", props.trim.inSec.value);
  } else if (dragging.value === "out") {
    props.trim.setOut(t);
    emit("scrub", props.trim.outSec.value);
  } else {
    // plain seek stays inside the kept range
    const clamped = Math.min(props.trim.outSec.value, Math.max(props.trim.inSec.value, t));
    emit("scrub", clamped);
  }
}

function endDrag() {
  dragging.value = null;
}

const pct = (v: number) =>
  props.trim.duration.value > 0 ? (v / props.trim.duration.value) * 100 : 0;

const inPct = computed(() => pct(props.trim.inSec.value));
const outPct = computed(() => pct(props.trim.outSec.value));
const playheadPct = computed(() => pct(props.currentTime));
</script>

<template>
  <div class="trim-wrap">
    <div class="kept-label">{{ formatTimeTenths(trim.keptDuration.value) }} kept</div>
    <div
      ref="bar"
      class="trim-bar"
      @pointerdown="startDrag('seek', $event)"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <div class="dim" :style="{ left: 0, width: inPct + '%' }" />
      <div class="kept" :style="{ left: inPct + '%', width: outPct - inPct + '%' }" />
      <div class="dim" :style="{ left: outPct + '%', width: 100 - outPct + '%' }" />
      <div class="playhead" :style="{ left: playheadPct + '%' }" />
      <div
        class="grip grip-in"
        :style="{ left: inPct + '%' }"
        @pointerdown.stop="startDrag('in', $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
      >
        <span class="grip-bar" />
      </div>
      <div
        class="grip grip-out"
        :style="{ left: outPct + '%' }"
        @pointerdown.stop="startDrag('out', $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
      >
        <span class="grip-bar" />
      </div>
    </div>
    <div class="edge-labels">
      <span class="edge" :style="{ left: inPct + '%' }">{{
        formatTimeTenths(trim.inSec.value)
      }}</span>
      <span class="edge" :style="{ left: outPct + '%' }">{{
        formatTimeTenths(trim.outSec.value)
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.trim-wrap {
  position: relative;
}
.kept-label {
  display: flex;
  justify-content: center;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--color-accent-300);
  font-variant-numeric: tabular-nums;
}
.trim-bar {
  position: relative;
  height: 28px;
  border-radius: 6px;
  overflow: visible;
  background: var(--color-neutral-900);
  cursor: pointer;
  touch-action: none;
}
.dim {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #0f0f0f80;
  pointer-events: none;
}
.kept {
  position: absolute;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--color-accent-600), var(--color-accent));
  opacity: 0.85;
  border-radius: 4px;
  pointer-events: none;
}
.playhead {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  background: var(--color-neutral-100);
  pointer-events: none;
}
.grip {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 14px;
  margin-left: -7px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--color-accent-200);
  box-shadow: 0 0 10px color-mix(in oklab, var(--color-accent) 70%, transparent);
  cursor: ew-resize;
  touch-action: none;
}
.grip::before {
  /* generous invisible hit area beyond the visible grip */
  content: "";
  position: absolute;
  inset: -6px -8px;
}
.grip-bar {
  width: 2px;
  height: 14px;
  border-radius: 1px;
  background: var(--color-accent-800);
}
.edge-labels {
  position: relative;
  height: 14px;
  margin-top: 2px;
}
.edge {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10.5px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
