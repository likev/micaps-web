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
      name: "serve-static-dev",
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

        server.middlewares.use("/map-china.pmtiles", (req, res, next) => {
          const filePath = path.resolve(__dirname, "map", "map-china.pmtiles");
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const stat = fs.statSync(filePath);
            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, "").split("-");
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
              res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                "Accept-Ranges": "bytes",
                "Content-Length": end - start + 1,
                "Content-Type": "application/octet-stream",
                "Access-Control-Allow-Origin": "*",
              });
              fs.createReadStream(filePath, { start, end }).pipe(res);
              return;
            }
            res.writeHead(200, {
              "Content-Length": stat.size,
              "Content-Type": "application/octet-stream",
              "Access-Control-Allow-Origin": "*",
            });
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });

        server.middlewares.use("/config.json", (req, res, next) => {
          const filePath = path.resolve(__dirname, "config.json");
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader("Content-Type", "application/json");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
    {
      name: "copy-config-json",
      closeBundle() {
        const src = path.resolve(__dirname, "config.json");
        const dst = path.resolve(__dirname, "dist", "config.json");
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
        }
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
