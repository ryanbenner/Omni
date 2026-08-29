import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { DirListing, DriveInfo, Pin } from "../types";
import { ancestorDirs, displayLabel } from "./pathUtils";

export interface TreeRow {
  path: string;
  name: string;
  label: string;
  kind: "drive" | "folder" | "file";
  mediaKind?: "video" | "image";
  depth: number;
  guides: number;
  open: boolean;
  selected: boolean;
}

interface NodeState {
  open: boolean;
  loaded: boolean;
  listing: DirListing | null;
}

const PINS_KEY = "mv-pins";

function loadPins(): Pin[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Pin[]).map((p) => ({ ...p, count: p.count ?? 0 }));
  } catch {
    return [];
  }
}

function storePins(pins: Pin[]) {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // storage unavailable: pins just do not persist
  }
}

export function useFileTree(openFile: (path: string) => void) {
  const roots = ref<DriveInfo[]>([]);
  const nodes = ref(new Map<string, NodeState>());
  const currentPath = ref<string | null>(null);
  const pins = ref<Pin[]>([]);
  const version = ref(0); // bumped on any node mutation so rows recompute
  // when set, the tree shows only the pin's drive plus the pin as root
  const scope = ref<Pin | null>(null);

  // separator-aware containment so "C:\Users" does not match "C:\UsersX"
  function isWithin(child: string, parent: string): boolean {
    const c = child.toLowerCase();
    const p = parent.toLowerCase();
    if (c === p) return true;
    const sep = parent.includes("\\") ? "\\" : "/";
    return c.startsWith(p.endsWith(sep) ? p : p + sep);
  }

  function driveOf(path: string): DriveInfo | null {
    return roots.value.find((d) => isWithin(path, d.path)) ?? null;
  }

  function node(path: string): NodeState {
    let n = nodes.value.get(path);
    if (!n) {
      n = { open: false, loaded: false, listing: null };
      nodes.value.set(path, n);
    }
    return n;
  }

  async function load(path: string) {
    const n = node(path);
    if (n.loaded) return;
    try {
      n.listing = await invoke<DirListing>("read_dir_entries", { path });
    } catch {
      n.listing = { folders: [], files: [] };
    }
    n.loaded = true;
    version.value++;
  }

  async function init() {
    try {
      roots.value = await invoke<DriveInfo[]>("list_drives");
    } catch {
      roots.value = [];
    }
    pins.value = loadPins();
    for (const p of pins.value) refreshPinCount(p.path);
    version.value++;
  }

  async function toggle(path: string) {
    const n = node(path);
    if (!n.open) await load(path);
    n.open = !n.open;
    version.value++;
  }

  async function reveal(filePath: string) {
    const s = scope.value;
    if (s) {
      if (isWithin(filePath, s.path)) {
        // expand only within the scoped folder
        for (const dir of ancestorDirs(filePath)) {
          if (!isWithin(dir, s.path)) continue;
          const n = node(dir);
          if (!n.open) {
            await load(dir);
            n.open = true;
          }
        }
        version.value++;
        return;
      }
      // file lives outside the scoped folder: drop back to the full tree
      scope.value = null;
    }
    for (const dir of ancestorDirs(filePath)) {
      const n = node(dir);
      if (!n.open) {
        await load(dir);
        n.open = true;
      }
    }
    version.value++;
  }

  function setCurrent(path: string | null) {
    currentPath.value = path;
  }

  async function refreshPinCount(path: string) {
    try {
      const listing = await invoke<DirListing>("read_dir_entries", { path });
      const pin = pins.value.find((p) => p.path === path);
      if (pin) {
        pin.count = listing.files.length;
        storePins(pins.value);
      }
    } catch {
      // unreadable pin keeps its stale count
    }
  }

  async function addPin(path: string, name: string) {
    if (pins.value.some((p) => p.path === path)) return;
    pins.value.push({ path, name, count: 0 });
    storePins(pins.value);
    await refreshPinCount(path);
  }

  function removePin(path: string) {
    pins.value = pins.value.filter((p) => p.path !== path);
    storePins(pins.value);
  }

  function isPinned(path: string): boolean {
    return pins.value.some((p) => p.path === path);
  }

  async function pinClick(pin: Pin) {
    // reclicking the active pin closes the scoped view
    if (scope.value?.path === pin.path) {
      clearScope();
      return;
    }
    // scope the tree to the pin: its drive on top, the pin as expanded root
    scope.value = pin;
    await load(pin.path);
    node(pin.path).open = true;
    refreshPinCount(pin.path);
    version.value++;
  }

  function clearScope() {
    scope.value = null;
    version.value++;
  }

  // re-read a directory after a file was deleted or renamed inside it
  async function refresh(dirPath: string) {
    const n = nodes.value.get(dirPath);
    if (n) {
      n.loaded = false;
      n.listing = null;
      if (n.open) await load(dirPath);
    }
    if (isPinned(dirPath)) refreshPinCount(dirPath);
    version.value++;
  }

  function walk(path: string, name: string, kind: "drive" | "folder", depth: number, out: TreeRow[]) {
    const n = node(path);
    out.push({
      path,
      name,
      label: name,
      kind,
      depth,
      guides: depth,
      open: n.open,
      selected: false,
    });
    if (!n.open || !n.listing) return;
    for (const f of n.listing.folders) {
      walk(f.path, f.name, "folder", depth + 1, out);
    }
    for (const file of n.listing.files) {
      out.push({
        path: file.path,
        name: file.name,
        label: displayLabel(file.name, true),
        kind: "file",
        mediaKind: file.kind,
        depth: depth + 1,
        guides: depth,
        open: false,
        selected: file.path === currentPath.value,
      });
    }
  }

  const rows = computed<TreeRow[]>(() => {
    void version.value;
    void currentPath.value;
    const out: TreeRow[] = [];
    const s = scope.value;
    if (s) {
      const drive = driveOf(s.path);
      if (drive) {
        // collapsed drive row doubles as the way back to the full tree
        out.push({
          path: drive.path,
          name: drive.name,
          label: drive.name,
          kind: "drive",
          depth: 0,
          guides: 0,
          open: false,
          selected: false,
        });
      }
      walk(s.path, s.name, "folder", drive ? 1 : 0, out);
      return out;
    }
    for (const d of roots.value) walk(d.path, d.name, "drive", 0, out);
    return out;
  });

  return {
    rows,
    pins,
    scope,
    init,
    toggle,
    reveal,
    setCurrent,
    addPin,
    removePin,
    isPinned,
    pinClick,
    clearScope,
    refresh,
    openFile,
  };
}
