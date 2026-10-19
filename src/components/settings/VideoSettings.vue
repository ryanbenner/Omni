<script setup lang="ts">
import { computed } from "vue";
import { draft } from "../../composables/settingsDraft";
import { SPEEDS } from "../../composables/videoControls";
import { SKIP_STEPS, HOLD_RATES, HIDE_DELAYS_MS, RANGES } from "../../composables/settings";
import SettingRow from "./SettingRow.vue";
import SettingToggle from "./SettingToggle.vue";
import SettingSelect from "./SettingSelect.vue";

const speedOptions = SPEEDS.map((s) => ({ value: s, label: `${s}x` }));
const skipOptions = SKIP_STEPS.map((s) => ({ value: s, label: `${s} s` }));
const holdOptions = HOLD_RATES.map((r) => ({ value: r, label: r ? `${r}x` : "Off" }));
const hideOptions = HIDE_DELAYS_MS.map((ms) => ({ value: ms, label: ms ? `${ms / 1000} s` : "Never" }));
const cap = RANGES["video.clipCapMb"];

const volumePct = computed({
  get: () => Math.round(draft.video.volume * 100),
  set: (v: number) => (draft.video.volume = v / 100),
});
</script>

<template>
  <SettingRow label="Default playback speed">
    <SettingSelect v-model="draft.video.defaultSpeed" :options="speedOptions" />
  </SettingRow>
  <SettingRow label="Skip step" description="The skip buttons and seek keys. Shift doubles it.">
    <SettingSelect v-model="draft.video.skipStep" :options="skipOptions" />
  </SettingRow>
  <SettingRow label="Start paused" description="Videos open on their first frame instead of playing.">
    <SettingToggle v-model="draft.video.startPaused" />
  </SettingRow>
  <SettingRow label="Loop">
    <SettingToggle v-model="draft.video.loop" />
  </SettingRow>
  <SettingRow label="Hold to speed up" description="Speed while holding a click on a playing video.">
    <SettingSelect v-model="draft.video.holdRate" :options="holdOptions" />
  </SettingRow>
  <SettingRow label="Hide controls after" description="Time without mouse movement over the video.">
    <SettingSelect v-model="draft.video.hideControlsMs" :options="hideOptions" />
  </SettingRow>
  <SettingRow label="Default volume" description="Keep volume and mute between launches.">
    <SettingToggle v-model="draft.video.persistentVolume" />
  </SettingRow>
  <SettingRow v-if="draft.video.persistentVolume" label="Volume" indent>
    <input v-model.number="volumePct" class="slider" type="range" min="0" max="100" step="1" />
  </SettingRow>
  <SettingRow label="Cap clip size by default" description="Trimmed clips start capped, for Discord. Uncheck it while trimming to export at full size.">
    <SettingToggle v-model="draft.video.capByDefault" />
  </SettingRow>
  <SettingRow v-if="draft.video.capByDefault" label="Max size" indent>
    <span class="cap-slider">
      <span class="cap-end">{{ cap.min }} MB</span>
      <input
        v-model.number="draft.video.clipCapMb"
        class="slider"
        type="range"
        :min="cap.min"
        :max="cap.max"
        step="1"
      />
      <span class="cap-end">{{ cap.max }} MB</span>
      <span class="cap-value">{{ draft.video.clipCapMb }} MB</span>
    </span>
  </SettingRow>
</template>

<style scoped>
.slider {
  width: 140px;
}
.slider:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.cap-slider {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cap-end {
  font-size: 11px;
  color: var(--color-neutral-500);
}
.cap-value {
  min-width: 48px;
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-200);
}
</style>
