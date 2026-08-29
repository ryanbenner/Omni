<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, ViewerAction } from "../types";
import { clampTime, formatTime } from "../composables/videoControls";

const props = defineProps<{ item: MediaItem }>();

const container = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const src = computed(() => convertFileSrc(props.item.path));

const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);
const muted = ref(false);
const failed = ref(false);

const FRAME = 1 / 60;
const EDGE = 0.05;
const SHUTTLE_RATE = 0.1;

// hold-to-shuttle: > plays at 10% speed, < steps backwards at 10% speed
// (video elements cannot play in reverse, so rev is a seek loop)
const shuttle = ref<"fwd" | "rev" | null>(null);
let priorRate = 1;
let priorPaused = false;
let revRaf = 0;
let revLastTs = 0;

function stopRevLoop() {
  if (revRaf) cancelAnimationFrame(revRaf);
  revRaf = 0;
}

function revTick(ts: number) {
  const el = video.value;
  if (!el || shuttle.value !== "rev") return;
  const dt = revLastTs ? (ts - revLastTs) / 1000 : 0;
  revLastTs = ts;
  el.currentTime = Math.max(0, el.currentTime - SHUTTLE_RATE * dt);
  revRaf = requestAnimationFrame(revTick);
}

function startShuttle(direction: 1 | -1) {
  const el = video.value;
  if (!el) return;
  const mode = direction > 0 ? "fwd" : "rev";
  if (shuttle.value === mode) return;
  if (shuttle.value === null) {
    priorRate = el.playbackRate;
    priorPaused = el.paused;
  }
  stopRevLoop();
  shuttle.value = mode;
  if (mode === "fwd") {
    el.playbackRate = SHUTTLE_RATE;
    el.play().catch(() => {});
  } else {
    el.pause();
    el.playbackRate = priorRate;
    revLastTs = 0;
    revRaf = requestAnimationFrame(revTick);
  }
}

function stopShuttle(direction: 1 | -1) {
  const el = video.value;
  const mode = direction > 0 ? "fwd" : "rev";
  if (!el || shuttle.value !== mode) return;
  stopRevLoop();
  shuttle.value = null;
  el.playbackRate = priorRate;
  if (priorPaused) el.pause();
  else el.play().catch(() => {});
}

function clearShuttle() {
  stopRevLoop();
  shuttle.value = null;
}

onUnmounted(stopRevLoop);

watch(src, () => {
  // new file: reset transient state, keep volume and mute
  failed.value = false;
  currentTime.value = 0;
  duration.value = 0;
  clearShuttle();
});

function onLoadedMetadata() {
  const el = video.value;
  if (!el) return;
  duration.value = el.duration;
  el.playbackRate = 1;
  el.volume = volume.value;
  el.muted = muted.value;
  el.play().catch(() => {});
}

function onTimeUpdate() {
  currentTime.value = video.value?.currentTime ?? 0;
}

function onError() {
  failed.value = true;
}

function togglePlay() {
  const el = video.value;
  if (!el) return;
  if (el.paused) el.play().catch(() => {});
  else el.pause();
}

function seekBy(seconds: number) {
  const el = video.value;
  if (!el) return;
  el.currentTime = clampTime(el.currentTime + seconds, el.duration);
}

function seekToFraction(e: MouseEvent) {
  const el = video.value;
  const bar = e.currentTarget as HTMLElement;
  if (!el || !Number.isFinite(el.duration)) return;
  const rect = bar.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  el.currentTime = clampTime(frac * el.duration, el.duration);
}

function setVolume(e: Event) {
  volume.value = Number((e.target as HTMLInputElement).value);
  if (video.value) video.value.volume = volume.value;
}

function toggleMute() {
  muted.value = !muted.value;
  if (video.value) video.value.muted = muted.value;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else container.value?.requestFullscreen();
}

function handleAction(action: ViewerAction): boolean {
  const el = video.value;
  if (!el || failed.value) return false;
  switch (action.type) {
    case "playPause":
      togglePlay();
      return true;
    case "seek": {
      // paused at the relevant edge means the user is done: let the
      // app fall back to prev/next file per spec
      if (el.paused && action.seconds < 0 && el.currentTime <= EDGE) return false;
      if (el.paused && action.seconds > 0 && el.currentTime >= el.duration - EDGE)
        return false;
      seekBy(action.seconds);
      return true;
    }
    case "frameStep":
      el.pause();
      seekBy(action.frames * FRAME);
      return true;
    case "shuttleStart":
      startShuttle(action.direction);
      return true;
    case "shuttleStop":
      stopShuttle(action.direction);
      return true;
    case "toggleMute":
      toggleMute();
      return true;
    case "toggleFullscreen":
      toggleFullscreen();
      return true;
    default:
      return false;
  }
}

defineExpose({ handleAction });

const progress = computed(() =>
  duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0,
);
</script>

<template>
  <div ref="container" class="video-player">
    <div v-if="failed" class="video-error">
      <p>Couldn't play {{ item.name }}.</p>
      <p class="hint">
        Windows couldn't decode this video. Note: an .mp4 file can still
        contain HEVC/H.265 video (common for ShadowPlay HDR or high-quality
        captures) — install the free "HEVC Video Extensions" from the
        Microsoft Store, then reopen the file. .mkv files and files outside
        your user folder also can't play in this viewer yet.
      </p>
    </div>
    <video
      v-else
      ref="video"
      :src="src"
      class="video-el"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="playing = true"
      @pause="playing = false"
      @error="onError"
      @click="togglePlay"
      @dblclick="toggleFullscreen"
    />
    <div v-if="!failed" class="controls">
      <div class="timeline" @click="seekToFraction">
        <div class="timeline-fill" :style="{ width: progress + '%' }" />
      </div>
      <div class="controls-row">
        <button class="ctl" @click="togglePlay">{{ playing ? "Pause" : "Play" }}</button>
        <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        <span class="speed" v-show="shuttle">{{ shuttle === "fwd" ? "0.1x" : "-0.1x" }}</span>
        <span class="spacer" />
        <button class="ctl" @click="toggleMute">{{ muted ? "Unmute" : "Mute" }}</button>
        <input
          class="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="setVolume"
        />
        <button class="ctl" @click="toggleFullscreen">Fullscreen</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-player {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #000;
}
.video-el {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
.video-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.video-error .hint {
  color: #999;
  max-width: 40ch;
  text-align: center;
}
.controls {
  padding: 0 0.75rem 0.5rem;
  background: #000;
}
.timeline {
  height: 8px;
  background: #333;
  border-radius: 4px;
  cursor: pointer;
  margin: 0.4rem 0;
}
.timeline-fill {
  height: 100%;
  background: #4a9eff;
  border-radius: 4px;
  pointer-events: none;
}
.controls-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.ctl {
  background: #222;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
}
.time,
.speed {
  font-variant-numeric: tabular-nums;
  color: #aaa;
  font-size: 0.85rem;
}
.spacer {
  flex: 1;
}
.volume {
  width: 90px;
}
</style>
