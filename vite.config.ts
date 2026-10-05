/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
// @ts-expect-error node typings are not installed; vite runs this under node
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
// @ts-expect-error node typings are not installed; vite runs this under node
import { extname, join, resolve, sep } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// pdf.js fetches its wasm decoders, cmaps and standard fonts by url at runtime;
// they are served from node_modules in dev and copied into dist at build so the
// ~4 MB of assets never enter git
const PDFJS_DIRS = ["wasm", "cmaps", "standard_fonts"];
const PDFJS_ROOT = resolve("node_modules/pdfjs-dist");
const PDFJS_TYPES: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript" };

function pdfjsAssets(): Plugin {
  let outDir = "";
  return {
    name: "pdfjs-assets",
    configResolved(c) {
      outDir = c.command === "build" ? resolve(c.root, c.build.outDir) : "";
    },
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const path = decodeURIComponent(((req as { url?: string }).url ?? "").split("?")[0]);
        const dir = path.split("/")[1];
        const file = join(PDFJS_ROOT, path);
        if (PDFJS_DIRS.indexOf(dir) < 0 || !file.startsWith(join(PDFJS_ROOT, dir) + sep)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", PDFJS_TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!outDir) return;
      for (const d of PDFJS_DIRS) cpSync(join(PDFJS_ROOT, d), join(outDir, "pdfjs", d), { recursive: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), pdfjsAssets()],

  test: {
    environment: "jsdom",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
