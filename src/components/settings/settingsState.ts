import { computed, ref } from "vue";
import type { Scope } from "../../composables/keybinds";

// the keybinds group the page has in view; the nav highlights it
export const keybindGroup = ref<Scope>("general");
// a group the nav asked to jump to; the page scrolls there and clears it
export const keybindJump = ref<Scope | null>(null);

export const keybindPromptOpen = ref(false);
export const unsavedPromptOpen = ref(false);
// a prompt inside settings is waiting on an answer
export const settingsBlocked = computed(() => keybindPromptOpen.value || unsavedPromptOpen.value);
