<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, ViewerAction } from "../types";
import { clampTime, cycleSpeed, formatTime } from "../composables/videoControls";

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
const speed = ref(1);

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

function setSpeed(v: number) {
  speed.value = v;
  const el = video.value;
  // shuttle owns playbackRate while active; restore lands on the new choice
  if (el && shuttle.value === null) el.playbackRate = v;
  priorRate = v;
}

function chipClick() {
  setSpeed(cycleSpeed(speed.value));
}

const chipLabel = computed(() => {
  if (shuttle.value === "fwd") return "0.1x";
  if (shuttle.value === "rev") return "-0.1x";
  return speed.value + "x";
});

function frameStepClick(frames: number) {
  const el = video.value;
  if (!el) return;
  el.pause();
  seekBy(frames * FRAME);
}

const showBadge = computed(() => !playing.value && !failed.value);

onUnmounted(stopRevLoop);

watch(src, () => {
  // new file: reset transient state, keep volume and mute
  failed.value = false;
  currentTime.value = 0;
  duration.value = 0;
  speed.value = 1;
  clearShuttle();
});

function onLoadedMetadata() {
  const el = video.value;
  if (!el) return;
  duration.value = el.duration;
  el.playbackRate = speed.value;
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
        Microsoft Store, then reopen the file. .mkv files also can't play in
        this viewer yet.
      </p>
    </div>
    <div v-else class="video-wrap">
      <video
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
      <div v-if="showBadge" class="badge-layer">
        <button class="play-badge" title="Play (Space)" @click="togglePlay">
          <i class="ph-fill ph-play" />
        </button>
      </div>
    </div>
    <div v-if="!failed" class="controls">
      <div class="timeline" @click="seekToFraction">
        <div class="track">
          <div class="fill" :style="{ width: progress + '%' }" />
          <div class="knob" :style="{ left: progress + '%' }" />
        </div>
      </div>
      <div class="transport">
        <div class="cluster left">
          <button class="tbtn" title="Previous frame (,)" @click="frameStepClick(-1)">
            <i class="ph ph-skip-back" />
          </button>
          <button class="tbtn" title="Next frame (.)" @click="frameStepClick(1)">
            <i class="ph ph-skip-forward" />
          </button>
          <button class="speed-chip" title="Playback speed" @click="chipClick">
            <i class="ph ph-gauge" />
            <span>{{ chipLabel }}</span>
          </button>
          <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>
        <button class="play-btn" title="Play / pause (Space)" @click="togglePlay">
          <i class="ph-fill" :class="playing ? 'ph-pause' : 'ph-play'" />
        </button>
        <div class="cluster right">
          <button class="tbtn" title="Mute (M)" @click="toggleMute">
            <i class="ph" :class="muted || volume === 0 ? 'ph-speaker-slash' : 'ph-speaker-high'" />
          </button>
          <input
            class="volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="volume"
            @input="setVolume"
          />
          <button class="tbtn" title="Fullscreen (F)" @click="toggleFullscreen">
            <i class="ph ph-corners-out" />
          </button>
        </div>
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
  background: #0f0f0f;
}
.video-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}
.video-el {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.badge-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.play-badge {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #1a1a1ab3;
  border: 1px solid var(--color-accent-700);
  color: var(--color-accent-200);
  box-shadow: 0 0 40px color-mix(in oklab, var(--color-accent) 30%, transparent);
  pointer-events: auto;
  cursor: pointer;
  font-size: 26px;
  padding-left: 3px;
}
.play-badge:hover {
  border-color: var(--color-accent);
  background: #262626cc;
}
.video-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
}
.video-error .hint {
  color: var(--color-neutral-500);
  max-width: 44ch;
  text-align: center;
}
.controls {
  flex: none;
  padding: 8px 16px 12px;
  background: linear-gradient(180deg, transparent, #0b0b0b 55%);
}
.timeline {
  position: relative;
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.track {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 3px;
  background: var(--color-neutral-900);
}
.fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--color-accent-600), var(--color-accent));
  pointer-events: none;
}
.knob {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  margin-left: -5.5px;
  transform: translateY(-50%);
  border-radius: 50%;
  background: var(--color-accent-200);
  box-shadow: 0 0 10px color-mix(in oklab, var(--color-accent) 70%, transparent);
  pointer-events: none;
}
.transport {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.cluster {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cluster.right {
  justify-content: flex-end;
  gap: 8px;
}
.tbtn {
  width: 28px;
  height: 28px;
  flex: none;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-neutral-500);
  cursor: pointer;
  font-size: 15px;
}
.cluster.right .tbtn {
  font-size: 16px;
}
.tbtn:hover {
  background: var(--color-neutral-900);
  color: var(--color-text);
}
.speed-chip {
  height: 24px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--color-neutral-800);
  background: none;
  color: var(--color-neutral-400);
  font-size: 11.5px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-body);
}
.speed-chip i {
  font-size: 13px;
}
.speed-chip:hover {
  border-color: var(--color-accent-700);
  color: var(--color-accent-200);
}
.time {
  font-size: 12px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  margin-left: 2px;
}
.play-btn {
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--color-accent-700);
  background: none;
  color: var(--color-accent-200);
  cursor: pointer;
  font-size: 15px;
}
.play-btn:hover {
  background: var(--color-accent-900);
  border-color: var(--color-accent);
}
.volume {
  width: 88px;
  height: 4px;
  flex: none;
}
</style>
