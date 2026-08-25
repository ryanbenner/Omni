import { onMounted, onUnmounted } from "vue";
import { resolveKey, type Command } from "./keymap";

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
  onMounted(() => window.addEventListener("keydown", onKeydown));
  onUnmounted(() => window.removeEventListener("keydown", onKeydown));
}
