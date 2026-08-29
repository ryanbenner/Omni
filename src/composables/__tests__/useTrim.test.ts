import { describe, it, expect } from "vitest";
import { useTrim, MIN_GAP, formatTimeTenths } from "../useTrim";

describe("useTrim", () => {
  it("enter keeps the whole clip and activates", () => {
    const t = useTrim();
    expect(t.active.value).toBe(false);
    t.enter(45);
    expect(t.active.value).toBe(true);
    expect(t.inSec.value).toBe(0);
    expect(t.outSec.value).toBe(45);
    expect(t.keptDuration.value).toBe(45);
  });

  it("setIn and setOut clamp to bounds and to each other with the min gap", () => {
    const t = useTrim();
    t.enter(10);
    t.setIn(-5);
    expect(t.inSec.value).toBe(0);
    t.setIn(4);
    t.setOut(20);
    expect(t.outSec.value).toBe(10);
    t.setOut(4.01); // closer than MIN_GAP to in=4
    expect(t.outSec.value).toBeCloseTo(4 + MIN_GAP, 5);
    t.setIn(9.99); // closer than MIN_GAP to out
    expect(t.inSec.value).toBeCloseTo(t.outSec.value - MIN_GAP, 5);
  });

  it("fromFraction maps 0..1 into clip seconds, clamped", () => {
    const t = useTrim();
    t.enter(20);
    expect(t.fromFraction(0.5)).toBe(10);
    expect(t.fromFraction(-0.2)).toBe(0);
    expect(t.fromFraction(1.4)).toBe(20);
  });

  it("exit deactivates without touching the range", () => {
    const t = useTrim();
    t.enter(10);
    t.setIn(2);
    t.exit();
    expect(t.active.value).toBe(false);
  });
});

describe("formatTimeTenths", () => {
  it("formats m:ss.t", () => {
    expect(formatTimeTenths(0)).toBe("0:00.0");
    expect(formatTimeTenths(65.27)).toBe("1:05.2");
    expect(formatTimeTenths(5.25)).toBe("0:05.2");
  });
  it("is nan-safe", () => {
    expect(formatTimeTenths(NaN)).toBe("0:00.0");
  });
});
