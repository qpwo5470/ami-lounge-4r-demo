// receipt-catalog.json -> receipt-catalog.js (CSP connect-src가 수신 엔드포인트만 허용하므로 fetch 대신 스크립트로 싣는다)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = join(root, 'receipt-catalog.json');
export const TARGET = join(root, 'receipt-catalog.js');

export function renderCatalogScript() {
  const catalog = JSON.parse(readFileSync(SOURCE, 'utf8'));
  return `// 자동 생성 파일. 수정하지 말고 \`node tools/build-catalog.mjs\`로 다시 만든다. 원본: receipt-catalog.json\n`
    + `window.RECEIPT_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TARGET, renderCatalogScript());
  console.log(`wrote ${TARGET}`);
}
