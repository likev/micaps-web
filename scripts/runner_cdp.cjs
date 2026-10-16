/**
 * runner_cdp.cjs
 * 
 * NOTE: Headless Chromium is NEVER run locally on this machine to prevent memory
 * exhaustion and swap thrashing on the local VPS/container (958MB RAM).
 * 
 * This runner automatically delegates execution to `runner_railway.cjs`, which runs
 * headless Chromium on the free Railway VM (with 2GB RAM & WebGL SwiftShader support),
 * bridges the local workstation server via reverse SSH tunnel, and transfers back
 * the resulting screenshot and workstation state metadata.
 */

const { fork } = require('child_process');
const path = require('path');

console.log('[Runner CDP] NOTICE: Running headless Chromium locally is disabled to avoid OOM.');
console.log('[Runner CDP] Redirecting to Railway VM headless Chromium runner (scripts/runner_railway.cjs)...');

const railwayRunner = path.join(__dirname, 'runner_railway.cjs');
const child = fork(railwayRunner, process.argv.slice(2), {
  stdio: 'inherit'
});

process.on('SIGINT', () => {
  if (child && child.pid) child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  if (child && child.pid) child.kill('SIGTERM');
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
