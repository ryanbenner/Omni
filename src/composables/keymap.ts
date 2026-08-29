import type { AppAction, ViewerAction } from "../types";

export type Command =
  | { target: "app"; action: AppAction }
  | { target: "viewer"; action: ViewerAction; fallback?: AppAction };

type KeyInput = { key: string; shiftKey: boolean };

export function resolveKey(
  e: KeyInput,
  kind: "video" | "image" | null,
): Command | null {
  if (kind === null) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  // both kinds
  if (key === "PageUp") return { target: "app", action: { type: "prevFile" } };
  if (key === "PageDown") return { target: "app", action: { type: "nextFile" } };

  if (kind === "image") {
    switch (key) {
      case "ArrowLeft":
        return { target: "app", action: { type: "prevFile" } };
      case "ArrowRight":
        return { target: "app", action: { type: "nextFile" } };
      case "f":
        return { target: "viewer", action: { type: "fit" } };
      case "0":
        return { target: "viewer", action: { type: "resetZoom" } };
      case "r":
        return { target: "viewer", action: { type: "rotate" } };
    }
    return null;
  }

  // video
  const step = e.shiftKey ? 10 : 5;
  switch (key) {
    case "ArrowLeft":
      return {
        target: "viewer",
        action: { type: "seek", seconds: -step },
        fallback: { type: "prevFile" },
      };
    case "ArrowRight":
      return {
        target: "viewer",
        action: { type: "seek", seconds: step },
        fallback: { type: "nextFile" },
      };
    case " ":
      return { target: "viewer", action: { type: "playPause" } };
    case ",":
      return { target: "viewer", action: { type: "frameStep", frames: -1 } };
    case ".":
      return { target: "viewer", action: { type: "frameStep", frames: 1 } };
    case "<":
      return { target: "viewer", action: { type: "shuttleStart", direction: -1 } };
    case ">":
      return { target: "viewer", action: { type: "shuttleStart", direction: 1 } };
    case "m":
      return { target: "viewer", action: { type: "toggleMute" } };
    case "f":
      return { target: "viewer", action: { type: "toggleFullscreen" } };
    case "i":
      return { target: "viewer", action: { type: "setIn" } };
    case "o":
      return { target: "viewer", action: { type: "setOut" } };
    case "Escape":
      return { target: "viewer", action: { type: "exitTrim" } };
  }
  return null;
}

// keyup matters only for hold-to-shuttle: releasing < or > ends the shuttle
export function resolveKeyUp(
  e: KeyInput,
  kind: "video" | "image" | null,
): Command | null {
  if (kind !== "video") return null;
  switch (e.key) {
    case "<":
      return { target: "viewer", action: { type: "shuttleStop", direction: -1 } };
    case ">":
      return { target: "viewer", action: { type: "shuttleStop", direction: 1 } };
  }
  return null;
}
