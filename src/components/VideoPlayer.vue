<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DirListing, MediaItem, ViewerAction } from "../types";
import { clampTime, formatTime, SPEEDS } from "../composables/videoControls";
import TrimBar from "./TrimBar.vue";
import ExportPanel from "./ExportPanel.vue";
import { useTrim } from "../composables/useTrim";
import {
  CAP_BYTES,
  ensureMp4,
  estimateClipBytes,
  formatMB,
  newClipName,
  useExport,
  type ExportRequest,
} from "../composables/useExport";
import { parentDir, sepOf } from "../composables/pathUtils";

const props = defineProps<{ item: MediaItem; hasPrev?: boolean; hasNext?: boolean }>();
const emit = defineEmits<{ deleteFile: []; clipSaved: [path: string]; navigate: [dir: -1 | 1] }>();

function navClick(dir: -1 | 1, e: MouseEvent) {
  emit("navigate", dir);
  // drop focus so space keeps controlling the video, not this button
  (e.currentTarget as HTMLElement).blur();
}

const trim = useTrim();
const exporter = useExport();
const exportName = ref("");
const capped = ref(false);
const toast = ref<string | null>(null);
let toastTimer = 0;

// naming happens up front for both flows; the trim ui hides behind the modal
const naming = ref<{ replace: boolean; draft: string; error: string } | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
let dirNames: string[] = [];

async function onRequestExport(replace: boolean) {
  const dir = parentDir(props.item.path);
  try {
    const listing = await invoke<DirListing>("read_dir_entries", { path: dir });
    dirNames = listing.files.map((f) => f.name);
  } catch {
    dirNames = [];
  }
  const draft = replace ? props.item.name : newClipName(props.item.name, dirNames);
  naming.value = { replace, draft, error: "" };
  nextTick(() => {
    const el = nameInput.value;
    el?.focus();
    const dot = draft.lastIndexOf(".");
    el?.setSelectionRange(0, dot > 0 ? dot : draft.length);
  });
}

function cancelNaming() {
  // back out one step: trim state is untouched, keep editing
  naming.value = null;
}

function confirmNaming() {
  const n = naming.value;
  if (!n) return;
  const raw = n.draft.trim();
  if (!raw || raw.includes("/") || raw.includes("\\")) {
    n.error = "enter a name without slashes";
    return;
  }
  const name = ensureMp4(raw);
  const self = props.item.name.toLowerCase();
  const collides = dirNames.some(
    (x) =>
      x.toLowerCase() === name.toLowerCase() &&
      (!n.replace || x.toLowerCase() !== self),
  );
  if (collides) {
    n.error = `${name} already exists`;
    return;
  }
  naming.value = null;
  onExport(capped.value ? "discord" : "precise", n.replace, name);
}

const sizeLabel = computed(() => {
  if (!trim.active.value) return "";
  const est = estimateClipBytes(props.item.size, trim.duration.value, trim.keptDuration.value);
  if (est <= 0) return "";
  if (capped.value && est > CAP_BYTES) {
    return `~${formatMB(CAP_BYTES)} (capped from ≈${formatMB(est)})`;
  }
  if (capped.value) return `≈${formatMB(est)} · under the cap`;
  return `≈${formatMB(est)}`;
});

function flash(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 4000);
}

function toggleTrim() {
  if (trim.active.value) {
    trim.exit();
    return;
  }
  const el = video.value;
  if (!el || !Number.isFinite(el.duration)) return;
  el.pause();
  trim.enter(el.duration);
}

function onScrub(t: number) {
  const el = video.value;
  if (el) el.currentTime = t;
}

