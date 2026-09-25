import { computed, ref } from "vue";
import type { Rect } from "../types";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.1;

// screen = wall * zoom + offset; screen coordinates are relative to the
// wall container's top-left corner
export function useWallView() {
  const x = ref(0);
  const y = ref(0);
  const zoom = ref(1);

  const style = computed(() => ({
    transform: `translate(${x.value}px, ${y.value}px) scale(${zoom.value})`,
  }));

  function toWall(sx: number, sy: number) {
    return { x: (sx - x.value) / zoom.value, y: (sy - y.value) / zoom.value };
  }

  function toScreen(wx: number, wy: number) {
    return { x: wx * zoom.value + x.value, y: wy * zoom.value + y.value };
  }

  function panBy(dx: number, dy: number) {
    x.value += dx;
    y.value += dy;
  }

  function zoomAt(factor: number, sx: number, sy: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor));
    const w = toWall(sx, sy);
    zoom.value = next;
    // move the offset so the same wall point sits under the cursor again
    x.value = sx - w.x * next;
    y.value = sy - w.y * next;
  }

  function set(view: { x: number; y: number; zoom: number }) {
    x.value = view.x;
    y.value = view.y;
    zoom.value = view.zoom;
  }

  function get() {
    return { x: x.value, y: y.value, zoom: zoom.value };
  }

  function visibleRect(viewport: { w: number; h: number }, marginFactor = 0): Rect {
    const tl = toWall(0, 0);
    const w = viewport.w / zoom.value;
    const h = viewport.h / zoom.value;
    return {
      x: tl.x - w * marginFactor,
      y: tl.y - h * marginFactor,
      w: w * (1 + 2 * marginFactor),
      h: h * (1 + 2 * marginFactor),
    };
  }

  function fitAll(rects: Rect[], viewport: { w: number; h: number }, padding = 40) {
    if (rects.length === 0) {
      set({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);
    const z = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((viewport.w - 2 * padding) / gw, (viewport.h - 2 * padding) / gh)),
    );
    zoom.value = z;
    x.value = (viewport.w - gw * z) / 2 - minX * z;
    y.value = (viewport.h - gh * z) / 2 - minY * z;
  }

  function centerOn(rect: Rect, viewport: { w: number; h: number }) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    x.value = viewport.w / 2 - cx * zoom.value;
    y.value = viewport.h / 2 - cy * zoom.value;
  }

  return { x, y, zoom, style, toWall, toScreen, panBy, zoomAt, set, get, visibleRect, fitAll, centerOn };
}
