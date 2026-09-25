<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { onEscape } from "../composables/dialogStack";

defineProps<{ closing?: boolean }>();
const emit = defineEmits<{ discard: []; save: []; saveAs: []; cancel: [] }>();

const saveBtn = ref<HTMLButtonElement | null>(null);
let offEscape: (() => void) | null = null;

onMounted(() => {
  offEscape = onEscape(() => emit("cancel"));
  saveBtn.value?.focus();
});
onUnmounted(() => offEscape?.());
</script>

<template>
  <div class="dialog-backdrop" @pointerdown.stop @wheel.stop>
    <div class="dialog" role="dialog" aria-label="Unsaved changes">
      <p class="dialog-title">Unsaved changes</p>
      <p class="dialog-body">This collage has changes that have not been saved.</p>
      <div class="dialog-actions">
        <button class="btn-outline" @click="emit('discard')">
          {{ closing ? "Discard and Close" : "Discard" }}
        </button>
        <button class="btn-accent" @click="emit('saveAs')">Save As</button>
        <button ref="saveBtn" class="btn-accent" @click="emit('save')">Save</button>
      </div>
      <button class="dialog-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
