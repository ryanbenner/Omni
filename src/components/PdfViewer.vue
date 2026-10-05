<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { readFile } from "@tauri-apps/plugin-fs";
import type { MediaItem, ViewerAction } from "../types";
import { settings } from "../composables/settings";
import { openPdf, type PdfHandle } from "../composables/pdfDocument";
import {
  GAP,
  clampZoom,
  currentPage,
  fitScale,
  layout,
  pageSlice,
  scrollForThumb,
  thumb,
  visibleRange,
  wheelZoomFactor,
  zoomAt,
  type Layout,
  type PageBox,
  type Size,
  type Slice,
} from "../composables/pdfLayout";
import PdfPage from "./PdfPage.vue";

const props = defineProps<{ item: MediaItem; hasPrev?: boolean; hasNext?: boolean }>();
const emit = defineEmits<{ navigate: [dir: -1 | 1] }>();

interface PageEntry {
  index: number;
  handle: PdfHandle;
  box: PageBox;
  settled: { scale: number; slice: Slice | null } | null;
}

// renders wait this long after the last scroll or zoom so a gesture in
// progress never queues rasterization it will throw away
const SETTLE_MS = 100;
const ZOOM_STEPS = { fine: 1.05, normal: 1.1, coarse: 1.2 } as const;
const zoomStep = computed(() => ZOOM_STEPS[settings.image.zoomStep]);

const container = ref<HTMLElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const viewport = ref({ w: 1, h: 1 });
const dpr = window.devicePixelRatio || 1;

// ---- document ----
const handle = shallowRef<PdfHandle | null>(null);
const sizes = ref<Size[]>([]);
const error = ref<string | null>(null);
// bumped per load so a late result from an earlier file is dropped
let generation = 0;
const gen = ref(0);

// ---- view ----
const zoom = ref(1);
const scrollLeft = ref(0);
const scrollTop = ref(0);
const settled = ref<{ scale: number; left: number; top: number } | null>(null);

const fit = computed(() => (sizes.value.length ? fitScale(viewport.value.w, sizes.value[0]) : 1));
const scale = computed(() => fit.value * zoom.value);
const lay = computed<Layout>(() => layout(sizes.value, scale.value, viewport.value.w));
const range = computed(() => visibleRange(lay.value.boxes, scrollTop.value, viewport.value.h, viewport.value.h));
const current = computed(() => currentPage(lay.value.boxes, scrollTop.value, viewport.value.h));
const zoomPct = computed(() => Math.round(zoom.value * 100) + "%");

// the pages inside the render window, each with the slice it showed when the
// view last settled; the layout at the settled scale may differ from the live one
const settledLay = computed(() =>
  settled.value ? layout(sizes.value, settled.value.scale, viewport.value.w) : null,
);
const pages = computed(() => {
  const r = range.value;
  const h = handle.value;
  if (!r || !h) return [];
  const s = settled.value;
  const sl = settledLay.value;
  const out: PageEntry[] = [];
  for (let i = r.first; i <= r.last; i++) {
    const settledFor =
      s && sl
        ? { scale: s.scale, slice: pageSlice(sl.boxes[i], s.left, s.top, viewport.value.w, viewport.value.h) }
        : null;
    out.push({ index: i, handle: h, box: lay.value.boxes[i], settled: settledFor });
  }
  return out;
});

// ---- settle and scroll ----
let settleTimer = 0;
function settle() {
  settled.value = { scale: scale.value, left: scrollLeft.value, top: scrollTop.value };
}
function scheduleSettle() {
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, SETTLE_MS);
}
function onScroll() {
  const el = scroller.value;
  if (!el) return;
  scrollLeft.value = el.scrollLeft;
  scrollTop.value = el.scrollTop;
  scheduleSettle();
}
function setScroll(left: number, top: number) {
  const el = scroller.value;
  if (!el) return;
  el.scrollLeft = Math.max(0, left);
  el.scrollTop = Math.max(0, top);
  scrollLeft.value = el.scrollLeft;
  scrollTop.value = el.scrollTop;
  scheduleSettle();
}

