// renders the drag ghost shown under the cursor while a file is dragged out
// of the app: a dark pill with the file name, as a png data url
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
