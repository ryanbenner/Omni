<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { CollageItem, ExportFormat, Rect } from "../types";
import { browserDeps, exportArea, renderArea, type RenderDeps } from "../composables/collageExport";
import { nextFreeCompositionPath } from "../composables/collageFile";

const props = defineProps<{
  rect: Rect;
  items: CollageItem[];
  format: ExportFormat;
  folder: string;
  deps?: RenderDeps;
}>();
const emit = defineEmits<{ close: []; saved: [path: string]; formatChange: [f: ExportFormat] }>();

const PREVIEW_MAX = 900;
const format = ref<ExportFormat>(props.format);
const previewUrl = ref<string | null>(null);
const missing = ref<string[]>([]);
const busy = ref(false);
const error = ref<string | null>(null);

function deps(): RenderDeps {
  return props.deps ?? browserDeps;
}

function baseName(p: string): string {
  return p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
}

async function render() {
  const scale = Math.min(1, PREVIEW_MAX / Math.max(props.rect.w, props.rect.h));
  try {
    const out = await renderArea(props.rect, props.items, format.value, scale, deps());
    missing.value = out.missing;
    const blob = await out.canvas.convertToBlob({ type: format.value === "jpg" ? "image/jpeg" : "image/png" });
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = URL.createObjectURL(blob);
  } catch (e) {
    error.value = String(e);
  }
}

function setFormat(f: ExportFormat) {
  if (format.value === f) return;
  format.value = f;
  emit("formatChange", f);
  render();
}

async function writeTo(dest: string) {
  busy.value = true;
  try {
    await exportArea(props.rect, props.items, format.value, dest, deps());
    emit("saved", dest);
  } catch (e) {
    error.value = "Save failed: " + e;
  } finally {
    busy.value = false;
  }
}

async function save() {
  await writeTo(await nextFreeCompositionPath(props.folder, format.value));
}

async function saveAs() {
  const dest = await saveDialog({
    defaultPath: await nextFreeCompositionPath(props.folder, format.value),
    filters: [{ name: format.value.toUpperCase() + " image", extensions: [format.value] }],
  });
  if (!dest) return;
  await writeTo(dest);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  render();
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey, true);
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
watch(() => props.format, (f) => (format.value = f));
</script>

<template>
  <div class="dialog-backdrop" @pointerdown.stop @wheel.stop>
    <div class="dialog preview">
      <div class="preview-stage">
        <img v-if="previewUrl" :src="previewUrl" class="preview-img" draggable="false" />
        <p v-else-if="error" class="preview-error">{{ error }}</p>
        <p v-else class="preview-wait">Rendering…</p>
      </div>
      <div class="preview-row">
        <span class="preview-size">{{ Math.round(rect.w) }} × {{ Math.round(rect.h) }}</span>
        <span class="fmt">
          <button class="fmt-btn fmt-png" :class="{ on: format === 'png' }" @click="setFormat('png')">PNG</button>
          <button class="fmt-btn fmt-jpg" :class="{ on: format === 'jpg' }" @click="setFormat('jpg')">JPG</button>
        </span>
      </div>
      <p v-if="missing.length" class="preview-missing">
        Missing, left blank: {{ missing.map(baseName).join(", ") }}
      </p>
      <div class="dialog-actions">
        <button class="btn-outline" :disabled="busy" @click="emit('close')">Discard</button>
        <button class="btn-accent save-as" :disabled="busy" @click="saveAs">Save As</button>
        <button class="btn-accent save" :disabled="busy" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  max-width: min(960px, 92%);
}
.preview-stage {
  display: grid;
  place-items: center;
  min-height: 200px;
  max-height: 70vh;
  margin-bottom: 10px;
  border-radius: 6px;
  overflow: hidden;
  /* checkerboard so transparent png areas read as transparent */
  background:
    linear-gradient(45deg, #2a2b2e 25%, transparent 25%, transparent 75%, #2a2b2e 75%),
    linear-gradient(45deg, #2a2b2e 25%, transparent 25%, transparent 75%, #2a2b2e 75%) 8px 8px,
    #1e1f22;
  background-size: 16px 16px;
}
.preview-img {
  max-width: 100%;
  max-height: 70vh;
  display: block;
}
.preview-wait,
.preview-error {
  color: var(--color-neutral-500);
}
.preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.preview-size {
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.fmt {
  display: inline-flex;
  border: 1px solid var(--color-neutral-800);
  border-radius: 6px;
  overflow: hidden;
}
.fmt-btn {
  padding: 4px 10px;
  border: none;
  background: none;
  color: var(--color-neutral-500);
  font-size: 11px;
  cursor: pointer;
}
.fmt-btn.on {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.preview-missing {
  margin: 0 0 10px;
  font-size: 12px;
  color: #e0b04a;
}
</style>
