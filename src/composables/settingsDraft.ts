import { computed, reactive } from "vue";
import { settings, type Settings } from "./settings";

// a plain copy; the store is json-shaped data, and cloning a reactive proxy
// through structuredClone throws
function snapshot(): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings;
}

// what the settings pages edit; nothing reaches the store until applyDraft
export const draft: Settings = reactive(snapshot());

export const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(settings));

export function openDraft() {
  Object.assign(draft, snapshot());
}

export function revertDraft() {
  Object.assign(draft, snapshot());
}

// field by field into the existing section objects so watchers keep their references
export function applyDraft() {
  const copy = JSON.parse(JSON.stringify(draft)) as Settings;
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    Object.assign(settings[key], copy[key]);
  }
}
