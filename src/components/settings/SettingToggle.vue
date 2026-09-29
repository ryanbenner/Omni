<script setup lang="ts">
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    class="toggle"
    :class="{ on: model }"
    role="switch"
    :aria-checked="model ? 'true' : 'false'"
    @click="model = !model"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.toggle {
  position: relative;
  width: 34px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: var(--color-neutral-700);
  cursor: pointer;
}
.toggle.on {
  background: var(--color-accent);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-neutral-100);
  transition: left 120ms;
}
.toggle.on .knob {
  left: 18px;
}
.toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
