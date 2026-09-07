#!/usr/bin/env node
// ย้ายสมาชิก/คำเชิญจากโมเดล roles[] หลายค่า → role หลักค่าเดียว + สิทธิ์รายกลุ่มงาน (2026-09-07)
//
// Usage:
//   node scripts/migrate-member-permissions.mjs            # dry-run (ค่าเริ่มต้น) — พิมพ์ตารางเฉย ๆ
//   node scripts/migrate-member-permissions.mjs --apply    # เขียนจริง
//
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY
// แตะเฉพาะแถวที่ roles ยังเป็นค่าเก่า หรือมีมากกว่า 1 ค่า — แถวที่ถูกต้องแล้วข้ามไป
// รันซ้ำได้ (idempotent) เพราะรอบสองจะไม่มีแถวไหนเข้าเงื่อนไข

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}

const APPLY = process.argv.includes('--apply');

// ⚠️ ตารางนี้ต้องตรงกับ STAFF_PRESETS ใน lib/permissions.ts เสมอ
// (สคริปต์เป็น .mjs จึง import ไฟล์ .ts ไม่ได้ — แก้ที่หนึ่งต้องแก้ทั้งสองที่)
const STAFF_PRESETS = {
  sales:     { orders: 'manage', chat: 'manage', products: 'view', inventory: 'view', customers: 'manage', finance: 'view' },
  cashier:   { pos: 'manage', inventory: 'view', products: 'view' },
  account:   { orders: 'view', customers: 'view', finance: 'manage', pos: 'view' },
  warehouse: { orders: 'manage', products: 'manage', inventory: 'manage' },
  pc:        { pc: 'manage' },
};
const ROLE_LEVELS = ['owner', 'admin', 'manager', 'staff'];

const mainRoleOf = (roles = []) => {
  const list = Array.isArray(roles) ? roles : [];
  if (list.includes('owner')) return 'owner';
  if (list.includes('admin')) return 'admin';
  if (list.includes('manager')) return 'manager';
  return 'staff';
};

const permissionsFromLegacyRoles = (roles = []) => {
  const out = {};
  for (const role of Array.isArray(roles) ? roles : []) {
    const preset = STAFF_PRESETS[role];
    if (!preset) continue;
    for (const [area, level] of Object.entries(preset)) {
      if (out[area] === 'manage') continue;   // manage ชนะ view เสมอ
      out[area] = level;
    }
  }
  return out;
};

/** แถวไหนต้องย้าย: roles มีมากกว่า 1 ค่า หรือมีค่าที่ไม่ใช่ role หลัก 4 ค่า */
const needsMigration = (roles) => {
  const list = Array.isArray(roles) ? roles : [];
  if (list.length !== 1) return true;
  return !ROLE_LEVELS.includes(list[0]);
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local');
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const areaSummary = (permissions) => {
  const entries = Object.entries(permissions || {}).filter(([, level]) => level && level !== 'none');
  return entries.length ? entries.map(([a, l]) => `${a}:${l}`).join(' ') : '—';
};

async function loadCompanyNames(ids) {
  if (ids.length === 0) return {};
  const { data } = await db.from('companies').select('id, name').in('id', ids);
  return Object.fromEntries((data || []).map(c => [c.id, c.name]));
}

async function run() {
  const [{ data: members, error: mErr }, { data: invites, error: iErr }] = await Promise.all([
    db.from('company_members').select('id, company_id, user_id, roles, permissions'),
    db.from('company_invitations').select('id, company_id, email, roles, permissions').eq('status', 'pending'),
  ]);
  if (mErr) throw mErr;
  if (iErr) throw iErr;

  const memberRows = (members || []).filter(m => needsMigration(m.roles));
  const inviteRows = (invites || []).filter(i => needsMigration(i.roles));

  const companyNames = await loadCompanyNames([
    ...new Set([...memberRows, ...inviteRows].map(r => r.company_id)),
  ]);

  // ชื่อ/อีเมลของสมาชิก — ใช้แค่ตอนพิมพ์ตารางให้คนอ่านรู้ว่ากำลังแก้ของใคร
  const userIds = [...new Set(memberRows.map(m => m.user_id))];
  let userNames = {};
  if (userIds.length > 0) {
    const { data: profiles } = await db.from('user_profiles').select('id, name, email').in('id', userIds);
    userNames = Object.fromEntries((profiles || []).map(p => [p.id, p.email || p.name || p.id]));
  }

  const plan = [];
  for (const m of memberRows) {
    const role = mainRoleOf(m.roles);
    const permissions = role === 'staff' ? permissionsFromLegacyRoles(m.roles) : null;
    plan.push({ table: 'company_members', id: m.id, company: companyNames[m.company_id] || m.company_id,
      who: userNames[m.user_id] || m.user_id, oldRoles: m.roles, role, permissions });
  }
  for (const i of inviteRows) {
    const role = mainRoleOf(i.roles);
    const permissions = role === 'staff' ? permissionsFromLegacyRoles(i.roles) : null;
    plan.push({ table: 'company_invitations', id: i.id, company: companyNames[i.company_id] || i.company_id,
      who: i.email || '(ลิงก์แชร์)', oldRoles: i.roles, role, permissions });
  }

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — ต้องย้าย ${plan.length} แถว ` +
    `(สมาชิก ${memberRows.length} · คำเชิญที่รอตอบรับ ${inviteRows.length})\n`);
  console.log(
    'ตาราง'.padEnd(22) + 'บริษัท'.padEnd(26) + 'ใคร'.padEnd(34) +
    'roles เดิม'.padEnd(28) + 'role ใหม่'.padEnd(10) + 'กลุ่มงาน');
  console.log('-'.repeat(150));
  for (const p of plan) {
    console.log(
      p.table.padEnd(22) + String(p.company).slice(0, 24).padEnd(26) + String(p.who).slice(0, 32).padEnd(34) +
      (p.oldRoles || []).join(',').slice(0, 26).padEnd(28) + p.role.padEnd(10) + areaSummary(p.permissions));
  }

  if (!APPLY) {
    console.log('\n(dry-run — ยังไม่เขียนอะไร · ใส่ --apply เมื่อพร้อม)\n');
    return;
  }

  let ok = 0, failed = 0;
  for (const p of plan) {
    const { error } = await db.from(p.table)
      .update({ roles: [p.role], permissions: p.permissions })
      .eq('id', p.id);
    if (error) { failed++; console.error(`FAILED ${p.table} ${p.id}: ${error.message}`); }
    else ok++;
  }
  console.log(`\nเขียนสำเร็จ ${ok} แถว · ล้มเหลว ${failed} แถว\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
