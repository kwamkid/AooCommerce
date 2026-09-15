// Run: node --test scripts/tests/buyer-adapter-imports.test.cjs
// Native ESM preserves temporal-dead-zone checks, unlike a CommonJS mock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

test('all adapter entry points initialize without an import cycle and preserve masking', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buyer-adapters-'));
  const files = ['lib/marketplace/buyer-shared.ts', 'lib/marketplace/buyer-adapter.ts',
    'lib/lazada/buyer-adapter.ts', 'lib/shopee/buyer-adapter.ts', 'lib/tiktok/buyer-adapter.ts', 'lib/thai-address-data.ts'];
  try {
    for (const file of files) {
      const destination = path.join(directory, file.replace(/\.ts$/, '.mjs'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      }).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
        const target = specifier.startsWith('@/') ? specifier.slice(2) : path.join(path.dirname(file), specifier);
        return `from ${JSON.stringify(pathToFileURL(path.join(directory, target + '.mjs')).href)}`;
      });
      fs.writeFileSync(destination, code);
    }
    const registry = pathToFileURL(path.join(directory, 'lib/marketplace/buyer-adapter.mjs')).href;
    for (const entry of ['lazada', 'shopee', 'tiktok', 'marketplace']) {
      const first = pathToFileURL(path.join(directory, `lib/${entry}/buyer-adapter.mjs`)).href;
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        await import(${JSON.stringify(first)});
        const { extractBuyer, getBuyerAdapter } = await import(${JSON.stringify(registry)});
        for (const platform of ['lazada', 'shopee', 'tiktok']) assert.ok(getBuyerAdapter(platform));
        const lazada = extractBuyer('lazada', { order: { address_shipping: {
          first_name: '***', phone: '095*****86', post_code: '43000', city: 'เมืองหนองคาย/ Mueang Nong Khai'
        } } });
        assert.equal(lazada.name, null);
        assert.equal(lazada.phone, null);
        assert.equal(lazada.amphoe, 'เมืองหนองคาย');
        assert.equal(lazada.province, 'หนองคาย');
        const tiktok = extractBuyer('tiktok', { recipient_address: { postal_code: '43***' } });
        assert.equal(tiktok.postal_code, null);
        const shopee = extractBuyer('shopee', { recipient_address: { name: ' Customer ', phone: '****' } });
        assert.equal(shopee.name, 'Customer');
        assert.equal(shopee.phone, null);
        assert.equal(extractBuyer('unknown', {}).name, null);
        console.log('ok');
      `], { encoding: 'utf8' });
      assert.equal(result.trim(), 'ok');
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
