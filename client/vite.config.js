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
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});
