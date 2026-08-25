<script setup lang="ts">
import { ref } from "vue";
import type { MediaItem, ViewerAction } from "../types";
import VideoPlayer from "./VideoPlayer.vue";
import ImageViewer from "./ImageViewer.vue";

defineProps<{ item: MediaItem }>();

const child = ref<{ handleAction: (a: ViewerAction) => boolean } | null>(null);

function handleAction(action: ViewerAction): boolean {
  return child.value?.handleAction(action) ?? false;
}

defineExpose({ handleAction });
</script>

<template>
  <VideoPlayer v-if="item.kind === 'video'" ref="child" :item="item" />
  <ImageViewer v-else ref="child" :item="item" />
</template>
