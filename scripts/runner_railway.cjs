const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const REPO_ROOT = path.resolve(__dirname, '..');

// Parse CLI flags and positional arguments
const args = process.argv.slice(2);
const positional = [];
const flags = {};

for (const arg of args) {
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      flags[arg.slice(2)] = true;
    }
  } else {
    positional.push(arg);
  }
}

const presetId = flags.preset || positional[0] || 'preset-swan_mcr';
const outPng = flags.out
  ? path.resolve(flags.out)
  : (positional[1] ? path.resolve(positional[1]) : path.resolve(REPO_ROOT, `${presetId}.png`));

const rawLevel = flags.level !== undefined ? flags.level : positional[2];
const targetLevel = (rawLevel !== undefined && rawLevel !== '' && rawLevel !== 'null') ? Number(rawLevel) : null;

const targetUrl = flags.url || positional[3] || 'http://127.0.0.1:8088';
const useMock = Boolean(flags.mock || process.env.MICAPS_MOCK === 'true');

let targetPort = 8088;
try {
  const parsedUrl = new URL(targetUrl);
  if (parsedUrl.port) {
    targetPort = Number(parsedUrl.port);
  } else if (parsedUrl.protocol === 'https:') {
    targetPort = 443;
  } else {
    targetPort = 80;
  }
} catch {
  targetPort = 8088;
}

const runId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const REMOTE_TMP_PNG = `/tmp/railway_${runId}_${presetId}.png`;
const REMOTE_TMP_JSON = REMOTE_TMP_PNG.replace(/\.png$/, '.json');
const LOCAL_OUT_JSON = outPng.replace(/\.png$/, '.json');

// Pick a dynamic, collision-free local port for the SSH bridge to railway's sshd:2222
const localBridgePort = 25000 + Math.floor(Math.random() * 15000);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkPort(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let isConnected = false;
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      isConnected = true;
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

async function waitForPort(port, host = '127.0.0.1', maxAttempts = 30, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    const ok = await checkPort(port, host, intervalMs);
    if (ok) return true;
    await sleep(intervalMs);
  }
  return false;
}

