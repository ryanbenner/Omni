<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import type { PdfHandle, RenderJob, RenderRegion } from "../composables/pdfDocument";
import type { PageBox, Slice } from "../composables/pdfLayout";

const props = defineProps<{
  handle: PdfHandle;
  page: number;
  box: PageBox;
  scale: number;
  baseScale: number;
  settled: { scale: number; slice: Slice | null } | null;
  dpr: number;
}>();

const baseA = ref<HTMLCanvasElement | null>(null);
const baseB = ref<HTMLCanvasElement | null>(null);
const detailA = ref<HTMLCanvasElement | null>(null);
const detailB = ref<HTMLCanvasElement | null>(null);

// two canvases per layer: a render goes into the hidden one and the pair
// swaps when it lands, so the previous picture never blanks mid-render
function makeLayer(a: Ref<HTMLCanvasElement | null>, b: Ref<HTMLCanvasElement | null>) {
  const front = ref<0 | 1>(0);
  const rect = ref<Slice | null>(null);
  const at = ref(0);
  // the device pixel ratio the shown picture was rendered at
  const atDpr = ref(0);
  let job: RenderJob | null = null;
  let requested: RenderRegion | null = null;
  let requestedDpr = 0;

  function render(region: RenderRegion) {
    const dpr = props.dpr;
    if (job && requested && requestedDpr === dpr && sameRegion(requested, region)) return;
    job?.cancel();
    const canvas = (front.value === 0 ? b : a).value;
    if (!canvas) return;
    const j = props.handle.render(props.page, canvas, region, dpr);
    job = j;
    requested = region;
    requestedDpr = dpr;
    j.done
      .then(() => {
        if (job !== j) return;
        job = null;
        requested = null;
        front.value = front.value === 0 ? 1 : 0;
        rect.value = { x: region.x, y: region.y, w: region.w, h: region.h };
        at.value = region.scale;
        atDpr.value = dpr;
        release((front.value === 0 ? b : a).value);
      })
      .catch((e) => {
        // a genuine failure (not a cancellation, which never rejects here)
        // must clear job/requested too, or the dedup guard above would
        // swallow every later request for this same region forever
        if (job === j) {
          job = null;
          requested = null;
        }
        console.warn(`pdf page ${props.page} render failed`, e);
      });
  }

  function clear() {
    job?.cancel();
    job = null;
    requested = null;
    release(a.value);
    release(b.value);
    rect.value = null;
    at.value = 0;
    atDpr.value = 0;
  }

  return { front, rect, at, atDpr, render, clear };
}

function release(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function sameRegion(a: RenderRegion, b: RenderRegion): boolean {
  return a.scale === b.scale && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

const base = makeLayer(baseA, baseB);
const detail = makeLayer(detailA, detailB);

const BASE_MAX_PX = 16e6;
const pagePts = computed(() => ({ w: props.box.w / props.scale, h: props.box.h / props.scale }));

// decides what each layer should show for the settled view; runs after mount
// (the canvases must exist) and after every settled change
function sync() {
  const settled = props.settled;
  if (!settled) return;
  // the base covers the whole page at fit resolution, or less when zoomed
  // out so many small pages stay cheap; small changes keep what it has
  let res = Math.min(props.baseScale, settled.scale);
  // a page far larger than page 1 would blow past canvas size limits; the
  // detail layer sharpens the visible slice of a capped base
  const area = pagePts.value.w * pagePts.value.h * res * res * props.dpr * props.dpr;
  if (area > BASE_MAX_PX) res *= Math.sqrt(BASE_MAX_PX / area);
  const baseStale = base.atDpr.value !== props.dpr || res > base.at.value * 1.01 || res < base.at.value / 2;
  if (base.rect.value === null || baseStale) {
    base.render({ scale: res, x: 0, y: 0, w: pagePts.value.w * res, h: pagePts.value.h * res });
  }
  const slice = settled.slice;
  if (settled.scale <= res || !slice) {
    detail.clear();
    return;
  }
  if (detail.at.value === settled.scale && detail.atDpr.value === props.dpr && detail.rect.value && sameRegion({ scale: settled.scale, ...detail.rect.value }, { scale: settled.scale, ...slice })) {
    return;
  }
  detail.render({ scale: settled.scale, ...slice });
}

onMounted(sync);
watch(() => [props.settled, props.baseScale, props.dpr] as const, sync, { flush: "post" });

const detailVisible = computed(
  () => detail.rect.value !== null && detail.at.value === props.scale && detail.atDpr.value === props.dpr,
);
const detailStyle = computed(() => {
  const r = detail.rect.value;
  return r ? { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" } : {};
});
const boxStyle = computed(() => ({
  left: props.box.left + "px",
  top: props.box.top + "px",
  width: props.box.w + "px",
  height: props.box.h + "px",
}));

// onBeforeUnmount, not onUnmounted: by the time onUnmounted fires, vue has
// already nulled the template refs while tearing down the subtree, so
// clear() would have nothing to release
onBeforeUnmount(() => {
  base.clear();
  detail.clear();
  props.handle.release(props.page);
});
</script>

<template>
  <div class="pdf-page" :style="boxStyle">
    <canvas v-show="base.rect.value && base.front.value === 0" ref="baseA" class="layer base" />
    <canvas v-show="base.rect.value && base.front.value === 1" ref="baseB" class="layer base" />
    <canvas
      v-show="detailVisible && detail.front.value === 0"
      ref="detailA"
      class="detail"
      :style="detailStyle"
    />
    <canvas
      v-show="detailVisible && detail.front.value === 1"
      ref="detailB"
      class="detail"
      :style="detailStyle"
    />
    <!-- a text layer for selection would sit here, positioned like .layer -->
  </div>
</template>

<style scoped>
.pdf-page {
  position: absolute;
  background: #fff;
  box-shadow: 0 2px 12px #000a;
  overflow: hidden;
}
.layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.detail {
  position: absolute;
}
</style>
