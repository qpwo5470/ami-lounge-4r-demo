import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCatalogScript, TARGET } from '../tools/build-catalog.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = require('../receipt-core.js');
const catalog = require('../receipt-catalog.json');

const pobyeong = catalog.sites.find(site => site.id === 'artillery-brigade');
const menu = pobyeong.devices.L.menus.find(item => item.productCode === 'AL001HG');
const base = { menu, storeCd: pobyeong.storeCd, posNo: '01', billNo: '9001', sourceId: pobyeong.sourceId };
// 2026-10-27T15:04:05.678Z = KST 2026-10-28 00:04:05.67 (날짜 넘김 검증)
const crossMidnight = new Date('2026-10-27T15:04:05.678Z');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    get size() { return map.size; },
    entries: () => [...map.entries()],
  };
}

test('endpoint is the production receive endpoint only', () => {
  assert.equal(core.ENDPOINT, 'https://asia-northeast3-cuppy-408d.cloudfunctions.net/receiveKioskSale/receiveKioskSale');
});

test('body carries the kiosk v3 contract fields', () => {
  const attempt = core.buildAttempt({ ...base, now: crossMidnight });
  assert.deepEqual(Object.keys(attempt.body), [
    'STORE_CD', 'POS_NO', 'BILL_NO', 'TRANSACTION_ID', 'APPROVAL_NUM', 'PAYMENT_METHOD', 'PRODUCT',
  ]);
  assert.equal(attempt.body.STORE_CD, 'N61605');
  assert.equal(attempt.body.POS_NO, '01');
  assert.equal(attempt.body.BILL_NO, '9001');
  assert.equal(attempt.body.PAYMENT_METHOD, 'CARD');
  assert.equal(attempt.body.PRODUCT.length, 1);
  assert.deepEqual(Object.keys(attempt.body.PRODUCT[0]), [
    'PAY_SEQ', 'PROD_CD', 'PROD_NM', 'MAP_PROD_CD', 'TAX_YN', 'SALE_AMT', 'QR_PAYLOAD',
  ]);
  const product = attempt.body.PRODUCT[0];
  assert.equal(product.PAY_SEQ, '01');
  assert.equal(product.PROD_CD, 'AL001HG');
  assert.equal(product.MAP_PROD_CD, 'AL001HG');
  assert.equal(product.PROD_NM, '아메리카노(고소)');
  assert.equal(product.TAX_YN, 'Y');
  assert.equal(product.SALE_AMT, 1500);
});

test('TRANSACTION_ID and business date are KST', () => {
  const attempt = core.buildAttempt({ ...base, now: crossMidnight });
  assert.equal(attempt.body.TRANSACTION_ID, '20261028-00:04:05:67');
  assert.match(attempt.body.TRANSACTION_ID, /^\d{8}-\d{2}:\d{2}:\d{2}:\d{2}$/);
  assert.equal(attempt.businessDate, '20261028');
});

test('APPROVAL_NUM is DEMO-prefixed and synthetic', () => {
  const attempt = core.buildAttempt({ ...base, now: crossMidnight });
  assert.equal(attempt.body.APPROVAL_NUM, 'DEMO-261028000405' + '67');
  assert.match(attempt.body.APPROVAL_NUM, /^DEMO-\d{14}$/);
});

test('QR payload is store|pos|date|receipt|01|productCode', () => {
  const attempt = core.buildAttempt({ ...base, now: crossMidnight });
  assert.equal(attempt.qrPayload, 'N61605|01|20261028|9001|01|AL001HG');
  assert.equal(attempt.body.PRODUCT[0].QR_PAYLOAD, attempt.qrPayload);
});

test('receipt number must be 4 digits and inside the high range default', () => {
  assert.throws(() => core.buildAttempt({ ...base, billNo: '901', now: crossMidnight }), /4자리/);
  assert.throws(() => core.buildAttempt({ ...base, billNo: '90011', now: crossMidnight }), /4자리/);
  assert.throws(() => core.buildAttempt({ ...base, billNo: 'abcd', now: crossMidnight }), /4자리/);
  assert.throws(() => core.buildAttempt({ ...base, posNo: '1', now: crossMidnight }), /POS/);
  assert.throws(() => core.buildAttempt({ ...base, sourceId: '  ', now: crossMidnight }), /소스 ID/);
  assert.throws(() => core.buildAttempt({ ...base, menu: null, now: crossMidnight }), /메뉴/);
  const allocated = core.nextBillNo(memoryStorage(), '20261028', '01');
  assert.equal(allocated, '9000');
  assert.ok(Number(allocated) >= core.BILL_NO_MIN && Number(allocated) <= core.BILL_NO_MAX);
});

test('bill number counter is per business date and POS, non-secret only', () => {
  const storage = memoryStorage();
  core.markBillNoUsed(storage, '20261028', '01', '9000');
  assert.equal(core.nextBillNo(storage, '20261028', '01'), '9001');
  assert.equal(core.nextBillNo(storage, '20261028', '02'), '9000');
  assert.equal(core.nextBillNo(storage, '20261029', '01'), '9000');
  core.markBillNoUsed(storage, '20261028', '01', '9500');
  assert.equal(core.nextBillNo(storage, '20261028', '01'), '9501');
  core.markBillNoUsed(storage, '20261028', '01', '9100'); // 과거 번호는 카운터를 되돌리지 않는다
  assert.equal(core.nextBillNo(storage, '20261028', '01'), '9501');
  assert.deepEqual(storage.entries(), [['receipt-mode:billno:20261028:01', '9500']]);
  assert.equal(core.nextBillNo(memoryStorage({ 'receipt-mode:billno:20261028:01': '9999' }), '20261028', '01'), '9999');
});

