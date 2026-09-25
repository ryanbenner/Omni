import { onMounted, onUnmounted } from "vue";
import { resolveKey, resolveKeyUp, type Command } from "./keymap";
import type { StageKind } from "../types";

// shortcuts must not fire while the user types in a text field
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return (
    t.isContentEditable ||
    t.tagName === "TEXTAREA" ||
    (t.tagName === "INPUT" && (t as HTMLInputElement).type === "text")
  );
}

export function useKeyboard(
  kind: () => StageKind | null,
  handler: (cmd: Command) => void,
) {
  function onKeydown(e: KeyboardEvent) {
    if (isTyping(e)) return;
    const cmd = resolveKey(e, kind());
    if (cmd) {
      e.preventDefault();
      handler(cmd);
    }
  }
  function onKeyup(e: KeyboardEvent) {
    if (isTyping(e)) return;
    const cmd = resolveKeyUp(e, kind());
    if (cmd) {
      e.preventDefault();
      handler(cmd);
    }
  }
  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("keyup", onKeyup);
  });
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("keyup", onKeyup);
  });
}
