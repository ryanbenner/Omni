import { describe, it, expect } from "vitest";
import { clampTime, cycleSpeed, formatTime, SPEEDS } from "../videoControls";

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

describe("cycleSpeed", () => {
  it("advances through the speed table and wraps", () => {
    expect(SPEEDS).toEqual([0.25, 0.5, 1, 1.5, 2]);
    expect(cycleSpeed(0.25)).toBe(0.5);
    expect(cycleSpeed(1)).toBe(1.5);
    expect(cycleSpeed(2)).toBe(0.25);
  });
  it("recovers from an unknown speed", () => {
    expect(cycleSpeed(0.1)).toBe(1);
  });
});
