import { describe, it, expect } from "vitest";
import { ancestorDirs, parentDir, displayLabel } from "../pathUtils";

describe("ancestorDirs", () => {
  it("walks windows paths from the drive root", () => {
    expect(ancestorDirs("C:\\Users\\ryan\\Videos\\clip.mp4")).toEqual([
      "C:\\",
      "C:\\Users",
      "C:\\Users\\ryan",
      "C:\\Users\\ryan\\Videos",
    ]);
  });

  it("walks unix paths from root", () => {
    expect(ancestorDirs("/Users/ben/Pictures/a.jpg")).toEqual([
      "/",
      "/Users",
      "/Users/ben",
      "/Users/ben/Pictures",
    ]);
  });
});

describe("parentDir", () => {
  it("returns the containing directory", () => {
    expect(parentDir("C:\\Users\\ryan\\clip.mp4")).toBe("C:\\Users\\ryan");
    expect(parentDir("/a/b/c.png")).toBe("/a/b");
  });
});

describe("displayLabel", () => {
  it("strips the game prefix before shadowplay-style dates on files", () => {
    expect(displayLabel("Valorant 2026.08.28 - 14.32.11.mp4", true)).toBe(
      "2026.08.28 - 14.32.11.mp4",
    );
  });
  it("leaves folders and non-dated names alone", () => {
    expect(displayLabel("Valorant", false)).toBe("Valorant");
    expect(displayLabel("bladerunner.jpg", true)).toBe("bladerunner.jpg");
  });
});