test('attempt body is immutable so retries resend the exact same bytes', () => {
  const attempt = core.buildAttempt({ ...base, now: crossMidnight });
  const serialized = attempt.serializedBody;
  assert.throws(() => { attempt.body.BILL_NO = '9002'; }, TypeError);
  assert.throws(() => { attempt.serializedBody = '{}'; }, TypeError);
  assert.equal(attempt.serializedBody, serialized);
  assert.equal(JSON.stringify(attempt.body), serialized);
  const later = core.buildAttempt({ ...base, now: new Date(crossMidnight.getTime() + 5000) });
  assert.notEqual(later.serializedBody, serialized); // 새 attempt는 새 시각/승인번호
  assert.equal(later.body.BILL_NO, attempt.body.BILL_NO); // 번호는 자동 변경되지 않는다
});

test('only ACCEPTED/ALREADY_RECEIVED produce a QR', () => {
  for (const code of ['ACCEPTED', 'ALREADY_RECEIVED', 'accepted']) {
    const verdict = core.classifyResponse({ status: 200, data: { code }, parsed: true });
    assert.equal(verdict.ok, true, code);
    assert.equal(verdict.kind, 'accepted');
  }
  assert.equal(core.classifyResponse({ status: 200, data: { result: 'ALREADY_RECEIVED' }, parsed: true }).ok, true);
});

test('errors and ambiguity never produce a QR', () => {
  const cases = [
    [{ status: 400, data: { code: 'INVALID' }, parsed: true }, 'bad_request'],
    [{ status: 401, data: {}, parsed: true }, 'auth'],
    [{ status: 403, data: {}, parsed: true }, 'auth'],
    [{ status: 409, data: { code: 'DUPLICATE' }, parsed: true }, 'conflict'],
    [{ status: 503, data: {}, parsed: true }, 'server'],
    [{ status: 500, data: {}, parsed: true }, 'server'],
    [{ status: 302, data: {}, parsed: true }, 'http'],
    [{ status: 200, data: null, parsed: false }, 'ambiguous'],
    [{ status: 200, data: { code: 'REJECTED' }, parsed: true }, 'rejected'],
    [{ status: 200, data: {}, parsed: true }, 'rejected'],
    [{ networkError: true }, 'network'],
  ];
  for (const [input, kind] of cases) {
    const verdict = core.classifyResponse(input);
    assert.equal(verdict.ok, false, kind);
    assert.equal(verdict.kind, kind);
    assert.ok(verdict.message.length > 0);
  }
});

for (const [siteId, storeCd] of [['artillery-brigade', 'N61605'], ['17-battalion', 'N61742']]) {
  test(`catalog has 29 verified mappings per side for ${siteId}`, () => {
    const site = catalog.sites.find(s => s.id === siteId);
    assert.equal(site.storeCd, storeCd);
    assert.equal(site.sourceId, `kis-${storeCd}`);
    for (const side of ['L', 'R']) {
      const menus = site.devices[side].menus;
      assert.equal(site.devices[side].blocked.receipt, '', side);
      assert.equal(menus.length, 29, side);
      assert.equal(menus.filter(item => item.category === 'HOT').length, 13, side);
      assert.equal(menus.filter(item => item.category === 'ICE').length, 16, side);
      const codes = new Set();
      for (const item of menus) {
        assert.ok(Number.isInteger(item.menuItemId) && item.menuItemId > 0);
        assert.equal(item.menuItemId, item.id);
        assert.match(item.productCode, /^AL\d{3}[HI][GS]?$/);
        assert.ok(typeof item.name === 'string' && item.name.length > 0);
        assert.ok(Number.isInteger(item.price) && item.price > 0);
        assert.equal(item.storeCd, storeCd);
        assert.ok(!codes.has(item.productCode), `duplicate ${item.productCode}`);
        codes.add(item.productCode);
      }
    }
    const l = site.devices.L.menus.find(item => item.productCode === 'AL001HG');
    const r = site.devices.R.menus.find(item => item.productCode === 'AL001HS');
    assert.equal(l.name, '아메리카노(고소)');
    assert.equal(r.name, '아메리카노(산미)');
    const attempt = core.buildAttempt({ ...base, storeCd: site.storeCd, sourceId: site.sourceId, menu: r, now: crossMidnight });
    assert.equal(attempt.body.PRODUCT[0].PROD_NM, '아메리카노(산미)');
    assert.equal(attempt.body.STORE_CD, storeCd);
  });
}

test('generated catalog script is in sync with the json source', () => {
  assert.equal(readFileSync(TARGET, 'utf8'), renderCatalogScript());
});

test('no secret-looking values are committed in the page sources', () => {
  for (const file of ['index.html', 'app.js', 'receipt.js', 'receipt-core.js', 'receipt-catalog.js', 'receipt-catalog.json']) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._-]{8,}/, file);
    assert.doesNotMatch(text, /(api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{8,}/i, file);
  }
  const receipt = readFileSync(join(root, 'receipt.js'), 'utf8');
  assert.doesNotMatch(receipt, /(localStorage|sessionStorage)\.setItem\([^)]*authKey/);
  assert.doesNotMatch(receipt, /console\.(log|warn|error|info)/);
});

test('demo mode assets and menu list are untouched by receipt mode', () => {
  const globals = { window: {} };
  const demoSource = readFileSync(join(root, 'menu.js'), 'utf8');
  new Function('window', demoSource)(globals.window);
  assert.equal(globals.window.DEMO_MENU.length, 29);
  assert.equal(globals.window.DEMO_MENU.filter(item => item.category === 'HOT').length, 13);
  const receiptSource = readFileSync(join(root, 'receipt.js'), 'utf8');
  assert.doesNotMatch(receiptSource, /DEMO_MENU/);
  assert.doesNotMatch(receiptSource, /qr\//);
});
