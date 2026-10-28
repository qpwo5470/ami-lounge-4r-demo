/* 브라우저 테스트: 설치된 Chrome + playwright-core, fetch는 전부 모킹한다.
   실제 운영 엔드포인트로 나가는 요청은 없다(라우트에서 로컬 응답으로 가로채거나 실패시킨다). */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../.devtools/node_modules/playwright-core');
const jsQR = require('../.devtools/node_modules/jsqr').default; // 독립 디코더(검증 전용)
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT_GLOB = '**/receiveKioskSale/receiveKioskSale';
const FAKE_KEY = 'test-only-fake-key-0000';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

let server;
let origin;
let browser;

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      res.end(body);
    } catch (_) {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  // DNS를 로컬로만 묶어 실제 운영 엔드포인트로 나갈 수 없게 한다(모킹 누락 방지).
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1'],
  });
});

test.after(async () => {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
});

async function newPage(query = '', viewport = { width: 420, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    // 모킹된 엔드포인트의 상태코드/중단으로 생기는 리소스 로딩 잡음은 제외한다.
    const noise = message.text().startsWith('Failed to load resource')
      && message.location().url.includes('receiveKioskSale');
    if (message.type() === 'error' && !noise) errors.push(message.text());
  });
  const external = [];
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    external.push(url);
    return route.abort('blockedbyclient');
  });
  page.errors = errors;
  page.external = external;
  await page.goto(`${origin}/index.html${query}`, { waitUntil: 'load' });
  return page;
}

/* 수신 엔드포인트 모킹. 실제 네트워크로 나가지 않는다. */
async function mockEndpoint(page, responder) {
  const seen = [];
  await page.route(ENDPOINT_GLOB, async route => {
    seen.push({ postData: route.request().postData(), headers: await route.request().allHeaders(), method: route.request().method() });
    await responder(route, seen.length);
  });
  return seen;
}

/* 운영에서는 루트가 이 Pages origin에 CORS를 허용하므로 모킹도 같은 헤더를 준다. */
const json = (status, body, delay = 0) => async route => {
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  await route.fulfill({
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Kiosk-Source',
    },
    body: JSON.stringify(body),
  });
};

/* 화면에 그려진 SVG 모듈을 픽셀로 펼쳐 독립 디코더로 읽는다(라이브러리 재인코딩 비교가 아님). */
async function decodeRenderedQr(page) {
  const { d, viewBox } = await page.locator('#receipt-result svg.receipt-qr').evaluate(svg => ({
    d: svg.querySelector('path').getAttribute('d'),
    viewBox: svg.getAttribute('viewBox'),
  }));
  const size = Number(viewBox.split(' ')[2]);
  const scale = 4;
  const side = size * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  const paint = (x, y) => {
    for (let py = y * scale; py < (y + 1) * scale; py += 1) {
      for (let px = x * scale; px < (x + 1) * scale; px += 1) {
        const index = (py * side + px) * 4;
        data[index] = data[index + 1] = data[index + 2] = 0;
      }
    }
  };
  for (const [, x, y] of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) paint(Number(x), Number(y));
  return jsQR(data, side, side);
}

async function prepareReceipt(page, { side, drink } = {}) {
  await page.click('#mode-receipt');
  if (side) await page.selectOption('#device', side);
  await page.fill('#auth-key', FAKE_KEY);
  await page.click('#auth-apply');
  const target = drink || (await page.locator('#receipt-drinks button').first().textContent());
  await page.locator('#receipt-drinks button', { hasText: target.split(' · ')[0] }).first().click();
  return target;
}

test('demo mode keeps its existing paths and qr assets', async () => {
  const page = await newPage();
  assert.equal(await page.locator('#demo-mode').isVisible(), true);
  assert.equal(await page.locator('#receipt-mode').isVisible(), false);
  assert.equal(await page.locator('#content .category').count(), 2);
  await page.locator('.category.hot').click();
  assert.equal(await page.locator('#content .drink').count(), 13);
  await page.locator('#content .drink').first().click();
  const img = page.locator('.qr-panel img');
  assert.equal(await img.getAttribute('src'), 'qr/drink-01.svg');
  // 디코딩 완료까지 기다린 뒤 검사한다(로드 경쟁으로 깜빡이지 않도록).
  assert.equal(await img.evaluate(node => node.decode().then(() => node.naturalWidth > 0)), true);
  await page.click('#back');
  await page.click('#back');
  assert.equal(await page.locator('#content .category').count(), 2);
  await page.selectOption('#device', 'R');
  await page.locator('.category.ice').click();
  assert.equal(await page.locator('#content .drink').count(), 16);
  await page.locator('#content .drink').first().click();
  assert.match(await page.locator('h1').textContent(), /아메리카노\(산미\)/);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(page.external, []);
  await page.context().close();
});

