const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const REPO_ROOT = path.resolve(__dirname, '..');
const targetPort = 8088;
const localBridgePort = 26000 + Math.floor(Math.random() * 5000);

function checkPort(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log(`[Railway Test Runner] Starting test on Railway VM...`);

  // 1. Ensure remote sshd on port 2222
  execSync('ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR railway.new "ss -tln | grep -q :2222 || /usr/sbin/sshd -p 2222"', {
    stdio: 'inherit'
  });

  // 2. Sync test script to Railway VM
  const localScript = path.join(__dirname, 'test_menu_comprehensive.cjs');
  execSync(`cat "${localScript}" | ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR railway.new "cat > /tmp/test_menu_comprehensive.cjs"`, { stdio: 'inherit' });

  // 3. Setup SSH bridge
  console.log(`[Railway Test Runner] Establishing SSH bridge localhost:${localBridgePort} -> Railway VM:2222...`);
  const tunnelProcess = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'LogLevel=ERROR',
    '-L', `${localBridgePort}:127.0.0.1:2222`,
    'railway.new',
    'cat'
  ], {
    detached: false,
    stdio: ['pipe', 'ignore', 'ignore']
  });

  const cleanup = () => {
    try {
      if (tunnelProcess.stdin && !tunnelProcess.stdin.destroyed) tunnelProcess.stdin.end();
      tunnelProcess.kill('SIGTERM');
    } catch {}
  };

  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  let bridgeReady = false;
  for (let i = 0; i < 30; i++) {
    bridgeReady = await checkPort(localBridgePort);
    if (bridgeReady) break;
    await sleep(300);
  }
  if (!bridgeReady) {
    cleanup();
    throw new Error('Bridge failed');
  }
  console.log(`[Railway Test Runner] Bridge established.`);

  // 4. Run test on Railway VM with reverse forwarding of port 8088
  const remoteCmd = `CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome NODE_PATH=/root/.local/share/mise/installs/node/24.22.0/lib/node_modules/@playwright/mcp/node_modules node /tmp/test_menu_comprehensive.cjs http://127.0.0.1:8088`;

  console.log(`[Railway Test Runner] Executing test script on Railway VM...`);
  const runRes = spawnSync('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'LogLevel=ERROR',
    '-i', '/root/.ssh/id_railway',
    '-p', String(localBridgePort),
    '-R', `${targetPort}:127.0.0.1:${targetPort}`,
    'root@127.0.0.1',
    remoteCmd
  ], {
    stdio: 'inherit'
  });

  // 5. Transfer artifacts back
  try {
    for (const vh of [600, 500, 420, 360]) {
      spawnSync('scp', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'LogLevel=ERROR',
        '-i', '/root/.ssh/id_railway',
        '-P', String(localBridgePort),
        `root@127.0.0.1:/tmp/test_menu_h${vh}.png`,
        path.join(REPO_ROOT, 'artifacts', `test_menu_h${vh}.png`)
      ], { stdio: 'ignore' });
    }
    spawnSync('scp', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-i', '/root/.ssh/id_railway',
      '-P', String(localBridgePort),
      `root@127.0.0.1:/tmp/comprehensive_menu_report.json`,
      path.join(REPO_ROOT, 'artifacts', `comprehensive_menu_report.json`)
    ], { stdio: 'ignore' });
  } catch {}

  cleanup();

  if (runRes.status !== 0) {
    console.error(`[Railway Test Runner] Test failed with status ${runRes.status}`);
    process.exit(runRes.status);
  }
  console.log(`[Railway Test Runner] All tests passed!`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
