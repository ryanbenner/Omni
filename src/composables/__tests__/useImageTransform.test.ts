import { describe, it, expect } from "vitest";
import { useImageTransform } from "../useImageTransform";

describe("useImageTransform", () => {
  it("starts at fit baseline", () => {
    const t = useImageTransform();
    expect(t.scale.value).toBe(1);
    expect(t.x.value).toBe(0);
    expect(t.y.value).toBe(0);
    expect(t.rotation.value).toBe(0);
  });

  it("zoomBy multiplies and clamps scale", () => {
    const t = useImageTransform();
    t.zoomBy(2);
    expect(t.scale.value).toBe(2);
    t.zoomBy(100);
    expect(t.scale.value).toBe(10);
    t.zoomBy(0.0001);
    expect(t.scale.value).toBe(0.1);
  });

  it("panBy accumulates offsets", () => {
    const t = useImageTransform();
    t.panBy(10, -5);
    t.panBy(2, 3);
    expect(t.x.value).toBe(12);
    expect(t.y.value).toBe(-2);
  });

  it("rotate steps 90 degrees and wraps", () => {
    const t = useImageTransform();
    t.rotate();
    expect(t.rotation.value).toBe(90);
    t.rotate();
    t.rotate();
    t.rotate();
    expect(t.rotation.value).toBe(0);
  });

  it("reset restores zoom and pan but keeps rotation", () => {
    const t = useImageTransform();
    t.zoomBy(3);
    t.panBy(50, 50);
    t.rotate();
    t.reset();
    expect(t.scale.value).toBe(1);
    expect(t.x.value).toBe(0);
    expect(t.y.value).toBe(0);
    expect(t.rotation.value).toBe(90);
  });

  it("style contains the combined transform", () => {
    const t = useImageTransform();
    t.zoomBy(2);
    t.panBy(10, 20);
    t.rotate();
    expect(t.style.value.transform).toBe(
      "translate(10px, 20px) scale(2) rotate(90deg)",
    );
  });
});
