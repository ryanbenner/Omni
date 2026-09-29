<script setup lang="ts">
defineProps<{ label: string; description?: string; indent?: boolean }>();
</script>

<template>
  <div class="setting-row" :class="{ indent }">
    <div class="setting-text">
      <div class="setting-label">{{ label }}</div>
      <div v-if="description" class="setting-desc">{{ description }}</div>
    </div>
    <div class="setting-control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--color-neutral-900);
}
.setting-row:first-child {
  border-top: none;
}
.setting-row.indent {
  padding-left: 24px;
  border-top: none;
}
.setting-text {
  flex: 1;
  min-width: 0;
}
.setting-label {
  font-size: 13px;
  color: var(--color-neutral-200);
}
.setting-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-neutral-500);
}
.setting-control {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
