<script setup lang="ts">
import { ref } from "vue";
import type { MediaItem, ViewerAction } from "../types";
import VideoPlayer from "./VideoPlayer.vue";
import ImageViewer from "./ImageViewer.vue";

defineProps<{ item: MediaItem; hasPrev?: boolean; hasNext?: boolean }>();
defineEmits<{ deleteFile: []; clipSaved: [path: string]; navigate: [dir: -1 | 1]; collage: [] }>();

const child = ref<{ handleAction: (a: ViewerAction) => boolean } | null>(null);

function handleAction(action: ViewerAction): boolean {
  return child.value?.handleAction(action) ?? false;
}

defineExpose({ handleAction });
</script>

<template>
  <VideoPlayer
    v-if="item.kind === 'video'"
    ref="child"
    :item="item"
    :has-prev="hasPrev"
    :has-next="hasNext"
    @delete-file="$emit('deleteFile')"
    @clip-saved="$emit('clipSaved', $event)"
    @navigate="$emit('navigate', $event)"
  />
  <ImageViewer
    v-else
    ref="child"
    :item="item"
    :has-prev="hasPrev"
    :has-next="hasNext"
    @navigate="$emit('navigate', $event)"
    @collage="$emit('collage')"
  />
</template>
