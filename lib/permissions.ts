// Single source of truth for permissions — role หลัก 1 ค่า + สิทธิ์รายกลุ่มงาน
//
// Use this from BOTH client and server — pure functions, no Supabase deps.
// API route:    if (!can(auth, 'inventory.manage')) return 403;
// Client page:  const { allowed } = useAuthGuard('customer.edit');
// Sidebar:      เมนูอ่านจาก matrix เดียวกันนี้ — เมนูกับด่านหน้า/API จึงพูดตรงกันเสมอ
//
// โมเดล (2026-09-07):
//   1) ทุกสมาชิกมี "role หลัก" ค่าเดียว: owner | admin | manager | staff
//      (เก็บใน company_members.roles ที่ยังเป็น text[] แต่มีสมาชิกเดียว)
//   2) staff เพิ่มสิทธิ์เป็นราย "กลุ่มงาน" (area) ระดับ none | view | manage
//      เก็บใน company_members.permissions jsonb เช่น {"orders":"manage"}
//   3) owner/admin/manager ได้ทุกกลุ่มงานอัตโนมัติ (permissions = null)
//
// ค่าเก่าใน roles[] (sales/cashier/account/warehouse/pc) ยังอ่านได้ —
// grantsOf() แปลงเป็นแม่แบบ STAFF_PRESETS ให้จนกว่าจะรัน
// scripts/migrate-member-permissions.mjs (ตารางแม่แบบในสคริปต์นั้นต้องตรงกับไฟล์นี้)
//
// เพิ่ม capability ใหม่ = เพิ่ม 1 บรรทัดใน CAPABILITIES แล้วเลือก token ของกลุ่มงานที่ตรงที่สุด

// ─── กลุ่มงาน (area) ──────────────────────────────────────────────────

export type RoleLevel = 'owner' | 'admin' | 'manager' | 'staff';
export type Area =
  | 'orders' | 'chat' | 'products' | 'inventory'
  | 'customers' | 'finance' | 'pos' | 'pc';
export type AreaLevel = 'none' | 'view' | 'manage';
export type Permissions = Partial<Record<Area, AreaLevel>>;

export const AREAS: { key: Area; label: string; desc: string }[] = [
  { key: 'orders',    label: 'ออเดอร์',      desc: 'คำสั่งซื้อ · จัดของ & ส่ง · ตัวแทน/ห้าง · เติมของ · ฝากขาย' },
  { key: 'chat',      label: 'แชท',          desc: 'กล่องแชทรวมทุกช่องทาง (LINE, Facebook, Shopee, TikTok, Lazada)' },
  { key: 'products',  label: 'สินค้า',       desc: 'รายการสินค้า · โปรโมชั่น · แก้ไขแบบชุด' },
  { key: 'inventory', label: 'คลังสินค้า',   desc: 'สต๊อก · รับเข้า/เบิกออก/โอนย้าย · ใบสั่งซื้อ' },
  { key: 'customers', label: 'ลูกค้า',        desc: 'ข้อมูลลูกค้า · ที่อยู่ · แท็ก' },
  { key: 'finance',   label: 'บัญชี/รายงาน', desc: 'เอกสารบัญชี · ใบวางบิล · ใบลดหนี้ · รายงานยอดขาย · รายงานซัพพลายเออร์' },
  { key: 'pos',       label: 'แคชเชียร์',    desc: 'หน้าขาย POS · รายการขายหน้าร้าน' },
  { key: 'pc',        label: 'PC ประจำห้าง', desc: 'บันทึกยอดขายรายวันของสาขาที่ได้รับมอบหมาย' },
];

const AREA_KEYS = new Set<string>(AREAS.map(a => a.key));

/** role หลัก 4 ระดับ — ใช้ทั้งหน้าจัดการสมาชิกและป้ายชื่อใน sidebar */
export const ROLE_LEVELS: { key: RoleLevel; label: string; desc: string }[] = [
  { key: 'owner',   label: 'เจ้าของ',       desc: 'ทำได้ทุกอย่าง + ลบบริษัท' },
  { key: 'admin',   label: 'ผู้ดูแลระบบ',   desc: 'ทำได้ทุกอย่าง + แต่งตั้งผู้ดูแลระบบคนอื่น' },
  { key: 'manager', label: 'ผู้จัดการ',     desc: 'ทำได้ทุกอย่าง ยกเว้นแต่งตั้งผู้ดูแลระบบและลบข้อมูลทั้งหมด' },
  { key: 'staff',   label: 'พนักงาน',       desc: 'เห็นเฉพาะกลุ่มงานที่ติ๊กให้เท่านั้น' },
];

