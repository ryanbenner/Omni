<script setup lang="ts">
import { computed } from "vue";
import { settings } from "../../composables/settings";
import { SPEEDS } from "../../composables/videoControls";
import SettingRow from "./SettingRow.vue";
import SettingToggle from "./SettingToggle.vue";
import SettingSelect from "./SettingSelect.vue";
import SettingNumber from "./SettingNumber.vue";

const speedOptions = SPEEDS.map((s) => ({ value: s, label: `${s}x` }));

const volumePct = computed({
  get: () => Math.round(settings.video.volume * 100),
  set: (v: number) => (settings.video.volume = v / 100),
});
</script>

<template>
  <SettingRow label="Default playback speed">
    <SettingSelect v-model="settings.video.defaultSpeed" :options="speedOptions" />
  </SettingRow>
  <SettingRow label="Persistent volume" description="Keep volume and mute between launches.">
    <SettingToggle v-model="settings.video.persistentVolume" />
  </SettingRow>
  <SettingRow v-if="settings.video.persistentVolume" label="Volume" indent>
    <input v-model.number="volumePct" class="volume-slider" type="range" min="0" max="100" step="1" />
  </SettingRow>
  <SettingRow label="Clip export size cap" description="Discord-mode clips target this size.">
    <SettingNumber v-model="settings.video.clipCapMb" range="video.clipCapMb" unit="MB" />
  </SettingRow>
</template>

<style scoped>
.volume-slider {
  width: 140px;
}
.volume-slider:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
