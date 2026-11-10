/* Execute the actual shell with inert DOM nodes. Never create/decode/generate a QR or send requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { renderCatalogScript } from '../tools/build-catalog.mjs';
const catalog = JSON.parse(readFileSync(new URL('../receipt-catalog.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
class Node {
  value = ''; children = []; classList = { toggle() {} };
  constructor(value = '') { this.value = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener() {} setAttribute() {} focus() {}
}
function shell(input = structuredClone(catalog)) {
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) {
        const node = new Node();
        if (selector === '#device') node.options = [new Node('L'), new Node('R')];
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    createElement(tag) { assert.notEqual(tag, 'img', 'tests must not display or generate QR images'); return new Node(); },
    dispatchEvent() {},
  };
  const window = { RECEIPT_CATALOG: input, DEMO_MENU: [], location: {search:'',pathname:'/'}, history: {replaceState(){}} };
  vm.runInNewContext(source, { window, document, URLSearchParams, Option: Node, CustomEvent: class {} });
  return { api:window.DEMO_SHELL, data:input, nodes, document };
}
test('all six sites/twelve sides permit existing DEMO display, including missing receipt registration', () => {
  const {api,data}=shell(); let ready=0;
  for (const site of data.sites) for (const side of ['L','R']) {
    assert.equal(api.availability(site.id,side,'demo').ready,true,`${site.id}/${side}`);ready++;
  }
  assert.equal(ready,12);
});
test('receipt readiness/blocked reasons stay independent from demo display permission', () => {
  const {api,data}=shell();
  for (const site of data.sites) for (const side of ['L','R']) {
    const device=site.devices[side];
    const before=JSON.stringify(api.availability(site.id,side,'receipt'));
    site.demoQr[side]=false;
    assert.equal(JSON.stringify(api.availability(site.id,side,'receipt')),before);
    assert.equal(api.availability(site.id,side,'receipt').ready,Boolean(device&&!device.blocked.receipt&&site.sourceId&&site.storeCd&&device.menus.length));
  }
  for(const id of ['15-brigade','15-brigade-1-battalion','58-battalion']) {
    const site=data.sites.find(s=>s.id===id);assert.equal(site.devices.L,null);assert.equal(site.devices.R,null);
    assert.equal(site.storeCd,'');assert.equal(site.sourceId,'');
  }
});
test('explicit false closes DEMO permission without reopening receipt controls', () => {
  const {api,data}=shell();data.sites[0].demoQr.L=false;
  assert.equal(api.availability(data.sites[0].id,'L','demo').ready,false);
});
test('old catalog without the optional display map retains legacy demo gating', () => {
  const {api,data}=shell();for(const site of data.sites)delete site.demoQr;
  assert.equal(api.availability('artillery-brigade','L','demo').ready,true);
  assert.equal(api.availability('58-battalion','L','demo').ready,false);
});
test('actual rendered title and badge identify a common L/R page while preserving selected site', () => {
  const {nodes,document}=shell();
  assert.match(nodes.get('#site-badge').textContent,/공용 L\/R/);
  assert.match(document.title,/공용 L\/R/);
  assert.match(nodes.get('#site-badge').textContent,/포병여단/);
});
test('generated catalog script matches JSON without generating QR payloads', () => {
  assert.equal(readFileSync(new URL('../receipt-catalog.js', import.meta.url),'utf8'),renderCatalogScript());
});
