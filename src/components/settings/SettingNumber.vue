<script setup lang="ts">
import { ref, watch } from "vue";
import { RANGES, type RangeKey } from "../../composables/settings";

const props = defineProps<{ range: RangeKey; unit: string }>();
const model = defineModel<number>({ required: true });
const { min, max } = RANGES[props.range];

// the field edits a draft; the store only ever receives a clamped integer
const draft = ref(String(model.value));
watch(model, (v) => (draft.value = String(v)));

function handleInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value;
}

function commit() {
  const n = Number(draft.value);
  if (draft.value.trim() === "" || !Number.isFinite(n)) {
    draft.value = String(model.value);
    return;
  }
  const v = Math.min(max, Math.max(min, Math.round(n)));
  model.value = v;
  draft.value = String(v);
}
</script>

<template>
  <span class="number-field">
    <!-- v-model not used on type=number input since vue would cast draft to number, breaking string handling -->
    <input
      :value="draft"
      @input="handleInput"
      class="number"
      type="number"
      :min="min"
      :max="max"
      step="1"
      @change="commit"
      @blur="commit"
      @keydown.enter="commit"
    />
    <span class="unit">{{ unit }}</span>
  </span>
</template>

<style scoped>
.number-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.number {
  width: 72px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  color: var(--color-neutral-200);
  font-family: var(--font-body);
  font-size: 13px;
}
.number:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.unit {
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
