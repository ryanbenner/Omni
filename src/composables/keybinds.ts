import type { StageKind } from "../types";

export type Scope = "general" | "video" | "image" | "pdf" | "collage";
export type Screen = StageKind;
export type ActionId =
  | "prevFile" | "nextFile" | "playPause" | "seekBack" | "seekForward" | "stepBack" | "stepForward" | "mute" | "fullscreen" | "trimIn" | "trimOut" | "exitTrim" | "imageFit" | "imageResetZoom" | "imageRotate" | "enterCollage" | "pdfPrevPage" | "pdfNextPage" | "pdfFirstPage" | "pdfLastPage" | "pdfFit" | "pdfResetZoom" | "collageSave" | "collageSaveAs" | "collageLock" | "collageRotate" | "collageRemove" | "collageDeselect" | "collageFitAll" | "collageResetZoom" | "collageExport" | "collageMemory" | "collageExit";
export type Keybinds = Record<ActionId, string | null>;
export interface ActionDef {
  id: ActionId;
  scope: Scope;
  label: string;
  default: string;
}

export const ACTIONS: readonly ActionDef[] = [
  { id: "prevFile", scope: "general", label: "Previous file", default: "ArrowLeft" },
  { id: "nextFile", scope: "general", label: "Next file", default: "ArrowRight" },
  { id: "playPause", scope: "video", label: "Play / pause", default: "Space" },
  { id: "seekBack", scope: "video", label: "Seek back", default: "q" },
  { id: "seekForward", scope: "video", label: "Seek forward", default: "e" },
  { id: "stepBack", scope: "video", label: "Step back", default: "," },
  { id: "stepForward", scope: "video", label: "Step forward", default: "." },
  { id: "mute", scope: "video", label: "Mute", default: "m" },
  { id: "fullscreen", scope: "video", label: "Fullscreen", default: "f" },
  { id: "trimIn", scope: "video", label: "Set trim start", default: "i" },
  { id: "trimOut", scope: "video", label: "Set trim end", default: "o" },
  { id: "exitTrim", scope: "video", label: "Leave trim", default: "Escape" },
  { id: "imageFit", scope: "image", label: "Fit to window", default: "f" },
  { id: "imageResetZoom", scope: "image", label: "Reset zoom", default: "0" },
  { id: "imageRotate", scope: "image", label: "Rotate", default: "r" },
  { id: "enterCollage", scope: "image", label: "Start a collage", default: "c" },
  { id: "pdfPrevPage", scope: "pdf", label: "Previous page", default: "ArrowUp" },
  { id: "pdfNextPage", scope: "pdf", label: "Next page", default: "ArrowDown" },
  { id: "pdfFirstPage", scope: "pdf", label: "First page", default: "Home" },
  { id: "pdfLastPage", scope: "pdf", label: "Last page", default: "End" },
  { id: "pdfFit", scope: "pdf", label: "Fit to window", default: "f" },
  { id: "pdfResetZoom", scope: "pdf", label: "Reset zoom", default: "0" },
  { id: "collageSave", scope: "collage", label: "Save", default: "ctrl+s" },
  { id: "collageSaveAs", scope: "collage", label: "Save as", default: "ctrl+shift+s" },
  { id: "collageLock", scope: "collage", label: "Lock aspect ratio", default: "l" },
  { id: "collageRotate", scope: "collage", label: "Rotate selected", default: "r" },
  { id: "collageRemove", scope: "collage", label: "Remove selected", default: "Delete" },
  { id: "collageDeselect", scope: "collage", label: "Deselect", default: "Escape" },
  { id: "collageFitAll", scope: "collage", label: "Fit everything", default: "f" },
  { id: "collageResetZoom", scope: "collage", label: "Reset zoom", default: "0" },
  { id: "collageExport", scope: "collage", label: "Export an area", default: "e" },
  { id: "collageMemory", scope: "collage", label: "Show memory use", default: "m" },
  { id: "collageExit", scope: "collage", label: "Leave collage", default: "c" },
];

