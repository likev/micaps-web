// testEnv.js - Bun.WebView lifecycle and testing environment helper

export async function createTestWebView(url = "http://localhost:8088") {
  const webview = new Bun.WebView({
    headless: true,
    width: 1920,
    height: 1080,
  });

  await webview.navigate(url);
  return webview;
}

export async function waitForMapLoaded(webview, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const loaded = await webview.evaluate(`Boolean(window.__MAP__ && window.__MAP__.isStyleLoaded())`);
    if (loaded) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export async function waitForCondition(webview, expr, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ok = await webview.evaluate(expr);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
