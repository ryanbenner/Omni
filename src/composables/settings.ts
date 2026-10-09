import { reactive, watch, type WatchStopHandle } from "vue";
import { SPEEDS } from "./videoControls";

export type ZoomStep = "fine" | "normal" | "coarse";
export const ZOOM_STEP_NAMES: readonly ZoomStep[] = ["fine", "normal", "coarse"];

export type ReopenMode = "off" | "folder" | "file";
export const REOPEN_MODES: readonly ReopenMode[] = ["off", "folder", "file"];

export interface Settings {
  general: {
    sidebarAtLaunch: boolean;
    offerResume: boolean;
    wrapAround: boolean;
    showHidden: boolean;
    reopen: ReopenMode;
    confirmDelete: boolean;
    openPinFirst: boolean;
  };
  video: {
    defaultSpeed: number; // member of SPEEDS
    persistentVolume: boolean;
    volume: number; // 0..1
    muted: boolean;
    clipCapMb: number;
  };
  image: { zoomStep: ZoomStep };
  collage: { memoryCapGb: number; jpgQuality: number };
}

// every default is the value the code hardcoded before settings existed,
// except offerResume, which starts off
export const DEFAULTS: Settings = {
  general: {
    sidebarAtLaunch: true,
    offerResume: false,
    wrapAround: false,
    showHidden: false,
    reopen: "off",
    confirmDelete: true,
    openPinFirst: false,
  },
  video: { defaultSpeed: 1, persistentVolume: false, volume: 1, muted: false, clipCapMb: 50 },
  image: { zoomStep: "normal" },
  collage: { memoryCapGb: 6, jpgQuality: 92 },
};

// integer fields shown as number inputs; the loader and SettingNumber both read this
export const RANGES = {
  "video.clipCapMb": { min: 1, max: 500 },
  "collage.memoryCapGb": { min: 1, max: 32 },
  "collage.jpgQuality": { min: 50, max: 100 },
} as const;
export type RangeKey = keyof typeof RANGES;

const KEY = "mv-settings";

export const settings: Settings = reactive(structuredClone(DEFAULTS));

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

function inRange(v: unknown, key: RangeKey): v is number {
  const r = RANGES[key];
  return Number.isInteger(v) && (v as number) >= r.min && (v as number) <= r.max;
}

function section(saved: Record<string, unknown>, name: string): Record<string, unknown> {
  const v = saved[name];
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

// each field accepts only a well-typed, in-range value; anything else keeps its default
function apply(saved: unknown) {
  if (typeof saved !== "object" || saved === null) return;
  const s = saved as Record<string, unknown>;
  const g = section(s, "general");
  const v = section(s, "video");
  const i = section(s, "image");
  const c = section(s, "collage");
  if (isBool(g.sidebarAtLaunch)) settings.general.sidebarAtLaunch = g.sidebarAtLaunch;
  if (isBool(g.offerResume)) settings.general.offerResume = g.offerResume;
  if (isBool(g.wrapAround)) settings.general.wrapAround = g.wrapAround;
  if (isBool(g.showHidden)) settings.general.showHidden = g.showHidden;
  if (typeof g.reopen === "string" && REOPEN_MODES.includes(g.reopen as ReopenMode)) {
    settings.general.reopen = g.reopen as ReopenMode;
  }
  if (isBool(g.confirmDelete)) settings.general.confirmDelete = g.confirmDelete;
  if (isBool(g.openPinFirst)) settings.general.openPinFirst = g.openPinFirst;
  if (typeof v.defaultSpeed === "number" && SPEEDS.includes(v.defaultSpeed)) {
    settings.video.defaultSpeed = v.defaultSpeed;
  }
  if (isBool(v.persistentVolume)) settings.video.persistentVolume = v.persistentVolume;
  if (typeof v.volume === "number" && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1) {
    settings.video.volume = v.volume;
  }
  if (isBool(v.muted)) settings.video.muted = v.muted;
  if (inRange(v.clipCapMb, "video.clipCapMb")) settings.video.clipCapMb = v.clipCapMb;
  if (typeof i.zoomStep === "string" && ZOOM_STEP_NAMES.includes(i.zoomStep as ZoomStep)) {
    settings.image.zoomStep = i.zoomStep as ZoomStep;
  }
  if (inRange(c.memoryCapGb, "collage.memoryCapGb")) settings.collage.memoryCapGb = c.memoryCapGb;
  if (inRange(c.jpgQuality, "collage.jpgQuality")) settings.collage.jpgQuality = c.jpgQuality;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: settings just do not persist
  }
}

let stopSaving: WatchStopHandle | null = null;

// resets to defaults, applies the save, then starts persisting; the watch is
// registered last so loading never writes
export function loadSettings() {
  stopSaving?.();
  Object.assign(settings, structuredClone(DEFAULTS));
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) apply(JSON.parse(raw));
  } catch {
    // unreadable save: defaults
  }
  stopSaving = watch(settings, save, { deep: true });
}
