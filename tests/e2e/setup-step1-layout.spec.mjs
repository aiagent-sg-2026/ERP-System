#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const web = path.join(root, 'web');
const port = process.env.SETUP_STEP1_E2E_PORT || '4340';
const base = `http://127.0.0.1:${port}`;
if (!existsSync(path.join(web, 'dist/index.html'))) throw new Error('Run npm run build:demo first.');
const server = spawn(path.join(web, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: web, stdio: 'ignore' });
let browser;
try {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${base}/?setup-step1=${Date.now()}`);
    await page.waitForSelector('#setupWizardView', { timeout: 180000 });
    await page.waitForFunction(() => window.ErpSystemData?.databaseReady === true, null, { timeout: 180000 });
    await page.waitForSelector('#setupWizardView .wiz-color-options');
    const measurements = await page.evaluate(() => {
      const wizard = document.querySelector('#setupWizardView');
      const panel = wizard.querySelector('.wizard-panel');
      const paletteCards = [...wizard.querySelectorAll('.wiz-color-option')];
      const button = wizard.querySelector('#wizNext');
      const nestedScrollers = [...panel.querySelectorAll('*')].filter((element) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      });
      const footer = button.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        nestedScrollers: nestedScrollers.map((element) => element.id || element.className),
        cards: paletteCards.map((card) => { const rect = card.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; }),
        footer: { top: footer.top, bottom: footer.bottom },
        paletteInputs: wizard.querySelectorAll('input[name="wizPalette"][type="radio"]').length,
      };
    });
    assert.equal(measurements.horizontalOverflow, false, `${viewport.width}px horizontal overflow`);
    assert.deepEqual(measurements.nestedScrollers, [], `${viewport.width}px nested scrolling`);
    assert.equal(measurements.paletteInputs, 6);
    await page.locator('.wiz-color-options').scrollIntoViewIfNeeded();
    const visible = await page.locator('.wiz-color-option').evaluateAll((cards) => cards.every((card) => {
      const rect = card.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    }));
    assert.equal(visible, true, `${viewport.width}px palette cards fully visible after scrolling`);
    const overlap = await page.locator('#wizNext').evaluate((button) => {
      const a = button.getBoundingClientRect();
      return [...document.querySelectorAll('.wiz-color-option')].some((card) => {
        const b = card.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
    });
    assert.equal(overlap, false, `${viewport.width}px Continue overlaps palette`);
    if (viewport.width === 390 || viewport.width === 1440) {
      const shots = path.resolve(root, '../shots');
      mkdirSync(shots, { recursive: true });
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
      const fileName = viewport.width === 390 ? 'step1-390.png' : 'step1-1440.png';
      await page.screenshot({ path: path.join(shots, fileName), fullPage: true });
    }
    console.log(`PASS setup step 1 ${viewport.width}x${viewport.height}`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
