<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onEscape } from "../../composables/dialogStack";
import { SECTIONS, selectedSection, type SectionId } from "./sections";
import { dirty, openDraft, applyDraft, revertDraft } from "../../composables/settingsDraft";

const emit = defineEmits<{ close: [] }>();

// before the pages render, so they never show a stale draft
openDraft();

const nav = ref<HTMLElement | null>(null);
const current = computed(() => SECTIONS.find((s) => s.id === selectedSection.value) ?? SECTIONS[0]);
let offEscape: (() => void) | null = null;

function select(id: SectionId) {
  selectedSection.value = id;
}

onMounted(() => {
  offEscape = onEscape(() => emit("close"));
  nav.value?.querySelector<HTMLButtonElement>(".nav-item.active")?.focus();
});
onUnmounted(() => offEscape?.());
</script>

<template>
  <!-- the native menu's reload entry would drop an unsaved wall underneath -->
  <div class="settings" role="dialog" aria-label="Settings" @contextmenu.prevent>
    <nav ref="nav" class="settings-nav">
      <div class="nav-caption">Settings</div>
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        class="nav-item"
        :class="{ active: s.id === selectedSection }"
        @click="select(s.id)"
      >
        <i class="ph" :class="s.icon" />
        <span>{{ s.label }}</span>
      </button>
    </nav>
    <div class="settings-page">
      <div class="page-header">
        <span class="page-title">{{ current.label }}</span>
        <button class="settings-close" title="Close" @click="emit('close')">
          <i class="ph ph-x" />
        </button>
      </div>
      <div class="page-body">
        <component :is="current.page" />
      </div>
      <div v-if="dirty" class="page-footer">
        <button class="btn-revert" @click="revertDraft">Revert</button>
        <button class="btn-apply" @click="applyDraft">Apply</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  background: var(--color-bg);
}
.settings-nav {
  width: 200px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  overflow-y: auto;
  background: #131416;
  border-right: 1px solid var(--color-neutral-900);
}
.nav-caption {
  margin-bottom: 8px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-neutral-600);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--color-neutral-300);
  font-family: var(--font-body);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.nav-item i {
  font-size: 16px;
  color: var(--color-neutral-500);
}
.nav-item:hover {
  background: var(--color-neutral-900);
}
.nav-item.active {
  background: var(--color-accent-900);
  color: var(--color-neutral-200);
}
.nav-item.active i {
  color: var(--color-accent-300);
}
.nav-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.settings-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.page-header {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-neutral-900);
}
.page-title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
}
.settings-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-600);
  cursor: pointer;
  font-size: 15px;
}
.settings-close:hover {
  background: var(--color-neutral-900);
  color: var(--color-text);
}
.settings-close:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px;
}
.page-body > :deep(.setting-row),
.page-body > :deep(.placeholder) {
  max-width: 640px;
}
.page-footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 28px;
  border-top: 1px solid var(--color-neutral-900);
}
.page-footer .btn-apply,
.page-footer .btn-revert {
  width: 96px;
  padding: 0;
}
</style>
