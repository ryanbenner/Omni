<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import type { CollageItem } from "../types";
import { displayLabel } from "../composables/pathUtils";

const props = defineProps<{ items: CollageItem[]; selectedId: string | null; missing: Set<string> }>();
const emit = defineEmits<{ select: [id: string]; close: [id: string]; reorder: [from: number, to: number] }>();

const strip = ref<HTMLElement | null>(null);
const DRAG_THRESHOLD = 6;

function nameOf(it: CollageItem): string {
  const i = Math.max(it.path.lastIndexOf("/"), it.path.lastIndexOf("\\"));
  return displayLabel(it.path.slice(i + 1), true);
}

// hold-and-drag reorders; the drop slot is the gap nearest the pointer
const drag = ref<{ from: number; startX: number; active: boolean; to: number } | null>(null);

function slotAt(clientX: number): number {
  const tabs = strip.value?.querySelectorAll<HTMLElement>(".tab") ?? [];
  let slot = 0;
  tabs.forEach((t, i) => {
    const r = t.getBoundingClientRect();
    if (clientX > r.left + r.width / 2) slot = i + 1;
  });
  return slot;
}

function onDown(e: PointerEvent, i: number) {
  if (e.button !== 0) return;
  drag.value = { from: i, startX: e.clientX, active: false, to: i };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", endDrag);
}

function onMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  if (!d.active && Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD) return;
  d.active = true;
  d.to = slotAt(e.clientX);
}

function onUp(e: PointerEvent) {
  const d = drag.value;
  if (d?.active) emit("reorder", d.from, slotAt(e.clientX));
  endDrag();
}

function endDrag() {
  drag.value = null;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", endDrag);
}

function onClick(id: string) {
  // a drag that moved is not a click
  if (drag.value?.active) return;
  emit("select", id);
}

onUnmounted(endDrag);

watch(
  () => props.selectedId,
  async () => {
    await nextTick();
    strip.value?.querySelector(".tab.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  },
);
</script>

<template>
  <div ref="strip" class="tabs">
    <template v-for="(it, i) in items" :key="it.id">
      <span v-if="drag?.active && drag.to === i" class="tab-drop" />
      <div
        class="tab"
        :class="{ active: it.id === selectedId, dragging: drag?.active && drag.from === i }"
        :data-tip="it.path"
        @pointerdown="onDown($event, i)"
        @click="onClick(it.id)"
      >
        <i v-if="missing.has(it.id)" class="ph ph-warning tab-warn" />
        <span class="tab-name">{{ nameOf(it) }}</span>
        <button class="tab-close" @pointerdown.stop @click.stop="emit('close', it.id)">
          <i class="ph ph-x" />
        </button>
      </div>
    </template>
    <span v-if="drag?.active && drag.to === items.length" class="tab-drop" />
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  align-items: stretch;
  height: 30px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-neutral-900);
  user-select: none;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 12px;
  max-width: 200px;
  font-size: 12px;
  color: var(--color-neutral-500);
  border-right: 1px solid var(--color-neutral-900);
  cursor: default;
  white-space: nowrap;
}
.tab.active {
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.tab.dragging {
  opacity: 0.5;
}
.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-warn {
  color: #e0b04a;
}
.tab-close {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-neutral-600);
  cursor: pointer;
  font-size: 12px;
}
.tab-close:hover {
  background: var(--color-neutral-900);
  color: var(--color-neutral-200);
}
.tab-drop {
  width: 2px;
  margin: 4px 0;
  background: var(--color-accent);
  flex: none;
}
</style>