test('receipt mode shows the current 29 mappings per side and L/R defaults', async () => {
  const page = await newPage();
  await page.click('#mode-receipt');
  assert.equal(await page.inputValue('#source-id'), 'kis-N61605');
  assert.equal(await page.inputValue('#pos-no'), '01');
  assert.match(await page.inputValue('#bill-no'), /^9\d{3}$/);
  assert.equal(await page.locator('#store-cd').textContent(), 'N61605');
  assert.equal(await page.locator('#receipt-drinks button').count(), 13);
  await page.locator('.category-tab', { hasText: 'ICE' }).click();
  assert.equal(await page.locator('#receipt-drinks button').count(), 16);
  assert.equal(await page.locator('#receipt-drinks button', { hasText: '아메리카노(고소)' }).count(), 1);
  await page.selectOption('#device', 'R');
  assert.equal(await page.inputValue('#pos-no'), '02');
  assert.equal(await page.locator('#receipt-drinks button', { hasText: '아메리카노(산미)' }).count(), 1);
  assert.equal(await page.locator('#receipt-drinks button', { hasText: '아메리카노(고소)' }).count(), 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('accepted response posts the v3 contract with memory-only auth and renders the receipt QR', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED', billNo: '9001' }));
  await prepareReceipt(page, { side: 'L', drink: '아메리카노(고소)' });
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(seen.length, 1);
  const request = seen[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['x-kiosk-source'], 'kis-N61605');
  assert.equal(request.headers.authorization, `Bearer ${FAKE_KEY}`);
  const body = JSON.parse(request.postData);
  assert.equal(body.STORE_CD, 'N61605');
  assert.equal(body.POS_NO, '01');
  assert.match(body.BILL_NO, /^9\d{3}$/);
  assert.match(body.TRANSACTION_ID, /^\d{8}-\d{2}:\d{2}:\d{2}:\d{2}$/);
  assert.match(body.APPROVAL_NUM, /^DEMO-\d{14}$/);
  assert.equal(body.PAYMENT_METHOD, 'CARD');
  assert.deepEqual(body.PRODUCT[0], {
    PAY_SEQ: '01', PROD_CD: 'AL001HG', PROD_NM: '아메리카노(고소)', MAP_PROD_CD: 'AL001HG',
    TAX_YN: 'Y', SALE_AMT: 1500,
    QR_PAYLOAD: `N61605|01|${body.TRANSACTION_ID.slice(0, 8)}|${body.BILL_NO}|01|AL001HG`,
  });
  assert.equal(await page.locator('#receipt-result .payload').textContent(), body.PRODUCT[0].QR_PAYLOAD);
  const decoded = await decodeRenderedQr(page);
  assert.ok(decoded, 'rendered QR must be decodable');
  assert.equal(decoded.data, body.PRODUCT[0].QR_PAYLOAD);
  const shown = await page.locator('#receipt-result dd').allTextContents();
  assert.ok(shown.includes('ACCEPTED'), shown.join('|'));
  assert.ok(shown.includes(body.BILL_NO));
  assert.ok(shown.includes(body.APPROVAL_NUM));
  assert.ok(shown.includes(body.TRANSACTION_ID));
  // 키는 어디에도 저장되지 않는다
  const stored = await page.evaluate(() => ({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
    keyField: document.querySelector('#auth-key').value, html: document.documentElement.outerHTML,
  }));
  assert.equal(stored.session.length, 0);
  assert.equal(stored.keyField, '');
  assert.ok(!JSON.stringify(stored.local).includes(FAKE_KEY));
  assert.ok(!stored.html.includes(FAKE_KEY));
  assert.ok(stored.local.every(([key]) => key.startsWith('receipt-mode:billno:')), JSON.stringify(stored.local));
  assert.deepEqual(page.errors, []);
  assert.deepEqual(page.external, []); // 모킹되지 않은 외부 요청 없음
  await page.context().close();
});

test('ALREADY_RECEIVED also produces the QR', async () => {
  const page = await newPage();
  await mockEndpoint(page, json(200, { code: 'ALREADY_RECEIVED' }));
  await prepareReceipt(page);
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.ok((await page.locator('#receipt-result dd').allTextContents()).includes('ALREADY_RECEIVED'));
  await page.context().close();
});

for (const [label, responder, kind] of [
  ['401', json(401, { code: 'UNAUTHORIZED' }), 'auth'],
  ['400', json(400, { code: 'INVALID_BODY' }), 'bad_request'],
  ['409', json(409, { code: 'DUPLICATE_BILL_NO' }), 'conflict'],
  ['503', json(503, { code: 'UNAVAILABLE' }), 'server'],
  ['rejected 200', json(200, { code: 'REJECTED' }), 'rejected'],
  ['non-json 200', async route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'OK' }), 'ambiguous'],
  ['network failure', async route => route.abort('failed'), 'network'],
]) {
  test(`no QR on ${label} and retry resends the exact same body`, async () => {
    const page = await newPage();
    const seen = await mockEndpoint(page, responder);
    await prepareReceipt(page);
    await page.click('#receipt-send');
    await page.waitForSelector('#receipt-error:not([hidden])');
    assert.equal(await page.locator('#receipt-error').getAttribute('data-kind'), kind, label);
    assert.equal(await page.locator('#receipt-result').isVisible(), false);
    assert.equal(await page.locator('#receipt-result svg').count(), 0);
    assert.equal(await page.locator('#receipt-retry').isVisible(), true);
    await page.click('#receipt-retry');
    await page.waitForFunction(() => !document.querySelector('#receipt-status').textContent.includes('중'));
    assert.equal(seen.length, 2, label);
    assert.equal(seen[1].postData, seen[0].postData); // 같은 본문/시각/승인번호/QR
    assert.equal(seen[1].headers.authorization, seen[0].headers.authorization);
    assert.equal(await page.locator('#receipt-result').isVisible(), false);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

/* 지연 응답 회귀: 전송 중 기기/모드를 바꾸면 그 응답은 현재 화면의 것이 아니므로 표시하지 않는다.
   요청은 중단하지 않고(수락되었을 수 있으므로) 자동 재전송도 하지 않는다. */
for (const [label, interrupt] of [
  ['side change', async page => page.selectOption('#device', 'L')],
  ['site change and back', async page => { await page.selectOption('#site', '17-battalion'); await page.selectOption('#site', 'artillery-brigade'); await page.selectOption('#device', 'R'); }],
  ['mode change and back', async page => { await page.click('#mode-demo'); await page.click('#mode-receipt'); }],
]) {
  test(`delayed success is not shown after a ${label} while in flight`, async () => {
    const page = await newPage();
    const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }, 650));
    await prepareReceipt(page, { side: 'R', drink: '아메리카노(산미)' });
    await page.click('#receipt-send');
    await interrupt(page);
    assert.equal(await page.locator('#receipt-send').isDisabled(), true); // 맥락이 바뀌어도 이중 전송 금지
    await page.waitForTimeout(900);
    assert.equal(seen.length, 1, label);                                  // 중단도 자동 재전송도 없음
    assert.equal(await page.locator('#receipt-result').isVisible(), false);
    assert.equal(await page.locator('#receipt-result svg').count(), 0);
    assert.equal(await page.locator('#receipt-error').isVisible(), false);
    assert.equal(await page.locator('#receipt-retry').isVisible(), false);
    assert.match(await page.locator('#receipt-status').textContent(), /표시하지 않습니다/);
    assert.deepEqual(page.errors, []);
    // 무효화 이후 새 선택으로 다시 보내면 새 본문으로 정상 동작한다.
    await page.locator('#receipt-drinks button').first().click();
    await page.click('#receipt-send');
    await page.waitForSelector('#receipt-result:not([hidden])');
    assert.equal(seen.length, 2);
    assert.notEqual(seen[1].postData, seen[0].postData);
    await page.context().close();
  });
}