/**
 * แม่แบบสิทธิ์ของ staff — ปุ่มลัดในหน้าเชิญ/แก้ไขสมาชิก และเป็นตัวแปลค่า roles รุ่นเก่า
 * ⚠️ มีสำเนาเป็น JS อยู่ใน scripts/migrate-member-permissions.mjs (สคริปต์ .mjs import .ts ไม่ได้)
 *    แก้ที่นี่ต้องแก้ที่นั่นด้วย ไม่งั้นสคริปต์ย้ายข้อมูลจะให้สิทธิ์คนละชุดกับแอป
 */
export const STAFF_PRESETS: { key: string; label: string; desc: string; permissions: Permissions }[] = [
  {
    key: 'sales', label: 'แอดมินออนไลน์',
    desc: 'ดูแลออเดอร์กับแชทได้เต็มที่ แก้ข้อมูลลูกค้าได้ ดูสินค้า/สต๊อก/รายงานได้',
    permissions: { orders: 'manage', chat: 'manage', products: 'view', inventory: 'view', customers: 'manage', finance: 'view' },
  },
  {
    key: 'cashier', label: 'แคชเชียร์',
    desc: 'ขายหน้าร้านผ่าน POS ได้ ดูสินค้ากับสต๊อกได้',
    permissions: { pos: 'manage', inventory: 'view', products: 'view' },
  },
  {
    key: 'account', label: 'บัญชี',
    desc: 'ออก/ดูเอกสารบัญชีและรายงานได้เต็มที่ ดูออเดอร์ ลูกค้า และรายการขายหน้าร้านได้',
    permissions: { orders: 'view', customers: 'view', finance: 'manage', pos: 'view' },
  },
  {
    key: 'warehouse', label: 'คลังสินค้า',
    desc: 'จัดการสต๊อกและสินค้าได้เต็มที่ จัดของ/ส่งออเดอร์ได้',
    permissions: { orders: 'manage', products: 'manage', inventory: 'manage' },
  },
  {
    key: 'pc', label: 'PC ประจำห้าง',
    desc: 'บันทึกยอดขายรายวันของสาขาที่ได้รับมอบหมายเท่านั้น',
    permissions: { pc: 'manage' },
  },
];

const PRESET_BY_KEY = new Map(STAFF_PRESETS.map(p => [p.key, p]));

// ─── Token groups ────────────────────────────────────────────────────
// token = คำที่ใช้เทียบใน CAPABILITIES: role หลัก ('owner') หรือสิทธิ์กลุ่มงาน ('orders:manage')

const OWNER_ONLY = ['owner']                     as const;
const ADMIN_PLUS = ['owner', 'admin']            as const;  // strict: ไม่รวม manager
const ADMIN_TIER = ['owner', 'admin', 'manager'] as const;  // ชั้นผู้บริหาร = ได้ทุกกลุ่มงาน

// ─── Capability matrix ────────────────────────────────────────────────
// Pattern: '{domain}.{action}'. Group by domain, alphabetical inside.

