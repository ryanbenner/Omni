<script setup lang="ts">
import { nextTick, ref } from "vue";

const props = defineProps<{
  busy: boolean;
  percent: number;
  outputName: string;
  currentName: string;
}>();
const emit = defineEmits<{
  doExport: [mode: "fast" | "precise" | "discord", replace: boolean, newName: string | null];
  cancelExport: [];
}>();

const modeChoice = ref<"precise" | "fast">("precise");
const capped = ref(false);
const renameOpen = ref(false);
const draft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

function effectiveMode(): "fast" | "precise" | "discord" {
  return capped.value ? "discord" : modeChoice.value;
}

function saveNew() {
  emit("doExport", effectiveMode(), false, null);
}

function openRename() {
  draft.value = props.currentName;
  renameOpen.value = true;
  nextTick(() => {
    const el = nameInput.value;
    el?.focus();
    const dot = draft.value.lastIndexOf(".");
    el?.setSelectionRange(0, dot > 0 ? dot : draft.value.length);
  });
}

function confirmReplace() {
  const name = draft.value.trim();
  if (!name || name.includes("/") || name.includes("\\")) return; // keep the modal open
  renameOpen.value = false;
  emit("doExport", effectiveMode(), true, name);
}
</script>

<template>
  <div class="export-panel" @pointerdown.stop>
    <template v-if="!busy">
      <div class="seg">
        <button
          class="seg-opt"
          :class="{ active: modeChoice === 'precise' || capped }"
          :disabled="capped"
          @click="modeChoice = 'precise'"
        >
          Precise
        </button>
        <button
          class="seg-opt"
          :class="{ active: modeChoice === 'fast' && !capped }"
          :disabled="capped"
          @click="modeChoice = 'fast'"
        >
          Fast
        </button>
      </div>
      <label class="cap">
        <input v-model="capped" type="checkbox" />
        ≤ 50 MB
      </label>
      <span v-if="modeChoice === 'fast' && !capped" class="caveat">
        snaps to keyframes — cut may shift up to ~2s
      </span>
      <span class="spacer" />
      <button class="btn-primary" @click="saveNew">Save as new clip</button>
      <button class="btn-outline" @click="openRename">Replace original…</button>
    </template>
    <template v-else>
      <div class="prog-track">
        <div class="prog-fill" :style="{ width: percent + '%' }" />
      </div>
      <span class="prog-name">{{ outputName }}</span>
      <button class="btn-outline" @click="emit('cancelExport')">Cancel</button>
    </template>

    <div v-if="renameOpen" class="modal-backdrop" @pointerdown.stop="renameOpen = false">
      <div class="modal" @pointerdown.stop>
        <div class="modal-title">Replace original</div>
        <p class="modal-hint">
          The original moves to the Recycle Bin and the trimmed clip takes this name.
        </p>
        <input
          ref="nameInput"
          v-model="draft"
          class="modal-input"
          spellcheck="false"
          @keydown.enter.prevent="confirmReplace"
          @keydown.esc.prevent="renameOpen = false"
        />
        <div class="modal-actions">
          <button class="btn-outline" @click="renameOpen = false">Cancel</button>
          <button class="btn-primary" @click="confirmReplace">Replace</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  margin-bottom: 6px;
  border-radius: 12px;
  background: #1e1e1ef0;
  border: 1px solid var(--color-neutral-800);
  backdrop-filter: blur(8px);
  font-size: 12px;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--color-neutral-800);
  border-radius: 999px;
  overflow: hidden;
}
.seg-opt {
  padding: 4px 12px;
  border: none;
  background: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-body);
}
.seg-opt.active {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.seg-opt:disabled {
  opacity: 0.4;
  cursor: default;
}
.cap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-neutral-300);
  cursor: pointer;
}
.caveat {
  color: var(--color-neutral-500);
  font-size: 11px;
}
.spacer {
  flex: 1;
}
.btn-primary {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent-100);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12px;
}
.btn-primary:hover {
  background: color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.btn-outline {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-neutral-700);
  background: none;
  color: var(--color-neutral-300);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12px;
}
.btn-outline:hover {
  border-color: var(--color-accent-700);
  color: var(--color-accent-200);
}
.prog-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--color-neutral-900);
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent-600), var(--color-accent));
  transition: width 0.2s;
}
.prog-name {
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: #000a;
}
.modal {
  width: min(360px, 90vw);
  padding: 14px;
  border-radius: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  box-shadow: 0 12px 40px #000c;
}
.modal-title {
  font-size: 14px;
  color: var(--color-text);
  margin-bottom: 4px;
}
.modal-hint {
  font-size: 11.5px;
  color: var(--color-neutral-500);
  margin: 0 0 10px;
}
.modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-accent-700);
  background: #121212;
  color: var(--color-text);
  font: inherit;
  outline: none;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