test('delayed error after a side change shows neither QR nor the error box', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(503, { code: 'UNAVAILABLE' }, 650));
  await prepareReceipt(page, { side: 'R' });
  await page.click('#receipt-send');
  await page.selectOption('#device', 'L');
  await page.waitForTimeout(900);
  assert.equal(seen.length, 1);
  assert.equal(await page.locator('#receipt-error').isVisible(), false);
  assert.equal(await page.locator('#receipt-result').isVisible(), false);
  assert.equal(await page.locator('#receipt-retry').isVisible(), false); // 다른 맥락의 요청은 재시도 대상이 아니다
  await page.context().close();
});

test('retry still reuses the same immutable request when the context did not change', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(503, { code: 'UNAVAILABLE' }, 120));
  await prepareReceipt(page);
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-error:not([hidden])');
  await page.unroute(ENDPOINT_GLOB);
  const accepted = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await page.click('#receipt-retry');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(accepted[0].postData, seen[0].postData);
  await page.context().close();
});

test('conflict is shown and identity is never auto-changed on retry', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(409, { code: 'DUPLICATE_BILL_NO' }));
  await prepareReceipt(page);
  const billBefore = await page.inputValue('#bill-no');
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-error:not([hidden])');
  assert.match(await page.locator('#receipt-error').textContent(), /409/);
  await page.click('#receipt-retry');
  await page.waitForFunction(() => !document.querySelector('#receipt-status').textContent.includes('중'));
  assert.equal(seen.length, 2);
  assert.equal(await page.inputValue('#bill-no'), billBefore);
  assert.equal(JSON.parse(seen[1].postData).BILL_NO, JSON.parse(seen[0].postData).BILL_NO);
  await page.context().close();
});

