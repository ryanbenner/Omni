// stacked dialogs (e.g. the export preview with an unsaved-changes dialog on top of it)
// must not both react to one Escape keypress: only the topmost registered handler runs.
const handlers: Array<() => void> = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  handlers[handlers.length - 1]?.();
}

export function onEscape(handler: () => void): () => void {
  handlers.push(handler);
  if (handlers.length === 1) window.addEventListener("keydown", onKey, true);
  return () => {
    const i = handlers.indexOf(handler);
    if (i !== -1) handlers.splice(i, 1);
    if (handlers.length === 0) window.removeEventListener("keydown", onKey, true);
  };
}
