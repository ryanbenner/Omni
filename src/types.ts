export type MediaKind = "video" | "image" | "collage";

export interface MediaItem {
  path: string;
  kind: MediaKind;
  name: string;
  mtime: number;
  size: number;
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
  | { type: "shuttleStart"; direction: 1 | -1 }
  | { type: "shuttleStop"; direction: 1 | -1 }
  | { type: "toggleMute" }
  | { type: "toggleFullscreen" }
  | { type: "rotate" }
  | { type: "resetZoom" }
  | { type: "fit" }
  | { type: "setIn" }
  | { type: "setOut" }
  | { type: "exitTrim" };

export type AppAction = { type: "prevFile" } | { type: "nextFile" };

export interface DriveInfo {
  path: string;
  name: string;
}

export interface FolderEntry {
  path: string;
  name: string;
}

export interface DirListing {
  folders: FolderEntry[];
  files: MediaItem[];
}

export interface Pin {
  path: string;
  name: string;
  count: number;
}
