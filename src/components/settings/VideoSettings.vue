<script setup lang="ts">
import { computed } from "vue";
import { draft } from "../../composables/settingsDraft";
import { SPEEDS } from "../../composables/videoControls";
import SettingRow from "./SettingRow.vue";
import SettingToggle from "./SettingToggle.vue";
import SettingSelect from "./SettingSelect.vue";
import SettingNumber from "./SettingNumber.vue";

const speedOptions = SPEEDS.map((s) => ({ value: s, label: `${s}x` }));

const volumePct = computed({
  get: () => Math.round(draft.video.volume * 100),
  set: (v: number) => (draft.video.volume = v / 100),
});
</script>

<template>
  <SettingRow label="Default playback speed">
    <SettingSelect v-model="draft.video.defaultSpeed" :options="speedOptions" />
  </SettingRow>
  <SettingRow label="Persistent volume" description="Keep volume and mute between launches.">
    <SettingToggle v-model="draft.video.persistentVolume" />
  </SettingRow>
  <SettingRow v-if="draft.video.persistentVolume" label="Volume" indent>
    <input v-model.number="volumePct" class="volume-slider" type="range" min="0" max="100" step="1" />
  </SettingRow>
  <SettingRow label="Clip export size cap" description="Discord clips are encoded to stay under this size.">
    <SettingNumber v-model="draft.video.clipCapMb" range="video.clipCapMb" unit="MB" />
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
