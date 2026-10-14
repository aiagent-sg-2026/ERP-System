import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const url = 'http://127.0.0.1:4392/';
const routes = [
  { route: 'sales-order', params: { no: 'SO-2' } },
  { route: 'work-order', params: {} },
  { route: 'quotation', params: {} },
  { route: 'delivery-order', params: {} },
  { route: 'sales-invoice', params: {} },
  { route: 'supplier-invoice', params: {} },
];
const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 375, height: 812 },
];
const preview = spawn(process.execPath, [
  fileURLToPath(new URL('../../web/node_modules/vite/bin/vite.js', import.meta.url)),
  'preview', '--host', '127.0.0.1', '--port', '4392', '--strictPort',
], { cwd: root + '/web', stdio: 'ignore' });
let browser;
let failures = 0;
try {
  let serving = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(preview.exitCode, null, 'vite preview exited before becoming ready');
    try { serving = (await fetch(url)).ok; } catch {}
    if (serving) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(serving, 'vite preview did not become ready on port 4392');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DEMO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEMO_CHROMIUM_EXECUTABLE } : {}),
  });
  const context = await browser.newContext({ viewport: viewports[0], serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ErpSystemData?.databaseReady === true, null, { timeout: 180000 });
  await page.evaluate(() => localStorage.setItem('aria-setup-wizard-complete', '1'));
  // Re-enter the login surface after the first-boot wizard, retaining the seeded DB.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ErpSystemData?.databaseReady === true, null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('#loginShowcase');
    return button && !button.disabled;
  });
  await page.locator('#loginShowcase').click();
  await page.locator('#globalSearch').waitFor({ timeout: 180000 });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const target of routes) {
      let metrics;
      let failure;
      try {
        // The real router writes #route and retains params separately; query-string
        // hashes do not implement the sales-order {no} contract.
        await page.evaluate(async ({ route, params }) => {
          if (!await window.navigate(route, params)) throw new Error(`Navigation failed: ${route}`);
        }, target);
        await page.locator('#viewRoot .docpage').waitFor();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        metrics = await page.evaluate(() => {
          const doc = document.querySelector('#viewRoot .docpage');
          const child = doc.firstElementChild;
          const wrap = doc.closest('.docwrap');
          const master = doc.closest('.master');
          const pagehead = master.querySelector('.pagehead');
          const breadcrumb = pagehead?.querySelector('.crumb') || doc.querySelector('.crumb');
          if (!child || !wrap || !breadcrumb) throw new Error('Missing document content, wrapper or breadcrumb');
          const bounds = child.getBoundingClientRect();
          const wrapLeft = wrap.getBoundingClientRect().left + wrap.clientLeft;
          const wrapRight = wrapLeft + wrap.clientWidth;
          // Older invoice documents put their breadcrumb inside the document.
          // Check the independent shell gutter too, so a narrow centred document
          // cannot pass merely because its own breadcrumb shares its left edge.
          const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gutter'));
          return {
            hash: location.hash,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth,
            contentWidth: wrap.clientWidth,
            left: bounds.left,
            breadcrumbLeft: breadcrumb.getBoundingClientRect().left,
            reference: pagehead ? 'pagehead' : 'inline-breadcrumb',
            expectedLeft: wrapLeft + gutter,
            leftGutter: bounds.left - wrapLeft,
            rightGutter: wrapRight - bounds.right,
          };
        });
        assert.equal(metrics.hash, `#${target.route}`, 'route must remain on the requested document');
        assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, 'page has horizontal overflow');
        if (viewport.width >= 1280) {
          assert.ok(Math.abs(metrics.leftGutter - metrics.rightGutter) <= 2, 'document gutters are asymmetric');
          assert.ok(Math.abs(metrics.left - metrics.breadcrumbLeft) <= 16, 'document and breadcrumb left edges differ');
          assert.ok(Math.abs(metrics.left - metrics.expectedLeft) <= 16, 'document does not use the shell gutter');
        }
        assert.equal(errors.length, 0, 'browser console/page errors occurred');
      } catch (error) {
        failures++;
        failure = error.message;
      }
      console.log(JSON.stringify({ ...target, viewport, status: failure ? 'FAIL' : 'PASS', metrics, errors: [...errors], ...(failure ? { failure } : {}) }));
    }
  }
  assert.equal(failures, 0, `${failures} document gutter scenarios failed`);
} finally {
  try { await browser?.close(); } finally { preview.kill('SIGTERM'); }
}
