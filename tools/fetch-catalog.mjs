// Firestore(cuppy-408d) -> receipt-catalog.json (다매장). 읽기 전용이며 비밀을 읽지 않는다.
// 실행: node tools/fetch-catalog.mjs   (사용자 gcloud 로그인 토큰 사용, 이후 node tools/build-catalog.mjs)
// 읽는 것: devices(armyLounge.siteId, deviceName), devices/{id}/menu/data(메뉴),
//          kioskProductMappings(기기별 상품코드), kioskSalesSources/{kis-매장코드}(enabled·allowedStores 필드만 마스크로).
// apiCredential·키·wg 설정 등 다른 필드는 요청하지 않는다. 쓰기 요청 없음.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'cuppy-408d';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SIDES = { LEFT: 'L', RIGHT: 'R' };

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };

async function call(url, body) {
  const response = await fetch(url, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${url.replace(BASE, '')}`);
  return response.json();
}

function value(v) {
  const [kind, x] = Object.entries(v)[0];
  if (kind === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([k, y]) => [k, value(y)]));
  if (kind === 'arrayValue') return (x.values || []).map(value);
  if (kind === 'integerValue') return Number(x);
  if (kind === 'nullValue') return null;
  return x;
}
const fields = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, value(v)]));

async function query(collection, field, equals, select) {
  const rows = await call(`${BASE}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: equals } } },
      ...(select ? { select: { fields: select.map(fieldPath => ({ fieldPath })) } } : {}),
    },
  });
  return rows.filter(row => row.document).map(row => ({ id: row.document.name.split('/').pop(), ...fields(row.document) }));
}

async function source(storeCd, issuer) {
  const id = `${issuer}-${storeCd}`;
  const doc = await call(`${BASE}/kioskSalesSources/${id}?mask.fieldPaths=enabled&mask.fieldPaths=allowedStores`);
  if (!doc) return null;
  const f = fields(doc);
  return f.enabled === true && f.allowedStores && f.allowedStores[storeCd] ? { id, pos: f.allowedStores[storeCd] } : null;
}

const roastOf = menus => {
  const americano = menus.find(m => /^아메리카노\(.+\)$/.test(m.name));
  return americano ? americano.name.slice(americano.name.indexOf('(') + 1, -1) : '';
};

async function deviceEntry(device, config) {
  const menuDoc = await call(`${BASE}/devices/${device.id}/menu/data`);
  const categories = menuDoc ? fields(menuDoc).content?.menu || [] : [];
  const items = new Map();
  for (const category of categories) {
    for (const item of category.menuItems || []) {
      if (item.hidden) continue;
      if (items.has(item.id)) throw new Error(`${device.id}: 메뉴 id ${item.id} 중복`);
      items.set(item.id, { id: item.id, name: item.name, price: item.price, category: category.category });
    }
  }
  const mappings = (await query('kioskProductMappings', 'deviceId', device.id, ['menuItemId', 'productCode', 'STORE_CD', 'enabled', 'issuer']))
    .filter(m => m.enabled === true && m.issuer === config.issuer);
  const storeCds = [...new Set(mappings.map(m => m.STORE_CD))];
  if (storeCds.length > 1) throw new Error(`${device.id}: 매장코드 여러 개 ${storeCds}`);
  const menus = [];
  const codes = new Set();
  for (const m of mappings) {
    const item = items.get(m.menuItemId);
    if (!item) continue; // 숨김/삭제된 메뉴의 매핑은 쓰지 않는다
    if (codes.has(m.productCode)) throw new Error(`${device.id}: 상품코드 ${m.productCode} 중복`);
    codes.add(m.productCode);
    menus.push({ ...item, productCode: m.productCode, menuItemId: item.id, storeCd: m.STORE_CD });
  }
  menus.sort((a, b) => a.category.localeCompare(b.category) || a.productCode.localeCompare(b.productCode));
  return { id: device.id, name: device.deviceName || '', storeCd: storeCds[0] || '', visibleMenus: items.size, menus };
}

const config = JSON.parse(readFileSync(join(root, 'tools/sites.json'), 'utf8'));
const out = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString().slice(0, 10),
  issuer: config.issuer,
  posOptions: config.posOptions,
  expectedMenuCount: config.expectedMenuCount,
  defaultSite: config.defaultSite,
  sites: [],
};
for (const site of config.sites) {
  const found = await query('devices', 'armyLounge.siteId', site.id, ['deviceName', 'armyLounge']);
  const devices = {};
  for (const device of found) {
    const side = SIDES[device.armyLounge?.side];
    if (!side) continue;
    if (devices[side]) throw new Error(`${site.id}: ${side} 기기가 여러 대`);
    devices[side] = await deviceEntry(device, config);
  }
  const storeCds = [...new Set(Object.values(devices).map(d => d.storeCd).filter(Boolean))];
  if (storeCds.length > 1) throw new Error(`${site.id}: 기기별 매장코드가 다름 ${storeCds}`);
  const storeCd = storeCds[0] || '';
  const src = storeCd ? await source(storeCd, config.issuer) : null;
  const entry = { id: site.id, name: site.name, storeCd, sourceId: src ? src.id : '', devices: {} };
  for (const side of ['L', 'R']) {
    const d = devices[side];
    if (!d) { entry.devices[side] = null; continue; }
    const receipt = !src ? '키오스크 매장코드 미확인'
      : d.menus.length === 0 ? '상품 매핑 없음'
        : d.menus.length < config.expectedMenuCount ? `상품 매핑 일부만 등록 (${d.menus.length}/${config.expectedMenuCount})` : '';
    const demo = site.demoQr?.[side] ? '' : '데모 QR 기기 연결 없음';
    entry.devices[side] = {
      id: d.id, name: d.name, roast: roastOf(d.menus),
      blocked: { demo, receipt },
      menus: d.menus.map(({ id, name, price, category, productCode, menuItemId, storeCd: s }) => ({ id, name, price, category, productCode, menuItemId, storeCd: s })),
    };
    console.log(`${site.name} ${side}: 표시 ${d.visibleMenus} / 매핑 ${d.menus.length} / ${storeCd || '매장코드 없음'} / 영수증 ${receipt || '가능'} / 데모 ${demo || '가능'}`);
  }
  if (!devices.L && !devices.R) console.log(`${site.name}: 기기 미등록`);
  out.sites.push(entry);
}
writeFileSync(join(root, 'receipt-catalog.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote receipt-catalog.json — 이어서 node tools/build-catalog.mjs');