export const CAPABILITIES = {
  // Company-level
  'company.delete':              OWNER_ONLY,    // ลบบริษัท
  'company.edit':                ADMIN_TIER,    // logo, name, info

  // Members
  'members.view':                ADMIN_TIER,
  'members.invite':              ADMIN_TIER,
  'members.grant_admin':         ADMIN_PLUS,    // แต่งตั้ง admin/owner — กันยกระดับสิทธิ์

  // Settings (page-level access)
  'settings.access':             ADMIN_TIER,
  'settings.delete_all_data':    ADMIN_PLUS,    // destructive — strict

  // Master data (1 capability per page; same tier today but ready to split)
  'masterdata.warehouses':       ADMIN_TIER,
  'masterdata.carriers':         ADMIN_TIER,
  'masterdata.suppliers':        ADMIN_TIER,
  'masterdata.payment_channels': ADMIN_TIER,
  'masterdata.sales_channels':   ADMIN_TIER,
  'masterdata.pos_terminals':    ADMIN_TIER,
  'masterdata.chat_channels':    ADMIN_TIER,    // LINE, Facebook, chat accounts
  'masterdata.brands':           ADMIN_TIER,
  'masterdata.categories':       ADMIN_TIER,
  'masterdata.variation_types':  ADMIN_TIER,
  'masterdata.delivery':         ADMIN_TIER,    // delivery zones + time slots
  'masterdata.tags':             ADMIN_TIER,    // แท็กลูกค้า/แชท — แก้ชื่อ/สี + ลบ (สร้างใหม่เปิดให้ทุกคนผ่าน quick-add)

  // Chat (กล่องแชทรวมทุกช่องทาง)
  'chat.view':                   [...ADMIN_TIER, 'chat:view'],
  'chat.reply':                  [...ADMIN_TIER, 'chat:manage'],   // ส่งข้อความออก + ผูกลูกค้า
  'chat.broadcast':              ADMIN_TIER,    // ส่งข้อความหาลูกค้าหลายคนพร้อมกัน — กินโควตา OA จึงให้เฉพาะระดับผู้บริหาร

  // Inventory
  'inventory.view':              [...ADMIN_TIER, 'inventory:view'],
  'inventory.manage':            [...ADMIN_TIER, 'inventory:manage'],   // transfer, receive, issue, adjust

  // Products
  'product.view':                [...ADMIN_TIER, 'products:view'],
  'product.manage':              [...ADMIN_TIER, 'products:manage'],    // สร้าง/แก้สินค้า + โปรโมชั่น
  'product.bulk_edit':           [...ADMIN_TIER, 'products:manage'],    // Excel template import

  // Customers
  'customer.view':               [...ADMIN_TIER, 'customers:view'],
  'customer.edit':               [...ADMIN_TIER, 'customers:manage'],

  // Suppliers / reports
  'supplier.edit':               ADMIN_TIER,
  'report.supplier.view':        [...ADMIN_TIER, 'finance:view'],
  'report.supplier.create':      [...ADMIN_TIER, 'finance:manage'],
  'report.supplier.delete':      ADMIN_TIER,    // destructive — ชั้นผู้บริหารเท่านั้น

  // Marketplace (Shopee, TikTok, etc.)
  'marketplace.connect':         ADMIN_TIER,    // OAuth, account CRUD
  'marketplace.sync':            ADMIN_TIER,    // sync orders, products
  'marketplace.ship':            [...ADMIN_TIER, 'orders:manage'],      // bulk-ship, label print
  'marketplace.push':            ADMIN_TIER,    // push price/stock/products to platform

  // Orders
  'order.view':                  [...ADMIN_TIER, 'orders:view'],
  'order.manage':                [...ADMIN_TIER, 'orders:manage'],
  'order.split':                 [...ADMIN_TIER, 'orders:manage'],      // split/unsplit (Shopee + manual)
  'order.delete':                ADMIN_PLUS,    // ลบบิลที่ยกเลิกแล้วทิ้งถาวร

  // Finance / accounting documents
  'finance.view':                [...ADMIN_TIER, 'finance:view'],
  'finance.manage':              [...ADMIN_TIER, 'finance:manage'],

  // POS
  'pos.sell':                    [...ADMIN_TIER, 'pos:manage'],         // หน้าขาย
  'pos.view':                    [...ADMIN_TIER, 'pos:view', 'finance:view'],  // รายการขายหน้าร้าน (บัญชีก็ต้องดูได้)
  'pos.manage':                  ADMIN_TIER,    // terminals + void/แก้บิลหน้าร้าน

  // Counter sales (PC ประจำจุดขายในห้าง — informational overlay, ไม่แตะ order/สต็อกจริง)
  'counter.record':              [...ADMIN_TIER, 'pc:manage'],          // บันทึก/แก้ยอดขายรายวันของสาขาที่ถูก assign
  'counter.manage':              ADMIN_TIER,    // จัดการสาขา (counter) + assign PC

  // Onboarding (initial setup wizard)
  'onboarding.manage':           ADMIN_TIER,

  // Logs / Admin tools
  'logs.view':                   ADMIN_TIER,
  'invoice.backfill':            ADMIN_TIER,
} as const satisfies Record<string, readonly string[]>;

export type Capability = keyof typeof CAPABILITIES;

// ─── Subject ─────────────────────────────────────────────────────────

/**
 * อะไรก็ได้ที่บอกได้ว่า "คนนี้เป็นใครในบริษัทนี้":
 * - `AuthResult` ของ API route (มี companyRoles + permissions)
 * - `UserProfile` ของฝั่ง client (มี roles + permissions)
 * - array ของ roles ล้วน ๆ (legacy — ได้เฉพาะสิทธิ์ที่แปลจาก role/แม่แบบ)
 */
export type PermissionSubject =
  | readonly string[]
  | {
      roles?: readonly string[] | null;
      companyRoles?: readonly string[] | null;
      permissions?: Permissions | null;
    }
  | null
  | undefined;

function rolesOf(subject: PermissionSubject): readonly string[] {
  if (!subject) return [];
  if (Array.isArray(subject)) return subject;
  const s = subject as { roles?: readonly string[] | null; companyRoles?: readonly string[] | null };
  return s.roles ?? s.companyRoles ?? [];
}

