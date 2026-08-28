#!/usr/bin/env node
// Scrape Shopee Open Platform API v2 docs → api_doc_knowledge/Shopee/*.md
// ไม่ต้อง login/headless browser — หน้า docs เป็น SPA ที่ดึงจาก JSON endpoint สาธารณะ:
//   GET https://open.shopee.com/api/v1/doc/module/?version=2      (รายชื่อหมวด+API)
//   GET https://open.shopee.com/api/v1/doc/api/?version=2&api_id= (สเปคเต็มราย API)
//
// Usage: node scripts/scrape-shopee-docs.mjs
// รันซ้ำได้ทุกเมื่อ — เขียนลง dir ชั่วคราวก่อนแล้วค่อย swap ทับของเดิมเมื่อครบ

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://open.shopee.com/api/v1';
const OUT_DIR = path.join(process.cwd(), 'api_doc_knowledge', 'Shopee');
const TMP_DIR = OUT_DIR + '.new';
const CONCURRENCY = 4;

const METHOD_LABEL = { 1: 'POST', 2: 'GET', 3: 'PUT', 4: 'DELETE' };

async function getJson(url, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= retries) throw new Error(`${url} → ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

function paramRows(list, depth = 0) {
  const rows = [];
  for (const p of list || []) {
    const arrow = '↳ '.repeat(depth);
    const req = String(p.required) === 'True' ? '✅' : '';
    rows.push(`| ${arrow}${esc(p.name)} | ${esc(p.type)} | ${req} | ${esc(p.sample)} | ${esc(p.description)} |`);
    if (p.children?.length) rows.push(...paramRows(p.children, depth + 1));
  }
  return rows;
}

function paramTable(title, list) {
  if (!list?.length) return '';
  return [
    `### ${title}`,
    '',
    '| Field | Type | Required | Sample | Description |',
    '| --- | --- | --- | --- | --- |',
    ...paramRows(list),
    '',
  ].join('\n');
}

function renderApi(d) {
  const out = [];
  out.push(`## ${d.api_name}`, '');
  out.push(`**Method:** \`${METHOD_LABEL[d.method] || d.method}\`  `);
  out.push(`**Path:** \`${d.path}\``, '');
  if (d.define) out.push(d.define.trim(), '');

  if (d.url || d.test_url) {
    out.push('### Endpoints', '', '| Environment | URL |', '| --- | --- |');
    if (d.url) out.push(`| Production | \`${d.url}\` |`);
    if (d.test_url) out.push(`| Test/Sandbox | \`${d.test_url}\` |`);
    out.push('');
  }

  let common = [];
  let params = { request_params: [], response_params: [] };
  try { common = JSON.parse(d.common_params || '[]'); } catch {}
  try { params = JSON.parse(d.params || '{}'); } catch {}

  out.push(paramTable('Common Parameters', common));
  out.push(paramTable('Request Parameters', params.request_params));
  out.push(paramTable('Response Parameters', params.response_params));

  try {
    const samples = JSON.parse(d.request_sample || '[]');
    const pick = samples.find((s) => s.type === 'Python') || samples[0];
    if (pick?.value) {
      out.push(`### Request Example (${pick.type})`, '', '```' + pick.type.toLowerCase(), pick.value.trim(), '```', '');
    }
  } catch {}

  if (d.response_sample) {
    out.push('### Response Example', '', '```json', String(d.response_sample).trim(), '```', '');
  }

  const errs = d.error_list || [];
  if (errs.length) {
    out.push('### Errors', '', '| Error | Description | Solution |', '| --- | --- | --- |');
    for (const e of errs) out.push(`| ${esc(e.name)} | ${esc(e.description)} | ${esc(e.solution)} |`);
    out.push('');
  }

  const logs = d.update_log_list || [];
  if (logs.length) {
    out.push('### Update Log', '', '| Date | Change |', '| --- | --- |');
    for (const l of logs) out.push(`| ${esc(l.date)} | ${esc(l.content)} |`);
    out.push('');
  }

  return out.join('\n');
}

const fileNameFor = (moduleName) => moduleName.toLowerCase().replace(/\s+/g, '_') + '.md';

async function main() {
  const catalog = await getJson(`${BASE}/doc/module/?version=2`);
  const modules = (catalog.modules || []).filter((m) =>
    (m.items || []).some((it) => String(it.name || '').startsWith('v2.'))
  );

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const indexRows = [];
  let grandTotal = 0;
  const failures = [];

  for (const m of modules) {
    const items = (m.items || []).filter((it) => String(it.name || '').startsWith('v2.'));
    const details = new Array(items.length);

    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < items.length) {
          const i = cursor++;
          const it = items[i];
          try {
            details[i] = await getJson(`${BASE}/doc/api/?version=2&api_id=${it.id}`);
          } catch (e) {
            failures.push(`${m.module_name}/${it.name}: ${e.message}`);
          }
          await new Promise((r) => setTimeout(r, 120));
        }
      })
    );

    const ok = details.filter(Boolean);
    const body = [
      `# ${m.module_name}`, '',
      '_Shopee Open Platform API v2_', '',
      '---', '',
      ...ok.map(renderApi),
    ].join('\n');
    const file = fileNameFor(m.module_name);
    fs.writeFileSync(path.join(TMP_DIR, file), body);
    indexRows.push({ name: m.module_name, count: ok.length, total: items.length, file });
    grandTotal += ok.length;
    console.log(`✓ ${m.module_name}: ${ok.length}/${items.length}`);
  }

  const today = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const index = [
    '# Shopee Open Platform API v2 — Index', '',
    `_Scraped on ${today}_`, '',
    `_Total: ${grandTotal} API endpoints in ${indexRows.length} modules_`, '',
    '| # | Module | APIs | File |',
    '| --- | --- | --- | --- |',
    ...indexRows.map((r, i) => `| ${i + 1} | ${r.name} | ${r.count}/${r.total} | [${r.file}](./${r.file}) |`),
    '',
    '_Refresh anytime: `node scripts/scrape-shopee-docs.mjs` (public JSON endpoints — no login needed)_',
  ].join('\n');
  fs.writeFileSync(path.join(TMP_DIR, '_INDEX.md'), index);

  if (failures.length) {
    console.error(`\n${failures.length} APIs failed:`);
    failures.forEach((f) => console.error('  ' + f));
    if (failures.length > grandTotal * 0.05) {
      console.error('Too many failures — keeping the old docs. Re-run to retry.');
      process.exit(1);
    }
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.renameSync(TMP_DIR, OUT_DIR);
  console.log(`\nDone: ${grandTotal} APIs, ${indexRows.length} modules → ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
