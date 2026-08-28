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

export async function waitForMapLoaded(webview, maxWaitMs = 25000) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 1000));
  while (Date.now() - start < maxWaitMs) {
    try {
      const loaded = await webview.evaluate(`Boolean(window.__MAP__ && (window.__MAP__.isStyleLoaded() || window.__MAP__.loaded()))`);
      if (loaded) return true;
    } catch {
      // ignore pending evaluate or not yet initialized
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

export async function waitForCondition(webview, expr, maxWaitMs = 25000) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 1000));
  while (Date.now() - start < maxWaitMs) {
    try {
      const ok = await webview.evaluate(expr);
      if (ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}