function permissionsOf(subject: PermissionSubject): Permissions | null {
  if (!subject || Array.isArray(subject)) return null;
  return (subject as { permissions?: Permissions | null }).permissions ?? null;
}

function addAreaTokens(tokens: Set<string>, permissions: Permissions | null | undefined): void {
  if (!permissions) return;
  for (const [area, level] of Object.entries(permissions)) {
    if (!AREA_KEYS.has(area)) continue;
    // manage ครอบ view เสมอ — ห้ามให้คนที่แก้ได้แต่เปิดดูไม่ได้
    if (level === 'manage') { tokens.add(`${area}:manage`); tokens.add(`${area}:view`); }
    else if (level === 'view') tokens.add(`${area}:view`);
  }
}

/**
 * แปลง subject เป็นชุด token ที่ถืออยู่ — pure, ไม่ cache
 * (owner/admin/manager ได้ทุกกลุ่มงานทุกระดับ · staff ได้ตาม permissions ·
 *  role รุ่นเก่าได้ตามแม่แบบของมัน)
 */
export function grantsOf(subject: PermissionSubject): Set<string> {
  const tokens = new Set<string>();
  const roles = rolesOf(subject);

  for (const role of roles) {
    if (role === 'owner' || role === 'admin' || role === 'manager') {
      tokens.add(role);
      for (const area of AREAS) { tokens.add(`${area.key}:manage`); tokens.add(`${area.key}:view`); }
      continue;
    }
    if (role === 'staff') { tokens.add('staff'); continue; }
    // ค่า roles รุ่นเก่า (sales/cashier/account/warehouse/pc) = staff + แม่แบบของมัน
    const preset = PRESET_BY_KEY.get(role);
    if (preset) {
      tokens.add('staff');
      addAreaTokens(tokens, preset.permissions);
    }
  }

  addAreaTokens(tokens, permissionsOf(subject));
  return tokens;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Check if the subject has a capability.
 * Pure function — safe for client + server.
 *
 * @example
 *   if (!can(auth, 'inventory.manage')) return 403;
 *   const allowed = can(userProfile, 'customer.edit');
 */
export function can(subject: PermissionSubject, capability: Capability): boolean {
  const need = CAPABILITIES[capability] as readonly string[];
  const tokens = grantsOf(subject);
  if (tokens.size === 0) return false;
  return need.some(t => tokens.has(t));
}

/** role หลักของสมาชิก — owner > admin > manager > staff (ค่าเก่าทุกตัวถือเป็น staff) */
export function mainRoleOf(roles: readonly string[] | null | undefined): RoleLevel {
  const list = Array.isArray(roles) ? roles : [];
  if (list.includes('owner')) return 'owner';
  if (list.includes('admin')) return 'admin';
  if (list.includes('manager')) return 'manager';
  return 'staff';
}

/** ชั้นผู้บริหาร = ได้ทุกกลุ่มงานอัตโนมัติ (permissions ต้องเป็น null) */
export function isAdminTierRole(role: RoleLevel): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager';
}

/**
 * แปลง roles[] รุ่นเก่าเป็นสิทธิ์รายกลุ่มงาน (รวมทุกแม่แบบที่ติดมา, ระดับสูงสุดชนะ)
 * ใช้ทั้งในสคริปต์ย้ายข้อมูลและตอนรับคำเชิญที่ออกก่อนเปลี่ยนโมเดล
 */
export function permissionsFromLegacyRoles(roles: readonly string[] | null | undefined): Permissions {
  const out: Permissions = {};
  for (const role of Array.isArray(roles) ? roles : []) {
    const preset = PRESET_BY_KEY.get(role);
    if (!preset) continue;
    for (const [area, level] of Object.entries(preset.permissions) as [Area, AreaLevel][]) {
      if (out[area] === 'manage') continue;      // manage ชนะ view เสมอ
      out[area] = level;
    }
  }
  return out;
}

/**
 * staff ที่เปิดได้เฉพาะกลุ่มงาน PC — ใช้เด้งจาก /dashboard ไปหน้า /pc
 * (คนที่มีกลุ่มงานอื่นด้วยไม่ควรโดนเด้ง เพราะเขามีงานอื่นให้ทำในระบบ)
 */
export function isPcOnly(subject: PermissionSubject): boolean {
  const tokens = grantsOf(subject);
  if (tokens.has('owner') || tokens.has('admin') || tokens.has('manager')) return false;
  const areas = new Set<string>();
  for (const token of tokens) {
    const idx = token.indexOf(':');
    if (idx > 0) areas.add(token.slice(0, idx));
  }
  return areas.size === 1 && areas.has('pc');
}