// ---- zoom and resize ----
// runs `mutate` (which changes the layout) and keeps the document point under
// the cursor where it was; the content element must take its new size before
// the scroll offsets can reach it, hence the tick
async function reflow(mutate: () => void, cx: number, cy: number) {
  const before = lay.value;
  const s0 = scale.value;
  mutate();
  if (!sizes.value.length) return;
  const pos = zoomAt(before, lay.value, s0, scale.value, { left: scrollLeft.value, top: scrollTop.value }, { x: cx, y: cy });
  await nextTick();
  setScroll(pos.left, pos.top);
}
function zoomTo(next: number, cx = viewport.value.w / 2, cy = viewport.value.h / 2) {
  next = clampZoom(next);
  if (next === zoom.value) return;
  reflow(() => (zoom.value = next), cx, cy);
}
function zoomBy(factor: number, cx?: number, cy?: number) {
  zoomTo(zoom.value * factor, cx, cy);
}
function onWheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey)) return; // a plain wheel scrolls natively
  e.preventDefault();
  const r = container.value?.getBoundingClientRect();
  zoomBy(wheelZoomFactor(e.deltaY, zoomStep.value), e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
}

let ro: ResizeObserver | null = null;
function measure() {
  const r = container.value?.getBoundingClientRect();
  if (!r || r.width <= 0) return;
  if (r.width === viewport.value.w && r.height === viewport.value.h) return;
  reflow(() => (viewport.value = { w: r.width, h: r.height }), 0, 0);
}

// ---- drag to pan ----
let drag: { x: number; y: number } | null = null;
function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  const el = scroller.value;
  if (!drag || !el) return;
  setScroll(el.scrollLeft - (e.clientX - drag.x), el.scrollTop - (e.clientY - drag.y));
  drag = { x: e.clientX, y: e.clientY };
}
function onPointerUp() {
  drag = null;
}

// ---- overlay bars ----
const H_TRACK_FRAC = 0.6;
const hTrack = computed(() => viewport.value.w * H_TRACK_FRAC);
const vTrack = computed(() => Math.max(0, viewport.value.h - 24));
const showH = computed(() => lay.value.width > viewport.value.w + 0.5);
const showV = computed(() => lay.value.height > viewport.value.h + 0.5);
const hThumb = computed(() => thumb(scrollLeft.value, viewport.value.w, lay.value.width, hTrack.value));
const vThumb = computed(() => thumb(scrollTop.value, viewport.value.h, lay.value.height, vTrack.value));

type Axis = "x" | "y";
let barDrag: { axis: Axis; start: number; offset: number } | null = null;
function applyBar(axis: Axis, offset: number) {
  if (axis === "x") {
    setScroll(scrollForThumb(offset, viewport.value.w, lay.value.width, hTrack.value), scrollTop.value);
  } else {
    setScroll(scrollLeft.value, scrollForThumb(offset, viewport.value.h, lay.value.height, vTrack.value));
  }
}
// a press on the thumb grabs it; a press on the track jumps the thumb's center there and grabs it
function onBarDown(axis: Axis, e: PointerEvent) {
  if (e.button !== 0) return;
  const track = e.currentTarget as HTMLElement;
  const rect = track.getBoundingClientRect();
  const t = axis === "x" ? hThumb.value : vThumb.value;
  const pos = axis === "x" ? e.clientX - rect.left : e.clientY - rect.top;
  const onThumb = pos >= t.offset && pos <= t.offset + t.len;
  const offset = onThumb ? t.offset : pos - t.len / 2;
  if (!onThumb) applyBar(axis, offset);
  barDrag = { axis, start: axis === "x" ? e.clientX : e.clientY, offset };
  track.setPointerCapture?.(e.pointerId);
}
function onBarMove(e: PointerEvent) {
  if (!barDrag) return;
  const d = (barDrag.axis === "x" ? e.clientX : e.clientY) - barDrag.start;
  applyBar(barDrag.axis, barDrag.offset + d);
}
function onBarUp() {
  barDrag = null;
}

