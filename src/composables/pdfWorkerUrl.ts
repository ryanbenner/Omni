// vite bundles the worker as a same-origin asset; kept in its own module so
// tests can mock the url without touching pdf.js
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export default workerUrl;
