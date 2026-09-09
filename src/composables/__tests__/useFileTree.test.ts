import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useFileTree } from "../useFileTree";
import type { DirListing, DriveInfo } from "../../types";

const drives: DriveInfo[] = [{ path: "C:\\", name: "C:" }];
const rootListing: DirListing = {
  folders: [{ path: "C:\\Users", name: "Users" }],
  files: [],
};
const usersListing: DirListing = {
  folders: [],
  files: [{ path: "C:\\Users\\pic.jpg", kind: "image", name: "pic.jpg", mtime: 1, size: 0 }],
};
const gamesListing: DirListing = {
  folders: [],
  files: [{ path: "C:\\Games\\v.mp4", kind: "video", name: "v.mp4", mtime: 2, size: 0 }],
};

function wire() {
  invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
    if (cmd === "list_drives") return Promise.resolve(drives);
    if (cmd === "read_dir_entries") {
      if (args?.path === "C:\\") return Promise.resolve(rootListing);
      if (args?.path === "C:\\Users") return Promise.resolve(usersListing);
      if (args?.path === "C:\\Games") return Promise.resolve(gamesListing);
    }
    return Promise.reject(`unexpected ${cmd} ${args?.path}`);
  });
}

describe("useFileTree", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    wire();
  });

  it("init loads drives as closed roots", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    expect(tree.rows.value).toHaveLength(1);
    expect(tree.rows.value[0]).toMatchObject({
      path: "C:\\",
      kind: "drive",
      depth: 0,
      open: false,
    });
  });

  it("toggle expands lazily and flattens children with depth", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.toggle("C:\\");
    expect(tree.rows.value.map((r) => r.path)).toEqual(["C:\\", "C:\\Users"]);
    expect(tree.rows.value[1].depth).toBe(1);
    await tree.toggle("C:\\Users");
    expect(tree.rows.value.map((r) => r.path)).toEqual([
      "C:\\",
      "C:\\Users",
      "C:\\Users\\pic.jpg",
    ]);
    await tree.toggle("C:\\"); // collapse hides descendants
    expect(tree.rows.value).toHaveLength(1);
  });

  it("file rows open the file and reflect selection", async () => {
    const opened: string[] = [];
    const tree = useFileTree((p) => opened.push(p));
    await tree.init();
    await tree.toggle("C:\\");
    await tree.toggle("C:\\Users");
    const file = tree.rows.value[2];
    expect(file.kind).toBe("file");
    tree.setCurrent("C:\\Users\\pic.jpg");
    expect(tree.rows.value[2].selected).toBe(true);
  });

  it("reveal expands the ancestor chain of a file", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.reveal("C:\\Users\\pic.jpg");
    expect(tree.rows.value.map((r) => r.path)).toEqual([
      "C:\\",
      "C:\\Users",
      "C:\\Users\\pic.jpg",
    ]);
  });

  it("pins persist to localStorage and carry counts", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.addPin("C:\\Users", "Users");
    expect(tree.pins.value).toEqual([{ path: "C:\\Users", name: "Users", count: 1 }]);
    expect(tree.isPinned("C:\\Users")).toBe(true);
    const tree2 = useFileTree(() => {});
    await tree2.init();
    expect(tree2.pins.value[0].path).toBe("C:\\Users");
    tree2.removePin("C:\\Users");
    expect(tree2.pins.value).toHaveLength(0);
  });

  it("pinClick scopes the tree to drive plus pinned folder, skipping ancestors", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.addPin("C:\\Users", "Users");
    await tree.pinClick(tree.pins.value[0]);
    expect(tree.rows.value).toEqual([
      expect.objectContaining({ path: "C:\\", kind: "drive", depth: 0, open: false }),
      expect.objectContaining({ path: "C:\\Users", kind: "folder", depth: 1, open: true }),
      expect.objectContaining({ path: "C:\\Users\\pic.jpg", kind: "file", depth: 2 }),
    ]);
    expect(tree.scope.value?.path).toBe("C:\\Users");
    expect(tree.pins.value[0].count).toBe(1);
  });

  it("clearScope returns to the full tree, collapsed by the pin entry", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.toggle("C:\\"); // expand drive in full view first
    await tree.addPin("C:\\Users", "Users");
    await tree.pinClick(tree.pins.value[0]); // entering a pin collapses prior state
    tree.clearScope();
    expect(tree.scope.value).toBeNull();
    expect(tree.rows.value.map((r) => r.path)).toEqual(["C:\\"]);
  });

  it("reclicking the same pin collapses everything cleanly", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.toggle("C:\\"); // leftover full-view expansion
    await tree.addPin("C:\\Users", "Users");
    await tree.pinClick(tree.pins.value[0]);
    expect(tree.scope.value?.path).toBe("C:\\Users");
    await tree.pinClick(tree.pins.value[0]);
    expect(tree.scope.value).toBeNull();
    // nothing left open anywhere: just the collapsed drive root
    expect(tree.rows.value).toEqual([
      expect.objectContaining({ path: "C:\\", kind: "drive", open: false }),
    ]);
  });

  it("switching pins swaps the scope and starts clean", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.addPin("C:\\Users", "Users");
    await tree.addPin("C:\\Games", "Games");
    await tree.pinClick(tree.pins.value[0]);
    await tree.pinClick(tree.pins.value[1]);
    expect(tree.scope.value?.path).toBe("C:\\Games");
    expect(tree.rows.value.map((r) => r.path)).toEqual([
      "C:\\",
      "C:\\Games",
      "C:\\Games\\v.mp4",
    ]);
    // toggling back to the first pin shows it fresh, not doubled up
    await tree.pinClick(tree.pins.value[0]);
    expect(tree.rows.value.map((r) => r.path)).toEqual([
      "C:\\",
      "C:\\Users",
      "C:\\Users\\pic.jpg",
    ]);
  });

  it("reveal inside the scope keeps it; reveal outside clears it", async () => {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.addPin("C:\\Users", "Users");
    await tree.pinClick(tree.pins.value[0]);
    await tree.reveal("C:\\Users\\pic.jpg");
    expect(tree.scope.value?.path).toBe("C:\\Users");
    await tree.reveal("C:\\stray.mp4"); // outside the pinned folder
    expect(tree.scope.value).toBeNull();
    expect(tree.rows.value[0]).toMatchObject({ path: "C:\\", kind: "drive" });
  });
});

describe("movePin", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    wire();
  });

  async function threePins() {
    const tree = useFileTree(() => {});
    await tree.init();
    await tree.addPin("C:\\Users", "Users");
    await tree.addPin("C:\\Games", "Games");
    await tree.addPin("C:\\", "C:");
    return tree;
  }

  it("moves a pin down to an insertion slot and persists", async () => {
    const tree = await threePins();
    tree.movePin(0, 3); // drop after the last row
    expect(tree.pins.value.map((p) => p.name)).toEqual(["Games", "C:", "Users"]);
    const tree2 = useFileTree(() => {});
    await tree2.init();
    expect(tree2.pins.value.map((p) => p.name)).toEqual(["Games", "C:", "Users"]);
  });

  it("moves a pin up", async () => {
    const tree = await threePins();
    tree.movePin(2, 0);
    expect(tree.pins.value.map((p) => p.name)).toEqual(["C:", "Users", "Games"]);
  });

  it("dropping on either side of the dragged row is a no-op", async () => {
    const tree = await threePins();
    tree.movePin(1, 1);
    tree.movePin(1, 2);
    expect(tree.pins.value.map((p) => p.name)).toEqual(["Users", "Games", "C:"]);
  });
});
