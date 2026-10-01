<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { onEscape } from "../../composables/dialogStack";

const emit = defineEmits<{ apply: []; discard: []; stay: [] }>();

const applyBtn = ref<HTMLButtonElement | null>(null);
let offEscape: (() => void) | null = null;

onMounted(() => {
  offEscape = onEscape(() => emit("stay"));
  applyBtn.value?.focus();
});
onUnmounted(() => offEscape?.());

// a press on the dim area, not inside the box, keeps the user where they are
function onBackdrop(e: Event) {
  if (e.target === e.currentTarget) emit("stay");
}
</script>

<template>
  <div class="dialog-backdrop" @pointerdown.stop="onBackdrop" @wheel.stop>
    <div class="dialog unsaved-settings" role="dialog" aria-label="Unsaved changes">
      <button class="dialog-x" title="Close" @click="emit('stay')">
        <i class="ph ph-x" />
      </button>
      <p class="dialog-title">Unsaved changes</p>
      <p class="dialog-body">Apply your changes before leaving?</p>
      <div class="dialog-actions">
        <button class="btn-revert" @click="emit('discard')">Exit without saving</button>
        <button ref="applyBtn" class="btn-apply" @click="emit('apply')">Apply</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unsaved-settings {
  position: relative;
  padding-right: 44px;
}
.unsaved-settings .dialog-actions {
  margin-right: -24px;
}
.unsaved-settings .btn-apply,
.unsaved-settings .btn-revert {
  width: 120px;
  padding: 0;
}
</style>
