import { computed, ref } from "vue";

export const MIN_GAP = 0.1;

export function formatTimeTenths(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const tenths = Math.floor((rest - whole) * 10);
  return `${m}:${whole.toString().padStart(2, "0")}.${tenths}`;
}

export function useTrim() {
  const active = ref(false);
  const inSec = ref(0);
  const outSec = ref(0);
  const duration = ref(0);

  function enter(dur: number) {
    duration.value = dur;
    inSec.value = 0;
    outSec.value = dur;
    active.value = true;
  }

  function exit() {
    active.value = false;
  }

  function setIn(t: number) {
    const max = Math.max(0, outSec.value - MIN_GAP);
    inSec.value = Math.min(Math.max(0, t), max);
  }

  function setOut(t: number) {
    const min = Math.min(duration.value, inSec.value + MIN_GAP);
    outSec.value = Math.max(Math.min(duration.value, t), min);
  }

  function fromFraction(f: number): number {
    return Math.min(1, Math.max(0, f)) * duration.value;
  }

  const keptDuration = computed(() => outSec.value - inSec.value);

  return { active, inSec, outSec, duration, keptDuration, enter, exit, setIn, setOut, fromFraction };
}
