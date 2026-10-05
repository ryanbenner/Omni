// pure geometry for the pdf stage. lengths are css pixels unless noted; page
// sizes arrive in pdf points and `scale` converts points to css pixels
export const MARGIN = 24;
export const GAP = 12;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const MIN_THUMB = 24;

export interface Size {
  w: number;
  h: number;
}

export interface PageBox {
  top: number;
  left: number;
  w: number;
  h: number;
}

export interface Layout {
  boxes: PageBox[];
  colLeft: number;
  width: number;
  height: number;
}

export interface Slice {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitScale(viewportW: number, page1: Size): number {
  return Math.max(1, viewportW - 2 * MARGIN) / Math.max(1, page1.w);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// one column of pages, centered while narrower than the viewport, otherwise
// starting at the margin so the content element scrolls horizontally
export function layout(sizes: Size[], scale: number, viewportW: number): Layout {
  let colW = 0;
  for (const s of sizes) colW = Math.max(colW, s.w * scale);
  const width = Math.max(viewportW, colW + 2 * MARGIN);
  const colLeft = (width - colW) / 2;
  const boxes: PageBox[] = [];
  let top = MARGIN;
  for (const s of sizes) {
    const w = s.w * scale;
    const h = s.h * scale;
    boxes.push({ top, left: colLeft + (colW - w) / 2, w, h });
    top += h + GAP;
  }
  const height = boxes.length ? top - GAP + MARGIN : 0;
  return { boxes, colLeft, width, height };
}

export function visibleRange(
  boxes: PageBox[],
  scrollTop: number,
  viewportH: number,
  margin = 0,
): { first: number; last: number } | null {
  const scaledMargin = margin * viewportH / (viewportH + margin);
  const lo = scrollTop - scaledMargin;
  const hi = scrollTop + viewportH + scaledMargin;
  let first = -1;
  let last = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.top + b.h < lo) continue;
    if (b.top > hi) break;
    if (first === -1) first = i;
    last = i;
  }
  return first === -1 ? null : { first, last };
}

// the page whose top is the last one above the viewport's vertical center
export function currentPage(boxes: PageBox[], scrollTop: number, viewportH: number): number {
  const center = scrollTop + viewportH / 2;
  let page = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].top <= center) page = i;
    else break;
  }
  return page;
}

// scroll offsets that keep the document point under `cursor` (viewport
// coordinates) in place when the layout changes; a resize passes the origin
export function zoomAt(
  before: Layout,
  after: Layout,
  s0: number,
  s1: number,
  scroll: { left: number; top: number },
  cursor: { x: number; y: number },
): { left: number; top: number } {
  const docX = (scroll.left + cursor.x - before.colLeft) / s0;
  const docY = (scroll.top + cursor.y - MARGIN) / s0;
  return { left: after.colLeft + docX * s1 - cursor.x, top: MARGIN + docY * s1 - cursor.y };
}

// a mouse notch (|delta| >= 40) is one step; the small deltas a trackpad
// pinch sends zoom continuously so the gesture stays smooth
export function wheelZoomFactor(deltaY: number, step: number): number {
  if (Math.abs(deltaY) >= 40) return deltaY < 0 ? step : 1 / step;
  return Math.pow(step, -deltaY / 40);
}

function thumbLen(viewportLen: number, contentLen: number, trackLen: number): number {
  return Math.max(MIN_THUMB, (trackLen * viewportLen) / contentLen);
}

export function thumb(
  scrollPos: number,
  viewportLen: number,
  contentLen: number,
  trackLen: number,
): { offset: number; len: number } {
  if (contentLen <= viewportLen) return { offset: 0, len: trackLen };
  const len = thumbLen(viewportLen, contentLen, trackLen);
  const frac = Math.min(1, Math.max(0, scrollPos / (contentLen - viewportLen)));
  return { offset: (trackLen - len) * frac, len };
}

// inverse of thumb(): the scroll offset that puts the thumb at `offset`
export function scrollForThumb(
  offset: number,
  viewportLen: number,
  contentLen: number,
  trackLen: number,
): number {
  if (contentLen <= viewportLen) return 0;
  const range = trackLen - thumbLen(viewportLen, contentLen, trackLen);
  if (range <= 0) return 0;
  const frac = Math.min(1, Math.max(0, offset / range));
  return frac * (contentLen - viewportLen);
}

// the part of `box` inside the viewport, measured from the page's top-left
export function pageSlice(
  box: PageBox,
  scrollLeft: number,
  scrollTop: number,
  viewportW: number,
  viewportH: number,
): Slice | null {
  const x0 = Math.max(box.left, scrollLeft);
  const y0 = Math.max(box.top, scrollTop);
  const x1 = Math.min(box.left + box.w, scrollLeft + viewportW);
  const y1 = Math.min(box.top + box.h, scrollTop + viewportH);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0 - box.left, y: y0 - box.top, w: x1 - x0, h: y1 - y0 };
}