test('double submit is blocked while a request is in flight', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }, 400));
  await prepareReceipt(page);
  await page.click('#receipt-send');
  assert.equal(await page.locator('#receipt-send').isDisabled(), true);
  await page.locator('#receipt-send').dispatchEvent('click');
  await page.locator('#receipt-send').dispatchEvent('click');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(seen.length, 1);
  await page.context().close();
});

test('successful QR is cleared on side, menu, mode and new request changes', async () => {
  const page = await newPage();
  await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await prepareReceipt(page, { side: 'L', drink: '아메리카노(고소)' });
  const shownQr = async () => page.locator('#receipt-result').isVisible();

  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  await page.selectOption('#device', 'R');
  assert.equal(await shownQr(), false);

  await page.locator('#receipt-drinks button').first().click();
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  await page.locator('#receipt-drinks button').nth(1).click();
  assert.equal(await shownQr(), false);

  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  await page.click('#mode-demo');
  assert.equal(await shownQr(), false);
  await page.click('#mode-receipt');
  assert.equal(await shownQr(), false);

  await page.locator('#receipt-drinks button').first().click();
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  await page.fill('#bill-no', '9123');
  assert.equal(await shownQr(), false);
  await page.fill('#source-id', 'kis-N61605');
  assert.equal(await shownQr(), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a new request after success uses a fresh bill number and new timestamp', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await prepareReceipt(page);
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(seen.length, 2);
  const first = JSON.parse(seen[0].postData);
  const second = JSON.parse(seen[1].postData);
  assert.notEqual(second.BILL_NO, first.BILL_NO);
  assert.equal(Number(second.BILL_NO), Number(first.BILL_NO) + 1);
  assert.notEqual(second.TRANSACTION_ID, first.TRANSACTION_ID);
  assert.notEqual(second.PRODUCT[0].QR_PAYLOAD, first.PRODUCT[0].QR_PAYLOAD);
  await page.context().close();
});

test('manual bill number is respected and never auto-rewritten', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await prepareReceipt(page);
  await page.fill('#bill-no', '9777');
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(JSON.parse(seen[0].postData).BILL_NO, '9777');
  assert.equal(await page.inputValue('#bill-no'), '9777');
  await page.context().close();
});