async function onExport(
  mode: "precise" | "discord",
  replace: boolean,
  chosenName: string,
) {
  const srcPath = props.item.path;
  const srcName = props.item.name;
  const el = video.value;
  if (!el || exporter.running.value) return;
  el.pause();
  const dir = parentDir(srcPath);
  const sep = sepOf(srcPath);
  const stem = srcName.replace(/\.[^.]+$/, "");
  const target = mode === "discord" ? CAP_BYTES : undefined;
  try {
    if (!replace) {
      const output = dir + sep + chosenName;
      exportName.value = chosenName;
      await runExport({ input: srcPath, output, mode, target });
      flash(`Saved ${chosenName}`);
      trim.exit();
      emit("clipSaved", output);
    } else {
      const tmp = dir + sep + stem + ".omniexport.tmp.mp4";
      const finalName = chosenName;
      exportName.value = srcName;
      await runExport({ input: srcPath, output: tmp, mode, target });
      // collision check happens before the original is touched, so a bad
      // chosen name can still be aborted with both copies intact
      const listing = await invoke<DirListing>("read_dir_entries", { path: dir });
      const collides = listing.files.some(
        (f) =>
          f.name.toLowerCase() === finalName.toLowerCase() &&
          f.name.toLowerCase() !== srcName.toLowerCase(),
      );
      if (collides) {
        await invoke("delete_file", { path: tmp }).catch(() => {});
        flash("Export failed: " + finalName + " already exists");
        return;
      }
      try {
        await invoke("delete_file", { path: srcPath });
      } catch {
        // original untouched: keep it, keep the clip, say so plainly
        flash(`Couldn't replace — original untouched; trimmed clip kept as ${stem}.omniexport.tmp.mp4`);
        return;
      }
      try {
        const newPath = await invoke<string>("rename_file", { path: tmp, newName: finalName });
        flash("Replaced");
        trim.exit();
        emit("clipSaved", newPath);
      } catch {
        try {
          const fallbackPath = await invoke<string>("rename_file", {
            path: tmp,
            newName: srcName,
          });
          flash("Replaced (kept original name — chosen name was taken)");
          trim.exit();
          emit("clipSaved", fallbackPath);
        } catch {
          flash(
            "Export kept as " + stem + ".omniexport.tmp.mp4 — original is in the Recycle Bin",
          );
        }
      }
    }
  } catch (e) {
    const msg = String(e);
    if (!msg.includes("cancelled")) flash("Export failed: " + msg);
  }
}

function runExport(o: { input: string; output: string; mode: ExportRequest["mode"]; target?: number }) {
  const req: ExportRequest = {
    input: o.input,
    output: o.output,
    inSec: trim.inSec.value,
    outSec: trim.outSec.value,
    mode: o.mode,
    targetBytes: o.target,
  };
  return exporter.run(req);
}

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
  const floor = trim.active.value ? trim.inSec.value : 0;
  el.currentTime = Math.max(floor, el.currentTime - SHUTTLE_RATE * dt);
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
  if (priorPaused || (trim.active.value && el.currentTime >= trim.outSec.value - 0.01)) el.pause();
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

const chipLabel = computed(() => {
  if (shuttle.value === "fwd") return "0.1x";
  if (shuttle.value === "rev") return "-0.1x";
  return speed.value + "x";
});

// custom dropdown: the native select popup cannot be styled to match the pill
const speedMenuOpen = ref(false);

function closeSpeedMenu() {
  speedMenuOpen.value = false;
}

function toggleSpeedMenu() {
  speedMenuOpen.value = !speedMenuOpen.value;
}

function pickSpeed(s: number) {
  setSpeed(s);
  speedMenuOpen.value = false;
}

watch(speedMenuOpen, (open) => {
  if (open) window.addEventListener("pointerdown", closeSpeedMenu);
  else window.removeEventListener("pointerdown", closeSpeedMenu);
});


const showBadge = computed(() => !playing.value && !failed.value);

// on-screen ten second skips clamp at the clip edges and never change files
function seekTen(dir: -1 | 1) {
  seekBy(dir * 10);
}

// controls live over the video and only show while the mouse is around
const controlsVisible = ref(false);
let hideTimer = 0;

function showControls() {
  controlsVisible.value = true;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => (controlsVisible.value = false), 2500);
}

function hideControls() {
  clearTimeout(hideTimer);
  controlsVisible.value = false;
}

onUnmounted(() => {
  stopRevLoop();
  clearTimeout(hideTimer);
  clearTimeout(toastTimer);
  window.removeEventListener("pointerdown", closeSpeedMenu);
});

