<script setup lang="ts">
defineProps<{
  busy: boolean;
  percent: number;
  outputName: string;
}>();
const capped = defineModel<boolean>("capped", { required: true });
const emit = defineEmits<{
  requestExport: [replace: boolean];
  cancelExport: [];
}>();
</script>

<template>
  <div class="export-panel" @pointerdown.stop>
    <template v-if="!busy">
      <label class="cap">
        <input v-model="capped" type="checkbox" />
        ≤ 50 MB
      </label>
      <span class="spacer" />
      <button class="btn-primary" @click="emit('requestExport', false)">
        Save as new clip
      </button>
      <button class="btn-outline" @click="emit('requestExport', true)">
        Replace original…
      </button>
    </template>
    <template v-else>
      <div class="prog-track">
        <div class="prog-fill" :style="{ width: percent + '%' }" />
      </div>
      <span class="prog-name">{{ outputName }}</span>
      <button class="btn-outline" @click="emit('cancelExport')">Cancel</button>
    </template>
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
.cap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-neutral-300);
  cursor: pointer;
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
</style>
