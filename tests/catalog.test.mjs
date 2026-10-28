/* 다매장 카탈로그 스키마와 매장별 준비 상태. 카탈로그는 tools/fetch-catalog.mjs가 Firestore에서 생성한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = require('../receipt-catalog.json');
const sites = JSON.parse(readFileSync(join(root, 'tools/sites.json'), 'utf8'));
const byId = id => catalog.sites.find(site => site.id === id);

test('catalog schema v2 lists every configured army lounge site in order', () => {
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.issuer, 'kis');
  assert.deepEqual(catalog.posOptions, ['01', '02']);
  assert.equal(catalog.defaultSite, 'artillery-brigade');
  assert.deepEqual(catalog.sites.map(site => site.id), sites.sites.map(site => site.id));
  assert.deepEqual(catalog.sites.map(site => site.name), ['포병여단', '17대대', '공병대대', '15여단', '15여단 1대대', '58대대']);
  for (const site of catalog.sites) {
    assert.deepEqual(Object.keys(site).sort(), ['devices', 'id', 'name', 'sourceId', 'storeCd'], site.id);
    assert.deepEqual(Object.keys(site.devices).sort(), ['L', 'R'], site.id);
    if (site.storeCd) assert.match(site.storeCd, /^N\d{5}$/);
    if (site.sourceId) assert.equal(site.sourceId, `kis-${site.storeCd}`);
    for (const side of ['L', 'R']) {
      const device = site.devices[side];
      if (device === null) continue;
      assert.match(device.id, /^[0-9a-f-]{36}$/);
      assert.equal(typeof device.blocked.demo, 'string');
      assert.equal(typeof device.blocked.receipt, 'string');
      for (const item of device.menus) {
        assert.deepEqual(Object.keys(item).sort(), ['category', 'id', 'menuItemId', 'name', 'price', 'productCode', 'storeCd']);
        assert.ok(['HOT', 'ICE'].includes(item.category));
        assert.equal(item.storeCd, site.storeCd);
      }
    }
  }
});

test('device ids are unique across sites and match the placements', () => {
  const ids = catalog.sites.flatMap(site => ['L', 'R'].map(side => site.devices[side]?.id).filter(Boolean));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(byId('artillery-brigade').devices.L.id, '05756b01-ee1c-4df7-8492-7b6f00485152');
  assert.equal(byId('artillery-brigade').devices.R.id, 'dc40f9a1-5b8f-4579-aa2f-58d4b8a08aa7');
  assert.equal(byId('17-battalion').devices.L.id, 'de8aface-79b0-40e1-bdfb-45a028a12f95');
  assert.equal(byId('17-battalion').devices.R.id, 'b250e466-6c8b-4b81-8238-bebe93f18d39');
  assert.equal(byId('17-battalion').devices.L.roast, '고소');
  assert.equal(byId('17-battalion').devices.R.roast, '산미');
});

test('readiness: only sites with verified demo bindings allow demo QR', () => {
  for (const site of catalog.sites) {
    const configured = sites.sites.find(s => s.id === site.id).demoQr;
    for (const side of ['L', 'R']) {
      const device = site.devices[side];
      if (!device) continue;
      assert.equal(device.blocked.demo === '', configured[side] === true, `${site.id} ${side}`);
    }
  }
  assert.equal(byId('artillery-brigade').devices.L.blocked.demo, '');
  assert.equal(byId('artillery-brigade').devices.R.blocked.demo, '');
  assert.equal(byId('17-battalion').devices.L.blocked.demo, '');
  assert.equal(byId('17-battalion').devices.R.blocked.demo, '');
});

test('readiness: partial or missing mappings and unknown stores block receipts', () => {
  const engineer = byId('engineer-battalion');
  for (const side of ['L', 'R']) {
    if (!engineer.devices[side]) continue;
    assert.notEqual(engineer.devices[side].blocked.receipt, '', side);
  }
  for (const id of ['15-brigade', '15-brigade-1-battalion', '58-battalion']) {
    const site = byId(id);
    assert.equal(site.devices.L, null, id);
    assert.equal(site.devices.R, null, id);
    assert.equal(site.storeCd, '', id);
    assert.equal(site.sourceId, '', id);
  }
  for (const site of catalog.sites) {
    for (const side of ['L', 'R']) {
      const device = site.devices[side];
      if (!device || device.blocked.receipt) continue;
      assert.ok(site.sourceId && site.storeCd, `${site.id} ${side} ready needs a source`);
      assert.equal(device.menus.length, catalog.expectedMenuCount, `${site.id} ${side}`);
    }
  }
});

test('fetch tool is read-only and never requests credential fields', () => {
  const source = readFileSync(join(root, 'tools/fetch-catalog.mjs'), 'utf8');
  assert.doesNotMatch(source, /method:\s*'(PATCH|DELETE|PUT)'/);
  assert.doesNotMatch(source, /:commit|:batchWrite|documents:beginTransaction/);
  assert.match(source, /mask\.fieldPaths=enabled&mask\.fieldPaths=allowedStores/);
  assert.doesNotMatch(source.replace(/^\/\/.*$/gm, ''), /apiCredential|wg_config|authSecret/);
});
