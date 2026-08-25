<script setup lang="ts">
import type { MediaItem } from "../types";

defineProps<{ items: MediaItem[]; currentIndex: number }>();
defineEmits<{ select: [index: number] }>();
</script>

<template>
  <aside class="sidebar">
    <ul class="file-list">
      <li
        v-for="(it, i) in items"
        :key="it.path"
        class="file-row"
        :class="{ active: i === currentIndex }"
        @click="$emit('select', i)"
      >
        <span class="kind-tag">{{ it.kind === "video" ? "VID" : "IMG" }}</span>
        <span class="file-name" :title="it.name">{{ it.name }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  overflow-y: auto;
  background: #191919;
  border-right: 1px solid #2a2a2a;
}
.file-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.file-row:hover {
  background: #242424;
}
.file-row.active {
  background: #2c4a6e;
}
.kind-tag {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: #888;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  padding: 0 3px;
}
.file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