// ---- loading ----
async function load() {
  const myGen = ++generation;
  handle.value?.close();
  handle.value = null;
  sizes.value = [];
  error.value = null;
  settled.value = null;
  zoom.value = 1;
  try {
    const bytes = await readFile(props.item.path);
    if (myGen !== generation) return;
    const h = await openPdf(bytes);
    if (myGen !== generation) {
      h.close();
      return;
    }
    const first = await h.pageSize(1);
    if (myGen !== generation) {
      h.close();
      return;
    }
    sizes.value = Array.from({ length: h.pageCount }, () => first);
    handle.value = h;
    gen.value = myGen;
    setScroll(0, 0);
    settle();
    // the scroller recreates via v-if/v-else after an error, so focus needs a tick to land on it
    await nextTick();
    refocus();
    measureRest(h, myGen);
  } catch (e) {
    if (myGen !== generation) return;
    error.value = e instanceof Error ? e.message : String(e);
  }
}

// sizes after page 1 arrive in the background in batches, so a long document
// relayouts a few times instead of once per page; a bad page keeps page 1's size
async function measureRest(h: PdfHandle, myGen: number) {
  const batch: { i: number; size: Size }[] = [];
  const flush = () => {
    if (!batch.length) return;
    const next = sizes.value.slice();
    for (const b of batch) next[b.i] = b.size;
    sizes.value = next;
    batch.length = 0;
  };
  for (let n = 2; n <= h.pageCount; n++) {
    if (myGen !== generation) return;
    let size: Size;
    try {
      size = await h.pageSize(n);
    } catch {
      continue;
    }
    batch.push({ i: n - 1, size });
    if (batch.length >= 16) flush();
  }
  flush();
}

watch(() => props.item.path, load, { immediate: true });

// ---- actions ----
function scrollToPage(i: number) {
  const boxes = lay.value.boxes;
  if (!boxes.length) return;
  const idx = Math.max(0, Math.min(boxes.length - 1, i));
  // the first page goes to the very top; others leave a sliver of the gap
  setScroll(scrollLeft.value, idx === 0 ? 0 : boxes[idx].top - GAP);
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else container.value?.requestFullscreen();
}
function handleAction(action: ViewerAction): boolean {
  switch (action.type) {
    case "fit":
    case "resetZoom":
      zoomTo(1);
      return true;
    case "pageStep":
      scrollToPage(current.value + action.pages);
      return true;
    case "pageJump":
      scrollToPage(action.to === "first" ? 0 : lay.value.boxes.length - 1);
      return true;
    case "toggleFullscreen":
      toggleFullscreen();
      return true;
    default:
      return false;
  }
}
function navClick(dir: -1 | 1) {
  emit("navigate", dir);
  refocus();
}
// keyboard scrolling (up/down/space) goes to the focused scroller, so focus
// returns to it after any pill press
function refocus() {
  scroller.value?.focus({ preventScroll: true });
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && container.value) {
    ro = new ResizeObserver(measure);
    ro.observe(container.value);
  }
  refocus();
});
onUnmounted(() => {
  generation++;
  handle.value?.close();
  clearTimeout(settleTimer);
  ro?.disconnect();
});

defineExpose({ handleAction });
</script>

