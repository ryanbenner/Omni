<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onEscape } from "../../composables/dialogStack";
import { dirty, openDraft, applyDraft, revertDraft } from "../../composables/settingsDraft";
import { SECTIONS, selectedSection, type SectionId } from "./sections";
import UnsavedSettingsDialog from "./UnsavedSettingsDialog.vue";

const emit = defineEmits<{ close: [] }>();

// before the pages render, so they never show a stale draft
openDraft();

const nav = ref<HTMLElement | null>(null);
const current = computed(() => SECTIONS.find((s) => s.id === selectedSection.value) ?? SECTIONS[0]);
let offEscape: (() => void) | null = null;

function select(id: SectionId) {
  selectedSection.value = id;
}

// an exit parked behind the prompt: run after apply or discard, cancel on stay
const pending = ref<{ run: () => void; cancel?: () => void } | null>(null);

function guard(run: () => void, cancel?: () => void) {
  if (!dirty.value) {
    run();
    return;
  }
  // a newer exit replaces an older one still waiting on the prompt
  pending.value?.cancel?.();
  pending.value = { run, cancel };
}

function finishPrompt(outcome: "apply" | "discard" | "stay") {
  const p = pending.value;
  pending.value = null;
  if (!p) return;
  if (outcome === "stay") {
    p.cancel?.();
    return;
  }
  if (outcome === "apply") applyDraft();
  else revertDraft();
  p.run();
}

// the gear lives outside the modal; app awaits this before closing
function requestClose(): Promise<boolean> {
  return new Promise((resolve) => guard(() => resolve(true), () => resolve(false)));
}

onMounted(() => {
  offEscape = onEscape(() => {
    // a typed number commits on blur; escape must see it before deciding to close
    (document.activeElement as HTMLElement | null)?.blur();
    guard(() => emit("close"));
  });
  nav.value?.querySelector<HTMLButtonElement>(".nav-item.active")?.focus();
});
onUnmounted(() => {
  offEscape?.();
  // settings closed from outside while the prompt was up: the parked exit is off
  pending.value?.cancel?.();
  pending.value = null;
});

defineExpose({ requestClose });
</script>

<template>
  <!-- the native menu's reload entry would drop an unsaved wall underneath -->
  <div class="settings" role="dialog" aria-label="Settings" @contextmenu.prevent>
    <nav ref="nav" class="settings-nav" :inert="pending ? true : undefined">
      <div class="nav-caption">Settings</div>
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        class="nav-item"
        :class="{ active: s.id === selectedSection }"
        @click="guard(() => select(s.id))"
      >
        <i class="ph" :class="s.icon" />
        <span>{{ s.label }}</span>
      </button>
    </nav>
    <div class="settings-page" :inert="pending ? true : undefined">
      <div class="page-header">
        <span class="page-title">{{ current.label }}</span>
        <button class="settings-close" title="Close" @click="guard(() => emit('close'))">
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
    <UnsavedSettingsDialog
      v-if="pending"
      @apply="finishPrompt('apply')"
      @discard="finishPrompt('discard')"
      @stay="finishPrompt('stay')"
    />
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
  position: relative;
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
  /* room at the end so the last row can scroll clear of the floating buttons */
  padding: 28px 28px 64px;
}
.page-body > :deep(.setting-row),
.page-body > :deep(.placeholder) {
  max-width: 640px;
}
.page-footer {
  /* floats over the scrolling page, pinned to the corner */
  position: absolute;
  right: 28px;
  bottom: 16px;
  display: flex;
  gap: 8px;
}
.page-footer .btn-apply,
.page-footer .btn-revert {
  min-width: 88px;
}
</style>
