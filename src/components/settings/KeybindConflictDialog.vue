<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { onEscape } from "../../composables/dialogStack";

defineProps<{ keyLabel: string; other: string }>();
const emit = defineEmits<{ overwrite: []; cancel: [] }>();

const noBtn = ref<HTMLButtonElement | null>(null);
let offEscape: (() => void) | null = null;

onMounted(() => {
  offEscape = onEscape(() => emit("cancel"));
  noBtn.value?.focus();
});
onUnmounted(() => offEscape?.());

function onBackdrop(e: Event) {
  if (e.target === e.currentTarget) emit("cancel");
}
</script>

<template>
  <div class="dialog-backdrop" @pointerdown.stop="onBackdrop" @wheel.stop>
    <div class="dialog keybind-conflict" role="dialog" aria-label="Key already in use">
      <p class="dialog-title">Key already in use</p>
      <p class="dialog-body">
        {{ keyLabel }} is already bound to {{ other }}. Overwrite it? {{ other }} will be left with no key.
      </p>
      <div class="dialog-actions">
        <button ref="noBtn" class="btn-revert" @click="emit('cancel')">No</button>
        <button class="btn-apply" @click="emit('overwrite')">Overwrite</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keybind-conflict {
  max-width: 380px;
}
.keybind-conflict .dialog-body {
  line-height: 1.5;
}
.keybind-conflict .btn-apply,
.keybind-conflict .btn-revert {
  min-width: 96px;
}
</style>
