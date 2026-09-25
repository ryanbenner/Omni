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
  | { type: "exitTrim" }
  // collage wall
  | { type: "toggleLock" }
  | { type: "removeSelected" }
  | { type: "deselect" }
  | { type: "fitAll" }
  | { type: "exportArea" }
  | { type: "save" }
  | { type: "saveAs" }
  | { type: "toggleMemory" }
  | { type: "exitCollage" };

export type StageKind = "video" | "image" | "collage";

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

export type ExportFormat = "png" | "jpg";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// a picture placed on the wall. x/y/w/h are the footprint in wall pixels
// after rotation; nw/nh are the file's natural pixel size
export interface CollageItem {
  id: string;
  kind: "image";
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nw: number;
  nh: number;
  rotation: 0 | 90 | 180 | 270;
  z: number;
  thumb?: string;
}

export interface CollageDoc {
  version: 1;
  items: CollageItem[];
  view: { x: number; y: number; zoom: number };
  lockAspect: boolean;
  exportFormat: ExportFormat;
}
