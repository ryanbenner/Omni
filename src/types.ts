export interface MediaItem {
  path: string;
  kind: "video" | "image";
  name: string;
  mtime: number;
}

export interface ScanResult {
  items: MediaItem[];
  startIndex: number;
}

// actions a viewer component may handle; handleAction returns false when
// the action does not apply so the app can fall back (e.g. arrow -> next file)
export type ViewerAction =
  | { type: "playPause" }
  | { type: "seek"; seconds: number }
  | { type: "frameStep"; frames: number }
  | { type: "cycleSpeed"; direction: 1 | -1 }
  | { type: "toggleMute" }
  | { type: "toggleFullscreen" }
  | { type: "rotate" }
  | { type: "resetZoom" }
  | { type: "fit" };

export type AppAction = { type: "prevFile" } | { type: "nextFile" };
