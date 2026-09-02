import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

export default defineConfig({
  resolve: {
    alias: {
      griddata: path.resolve("/root/downloads/griddata-js/dist/index.js"),
    },
  },
  plugins: [
    {
      name: "serve-palettes-dev",
      configureServer(server) {
        server.middlewares.use("/palettes", (req, res, next) => {
          const reqPath = decodeURIComponent((req.url || "").split("?")[0].replace(/^\//, ""));
          const filePath = path.resolve(__dirname, "palettes", reqPath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            if (filePath.endsWith(".json")) res.setHeader("Content-Type", "application/json");
            else if (filePath.endsWith(".xml")) res.setHeader("Content-Type", "application/xml");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8088",
        changeOrigin: true,
      },
      "/map-china.pmtiles": {
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
