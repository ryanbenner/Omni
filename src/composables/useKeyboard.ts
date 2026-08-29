import { onMounted, onUnmounted } from "vue";
import { resolveKey, resolveKeyUp, type Command } from "./keymap";

export function useKeyboard(
  kind: () => "video" | "image" | null,
  handler: (cmd: Command) => void,
) {
  function onKeydown(e: KeyboardEvent) {
    const cmd = resolveKey(e, kind());
    if (cmd) {
      e.preventDefault();
      handler(cmd);
    }
  }
  function onKeyup(e: KeyboardEvent) {
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
