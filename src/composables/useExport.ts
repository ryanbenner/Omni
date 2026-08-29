import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ExportRequest {
  input: string;
  output: string;
  inSec: number;
  outSec: number;
  mode: "fast" | "precise" | "discord";
  targetBytes?: number;
}

export function newClipName(sourceName: string, existingNames: string[]): string {
  const stem = sourceName.replace(/\.[^.]+$/, "");
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let candidate = `${stem}_clip.mp4`;
  let i = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${stem}_clip_${i}.mp4`;
    i++;
  }
  return candidate;
}

export function ensureMp4(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.mp4`;
}

export function useExport() {
  const running = ref(false);
  const percent = ref(0);

  async function run(req: ExportRequest): Promise<void> {
    running.value = true;
    percent.value = 0;
    const unlisten = await listen<{ percent: number }>("export-progress", (e) => {
      percent.value = e.payload.percent;
    });
    try {
      await invoke("export_clip", { req });
    } finally {
      unlisten();
      running.value = false;
    }
  }

  function cancel() {
    invoke("cancel_export").catch(() => {});
  }

  return { running, percent, run, cancel };
}
