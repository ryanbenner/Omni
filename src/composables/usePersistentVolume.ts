import { watch, type Ref } from "vue";
import { settings } from "./settings";

// keeps a player's volume and mute in step with the store while the persistent
// volume setting is on; off, the refs belong to the player alone
export function usePersistentVolume(volume: Ref<number>, muted: Ref<boolean>) {
  const on = () => settings.video.persistentVolume;

  if (on()) {
    volume.value = settings.video.volume;
    muted.value = settings.video.muted;
  }

  watch([volume, muted], ([v, m]) => {
    if (!on()) return;
    settings.video.volume = v;
    settings.video.muted = m;
  });

  // store -> player while on. turning the setting on normally captures what the
  // player is doing, but a volume applied in the same flush (settings apply) wins
  watch(
    () => [settings.video.persistentVolume, settings.video.volume, settings.video.muted] as const,
    ([on, v, m], [wasOn, prevV, prevM]) => {
      if (!on) return;
      if (!wasOn && v === prevV && m === prevM) {
        settings.video.volume = volume.value;
        settings.video.muted = muted.value;
        return;
      }
      volume.value = v;
      muted.value = m;
    },
  );
}
