<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onEscape } from "../../composables/dialogStack";
import { draft } from "../../composables/settingsDraft";
import {
  ACTIONS,
  KEYBIND_GROUPS,
  actionHint,
  bindableCombo,
  comboFromEvent,
  findConflict,
  formatCombo,
  type ActionId,
  type Scope,
} from "../../composables/keybinds";
import { mostVisible } from "../../composables/scrollSpy";
import { keybindGroup, keybindJump, keybindPromptOpen, unsavedPromptOpen } from "./settingsState";
import KeybindConflictDialog from "./KeybindConflictDialog.vue";

const groups = KEYBIND_GROUPS.map((g) => ({ ...g, actions: ACTIONS.filter((a) => a.scope === g.scope) }));
const LABELS = new Map(ACTIONS.map((a) => [a.id, a.label]));

const root = ref<HTMLElement | null>(null);
const listening = ref<ActionId | null>(null);
const conflict = ref<{ id: ActionId; other: ActionId; combo: string } | null>(null);
let offEscape: (() => void) | null = null;

function listen(id: ActionId) {
  listening.value = id;
  if (offEscape) return;
  // above the modal's own handler, so escape cancels without closing settings
  offEscape = onEscape(stop);
  window.addEventListener("keydown", onKey, true);
}

function stop() {
  listening.value = null;
  offEscape?.();
  offEscape = null;
  window.removeEventListener("keydown", onKey, true);
}

// the page stays mounted under the unsaved prompt; its Enter must not be bound
watch(unsavedPromptOpen, (open) => {
  if (open) stop();
});

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") return; // onEscape cancels
  e.preventDefault();
  e.stopPropagation();
  const id = listening.value!;
  const raw = comboFromEvent(e);
  const combo = raw && bindableCombo(id, raw);
  if (!combo) return;
  stop();
  const other = findConflict(draft.keybinds, id, combo);
  if (!other) {
    draft.keybinds[id] = combo;
    return;
  }
  conflict.value = { id, other, combo };
  keybindPromptOpen.value = true;
}

function resolve(overwrite: boolean) {
  const c = conflict.value!;
  conflict.value = null;
  keybindPromptOpen.value = false;
  if (overwrite) {
    // a seek key also takes its shift variant, so it can collide with two actions
    let other: ActionId | null;
    while ((other = findConflict(draft.keybinds, c.id, c.combo))) draft.keybinds[other] = null;
    draft.keybinds[c.id] = c.combo;
  }
  // back on the row once the page is no longer inert
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-id="${c.id}"]`)?.focus());
}

function chipText(id: ActionId) {
  if (listening.value === id) return "Press a key…";
  const bind = draft.keybinds[id];
  return bind === null ? "Not set" : formatCombo(bind);
}

let scroller: HTMLElement | null = null;

function sections() {
  return [...(root.value?.querySelectorAll<HTMLElement>("section[data-scope]") ?? [])];
}

// the scroll a jump causes would overwrite the group it just set
let jumping = false;

function onScroll() {
  if (!scroller || jumping) return;
  const view = scroller.getBoundingClientRect();
  const items = sections().map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.scope as Scope, top: r.top, bottom: r.bottom };
  });
  if (items.length) keybindGroup.value = mostVisible(items, view.top, view.bottom);
}

function jump() {
  const scope = keybindJump.value;
  // before mount the watcher fires too early; onMounted picks the jump up
  if (!scope || !scroller) return;
  const el = sections().find((s) => s.dataset.scope === scope);
  if (el && scroller) {
    // the body's 28px top padding stays above the heading
    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 28;
  }
  jumping = true;
  requestAnimationFrame(() => (jumping = false));
  keybindGroup.value = scope;
  keybindJump.value = null;
}

watch(keybindJump, jump);

onMounted(() => {
  scroller = root.value?.closest<HTMLElement>(".page-body") ?? null;
  scroller?.addEventListener("scroll", onScroll, { passive: true });
  // a jump made before mount (nav click from another section)
  if (keybindJump.value) jump();
  // the group lives outside the page, so re-entry would keep a stale one
  else onScroll();
});

onUnmounted(() => {
  scroller?.removeEventListener("scroll", onScroll);
  stop();
  keybindPromptOpen.value = false;
});
</script>

<template>
  <div ref="root" class="keybinds" :inert="conflict ? true : undefined">
    <section v-for="g in groups" :key="g.scope" :data-scope="g.scope">
      <h3 class="keybind-group">{{ g.label }}</h3>
      <button
        v-for="a in g.actions"
        :key="a.id"
        class="keybind-row"
        :class="{ listening: listening === a.id }"
        :data-id="a.id"
        @click="listen(a.id)"
      >
        <span class="keybind-text">
          <span class="keybind-label">{{ a.label }}</span>
          <span v-if="actionHint(a.id, draft.video.skipStep)" class="keybind-hint">
            {{ actionHint(a.id, draft.video.skipStep) }}
          </span>
        </span>
        <span
          class="key-chip"
          :class="{ listening: listening === a.id, unset: listening !== a.id && draft.keybinds[a.id] === null }"
        >
          {{ chipText(a.id) }}
        </span>
      </button>
    </section>
  </div>
  <!-- over the whole modal, nav included, like the unsaved prompt -->
  <Teleport defer to=".settings">
    <KeybindConflictDialog
      v-if="conflict"
      :key-label="formatCombo(conflict.combo)"
      :other="LABELS.get(conflict.other)!"
      @overwrite="resolve(true)"
      @cancel="resolve(false)"
    />
  </Teleport>
</template>

<style scoped>
.keybinds {
  max-width: 720px;
  margin: 0 auto;
}
section + section {
  margin-top: 28px;
}
.keybind-group {
  margin: 0 0 6px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-neutral-500);
}
.keybind-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 9px 8px;
  border: none;
  border-top: 1px solid var(--color-neutral-900);
  border-radius: 6px;
  background: none;
  color: inherit;
  font-family: var(--font-body);
  text-align: left;
  cursor: pointer;
}
.keybind-row:first-of-type {
  border-top: none;
}
.keybind-row:hover,
.keybind-row.listening {
  background: var(--color-surface);
}
.keybind-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.keybind-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.keybind-label {
  font-size: 13px;
  color: var(--color-neutral-200);
}
.keybind-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-neutral-500);
}
.key-chip {
  flex: none;
  min-width: 28px;
  padding: 2px 8px;
  border: 1px solid var(--color-neutral-700);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-neutral-200);
  font-size: 12px;
  text-align: center;
}
.key-chip.listening {
  border-color: var(--color-accent);
  background: var(--color-accent-900);
  color: var(--color-accent-300);
}
.key-chip.unset {
  border-style: dashed;
  background: none;
  color: var(--color-neutral-600);
}
</style>
