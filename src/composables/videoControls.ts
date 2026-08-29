export const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export function clampTime(t: number, duration: number): number {
  const d = Number.isFinite(duration) ? duration : 0;
  return Math.min(d, Math.max(0, t));
}

export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, "0")}`;
}
