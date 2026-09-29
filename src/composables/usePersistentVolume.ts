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

  watch(
    () => [settings.video.volume, settings.video.muted] as const,
    ([v, m]) => {
      if (!on()) return;
      volume.value = v;
      muted.value = m;
    },
  );

  // turning it on captures what the user is hearing, not a stale stored value
  watch(
    () => settings.video.persistentVolume,
    (now) => {
      if (!now) return;
      settings.video.volume = volume.value;
      settings.video.muted = muted.value;
    },
  );
}
