// Run: node --test scripts/tests/product-navigation.test.cjs
// Render the real form's handlers in a minimal hook harness; all I/O is mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URLSearchParams, console: { ...console, error() {} }, crypto: globalThis.crypto,
    require: name => imports[name] ?? { default: name },
  }, { filename: file });
  return module.exports;
}
const navigation = load('lib/product-navigation.ts');
const origin = '/products?q=รถเข็น&cat=cat-1&brand=brand-1&shop=shop-1&type=variation&status=inactive&wh=wh-1&page=3&limit=50';

test('return URL round-trips search, all filters and pagination through edit/new/duplicate links', () => {
  for (const [id, duplicate] of [['product-1', undefined], [null, undefined], [null, 'source-1']]) {
    const href = navigation.productEditorUrl(id, origin, duplicate);
    const url = new URL(href, 'http://local.test');
    assert.equal(navigation.productReturnUrl(url.searchParams.get('returnTo')), origin);
    assert.equal(url.searchParams.get('duplicate'), duplicate ?? null);
    assert.equal(url.pathname, id ? '/products/product-1/edit' : '/products/new');
  }
});
test('direct entry and invalid/external return destinations fall back to product list', () => {
  for (const value of [undefined, null, '', 'https://example.com', '//example.com', '/products/../orders', '/products-new', '/products\\evil', '/products?x=\nmalformed']) {
    assert.equal(navigation.productReturnUrl(value), '/products');
  }
});

function harness(response = { ok: true, product: { id: 'saved-id' }, variations: [] }) {
  const state = [];
  let cursor = 0;
  const calls = [], routes = [], toasts = [];
  const jsx = (type, props) => ({ type, props });
  const Form = load('components/products/ProductForm.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
      },
      useRef: initial => ({ current: initial }), useMemo: fn => fn(), useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => ({ push: url => routes.push(['push', url]), replace: url => routes.push(['replace', url]) }) },
    '@/lib/product-navigation': navigation,
    '@/lib/api-client': { apiFetch: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return { ok: response.ok, json: async () => response };
    } },
    '@/lib/auth-context': { useAuth: () => ({ userProfile: { canViewCost: true } }) },
    '@/lib/features-context': { useFeatures: () => ({ features: {} }) },
    '@/lib/toast-context': { useToast: () => ({ showToast: (...args) => toasts.push(args) }) },
    '@/lib/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => true, confirmDialog: null }) },
    '@/lib/product-type-change': { typeChangeBlockReason: () => null },
    '@/components/products/composite/useCompositeEditor': { useCompositeEditor: () => ({ dirtySnapshot: '{}', rows: [], slots: [] }) },
    '@/lib/product-variants': load('lib/product-variants.ts'),
  }).default;
  const find = (tree, name) => {
    if (!tree || typeof tree !== 'object') return;
    if (tree.type === name) return tree.props;
    for (const child of [tree.props?.children].flat(Infinity)) {
      const result = find(child, name);
      if (result) return result;
    }
  };
  return {
    calls, routes, toasts,
    render(props) {
      cursor = 0;
      const tree = Form(props);
      return {
        form: find(tree, '@/components/products/form/ProductFormCard'),
        actions: find(tree, '@/components/ui/StickyActionBar'),
      };
    },
  };
}
const product = { product_id: 'existing-id', code: 'P001', name: 'Test product', product_type: 'simple',
  is_active: true, variations: [], simple_default_price: 100, simple_discount_price: 0 };

test('editing saves via PUT and awaits persisted data reload without returning to the list', async () => {
  const h = harness();
  const saved = [];
  const props = { editingProduct: product, onSaved: async id => saved.push(id), returnTo: origin };
  await h.render(props).actions.onSave();
  assert.equal(h.calls[0].method, 'PUT');
  assert.equal(h.calls[0].body.id, 'existing-id');
  assert.deepEqual(saved, ['saved-id']);
  assert.deepEqual(h.routes, []);
  assert.equal(h.render(props).actions.saving, true, 'locked until parent remounts with persisted rows');
});
test('new and duplicated products save via POST then replace with edit URL carrying original filters', async () => {
  for (const initial of [null, { ...product, product_id: '' }]) {
    const h = harness();
    const props = { editingProduct: initial, returnTo: origin };
    h.render(props).form.onChange({ name: 'New product', default_price: 100 });
    await h.render(props).actions.onSave();
    assert.equal(h.calls[0].method, 'POST');
    assert.equal(h.calls[0].body.id, undefined);
    assert.deepEqual(h.routes, [['replace', navigation.productEditorUrl('saved-id', origin)]]);
    // The edit route mounts with the created ID; subsequent saves update it.
    const editor = harness();
    await editor.render({ editingProduct: { ...product, product_id: 'saved-id' }, onSaved: async () => {} }).actions.onSave();
    assert.equal(editor.calls[0].method, 'PUT');
    assert.equal(editor.calls[0].body.id, 'saved-id');
  }
});
test('save-and-add-next requests a fresh form, with no navigation to the product list', async () => {
  const h = harness();
  let resets = 0;
  const props = { editingProduct: { ...product, product_id: '' }, onAddNext: () => resets++ };
  await h.render(props).actions.extraActions.props.onClick();
  assert.equal(resets, 1);
  assert.deepEqual(h.routes, []);
  assert.equal(h.render(props).actions.saving, false);
});
test('failed saves preserve the form and allow retry without navigating', async () => {
  const h = harness({ ok: false, error: 'Save failed' });
  const props = { editingProduct: product, onSaved: async () => assert.fail('must not reload after failed save') };
  await h.render(props).actions.onSave();
  assert.deepEqual(h.routes, []);
  assert.equal(h.render(props).actions.saving, false);
  assert.equal(h.toasts[0][1], 'error');
});
