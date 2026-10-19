import { onMounted, onUnmounted } from "vue";
import { resolveKey, type Command } from "./keymap";
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
  // gates keydown only: keyup must still run so a held step key releases
  enabled: () => boolean = () => true,
) {
  // held step keys by physical key: the character can change mid-hold (shift released)
  const held = new Map<string, 1 | -1>();

  function onKeydown(e: KeyboardEvent) {
    if (!enabled() || isTyping(e)) return;
    // os key repeat can resolve differently once a modifier is released; keep the original hold
    if (held.has(e.code)) {
      e.preventDefault();
      return;
    }
    const cmd = resolveKey(e, kind());
    if (cmd) {
      e.preventDefault();
      if (cmd.target === "viewer" && cmd.action.type === "stepStart") {
        held.set(e.code, cmd.action.direction);
      }
      handler(cmd);
    }
  }
  function release(code: string) {
    const direction = held.get(code);
    if (direction === undefined) return;
    held.delete(code);
    handler({ target: "viewer", action: { type: "stepStop", direction } });
  }
  function onKeyup(e: KeyboardEvent) {
    if (!held.has(e.code)) return;
    e.preventDefault();
    release(e.code);
  }
  // keyup never arrives once the window loses focus
  function onBlur() {
    for (const code of [...held.keys()]) release(code);
  }
  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("keyup", onKeyup);
    window.addEventListener("blur", onBlur);
  });
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("keyup", onKeyup);
    window.removeEventListener("blur", onBlur);
  });
}
