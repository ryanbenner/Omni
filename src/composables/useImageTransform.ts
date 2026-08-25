import { computed, ref } from "vue";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export function useImageTransform() {
  const scale = ref(1);
  const x = ref(0);
  const y = ref(0);
  const rotation = ref(0);

  function zoomBy(factor: number) {
    scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
  }

  function panBy(dx: number, dy: number) {
    x.value += dx;
    y.value += dy;
  }

  function rotate() {
    rotation.value = (rotation.value + 90) % 360;
  }

  function reset() {
    scale.value = 1;
    x.value = 0;
    y.value = 0;
  }

  const style = computed(() => ({
    transform: `translate(${x.value}px, ${y.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  }));

  return { scale, x, y, rotation, style, zoomBy, panBy, rotate, reset };
}