(async () => {
  console.log(`=======================================================`);
  console.log(`[Railway Runner] Launching Headless Chromium on Railway VM`);
  console.log(`[Railway Runner] Preset: ${presetId}`);
  console.log(`[Railway Runner] Level: ${targetLevel}`);
  console.log(`[Railway Runner] Target URL: ${targetUrl} (Port: ${targetPort})`);
  console.log(`[Railway Runner] Target Output: ${outPng}`);
  console.log(`[Railway Runner] Bridge Port: ${localBridgePort}`);
  console.log(`=======================================================`);

  // Ensure output directory exists
  const outDir = path.dirname(outPng);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let spawnedServer = null;
  let tunnelProcess = null;

  const cleanup = () => {
    if (tunnelProcess) {
      try {
        if (tunnelProcess.stdin && !tunnelProcess.stdin.destroyed) {
          tunnelProcess.stdin.end();
        }
      } catch {}
      try { process.kill(-tunnelProcess.pid, 'SIGTERM'); } catch {}
      try { tunnelProcess.kill('SIGKILL'); } catch {}
      tunnelProcess = null;
    }
    if (spawnedServer && spawnedServer.pid) {
      console.log('[Railway Runner] Stopping temporary local MICAPS server...');
      try { process.kill(-spawnedServer.pid, 'SIGTERM'); } catch {}
      try { spawnedServer.kill('SIGTERM'); } catch {}
      spawnedServer = null;
    }
  };

  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    // 1. Ensure local server on targetPort
    const isServerRunning = await checkPort(targetPort);
    if (isServerRunning) {
      console.log(`[Railway Runner] Local MICAPS server is already listening on :${targetPort}`);
    } else {
      const serverBin = path.join(REPO_ROOT, 'server', 'micaps-server');
      const staticDir = path.join(REPO_ROOT, 'client', 'dist');
      const pmtilesPath = path.join(REPO_ROOT, 'client', 'map', 'map-china.pmtiles');

      if (!fs.existsSync(serverBin)) {
        console.log('[Railway Runner] Server binary not found. Building server/micaps-server...');
        execSync('go build -o micaps-server cmd/main.go', { cwd: path.join(REPO_ROOT, 'server'), stdio: 'inherit' });
      }

      console.log(`[Railway Runner] Local MICAPS server is not running. Starting server on :${targetPort} (mock=${useMock})...`);
      const serverArgs = [
        '-port', String(targetPort),
        '-static', staticDir,
        '-pmtiles', pmtilesPath
      ];

      if (useMock) {
        serverArgs.push('-mock=true');
      } else {
        serverArgs.push('-host', 'bore.pub', '-cport', '59043');
      }

      spawnedServer = spawn(serverBin, serverArgs, {
        cwd: path.join(REPO_ROOT, 'server'),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      spawnedServer.stdout.on('data', d => {
        const line = d.toString();
        if (line.includes('SUCCESS') || line.includes('Server Ready') || line.includes('error')) {
          process.stdout.write(`[Server] ${line}`);
        }
      });
      spawnedServer.stderr.on('data', d => {
        process.stderr.write(`[Server ERR] ${d.toString()}`);
      });

      const ready = await waitForPort(targetPort, '127.0.0.1', 25, 500);
      if (!ready) {
        throw new Error(`Failed to start local MICAPS server on port ${targetPort} within 12s`);
      }
      console.log(`[Railway Runner] Local server successfully started and listening on :${targetPort}`);
    }

    // 2. Ensure remote OpenSSH daemon is listening on port 2222 on Railway VM
    console.log('[Railway Runner] Ensuring remote OpenSSH daemon is listening on port 2222...');
    execSync('ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR railway.new "ss -tln | grep -q :2222 || /usr/sbin/sshd -p 2222"', {
      stdio: 'inherit'
    });

    // 3. Sync test_runner_railway.cjs to Railway VM
    console.log('[Railway Runner] Syncing test script to Railway VM (/app/railway_runner.cjs)...');
    const runnerScript = path.join(__dirname, 'test_runner_railway.cjs');
    try {
      execSync(`scp -o StrictHostKeyChecking=no -o LogLevel=ERROR "${runnerScript}" railway.new:/app/railway_runner.cjs`, { stdio: 'ignore' });
    } catch {
      execSync(`cat "${runnerScript}" | ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR railway.new "cat > /app/railway_runner.cjs"`, { stdio: 'inherit' });
    }

    // 4. Setup SSH tunnel for railway port 2222 on collision-free localBridgePort
    // Use 'cat' with stdin pipe so closing the pipe terminates remote process cleanly with zero leaks
    console.log(`[Railway Runner] Establishing SSH bridge localhost:${localBridgePort} -> Railway VM:2222...`);
    tunnelProcess = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'LogLevel=ERROR',
      '-L', `${localBridgePort}:127.0.0.1:2222`,
      'railway.new',
      'cat'
    ], {
      detached: false,
      stdio: ['pipe', 'ignore', 'ignore']
    });

    const bridgeReady = await waitForPort(localBridgePort, '127.0.0.1', 30, 500);
    if (!bridgeReady) {
      throw new Error(`Could not establish SSH bridge on port ${localBridgePort} to Railway VM`);
    }
    console.log(`[Railway Runner] SSH bridge active on port ${localBridgePort}`);

    // 5. Run remote headless Chromium via nested SSH with reverse port forwarding for targetPort
    console.log(`[Railway Runner] Running headless Chromium on Railway VM with reverse port :${targetPort} forwarded...`);
    const levelArg = targetLevel !== null ? targetLevel : 'null';
    const remoteUrl = `http://127.0.0.1:${targetPort}`;
    const remoteCmd = `cd /app && NODE_PATH=/app/node_modules node /app/railway_runner.cjs '${presetId}' '${REMOTE_TMP_PNG}' '${levelArg}' '${remoteUrl}'`;

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

    if (runRes.status !== 0) {
      throw new Error(`Remote runner exited with code ${runRes.status}`);
    }

    // 6. Transfer screenshot and JSON report back
    console.log(`[Railway Runner] Transferring screenshot from Railway VM to ${outPng}...`);
    const scpPng = spawnSync('scp', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-i', '/root/.ssh/id_railway',
      '-P', String(localBridgePort),
      `root@127.0.0.1:${REMOTE_TMP_PNG}`,
      outPng
    ], { stdio: 'inherit' });

    if (scpPng.status !== 0) {
      throw new Error(`Failed to scp screenshot back from Railway VM: code ${scpPng.status}`);
    }

    const scpJson = spawnSync('scp', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-i', '/root/.ssh/id_railway',
      '-P', String(localBridgePort),
      `root@127.0.0.1:${REMOTE_TMP_JSON}`,
      LOCAL_OUT_JSON
    ], { stdio: 'inherit' });

    if (scpJson.status !== 0) {
      throw new Error(`Failed to scp report JSON back from Railway VM: code ${scpJson.status}`);
    }

    // 7. Clean remote temp files
    try {
      spawnSync('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'LogLevel=ERROR',
        '-i', '/root/.ssh/id_railway',
        '-p', String(localBridgePort),
        'root@127.0.0.1',
        `rm -f '${REMOTE_TMP_PNG}' '${REMOTE_TMP_JSON}'`
      ], { stdio: 'ignore' });
    } catch {}

    const pngStat = fs.statSync(outPng);
    console.log(`=======================================================`);
    console.log(`[Railway Runner] SUCCESS!`);
    console.log(`[Railway Runner] Image saved: ${outPng} (${Math.round(pngStat.size / 1024)} KB)`);
    console.log(`[Railway Runner] State saved: ${LOCAL_OUT_JSON}`);
    console.log(`=======================================================`);
  } finally {
    cleanup();
  }

  process.exit(0);
})().catch(err => {
  console.error('[Railway Runner] Execution failed:', err);
  process.exit(1);
});