test('send is blocked without a key and the key survives menu changes', async () => {
  const page = await newPage();
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await page.click('#mode-receipt');
  await page.locator('#receipt-drinks button').first().click();
  assert.equal(await page.locator('#receipt-send').isDisabled(), true);
  await page.fill('#auth-key', FAKE_KEY);
  await page.click('#auth-apply');
  assert.equal(await page.locator('#auth-state').textContent(), '키 적용됨 (메모리 전용)');
  await page.locator('.category-tab', { hasText: 'ICE' }).click();
  await page.locator('#receipt-drinks button').nth(2).click();
  await page.selectOption('#device', 'R');
  await page.locator('#receipt-drinks button').nth(1).click();
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(seen[0].headers.authorization, `Bearer ${FAKE_KEY}`);
  await page.click('#auth-clear');
  assert.equal(await page.locator('#receipt-send').isDisabled(), true);
  assert.equal(await page.locator('#receipt-result').isVisible(), false);
  await page.context().close();
});

/* ---- 다매장: 매장 선택, 준비 중 차단, URL 파라미터, 모바일 레이아웃 ---- */
test('site picker lists six sites and the legacy ?device=R link opens Pobyeong R', async () => {
  const page = await newPage('?device=R');
  const options = await page.locator('#site option').allTextContents();
  assert.equal(options.length, 6);
  assert.equal(await page.inputValue('#site'), 'artillery-brigade');
  assert.equal(await page.inputValue('#device'), 'R');
  assert.match(options.join('|'), /포병여단\|17대대\|공병대대 \(준비 중\)/);
  assert.match(await page.locator('#site-badge').textContent(), /포병여단/);
  await page.locator('.category.hot').click();
  await page.locator('#content .drink').first().click();
  assert.match(await page.locator('#description').textContent(), /포병여단 R 기기/);
  assert.equal(await page.locator('#site-status').isVisible(), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('?site=17-battalion&device=R selects the site; demo QR is blocked with a reason', async () => {
  const page = await newPage('?site=17-battalion&device=R');
  assert.equal(await page.inputValue('#site'), '17-battalion');
  assert.equal(await page.inputValue('#device'), 'R');
  assert.match(await page.locator('#device option[value="R"]').textContent(), /산미/);
  assert.equal(await page.locator('#site-status').isVisible(), true);
  assert.match(await page.locator('#site-status').textContent(), /데모 QR 기기 연결 없음/);
  assert.equal(await page.locator('#content .category').count(), 0);
  assert.equal(await page.locator('#content img').count(), 0);
  assert.equal(await page.locator('.blocked-panel').isVisible(), true);
  const shown = (await page.locator('title, header, #site-status, #demo-mode, footer').allTextContents()).join('|');
  assert.doesNotMatch(shown, /포병여단/); // 매장 목록 외 문구에 포병여단 하드코딩 없음
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('unknown site falls back to the default site', async () => {
  const page = await newPage('?site=nope&device=L');
  assert.equal(await page.inputValue('#site'), 'artillery-brigade');
  assert.equal(await page.locator('#content .category').count(), 2);
  await page.context().close();
});

test('switching sites resets the demo flow, hides QR and updates the URL', async () => {
  const page = await newPage();
  await page.locator('.category.ice').click();
  await page.locator('#content .drink').first().click();
  assert.equal(await page.locator('.qr-panel img').count(), 1);
  await page.selectOption('#site', '17-battalion');
  assert.equal(await page.locator('.qr-panel img').count(), 0);
  assert.equal(await page.locator('#back').isVisible(), false);
  assert.match(page.url(), /site=17-battalion/);
  assert.match(page.url(), /device=L/);
  await page.selectOption('#device', 'R');
  assert.match(page.url(), /device=R/);
  await page.selectOption('#site', 'artillery-brigade');
  assert.equal(await page.locator('#content .category').count(), 2);
  assert.equal(await page.locator('#site-status').isVisible(), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('17-battalion receipt mode uses its own store, source and product codes', async () => {
  const page = await newPage('?site=17-battalion&device=L');
  const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
  await page.click('#mode-receipt');
  assert.equal(await page.locator('#site-status').isVisible(), false);
  assert.equal(await page.locator('#store-cd').textContent(), 'N61742');
  assert.equal(await page.inputValue('#source-id'), 'kis-N61742');
  assert.equal(await page.locator('#receipt-drinks button').count(), 13);
  await page.fill('#auth-key', FAKE_KEY);
  await page.click('#auth-apply');
  await page.locator('#receipt-drinks button', { hasText: '아메리카노(고소)' }).click();
  await page.click('#receipt-send');
  await page.waitForSelector('#receipt-result:not([hidden])');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers['x-kiosk-source'], 'kis-N61742');
  const body = JSON.parse(seen[0].postData);
  assert.equal(body.STORE_CD, 'N61742');
  assert.equal(body.PRODUCT[0].PROD_CD, 'AL001HG');
  assert.match(body.PRODUCT[0].QR_PAYLOAD, /^N61742\|01\|/);
  assert.equal((await decodeRenderedQr(page)).data, body.PRODUCT[0].QR_PAYLOAD);
  assert.match(await page.locator('#receipt-selected').textContent(), /17대대-L/);
  // 매장을 바꾸면 결과 QR이 사라지고 다른 매장 값으로 바뀐다.
  await page.selectOption('#site', 'artillery-brigade');
  assert.equal(await page.locator('#receipt-result').isVisible(), false);
  assert.equal(await page.locator('#store-cd').textContent(), 'N61605');
  assert.equal(await page.inputValue('#source-id'), 'kis-N61605');
  assert.deepEqual(page.external, []);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

for (const [siteId, side, reason] of [
  ['engineer-battalion', 'L', /상품 매핑 일부만 등록/],
  ['58-battalion', 'L', /기기 미등록/],
  ['15-brigade', 'R', /기기 미등록/],
  ['15-brigade-1-battalion', 'L', /기기 미등록/],
]) {
  test(`${siteId} ${side} is pending: no QR and no send in either mode`, async () => {
    const page = await newPage(`?site=${siteId}&device=${side}`);
    const seen = await mockEndpoint(page, json(200, { code: 'ACCEPTED' }));
    assert.equal(await page.locator('#content img').count(), 0);
    assert.equal(await page.locator('#content .category').count(), 0);
    assert.equal(await page.locator('#site-status').isVisible(), true);
    await page.click('#mode-receipt');
    assert.match(await page.locator('#site-status').textContent(), reason);
    assert.equal(await page.locator('#receipt-drinks button').count(), 0);
    assert.match(await page.locator('#receipt-drinks').textContent(), /준비 중/);
    await page.fill('#auth-key', FAKE_KEY);
    await page.click('#auth-apply');
    assert.equal(await page.locator('#receipt-send').isDisabled(), true);
    await page.locator('#receipt-send').dispatchEvent('click');
    await page.waitForTimeout(150);
    assert.equal(seen.length, 0);
    assert.equal(await page.locator('#receipt-result svg').count(), 0);
    if (/기기 미등록/.test(String(reason))) {
      assert.equal(await page.locator('#store-cd').textContent(), '미확인');
      assert.match(await page.locator(`#device option[value="${side}"]`).textContent(), /기기 미등록/);
    }
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

test('mobile width has no horizontal overflow for every site and mode', async () => {
  for (const viewport of [{ width: 360, height: 800 }, { width: 800, height: 360 }]) {
    const page = await newPage('', viewport);
    for (const siteId of ['artillery-brigade', '17-battalion', 'engineer-battalion', '15-brigade-1-battalion']) {
      await page.selectOption('#site', siteId);
      for (const mode of ['#mode-demo', '#mode-receipt']) {
        await page.click(mode);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 0, `${viewport.width} ${siteId} ${mode} overflow ${overflow}`);
      }
    }
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test('17-battalion L shows the shared demo QR with the site name', async () => {
  const page = await newPage('?site=17-battalion&device=L');
  assert.equal(await page.locator('#site-status').isVisible(), false);
  await page.locator('.category.ice').click();
  await page.locator('#content .drink').first().click();
  assert.match(await page.locator('h1').textContent(), /아메리카노\(고소\)/);
  assert.match(await page.locator('#description').textContent(), /17대대 L 기기/);
  const img = page.locator('.qr-panel img');
  assert.equal(await img.getAttribute('src'), 'qr/drink-14.svg');
  assert.equal(await img.evaluate(node => node.decode().then(() => node.naturalWidth > 0)), true);
  await page.selectOption('#device', 'R');
  assert.equal(await page.locator('.qr-panel img').count(), 0);
  assert.match(await page.locator('#site-status').textContent(), /데모 QR 기기 연결 없음/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
