import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = process.env.PWA_INSTALL_PORT || '4336';
const url = process.env.PWA_INSTALL_URL || `http://127.0.0.1:${port}/`;
const root = fileURLToPath(new URL('../../', import.meta.url));
const viteBin = process.env.PWA_INSTALL_VITE_BIN || fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const preview = process.env.PWA_INSTALL_URL ? null : spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root + '/web', stdio: 'inherit' });
const browser = await chromium.launch({ headless: true, ...(process.env.DEMO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEMO_CHROMIUM_EXECUTABLE } : {}) });
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const promptEvent = new Event('beforeinstallprompt', { cancelable: true });
    promptEvent.prompt = () => {};
    promptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(promptEvent);
  });
  const banner = page.locator('#pwaToast');
  await banner.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('#pwaToast');
    return element?.classList.contains('show') && element.getBoundingClientRect().top >= 0;
  });
  await banner.locator('.pwa-primary').waitFor({ state: 'visible' });
  const desktop = await banner.boundingBox();
  assert.ok(desktop, 'install prompt has a desktop bounding box');
  assert.ok(1280 - (desktop.x + desktop.width) <= 24, `desktop banner right edge is within 24px: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.y <= 24, `desktop banner top is within 24px: ${JSON.stringify(desktop)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await banner.boundingBox();
  assert.ok(mobile, 'install prompt has a mobile bounding box');
  assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390, `mobile banner has no horizontal overflow: ${JSON.stringify(mobile)}`);
  assert.ok(mobile.y >= 0 && mobile.y + mobile.height <= 844, `mobile banner stays inside the viewport: ${JSON.stringify(mobile)}`);
  assert.equal(await banner.getAttribute('role'), 'status');
  assert.ok(await banner.getAttribute('aria-label'));
  console.log('PWA install prompt position passed at desktop and mobile viewports');
} finally {
  await browser.close();
  preview?.kill('SIGTERM');
}
