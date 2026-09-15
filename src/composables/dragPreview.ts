// drag ghosts shown under the cursor while a file is dragged out of the app

// dark pill with the file name, as a png data url; the fallback for any file
export function filePreview(name: string): string {
  const canvas = document.createElement("canvas");
  const font = "13px Inter, system-ui, sans-serif";
  const padX = 12;
  const h = 28;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "data:image/png;base64,";
  ctx.font = font;
  const w = Math.min(320, Math.ceil(ctx.measureText(name).width) + padX * 2);
  canvas.width = w;
  canvas.height = h;
  // resizing the canvas resets the context state
  ctx.font = font;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, 6);
  ctx.fillStyle = "#17181a";
  ctx.fill();
  ctx.strokeStyle = "#7d7cf0";
  ctx.stroke();
  ctx.fillStyle = "#e6e6ea";
  ctx.textBaseline = "middle";
  ctx.fillText(name, padX, h / 2, w - padX * 2);
  return canvas.toDataURL("image/png");
}

const THUMB_WIDTH = 160;

// a frame from a video (by asset url) scaled to a small thumbnail; rejects
// when the video cannot be decoded so the caller can fall back to the pill
export function videoThumbnail(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    const done = () => {
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => {
      done();
      reject(new Error("video failed to load"));
    };
    video.onloadedmetadata = () => {
      // skip the often-black first frame on short clips, but stay early
      video.currentTime = Math.min(1, video.duration / 10 || 0);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const scale = THUMB_WIDTH / (video.videoWidth || THUMB_WIDTH);
      canvas.width = THUMB_WIDTH;
      canvas.height = Math.max(1, Math.round((video.videoHeight || 90) * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        done();
        reject(new Error("no canvas"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      done();
      resolve(canvas.toDataURL("image/png"));
    };
    video.src = url;
  });
}