watch(src, () => {
  // new file: reset transient state, keep volume and mute
  failed.value = false;
  currentTime.value = 0;
  duration.value = 0;
  speed.value = 1;
  speedMenuOpen.value = false;
  clearShuttle();
  naming.value = null;
  if (exporter.running.value) exporter.cancel();
  trim.exit();
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
  const el = video.value;
  currentTime.value = el?.currentTime ?? 0;
  if (el && trim.active.value && !el.paused && el.currentTime >= trim.outSec.value) {
    el.pause();
    el.currentTime = trim.outSec.value;
  }
}

function onError() {
  failed.value = true;
}

function togglePlay() {
  const el = video.value;
  if (!el) return;
  if (el.paused) {
    if (
      trim.active.value &&
      (el.currentTime < trim.inSec.value || el.currentTime >= trim.outSec.value - 0.01)
    ) {
      el.currentTime = trim.inSec.value;
    }
    el.play().catch(() => {});
  } else el.pause();
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
      // app fall back to prev/next file per spec (never while trimming,
      // so arrows can't bounce the app to a different file mid-trim)
      if (!trim.active.value && el.paused && action.seconds < 0 && el.currentTime <= EDGE)
        return false;
      if (
        !trim.active.value &&
        el.paused &&
        action.seconds > 0 &&
        el.currentTime >= el.duration - EDGE
      )
        return false;
      seekBy(action.seconds);
      if (trim.active.value) {
        el.currentTime = Math.min(trim.outSec.value, Math.max(trim.inSec.value, el.currentTime));
      }
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
    case "setIn":
      if (trim.active.value) trim.setIn(el.currentTime);
      return true;
    case "setOut":
      if (trim.active.value) trim.setOut(el.currentTime);
      return true;
    case "exitTrim":
      if (!trim.active.value) return false;
      trim.exit();
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
  <div
    ref="container"
    class="video-player"
    @pointermove="showControls"
    @pointerleave="hideControls"
  >
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
      />
      <div v-if="showBadge" class="badge-layer">
        <button class="play-badge" title="Play (Space)" @click="togglePlay">
          <i class="ph-fill ph-play" />
        </button>
      </div>
      <template v-if="!naming && !trim.active.value">
        <button
          class="nav-arrow nav-prev"
          :class="{ hidden: !controlsVisible }"
          :disabled="!hasPrev"
          title="Previous file"
          @click="navClick(-1, $event)"
        >
          <i class="ph ph-caret-left" />
        </button>
        <button
          class="nav-arrow nav-next"
          :class="{ hidden: !controlsVisible }"
          :disabled="!hasNext"
          title="Next file"
          @click="navClick(1, $event)"
        >
          <i class="ph ph-caret-right" />
        </button>
      </template>
    </div>
    <div
      v-if="!failed"
      v-show="!naming"
      class="controls"
      :class="{ hidden: !controlsVisible && !speedMenuOpen && !trim.active.value }"
    >
      <ExportPanel
        v-if="trim.active.value"
        v-model:capped="capped"
        :busy="exporter.running.value"
        :percent="exporter.percent.value"
        :output-name="exportName"
        @request-export="onRequestExport"
        @cancel-export="exporter.cancel()"
      />
      <template v-if="trim.active.value">
        <TrimBar
          :trim="trim"
          :current-time="currentTime"
          :size-label="sizeLabel"
          @scrub="onScrub"
        />
      </template>
      <template v-else>
        <div class="time-row">
          <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>
        <div class="timeline" @click="seekToFraction">
          <div class="track">
            <div class="fill" :style="{ width: progress + '%' }" />
            <div class="knob" :style="{ left: progress + '%' }" />
          </div>
        </div>
      </template>
      <div class="transport">
        <div class="cluster left">
          <button class="tbtn" title="Delete file" @click="emit('deleteFile')">
            <i class="ph ph-trash" />
          </button>
          <span class="speed-chip-wrap" @pointerdown.stop>
            <button class="speed-chip" title="Playback speed" @click="toggleSpeedMenu">
              <i class="ph ph-gauge" />
              <span>{{ chipLabel }}</span>
            </button>
            <div v-if="speedMenuOpen" class="speed-menu">
              <button
                v-for="s in SPEEDS"
                :key="s"
                class="speed-opt"
                :class="{ active: s === speed }"
                @click="pickSpeed(s)"
              >
                {{ s }}x
              </button>
            </div>
          </span>
        </div>
        <button class="tbtn skip" title="Back 10 seconds" @click="seekTen(-1)">
          <span class="skip-wrap">
            <i class="ph ph-arrow-counter-clockwise" />
            <span class="skip-num">10</span>
          </span>
        </button>
        <button class="play-btn" title="Play / pause (Space)" @click="togglePlay">
          <i class="ph-fill" :class="playing ? 'ph-pause' : 'ph-play'" />
        </button>
        <button class="tbtn skip" title="Forward 10 seconds" @click="seekTen(1)">
          <span class="skip-wrap">
            <i class="ph ph-arrow-clockwise" />
            <span class="skip-num">10</span>
          </span>
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
          <button
            class="tbtn"
            :class="{ 'tbtn-active': trim.active.value }"
            title="Trim clip"
            @click="toggleTrim"
          >
            <i class="ph ph-scissors" />
          </button>
          <button class="tbtn" title="Fullscreen (F)" @click="toggleFullscreen">
            <i class="ph ph-corners-out" />
          </button>
        </div>
      </div>
    </div>
    <div v-if="toast" class="export-toast">{{ toast }}</div>
    <div v-if="naming" class="naming-backdrop" @pointerdown.stop="cancelNaming">
      <div class="naming-modal" @pointerdown.stop>
        <div class="modal-title">
          {{ naming.replace ? "Replace original" : "Save as new clip" }}
        </div>
        <p class="modal-hint">
          {{
            naming.replace
              ? "The original moves to the Recycle Bin and the trimmed clip takes this name."
              : "The trimmed clip is saved next to the original."
          }}
        </p>
        <input
          ref="nameInput"
          v-model="naming.draft"
          class="modal-input"
          spellcheck="false"
          @keydown.enter.prevent="confirmNaming"
          @keydown.esc.prevent="cancelNaming"
        />
        <p v-if="naming.error" class="modal-error">{{ naming.error }}</p>
        <div class="modal-actions">
          <button class="m-btn-outline" @click="cancelNaming">Cancel</button>
          <button class="m-btn-primary" @click="confirmNaming">
            {{ naming.replace ? "Replace" : "Save" }}
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
  background: #0a0b0c;
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
  background: #141517b3;
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
  background: #1d1f22cc;
}
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 40px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #141517b3;
  border: 1px solid var(--color-neutral-900);
  color: var(--color-neutral-400);
  cursor: pointer;
  font-size: 20px;
  transition: opacity 0.2s;
}
.nav-arrow:hover:not(:disabled) {
  color: var(--color-accent-300);
  border-color: var(--color-accent-700);
}
.nav-arrow:disabled {
  opacity: 0.2;
  cursor: default;
}
.nav-arrow.hidden {
  opacity: 0;
  pointer-events: none;
}
.nav-prev {
  left: 14px;
}
.nav-next {
  right: 14px;
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
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  padding: 8px 16px 12px;
  background: linear-gradient(180deg, transparent, #0a0b0cd9 55%);
  transition: opacity 0.2s;
}
.controls.hidden {
  opacity: 0;
  pointer-events: none;
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
.speed-chip-wrap {
  position: relative;
  flex: none;
  display: inline-flex;
}
.speed-chip {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  /* pill shape so it sits flush with the round icon buttons */
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-neutral-800) 70%, transparent);
  color: var(--color-neutral-400);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-body);
}
.speed-chip i {
  font-size: 13px;
}
.speed-chip-wrap:hover .speed-chip {
  border-color: var(--color-accent-700);
  color: var(--color-accent-200);
}
.speed-chip {
  background: none;
  cursor: pointer;
}
.speed-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  min-width: 68px;
  padding: 4px;
  border-radius: 12px;
  background: #17181af0;
  border: 1px solid var(--color-neutral-800);
  box-shadow: 0 8px 24px #000a;
  backdrop-filter: blur(8px);
}
.speed-opt {
  display: block;
  width: 100%;
  padding: 5px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--color-neutral-300);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-body);
  text-align: center;
  cursor: pointer;
}
.speed-opt:hover {
  background: var(--color-neutral-900);
  color: var(--color-text);
}
.speed-opt.active {
  background: var(--color-accent-900);
  color: var(--color-accent-200);
}
.skip .skip-wrap {
  position: relative;
  display: grid;
  place-items: center;
}
.skip {
  width: 32px;
  height: 32px;
  font-size: 21px;
  color: var(--color-neutral-400);
}
.skip .skip-num {
  position: absolute;
  font-size: 6.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-top: 1px;
}
.time-row {
  display: flex;
  justify-content: center;
  margin-bottom: 2px;
}
.time {
  font-size: 12px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
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
.tbtn-active {
  color: var(--color-accent-300);
  background: var(--color-accent-900);
}
.export-toast {
  position: absolute;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  z-index: 7;
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  color: var(--color-accent-200);
  font-size: 12px;
}
/* naming modal owns the player while open; trim ui hides behind it */
.naming-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: #000d;
  backdrop-filter: blur(3px);
}
.naming-modal {
  width: min(380px, 90%);
  padding: 16px;
  border-radius: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  box-shadow: 0 12px 40px #000c;
}
.modal-title {
  font-size: 14px;
  color: var(--color-text);
  margin-bottom: 4px;
}
.modal-hint {
  font-size: 11.5px;
  color: var(--color-neutral-500);
  margin: 0 0 10px;
}
.modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-accent-700);
  background: #101113;
  color: var(--color-text);
  font: inherit;
  outline: none;
}
.modal-error {
  font-size: 11.5px;
  color: #e08585;
  margin: 6px 0 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.m-btn-primary {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent-100);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12px;
}
.m-btn-primary:hover {
  background: color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.m-btn-outline {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-neutral-700);
  background: none;
  color: var(--color-neutral-300);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12px;
}
.m-btn-outline:hover {
  border-color: var(--color-accent-700);
  color: var(--color-accent-200);
}
</style>
