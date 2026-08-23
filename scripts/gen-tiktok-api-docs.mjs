#!/usr/bin/env node
// สร้างเอกสาร TikTok Shop API เป็น markdown จาก OAS ของ TTS Open Toolkit
//
// ทำไมต้องมีสคริปต์นี้: เอกสาร TikTok อยู่หลัง login (docv2 เป็น SPA) เมื่อก่อน
// ต้องให้ AI ไล่เปิดอ่านทีละหน้า ช้ามากและได้สำเนาที่แช่แข็งทันที
// ตอนนี้ ByteDance แจก OAS ฉบับเต็มมากับ @tts-open-toolkit/cli แล้ว
// → อัปเดตเอกสาร = `tts_open_toolkit update --yes` + `skill add --agent cc --update`
//   แล้วรันไฟล์นี้ ไม่ต้อง crawl อีก
//
// Usage: node scripts/gen-tiktok-api-docs.mjs [--out DIR]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OAS_DIR = path.join(os.homedir(), '.claude/skills/tts-openapi-guide/references/oas');
const outArg = process.argv.indexOf('--out');
const OUT_DIR = outArg > -1
  ? process.argv[outArg + 1]
  : path.join(process.cwd(), ' api_doc_knowledge/Tiktok');

if (!fs.existsSync(OAS_DIR)) {
  console.error(`ไม่พบ OAS ที่ ${OAS_DIR}`);
  console.error('ติดตั้งก่อน: npm i -g @tts-open-toolkit/cli && tts_open_toolkit skill add --agent cc');
  process.exit(1);
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** ชนิดของ schema แบบอ่านออก — array/object กางลูกใน renderProps แยก */
function typeOf(s = {}) {
  if (s.type === 'array') return `array<${s.items?.type || 'object'}>`;
  return s.format === 'binary' ? 'file' : (s.type || 'object');
}

/** ตารางฟิลด์แบบ flatten — ลูกใช้ `^` นำหน้าเหมือนเอกสารทางการของ TikTok */
function renderProps(schema, depth = 0, out = []) {
  if (!schema || depth > 4) return out;
  const props = schema.type === 'array' ? schema.items?.properties : schema.properties;
  const required = new Set((schema.type === 'array' ? schema.items?.required : schema.required) || []);
  if (!props) return out;

  for (const [name, prop] of Object.entries(props)) {
    const desc = (prop.description || '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
    const enums = prop.enum ? ` ค่าที่เป็นไปได้: ${prop.enum.join(', ')}` : '';
    out.push({
      name: '^'.repeat(depth) + name,
      type: typeOf(prop),
      required: required.has(name) ? 'Y' : '',
      desc: desc + enums,
    });
    if (prop.type === 'object' || prop.type === 'array') renderProps(prop, depth + 1, out);
  }
  return out;
}

function table(rows, headers) {
  if (!rows.length) return '';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function renderOperation(p, method, op) {
  // เลข version 6 หลักอยู่ segment ที่ 2 ของ path เสมอ (/module/YYYYMM/...)
  const version = p.split('/')[2] || '';
  const lines = [
    `## ${op.summary || `${method.toUpperCase()} ${p}`}`,
    '',
    (op.description || '').trim(),
    '',
    `**Path:** \`${p}\``,
    `**Method:** \`${method.toUpperCase()}\``,
    version ? `**Version:** ${version}` : '',
    `**Docs:** https://partner.tiktokshop.com/docv2/page/${(op.summary || '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}-${version}`,
    '',
  ];

  const params = op.parameters || [];
  for (const loc of ['path', 'query', 'header']) {
    const rows = params.filter(x => x.in === loc).map(x => [
      x.name, typeOf(x.schema), x.required ? 'Y' : '',
      (x.description || '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim(),
    ]);
    if (rows.length) {
      lines.push(`### ${loc[0].toUpperCase() + loc.slice(1)} Parameters`, '',
        table(rows, ['Name', 'Type', 'Required', 'Description']), '');
    }
  }

  const body = op.requestBody?.content;
  if (body) {
    for (const [ct, def] of Object.entries(body)) {
      const rows = renderProps(def.schema).map(r => [r.name, r.type, r.required, r.desc]);
      lines.push(`### Request Body (\`${ct}\`)`, '',
        rows.length ? table(rows, ['Name', 'Type', 'Required', 'Description']) : '_(ไม่มีฟิลด์ระบุใน spec)_', '');
    }
  }

  const res = op.responses?.['200']?.content?.['application/json']?.schema;
  if (res) {
    const rows = renderProps(res).map(r => [r.name, r.type, r.required, r.desc]);
    if (rows.length) lines.push('### Response', '', table(rows, ['Name', 'Type', 'Required', 'Description']), '');
  }

  lines.push('---', '');
  return lines.filter(l => l !== undefined).join('\n');
}

// ── main ────────────────────────────────────────────────────────────────
const index = JSON.parse(fs.readFileSync(path.join(OAS_DIR, 'index.json'), 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

// ลบ .md เก่าทิ้งก่อน — ไม่งั้นไฟล์ของหมวดที่ TikTok ยุบไปแล้วจะค้างอยู่
// และคนอ่านจะไม่รู้ว่าอันไหนของจริง (ของเก่ากู้จาก git ได้ถ้าต้องการ)
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith('.md')) fs.unlinkSync(path.join(OUT_DIR, f));
}

// วันที่ท้องถิ่น — toISOString เป็น UTC ทำให้ไทย (UTC+7) ได้วันก่อนหน้าตอนดึก
const stamp = new Date().toLocaleDateString('sv-SE');
const summary = [];
let totalOps = 0;

for (const mod of index.modules) {
  const doc = JSON.parse(fs.readFileSync(path.join(OAS_DIR, mod.file), 'utf8'));
  const paths = doc.paths || doc;
  const chunks = [];
  let count = 0;

  for (const p of Object.keys(paths).sort()) {
    for (const method of HTTP_METHODS) {
      const op = paths[p][method];
      if (!op) continue;
      chunks.push(renderOperation(p, method, op));
      count++;
    }
  }

  const name = mod.first_level_path;
  const file = `${name}.md`;
  fs.writeFileSync(path.join(OUT_DIR, file), [
    `# TikTok Shop API — ${name}`,
    '',
    `_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ ${stamp} — ${count} operations_`,
    `_อัปเดต: \`tts_open_toolkit update --yes\` → \`tts_open_toolkit skill add --agent cc --update\` → \`node scripts/gen-tiktok-api-docs.mjs\`_`,
    '',
    `เวอร์ชันที่มีในหมวดนี้: ${(mod.versions || []).join(', ')}`,
    '',
    '---',
    '',
    ...chunks,
  ].join('\n'), 'utf8');

  summary.push({ name, count, file, versions: mod.versions || [] });
  totalOps += count;
}

summary.sort((a, b) => b.count - a.count);
fs.writeFileSync(path.join(OUT_DIR, '_INDEX.md'), [
  '# TikTok Shop API Documentation — Index',
  '',
  `_สร้างจาก OAS ทางการของ @tts-open-toolkit/cli เมื่อ ${stamp}_`,
  '',
  `_รวม ${totalOps} operations ใน ${summary.length} หมวด_`,
  '',
  '> ⚠️ OAS ที่แถมมากับ toolkit เป็น **snapshot** ไม่ใช่ของสด — ก่อนใช้ endpoint สำคัญ',
  '> ให้เช็ค Partner Center ว่ามี version ใหม่กว่าไหม (เลข 6 หลักใน path)',
  '> และ **ค่าที่เห็นในหน้า Partner Center ของจริงชนะเอกสารเสมอ**',
  '> (เคยเจอแล้ว: เลข webhook push code ในสำเนาเก่าไม่ตรงของจริง)',
  '',
  table(
    summary.map(s => [String(s.count), s.name, `[${s.file}](./${s.file})`, s.versions.join(', ')]),
    ['APIs', 'Module', 'File', 'Versions']
  ),
  '',
].join('\n'), 'utf8');

console.log(`✓ ${totalOps} operations · ${summary.length} หมวด → ${OUT_DIR}`);
