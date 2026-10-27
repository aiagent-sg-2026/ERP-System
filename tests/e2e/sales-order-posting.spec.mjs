import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiUrl = process.env.ERP_E2E_API_URL ?? 'http://127.0.0.1:3000';
const demoUrl = process.env.ERP_E2E_DEMO_URL ?? 'http://127.0.0.1:4173/';
const postgresUrl = process.env.POSTGRES_URL;
assert.ok(postgresUrl, 'POSTGRES_URL must point to the isolated erp-e2e Compose database');

async function assertStatus(response, expected, operation) {
  assert.equal(response.status, expected, `${operation}: ${response.status} ${await response.clone().text()}`);
}

function sessionCookies(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  const pairs = values.flatMap((value) => Array.from(
    value.matchAll(/(?:^|,\s*)(erp_(?:session|csrf))=([^;,\s]+)/g),
    (match) => `${match[1]}=${match[2]}`,
  ));
  const csrf = pairs.find((pair) => pair.startsWith('erp_csrf='));
  assert.ok(csrf && pairs.some((pair) => pair.startsWith('erp_session=')), 'login did not return ERP session and CSRF cookies');
  return { cookie: pairs.join('; '), csrf: decodeURIComponent(csrf.slice('erp_csrf='.length)) };
}

function payloadHeaders(session, key) {
  return {
    cookie: session.cookie,
    'content-type': 'application/json',
    'x-csrf-token': session.csrf,
    'idempotency-key': key,
  };
}

async function productionPath() {
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    const login = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationCode: 'ACME', username: 'admin', password: 'demo1234' }),
    });
    await assertStatus(login, 200, 'production login');
    const session = sessionCookies(login);

    const read = async (resource) => {
      const response = await fetch(`${apiUrl}/api/${resource}?limit=100`, { headers: { cookie: session.cookie } });
      await assertStatus(response, 200, `read ${resource}`);
      return (await response.json()).data;
    };
    const [products, customers] = await Promise.all([read('inventory/products'), read('sales/customers')]);
    const product = products.find((row) => row.sku === 'SG-WIDGET');
    const customer = customers.find((row) => row.code === 'CUST1');
    assert.ok(product && customer, 'seeded SG-WIDGET and CUST1 facts must be readable to the authenticated Company session');

    // The compact PostgreSQL seed intentionally has no warehouse. Create only this
    // prerequisite fixture as the isolated database owner; every tested stock and
    // sales mutation below uses the authenticated production API.
    const warehouseResult = await pool.query(
      `insert into warehouse (master_fn, company_fn, code, name)
       values ('M1', 'C-SG', $1, 'E2E sales warehouse') returning id`,
      [`E2E-SALES-${process.pid}`],
    );
    const warehouseId = Number(warehouseResult.rows[0].id);
    await pool.query(
      `insert into accounting_period (master_fn, company_fn, fiscal_year, period_no, label, start_date, end_date, status)
       values ('M1', 'C-SG', 2026, 10, 'October 2026', '2026-10-01', '2026-10-31', 'open')
       on conflict (master_fn, company_fn, fiscal_year, period_no) do nothing`,
    );
    const stockAdjustment = await fetch(`${apiUrl}/api/inventory/adjustments`, {
      method: 'POST', headers: payloadHeaders(session, `sales-e2e-stock-${process.pid}`),
      body: JSON.stringify({
        docNo: `ADJ-E2E-${process.pid}`, warehouseId, adjustmentDate: '2026-10-20',
        reason: 'Fictional E2E opening count', lines: [{ productId: product.id, countedQty: '10' }],
      }),
    });
    await assertStatus(stockAdjustment, 201, 'create opening stock adjustment');
    const adjustment = (await stockAdjustment.json()).data;
    const postStock = await fetch(`${apiUrl}/api/inventory/adjustments/${adjustment.id}/actions/post`, {
      method: 'POST', headers: payloadHeaders(session, `sales-e2e-stock-post-${process.pid}`), body: '{}',
    });
    await assertStatus(postStock, 200, 'post opening stock adjustment');

    const orderResponse = await fetch(`${apiUrl}/api/sales/orders`, {
      method: 'POST', headers: payloadHeaders(session, `sales-e2e-order-${process.pid}`),
      body: JSON.stringify({
        docNo: `SO-E2E-${process.pid}`, customerId: customer.id, orderDate: '2026-10-20', currency: 'SGD',
        approvalReason: 'Fictional E2E sales order approval.',
        lines: [{ productId: product.id, qty: '3', unitPrice: '12.50', taxCode: 'SR' }],
      }),
    });
    await assertStatus(orderResponse, 201, 'create sales order');
    const order = (await orderResponse.json()).data;
    const approval = await fetch(`${apiUrl}/api/sales/orders/${order.orderId}/actions/approve`, {
      method: 'POST', headers: payloadHeaders(session, `sales-e2e-approve-${process.pid}`),
      body: JSON.stringify({ note: 'Fictional E2E approval.' }),
    });
    await assertStatus(approval, 200, 'approve sales order');
    const confirmation = await fetch(`${apiUrl}/api/sales/orders/${order.orderId}/actions/confirm`, {
      method: 'POST', headers: payloadHeaders(session, `sales-e2e-confirm-${process.pid}`),
      body: JSON.stringify({ warehouseId }),
    });
    await assertStatus(confirmation, 200, 'confirm sales order');
    const posting = (await confirmation.json()).data;
    const stock = await pool.query(
      `select qty::text as qty from stock_level where master_fn='M1' and company_fn='C-SG' and product_id=$1 and warehouse_id=$2`,
      [product.id, warehouseId],
    );
    const invoice = await pool.query(
      `select net_amount::text as net, tax_amount::text as tax, total_amount::text as total
         from invoice where master_fn='M1' and company_fn='C-SG' and order_id=$1`,
      [order.orderId],
    );
    const ledger = await pool.query(
      `select count(*)::int as legs, sum(debit)::text as debit, sum(credit)::text as credit
         from gl_entry where master_fn='M1' and company_fn='C-SG' and journal_ref=$1`,
      [posting.invDocNo],
    );
    assert.equal(stock.rows[0]?.qty, '7.0000', 'production stock must fall from 10 to 7');
    assert.deepEqual(invoice.rows, [{ net: '37.50', tax: '3.38', total: '40.88' }]);
    assert.deepEqual(ledger.rows[0], { legs: 3, debit: '40.88', credit: '40.88' });
    return { stock: stock.rows[0].qty, invoice: invoice.rows[0], ledger: ledger.rows[0] };
  } finally {
    await pool.end();
  }
}