/**
 * owner/admin เห็นต้นทุนเสมอ — role อื่นตาม flag ที่ขอมา
 * Single source of truth — เดิม logic นี้ถูกเขียนซ้ำใน 3 ที่ (companies/members,
 * users route, members page) แล้ว drift กัน
 */
export function resolveCanViewCost(
  roles: readonly string[] | undefined | null,
  requested: unknown,
): boolean {
  if (Array.isArray(roles) && (roles.includes('owner') || roles.includes('admin'))) return true;
  return requested === true;
}

// ─── Validation (ใช้ร่วมทุก endpoint ที่เขียน roles/permissions) ────────

/** role หลักต้องเป็น 1 ใน 4 ค่า — คืนข้อความ error ภาษาไทย หรือ null เมื่อผ่าน */
export function validateRole(role: unknown): string | null {
  if (typeof role !== 'string' || !ROLE_LEVELS.some(r => r.key === role)) {
    return `ตำแหน่ง "${String(role)}" ไม่ถูกต้อง`;
  }
  return null;
}

/**
 * permissions ต้องเป็น object ที่ key เป็นกลุ่มงานจริง และค่าเป็น none|view|manage
 * (null/undefined = ไม่ตั้ง = ผ่าน — ใช้กับ owner/admin/manager)
 */
export function validatePermissions(permissions: unknown): string | null {
  if (permissions === null || permissions === undefined) return null;
  if (typeof permissions !== 'object' || Array.isArray(permissions)) {
    return 'รูปแบบสิทธิ์กลุ่มงานไม่ถูกต้อง';
  }
  for (const [area, level] of Object.entries(permissions as Record<string, unknown>)) {
    if (!AREA_KEYS.has(area)) return `กลุ่มงาน "${area}" ไม่ถูกต้อง`;
    if (level !== 'none' && level !== 'view' && level !== 'manage') {
      return `ระดับสิทธิ์ของกลุ่มงาน "${area}" ไม่ถูกต้อง`;
    }
  }
  return null;
}

/**
 * roles ที่เขียนลง DB ตั้งแต่ 2026-09-07 = array สมาชิกเดียวของ role หลัก 4 ค่า
 * (ค่าเก่าหลายตัวยัง "อ่าน" ได้ แต่ห้ามเขียนกลับเข้าไปอีก)
 */
export function validateRoles(roles: unknown): string | null {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'ต้องระบุตำแหน่งอย่างน้อย 1 ตำแหน่ง';
  }
  if (roles.length > 1) {
    return 'ตำแหน่งต้องมีค่าเดียว (เจ้าของ / ผู้ดูแลระบบ / ผู้จัดการ / พนักงาน)';
  }
  return validateRole(roles[0]);
}

/**
 * Escalation guard สำหรับ "ทุก" endpoint ที่แก้ไข/ลบ membership ของคนอื่น:
 * - แตะสมาชิกที่เป็น owner ได้เฉพาะ owner ด้วยกัน
 * - ผู้ที่ไม่มี members.grant_admin (เช่น manager) แตะสมาชิกที่เป็น admin ไม่ได้
 *   และมอบตำแหน่ง admin/owner ให้ใครไม่ได้
 * คืน error object เมื่อไม่ผ่าน, null เมื่อผ่าน — ห้าม copy logic นี้ไปเขียนเอง
 * (เคย copy-paste แล้วตกหล่นจน endpoint ข้างเคียงกลายเป็นช่องยกระดับสิทธิ์)
 */
export function assertMemberMutationAllowed(
  actorRoles: readonly string[] | undefined | null,
  targetRoles: readonly string[] | undefined | null,
  nextRoles?: readonly string[] | null,
): { error: string; status: number } | null {
  const target = Array.isArray(targetRoles) ? targetRoles : [];
  if (target.includes('owner') && !(actorRoles || []).includes('owner')) {
    return { error: 'ไม่สามารถแก้ไขข้อมูลเจ้าของได้', status: 403 };
  }
  if (!can(actorRoles, 'members.grant_admin')) {
    if (target.includes('admin')) {
      return { error: 'ผู้จัดการไม่สามารถแก้ไขผู้ดูแลระบบได้', status: 403 };
    }
    if (Array.isArray(nextRoles) && (nextRoles.includes('owner') || nextRoles.includes('admin'))) {
      return { error: 'ผู้จัดการไม่สามารถมอบตำแหน่งผู้ดูแลระบบหรือเจ้าของได้', status: 403 };
    }
  }
  return null;
}
