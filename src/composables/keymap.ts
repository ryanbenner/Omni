import type { ActionId } from "./keybinds";
import { ACTIONS, SCOPE_SCREENS, comboFromEvent, formatCombo } from "./keybinds";
import type { AppAction, StageKind, ViewerAction } from "../types";
import { settings } from "./settings";

export type Command =
  | { target: "app"; action: AppAction }
  | { target: "viewer"; action: ViewerAction };

export type KeyInput = {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

const VIEWER_ACTIONS: Partial<Record<ActionId, ViewerAction>> = {
  stepBack: { type: "stepStart", direction: -1 },
  stepForward: { type: "stepStart", direction: 1 },
  playPause: { type: "playPause" },
  mute: { type: "toggleMute" },
  fullscreen: { type: "toggleFullscreen" },
  trimIn: { type: "setIn" },
  trimOut: { type: "setOut" },
  exitTrim: { type: "exitTrim" },
  imageFit: { type: "fit" },
  pdfFit: { type: "fit" },
  imageResetZoom: { type: "resetZoom" },
  pdfResetZoom: { type: "resetZoom" },
  collageResetZoom: { type: "resetZoom" },
  imageRotate: { type: "rotate" },
  collageRotate: { type: "rotate" },
  enterCollage: { type: "enterCollage" },
  pdfPrevPage: { type: "pageStep", pages: -1 },
  pdfNextPage: { type: "pageStep", pages: 1 },
  pdfFirstPage: { type: "pageJump", to: "first" },
  pdfLastPage: { type: "pageJump", to: "last" },
  collageSave: { type: "save" },
  collageSaveAs: { type: "saveAs" },
  collageLock: { type: "toggleLock" },
  collageRemove: { type: "removeSelected" },
  collageDeselect: { type: "deselect" },
  collageFitAll: { type: "fitAll" },
  collageExport: { type: "exportArea" },
  collageMemory: { type: "toggleMemory" },
  collageExit: { type: "exitCollage" },
};

function findAction(combo: string, kind: StageKind, only?: readonly ActionId[]) {
  return ACTIONS.find(
    (a) =>
      (!only || only.includes(a.id)) &&
      SCOPE_SCREENS[a.scope].includes(kind) &&
      settings.keybinds[a.id] === combo,
  )?.id;
}

function seek(id: ActionId, doubled: boolean): Command {
  const seconds = settings.video.skipStep * (doubled ? 2 : 1);
  return {
    target: "viewer",
    action: { type: "seek", seconds: id === "seekBack" ? -seconds : seconds },
  };
}

export function resolveKey(e: KeyInput, kind: StageKind | null): Command | null {
  if (kind === null) return null;
  const combo = comboFromEvent(e);
  if (combo === null) return null;

  const id = findAction(combo, kind);
  if (id === "seekBack" || id === "seekForward") return seek(id, false);
  if (id === "prevFile" || id === "nextFile") return { target: "app", action: { type: id } };
  if (id) {
    const action = VIEWER_ACTIONS[id];
    return action ? { target: "viewer", action } : null;
  }

  // shift doubles the skip, so strip it and match the seek binds only
  if (kind === "video" && combo.includes("shift+")) {
    const seekId = findAction(combo.replace("shift+", ""), kind, ["seekBack", "seekForward"]);
    if (seekId) return seek(seekId, true);
  }
  return null;
}

export function keyHint(id: ActionId): string {
  const combo = settings.keybinds[id];
  return combo ? ` (${formatCombo(combo)})` : "";
}