async function waitForPreview(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, 'Demo preview exited before becoming ready');
    try {
      if ((await fetch(demoUrl)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Demo preview did not serve ${demoUrl}`);
}

async function demoPath() {
  const preview = spawn(process.execPath, [
    fileURLToPath(new URL('../../web/node_modules/vite/bin/vite.js', import.meta.url)),
    'preview', '--host', '127.0.0.1', '--port', new URL(demoUrl).port || '4173', '--strictPort',
  ], { cwd: path.join(root, 'web'), stdio: 'ignore' });
  let browser;
  try {
    await waitForPreview(preview);
    browser = await chromium.launch({
      headless: true,
      ...(process.env.DEMO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEMO_CHROMIUM_EXECUTABLE } : {}),
    });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('aria-setup-wizard-complete', '1'));
    await page.goto(demoUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ErpSystemData?.databaseReady === true, null, { timeout: 180_000 });
    await page.locator('#loginShowcase').waitFor({ state: 'visible', timeout: 180_000 });
    await page.locator('#loginShowcase').click();
    await page.locator('#globalSearch').waitFor({ state: 'visible', timeout: 180_000 });
    return await page.evaluate(async () => {
      const adapter = window.ErpSystemData;
      const [productPage, customerPage, warehousePage] = await Promise.all([
        adapter.list('inventory/products', { limit: 100 }),
        adapter.list('sales/customers', { limit: 100 }),
        adapter.list('inventory/warehouses', { limit: 100 }),
      ]);
      const product = productPage.data.find((row) => row.sku === 'SG-WIDGET');
      const customer = customerPage.data.find((row) => row.code === 'CUST1');
      const warehouse = warehousePage.data.find((row) => row.companyFn === 'C-SG');
      if (!product || !customer || !warehouse) throw new Error('Demo seed lacks SG sales fixture records');
      await adapter.db.query(
        `insert into accounting_period (master_fn, company_fn, fiscal_year, period_no, label, start_date, end_date, status)
         values ('M1', 'C-SG', 2026, 10, 'October 2026', '2026-10-01', '2026-10-31', 'open')
         on conflict (master_fn, company_fn, fiscal_year, period_no) do nothing`,
      );
      const suffix = `${Date.now()}`;
      const adjustment = await adapter.create('inventory/adjustments', {
        docNo: `ADJ-DEMO-E2E-${suffix}`, warehouseId: warehouse.id, adjustmentDate: '2026-10-20',
        reason: 'Fictional E2E opening count', lines: [{ productId: product.id, countedQty: '10' }],
      });
      await adapter.action('inventory/adjustments', adjustment.data.id, 'post', {});
      const created = await adapter.create('sales/orders', {
        docNo: `SO-DEMO-E2E-${suffix}`, customerId: customer.id, orderDate: '2026-10-20', currency: 'SGD',
        approvalReason: 'Fictional E2E sales order approval.',
        lines: [{ productId: product.id, qty: '3', unitPrice: '12.50', taxCode: 'SR' }],
      });
      await adapter.action('sales/orders', created.data.orderId, 'approve', { note: 'Fictional E2E approval.' });
      const confirmation = await adapter.action('sales/orders', created.data.orderId, 'confirm', { warehouseId: warehouse.id });
      const [stock] = (await adapter.db.query(
        'select qty::text as qty from stock_level where master_fn=$1 and company_fn=$2 and product_id=$3 and warehouse_id=$4',
        ['M1', 'C-SG', product.id, warehouse.id],
      )).rows;
      const [invoice] = (await adapter.db.query(
        'select net_amount::text as net, tax_amount::text as tax, total_amount::text as total from invoice where master_fn=$1 and company_fn=$2 and order_id=$3',
        ['M1', 'C-SG', created.data.orderId],
      )).rows;
      const [ledger] = (await adapter.db.query(
        'select count(*)::int as legs, sum(debit)::text as debit, sum(credit)::text as credit from gl_entry where master_fn=$1 and company_fn=$2 and journal_ref=$3',
        ['M1', 'C-SG', confirmation.data.invDocNo],
      )).rows;
      return { stock: stock.qty, invoice, ledger };
    });
  } finally {
    await browser?.close();
    preview.kill('SIGTERM');
  }
}

const production = await productionPath();
const demo = await demoPath();
assert.deepEqual(demo, production, 'Demo PGlite and Production PostgreSQL posting facts differ');
console.log(JSON.stringify({ production, demo, parity: 'PASS' }));
