<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: { value: T; label: string }[] }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <select v-model="model" class="select">
    <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
  </select>
</template>

<style scoped>
.select {
  height: 28px;
  min-width: 96px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  color: var(--color-neutral-200);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}
.select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