<template>
  <div ref="container" class="pdf-viewer">
    <div v-if="error" class="pdf-error">
      <p>Couldn't display {{ item.name }}.</p>
      <p class="hint">{{ error }}</p>
    </div>
    <div
      v-else
      ref="scroller"
      class="scroller"
      tabindex="-1"
      @scroll="onScroll"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="content" :style="{ width: lay.width + 'px', height: lay.height + 'px' }">
        <PdfPage
          v-for="p in pages"
          :key="gen + ':' + p.index"
          :handle="p.handle"
          :page="p.index + 1"
          :box="p.box"
          :scale="scale"
          :base-scale="fit"
          :settled="p.settled"
          :dpr="dpr"
        />
      </div>
    </div>
    <button
      class="nav-arrow nav-prev"
      :disabled="!hasPrev"
      title="Previous file"
      @pointerdown.stop
      @click="navClick(-1)"
    >
      <i class="ph ph-caret-left" />
    </button>
    <button
      class="nav-arrow nav-next"
      :disabled="!hasNext"
      title="Next file"
      @pointerdown.stop
      @click="navClick(1)"
    >
      <i class="ph ph-caret-right" />
    </button>
    <div
      v-if="!error && showV"
      class="vbar"
      :style="{ height: vTrack + 'px' }"
      @pointerdown.stop="onBarDown('y', $event)"
      @pointermove="onBarMove"
      @pointerup="onBarUp"
      @pointercancel="onBarUp"
    >
      <div class="thumb" :style="{ top: vThumb.offset + 'px', height: vThumb.len + 'px' }" />
    </div>
    <div
      v-if="!error && showH"
      class="hbar"
      :style="{ width: hTrack + 'px' }"
      @pointerdown.stop="onBarDown('x', $event)"
      @pointermove="onBarMove"
      @pointerup="onBarUp"
      @pointercancel="onBarUp"
    >
      <div class="thumb" :style="{ left: hThumb.offset + 'px', width: hThumb.len + 'px' }" />
    </div>
    <div v-if="!error" class="pill" @pointerdown.stop @click="refocus">
      <button class="pill-btn" data-tip="Zoom out" @click="zoomBy(1 / zoomStep)">
        <i class="ph ph-magnifying-glass-minus" />
      </button>
      <span class="pill-pct">{{ zoomPct }}</span>
      <button class="pill-btn" data-tip="Zoom in" @click="zoomBy(zoomStep)">
        <i class="ph ph-magnifying-glass-plus" />
      </button>
      <span class="pill-div" />
      <button class="pill-btn" data-tip="Fit width (F)" @click="zoomTo(1)">
        <i class="ph ph-arrows-out-line-horizontal" />
      </button>
      <button class="pill-btn" data-tip="Fullscreen" @click="toggleFullscreen">
        <i class="ph ph-corners-out" />
      </button>
      <span class="pill-div" />
      <span v-if="sizes.length" class="pill-page">{{ current + 1 }} / {{ sizes.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0b0c;
}
.scroller {
  position: absolute;
  inset: 0;
  overflow: auto;
  outline: none;
  cursor: grab;
  /* the overlay bars replace the native scrollbars */
  scrollbar-width: none;
}
.scroller::-webkit-scrollbar {
  display: none;
}
.scroller:active {
  cursor: grabbing;
}
.content {
  position: relative;
}
.pdf-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.pdf-error .hint {
  color: var(--color-neutral-500);
  max-width: 40ch;
  text-align: center;
}
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  width: 40px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #17181ad9;
  border: 1px solid var(--color-neutral-900);
  backdrop-filter: blur(8px);
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 20px;
}
.nav-arrow:hover:not(:disabled) {
  color: var(--color-accent-200);
  background: var(--color-accent-900);
}
.nav-arrow:disabled {
  opacity: 0.2;
  cursor: default;
}
.nav-prev {
  left: 14px;
}
.nav-next {
  right: 14px;
}
.hbar,
.vbar {
  position: absolute;
  z-index: 6;
  border-radius: 7px;
  background: #17181ad9;
  border: 1px solid var(--color-neutral-900);
  backdrop-filter: blur(8px);
  cursor: pointer;
}
.hbar {
  left: 50%;
  transform: translateX(-50%);
  bottom: 72px;
  height: 14px;
}
.vbar {
  right: 8px;
  top: 12px;
  width: 10px;
}
.thumb {
  position: absolute;
  border-radius: 5px;
  background: var(--color-neutral-700);
}
.hbar .thumb {
  top: 2px;
  bottom: 2px;
}
.vbar .thumb {
  left: 2px;
  right: 2px;
}
.hbar:hover .thumb,
.vbar:hover .thumb {
  background: var(--color-accent-400);
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
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 16px;
}
.pill-btn i {
  display: block;
  line-height: 1;
}
.pill-btn i::before {
  /* windows measures the glyph run narrower than it paints, which pushed
     the icon right of center; an explicit 1em box aligned to its left edge
     keeps layout and paint in step */
  display: block;
  width: 1em;
  text-align: left;
}
.pill-btn:hover {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.pill-pct,
.pill-page {
  min-width: 46px;
  text-align: center;
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.pill-page {
  padding: 0 6px;
  white-space: nowrap;
}
.pill-div {
  width: 1px;
  height: 18px;
  margin: 0 5px;
  background: var(--color-neutral-900);
}
</style>
