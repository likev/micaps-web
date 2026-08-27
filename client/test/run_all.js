// run_all.js - Sequential E2E test runner to prevent concurrent Chromium GPU port contention
import { spawn } from "child_process";

const testFiles = [
  "./test/e2e/map_render.test.js",
  "./test/e2e/ui_controls.test.js",
  "./test/e2e/contour_layer.test.js",
  "./test/e2e/raster_wind.test.js",
  "./test/e2e/station_plot.test.js",
  "./test/e2e/visual_regression.test.js",
];

async function runTest(file) {
  console.log(`\n========================================`);
  console.log(`RUNNING SUITE: ${file}`);
  console.log(`========================================`);

  return new Promise((resolve) => {
    const proc = spawn("bun", ["test", "--timeout", "60000", file], {
      stdio: "inherit",
      env: process.env,
    });

    proc.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

async function main() {
  let passed = 0;
  let failed = 0;

  for (const file of testFiles) {
    const ok = await runTest(file);
    if (ok) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`ALL TEST SUITES COMPLETED: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