export const KEYBIND_GROUPS: readonly { scope: Scope; label: string }[] = [
  { scope: "general", label: "General Keybinds" },
  { scope: "video", label: "Video Keybinds" },
  { scope: "image", label: "Image Keybinds" },
  { scope: "pdf", label: "PDF Keybinds" },
  { scope: "collage", label: "Collage Keybinds" },
];

export const SCOPE_SCREENS: Record<Scope, readonly Screen[]> = {
  general: ["video", "image", "pdf"],
  video: ["video"],
  image: ["image"],
  pdf: ["pdf"],
  collage: ["collage"],
};

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
const SEEK: readonly ActionId[] = ["seekBack", "seekForward"];
const STEP: readonly ActionId[] = ["stepBack", "stepForward"];

export function defaultKeybinds(): Keybinds {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, a.default])) as Keybinds;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function comboFromEvent(e: {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return (
    (e.ctrlKey || e.metaKey ? "ctrl+" : "") +
    (e.altKey ? "alt+" : "") +
    (e.shiftKey ? "shift+" : "") +
    key
  );
}

// the key part may itself be "+", so peel modifiers off the front only
function splitCombo(combo: string): { mods: string; key: string } {
  const mods = /^(?:ctrl\+)?(?:alt\+)?(?:shift\+)?/.exec(combo)![0];
  return { mods, key: combo.slice(mods.length) };
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Escape: "Esc",
};

export function formatCombo(combo: string): string {
  const { mods, key } = splitCombo(combo);
  const parts = mods
    .split("+")
    .filter(Boolean)
    .map((m) => m[0].toUpperCase() + m.slice(1));
  parts.push(KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key));
  return parts.join("+");
}

export function bindableCombo(id: ActionId, combo: string): string | null {
  const { mods, key } = splitCombo(combo);
  if (key === "Escape") return null;
  if (SEEK.includes(id)) return mods.replace("shift+", "") + key;
  return combo;
}

// seek actions also own their shift variant (shift doubles the skip)
function occupied(id: ActionId, combo: string): string[] {
  if (!SEEK.includes(id)) return [combo];
  const { mods, key } = splitCombo(combo);
  return [combo, mods.includes("shift+") ? combo : `${mods}shift+${key}`];
}

function sharesScreen(a: Scope, b: Scope): boolean {
  return SCOPE_SCREENS[a].some((s) => SCOPE_SCREENS[b].includes(s));
}

export function findConflict(binds: Keybinds, id: ActionId, combo: string): ActionId | null {
  const mine = occupied(id, combo);
  const scope = BY_ID.get(id)!.scope;
  for (const other of ACTIONS) {
    const bound = binds[other.id];
    if (other.id === id || bound === null || !sharesScreen(scope, other.scope)) continue;
    if (occupied(other.id, bound).some((c) => mine.includes(c))) return other.id;
  }
  return null;
}

export function actionHint(id: ActionId, skipStep: number): string | undefined {
  if (SEEK.includes(id)) return `${skipStep}s, hold Shift for ${skipStep * 2}s`;
  if (STEP.includes(id)) return "tap for one frame, hold for slow motion";
  return undefined;
}

// a combo comboFromEvent could have produced: ordered modifiers, then one key part
function isCanonical(combo: string): boolean {
  const { key } = splitCombo(combo);
  if (key === "" || MODIFIER_KEYS.has(key)) return false;
  if (key.length === 1) return key === key.toLowerCase();
  return !key.includes("+");
}

export function validateKeybinds(saved: unknown): Keybinds {
  const defaults = defaultKeybinds();
  if (typeof saved !== "object" || saved === null) return defaults;
  const src = saved as Record<string, unknown>;
  const out = Object.fromEntries(ACTIONS.map((a) => [a.id, null])) as Keybinds;
  for (const a of ACTIONS) {
    const v = src[a.id];
    const ok =
      v === null ||
      (typeof v === "string" && isCanonical(v) && (v === a.default || bindableCombo(a.id, v) === v));
    const candidate = ok ? (v as string | null) : a.default;
    if (candidate === null || !findConflict(out, a.id, candidate)) out[a.id] = candidate;
    else if (!findConflict(out, a.id, a.default)) out[a.id] = a.default;
  }
  return out;
}
