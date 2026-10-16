const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const targetUrl = process.argv[2] || 'http://127.0.0.1:8088';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log(`[Comprehensive Menu Test] Testing against ${targetUrl}...`);
  if (executablePath) console.log(`[Comprehensive Menu Test] Chromium path: ${executablePath}`);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ]
  });

  const testHeights = [600, 500, 420, 360];
  const results = {};

  for (const vh of testHeights) {
    console.log(`\n================ Testing Viewport Height: ${vh}px ================`);
    const page = await browser.newPage({ viewport: { width: 1280, height: vh } });
    
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);

    // 1. Click Presets menu trigger button
    const trigger = await page.waitForSelector('#btn-preset-menu', { timeout: 10000 });
    await trigger.click();
    await sleep(300);

    // 2. Measure preset dropdown
    const dropdown = await page.waitForSelector('.preset-dropdown', { timeout: 5000 });
    const dropdownInfo = await page.evaluate(() => {
      const el = document.querySelector('.preset-dropdown');
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const items = Array.from(el.querySelectorAll('.preset-category-item'));
      return {
        overflowY: cs.overflowY,
        overflowX: cs.overflowX,
        maxHeight: cs.maxHeight,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        isScrollable: el.scrollHeight > el.clientHeight,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right
        },
        itemCount: items.length,
        insideViewportBottom: rect.bottom <= window.innerHeight + 1,
      };
    });
    console.log(`Dropdown info (${vh}px):`, JSON.stringify(dropdownInfo, null, 2));

    // 3. Hover top category (idx 0)
    const catItems = await page.$$('.preset-category-item');
    console.log(`Found ${catItems.length} categories.`);
    await catItems[0].hover();
    await sleep(300);

    const topSubmenuInfo = await page.evaluate(() => {
      const sub = document.querySelector('.preset-submenu');
      if (!sub) return null;
      const cs = window.getComputedStyle(sub);
      const rect = sub.getBoundingClientRect();
      const dropRect = document.querySelector('.preset-dropdown').getBoundingClientRect();
      return {
        visible: true,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        maxHeight: cs.maxHeight,
        overflowY: cs.overflowY,
        dropdownRight: dropRect.right,
        insideViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        notClippedHorizontally: rect.left >= dropRect.right - 2,
      };
    });
    console.log(`Top category submenu (${vh}px):`, topSubmenuInfo);

    // 4. Hover a large category (e.g., Derived Diagnostics or NWP Fields with many items)
    let largeCatIdx = -1;
    const catNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.preset-category-item .category-name')).map(e => e.textContent.trim());
    });
    largeCatIdx = catNames.findIndex(name => name.includes('High-Impact') || name.includes('Derived') || name.includes('高影响'));
    if (largeCatIdx === -1) largeCatIdx = 5;

    console.log(`Hovering large category idx ${largeCatIdx} (${catNames[largeCatIdx]})...`);
    // Scroll category into view if needed
    await page.evaluate((idx) => {
      const items = document.querySelectorAll('.preset-category-item');
      items[idx]?.scrollIntoView({ block: 'nearest' });
    }, largeCatIdx);
    await sleep(150);
    const largeCatEl = (await page.$$('.preset-category-item'))[largeCatIdx];
    await largeCatEl.hover();
    await sleep(300);

    const largeSubmenuInfo = await page.evaluate(() => {
      const sub = document.querySelector('.preset-submenu');
      if (!sub) return null;
      const cs = window.getComputedStyle(sub);
      const rect = sub.getBoundingClientRect();
      const dropRect = document.querySelector('.preset-dropdown').getBoundingClientRect();
      const items = sub.querySelectorAll('.preset-item-btn');
      return {
        itemCount: items.length,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        maxHeight: cs.maxHeight,
        clientHeight: sub.clientHeight,
        scrollHeight: sub.scrollHeight,
        isScrollable: sub.scrollHeight > sub.clientHeight,
        insideViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        notClippedHorizontally: rect.left >= dropRect.right - 2,
      };
    });
    console.log(`Large category submenu (${vh}px):`, largeSubmenuInfo);

    // 5. Scroll dropdown to bottom category and hover last category
    const lastIdx = catItems.length - 1;
    console.log(`Hovering last category idx ${lastIdx} (${catNames[lastIdx]})...`);
    await page.evaluate((idx) => {
      const items = document.querySelectorAll('.preset-category-item');
      items[idx]?.scrollIntoView({ block: 'nearest' });
    }, lastIdx);
    await sleep(200);

    const lastCatEl = (await page.$$('.preset-category-item'))[lastIdx];
    await lastCatEl.hover();
    await sleep(300);

    const lastSubmenuInfo = await page.evaluate(() => {
      const sub = document.querySelector('.preset-submenu');
      if (!sub) return null;
      const cs = window.getComputedStyle(sub);
      const rect = sub.getBoundingClientRect();
      const dropRect = document.querySelector('.preset-dropdown').getBoundingClientRect();
      const items = sub.querySelectorAll('.preset-item-btn');
      return {
        itemCount: items.length,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        maxHeight: cs.maxHeight,
        insideViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        notClippedHorizontally: rect.left >= dropRect.right - 2,
      };
    });
    console.log(`Last category submenu (${vh}px):`, lastSubmenuInfo);

    // 6. Test scrolling inside the submenu to the last preset item and clicking it
    if (largeSubmenuInfo && largeSubmenuInfo.isScrollable) {
      await page.evaluate((idx) => {
        const items = document.querySelectorAll('.preset-category-item');
        items[idx]?.scrollIntoView({ block: 'nearest' });
      }, largeCatIdx);
      await (await page.$$('.preset-category-item'))[largeCatIdx].hover();
      await sleep(200);

      // Scroll inside submenu to last preset
      const lastPresetClicked = await page.evaluate(() => {
        const sub = document.querySelector('.preset-submenu');
        if (!sub) return false;
        const presets = sub.querySelectorAll('.preset-item-btn');
        if (presets.length === 0) return false;
        const last = presets[presets.length - 1];
        last.scrollIntoView({ block: 'nearest' });
        const lastRect = last.getBoundingClientRect();
        // Check if last item is inside viewport
        const inside = lastRect.top >= 0 && lastRect.bottom <= window.innerHeight;
        // Click it
        last.click();
        return { name: last.querySelector('.preset-name')?.textContent, inside };
      });
      console.log(`Clicked last preset in large submenu (${vh}px):`, lastPresetClicked);
      await sleep(500);

      // Verify menu closed after selection
      const isMenuClosed = await page.evaluate(() => !document.querySelector('.preset-dropdown'));
      console.log(`Menu closed after preset selection: ${isMenuClosed}`);
    }

    const screenshotPath = `/tmp/test_menu_h${vh}.png`;
    // Reopen menu for screenshot
    await (await page.waitForSelector('#btn-preset-menu')).click();
    await sleep(200);
    await (await page.$$('.preset-category-item'))[largeCatIdx].hover();
    await sleep(300);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    results[`h${vh}`] = {
      dropdown: dropdownInfo,
      topSubmenu: topSubmenuInfo,
      largeSubmenu: largeSubmenuInfo,
      lastSubmenu: lastSubmenuInfo,
    };

    await page.close();
  }

  await browser.close();
  console.log('\nAll viewport tests completed successfully!');
  fs.writeFileSync('/tmp/comprehensive_menu_report.json', JSON.stringify(results, null, 2));
  process.exit(0);
})().catch(err => {
  console.error('[Comprehensive Menu Test] Failed:', err);
  process.exit(1);
});
