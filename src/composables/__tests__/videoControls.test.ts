import { describe, it, expect } from "vitest";
import { SPEEDS, nextSpeed, clampTime, formatTime } from "../videoControls";

describe("nextSpeed", () => {
  it("cycles up and down through the spec speeds", () => {
    expect(SPEEDS).toEqual([0.25, 0.5, 1, 1.5, 2]);
    expect(nextSpeed(1, 1)).toBe(1.5);
    expect(nextSpeed(1.5, 1)).toBe(2);
    expect(nextSpeed(1, -1)).toBe(0.5);
  });

  it("clamps at both ends", () => {
    expect(nextSpeed(2, 1)).toBe(2);
    expect(nextSpeed(0.25, -1)).toBe(0.25);
  });

  it("recovers from an unknown current speed", () => {
    expect(nextSpeed(1.25 as number, 1)).toBe(1.5);
    expect(nextSpeed(1.25 as number, -1)).toBe(0.5);
  });
});

describe("clampTime", () => {
  it("clamps into [0, duration]", () => {
    expect(clampTime(-3, 100)).toBe(0);
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(120, 100)).toBe(100);
  });

  it("treats NaN duration as 0", () => {
    expect(clampTime(5, NaN)).toBe(0);
  });
});

describe("formatTime", () => {
  it("formats m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });

  it("is nan-safe", () => {
    expect(formatTime(NaN)).toBe("0:00");
  });
});
