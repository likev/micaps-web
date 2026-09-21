import { defineConfig } from "vite";
import path from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      griddata: path.resolve("/root/downloads/griddata-js/dist/index.js"),
    },
  },
  server: {
    // Dev-only: forward same-origin /api calls to the Go workstation server
    // so `vite` (e.g. :5173) shows traffic on http://localhost:8088/api.
    // Production dist is served by the Go server itself (same origin, no proxy).
    proxy: {
      "/api": {
        target: "http://localhost:8088",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});
