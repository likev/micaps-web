const { chromium } = require('playwright');
const fs = require('fs');

const presetId = process.argv[2] || 'preset-swan_mcr';
const outPng = process.argv[3] || `/tmp/${presetId}.png`;
const targetLevel = (process.argv[4] !== undefined && process.argv[4] !== '' && process.argv[4] !== 'null') ? Number(process.argv[4]) : null;
const targetUrl = process.argv[5] || 'http://127.0.0.1:8088';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log(`[Railway Remote Runner] Starting headless Chromium on Railway VM...`);
  console.log(`[Railway Remote Runner] Preset: ${presetId}, Level: ${targetLevel}, Target URL: ${targetUrl}`);

  let browser = null;
  const logs = [];

  try {
    browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--window-size=1440,900'
      ]
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    page.on('console', msg => {
      const text = msg.text();
      logs.push({ type: msg.type(), text });
    });
    page.on('pageerror', err => {
      logs.push({ type: 'pageerror', text: err.message });
    });

    console.log(`[Railway Remote Runner] Loading ${targetUrl} ...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2000);

    console.log('[Railway Remote Runner] Waiting for window.__loadPresetById ...');
    await page.waitForFunction(() => typeof window.__loadPresetById === 'function', { timeout: 30000 });

    console.log(`[Railway Remote Runner] Selecting preset ${presetId} (level=${targetLevel}) ...`);
    try {
      await page.evaluate(async ({ id, lvl }) => {
        await window.__loadPresetById(id, lvl);
      }, { id: presetId, lvl: targetLevel });
    } catch (err) {
      console.error('[Railway Remote Runner] Preset load error:', err.message);
      logs.push({ type: 'evalerror', text: err.message });
    }

    // Wait for data fetch, tile rendering, and WebGL drawing
    console.log('[Railway Remote Runner] Waiting for data fetch and rendering (9s) ...');
    await sleep(9000);

    const state = await page.evaluate(() => {
      return typeof window.__getWorkstationState === 'function' ? window.__getWorkstationState() : null;
    });

    console.log(`[Railway Remote Runner] Capturing screenshot to ${outPng} ...`);
    await page.screenshot({ path: outPng, fullPage: false });
    console.log(`[Railway Remote Runner] Screenshot saved to ${outPng}`);

    const outJson = outPng.replace(/\.png$/, '.json');
    fs.writeFileSync(outJson, JSON.stringify({
      presetId,
      targetLevel,
      state,
      logs: logs.slice(-50),
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`[Railway Remote Runner] State saved to ${outJson}`);

    console.log('[Railway Remote Runner] Finished successfully.');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[Railway Remote Runner] Error closing browser:', closeErr.message);
      }
    }
  }

  process.exit(0);
})().catch(err => {
  console.error('[Railway Remote Runner] Fatal error:', err);
  process.exit(1);
});
