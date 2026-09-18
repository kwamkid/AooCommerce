---
paths:
  - "lib/permissions.ts"
  - "lib/useAuthGuard.ts"
  - "components/members/**/*"
  - "app/settings/members/**/*"
  - "app/api/**/*"
  - "components/layout/**/*"
---
# Permissions — role หลัก + กลุ่มงาน

> แยกจาก code-simplicity.md (2026-09-10)

### Permissions — role หลัก 1 ค่า + กลุ่มงาน (อ่าน/เขียนผ่าน `can()` เท่านั้น)

**Single source of truth**: [lib/permissions.ts](../../lib/permissions.ts) — sidebar, ด่านหน้า (`useAuthGuard`) และ API อ่าน matrix เดียวกัน จึงไม่มีทางที่ "เห็นเมนูแต่กดเข้าไม่ได้"

- **role หลักค่าเดียว** ใน `company_members.roles` (array สมาชิกเดียว): `owner` (ทุกอย่าง + ลบบริษัท) · `admin` (ทุกอย่าง + แต่งตั้งผู้ดูแล) · `manager` (ทุกอย่าง ยกเว้นแต่งตั้งผู้ดูแล/ลบข้อมูลทั้งหมด) · `staff`
- **staff เพิ่มสิทธิ์รายกลุ่มงาน** ใน `company_members.permissions` jsonb = `{area: 'view'|'manage'}` (manage ครอบ view) · 8 กลุ่มงาน: `orders · chat · products · inventory · customers · finance · pos · pc` · owner/admin/manager ได้ทุกกลุ่มอัตโนมัติ (`permissions = null` — ห้ามเก็บสองแหล่งความจริง)
- **แม่แบบ (`STAFF_PRESETS`)**: `sales` แอดมินออนไลน์ · `cashier` แคชเชียร์ · `account` บัญชี · `warehouse` คลังสินค้า · `pc` PC ประจำห้าง — เป็นทั้งปุ่มลัดในหน้าเชิญ **และ** ตัวแปลค่า `roles` รุ่นเก่าที่ยังค้างใน DB (ย้ายด้วย `node scripts/migrate-member-permissions.mjs [--apply]`)
- **`can(subject, cap)`** รับได้ทั้ง `auth` (API), `userProfile` (client), `{ roles, permissions }` หรือ array ของ roles — **ห้ามส่งแค่ `.roles`** ถ้ามี permissions ให้ส่งด้วย ไม่งั้น staff จะถูกปฏิเสธทั้งที่มีสิทธิ์
- **ห้ามเขียน** `roles.includes('admin') || ...` กระจายในไฟล์ · ห้ามให้ sidebar มีตารางสิทธิ์ของตัวเอง (เคยมีแล้วเมนูกับ API พูดคนละเรื่อง) · deprecated helpers (`isAdminRole`, `isStrictAdmin`, `canBulkEdit`, `canManageInventory`, `hasAnyRole`) ยังใช้ได้แต่ห้ามเรียกในโค้ดใหม่

**Pattern**:
```ts
// API route — ส่ง auth ทั้งก้อน (มี companyRoles + permissions)
if (!can(auth, 'inventory.manage')) return 403;

// Client page — redirect (default /dashboard)
const { allowed, loading } = useAuthGuard('order.view');
if (loading) return <Layout><LoadingCard /></Layout>;
if (!allowed) return null;

// Settings-style page — render NoPermissionCard เอง
const { allowed, loading } = useAuthGuard('settings.access', { noRedirect: true });
```

**Capability ที่มี** (เลือกตัวที่ตรงความหมายที่สุด): `company.*` · `members.*` · `settings.*` · `masterdata.*` (12 หน้า) · `order.{view,manage,split,delete}` · `chat.{view,reply}` · `product.{view,manage,bulk_edit}` · `inventory.{view,manage}` · `customer.{view,edit,delete}` · `finance.{view,manage}` · `pos.{sell,view,manage}` · `counter.{record,manage}` · `marketplace.*` · `supplier.edit` · `report.supplier.*` · `onboarding.manage` · `logs.view` · `invoice.backfill`

**เพิ่ม capability ใหม่** = เพิ่ม 1 บรรทัดใน `CAPABILITIES` (pattern `{domain}.{action}`) แล้วใส่ token: `ADMIN_TIER` / `ADMIN_PLUS` / `OWNER_ONLY` และ (ถ้าเปิดให้ staff) token ของกลุ่มงาน เช่น `[...ADMIN_TIER, 'orders:manage']` — เมนูใน Sidebar อ้าง capability นี้ได้ทันที

**UI ของตำแหน่ง/สิทธิ์มีชุดเดียว — `components/members/`** (ห้ามสร้างใหม่):

| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| ตั้งตำแหน่ง + กลุ่มงาน + ขอบเขตคลัง/POS + ต้นทุน + PC หน่วยแทน | **`PermissionEditor`** — โมดัลเชิญกับโมดัลแก้ไขใช้ตัวเดียวกัน (`showPcRover={false}` ตอนเชิญ เพราะ `company_invitations` ไม่มีคอลัมน์นั้น) | checkbox หลาย role · dropdown ตำแหน่ง · บล็อกเลือกคลังที่ประกอบเอง |
| แสดงว่า "คนนี้เป็นใคร เห็นอะไร" | **`AreaBadges`** (ตำแหน่ง + กลุ่มงาน) · `RoleBadge` (ตำแหน่งอย่างเดียว) · `AreaCell` + `AreaLegend` (ตาราง "ใครเห็นอะไร") | ตาราง `ROLE_LABELS`/`ROLE_COLORS` ประจำไฟล์ (เคยมี 3 ชุดแล้วชื่อ/สีไม่ตรงกันสักชุด) |

- ป้ายกำกับ/คำอธิบายทั้งหมดอ่านจาก `ROLE_LEVELS` · `AREAS` · `STAFF_PRESETS` — **ห้าม hardcode ชื่อตำแหน่งหรือชื่อกลุ่มงานเป็นสตริงในหน้าใด ๆ**
- ระดับสิทธิ์อ่านจาก `role` + `permissions` ที่ API ส่งมา **ห้ามอ่านจาก `roles[]` ดิบ** (ค่าเก่ายังค้างใน DB — `mainRoleOf()`/`permissionsFromLegacyRoles()` แปลงให้แล้วที่ชั้น API)

### ⛔ ทุก handler ที่เขียนข้อมูลต้องมี `can()` (2026-09-18)

อุดไป 53 route + 51 หน้า — ก่อนหน้านี้การล็อกอยู่ที่ UI เกือบทั้งหมด staff ที่มีสิทธิ์แค่ "แชท: ดู" ยิง API ตรงแล้วลบสินค้า/ลบลูกค้า/เปิดบิลได้ (RLS ช่วยไม่ได้ — ทุกคนเป็นสมาชิกบริษัทนั้นจริง และ API ใช้ service role)

- **POST/PUT/PATCH/DELETE ต้องมี `can()` เสมอ · GET ปล่อยได้** (คนที่เห็นหน้านั้นได้ก็ควรอ่านข้อมูลได้)
- ⛔ **ห้าม `const { isAuth, companyId } = await checkAuthWithCompany(req)`** ทิ้ง `auth` ทั้งก้อน — `can()` ต้องได้ทั้ง `roles` และ `permissions` ไม่งั้น staff ที่มีสิทธิ์จริงถูกปฏิเสธ · เก็บไว้ว่า `const auth = await checkAuthWithCompany(req); const { isAuth, companyId } = auth;`
- route ที่**เว้นได้** มี 6 ตัว: คูปองที่ลูกค้ากรอกเอง · `push/*` ของอุปกรณ์ · ทำเครื่องหมาย "อ่านแล้ว" ในแชท (คนเปิดห้องแชทได้ต้องทำได้)
- ⛔ **เส้นทางที่ไม่มีบริบทบริษัท ห้ามใส่ด่าน** — portal ตัวแทน/ซัพพลายเออร์ · หน้ารับของด้วยลิงก์ · `/api/po?token=` · webhook · OAuth callback · cron (คุมด้วย token ของตัวเอง)

### ตำแหน่งวาง `useAuthGuard` ในหน้า

วาง **ก่อน early return ตัวแรก** ของ component — กฎ React บังคับว่า hook ทุกตัวต้องมาก่อน early return อยู่แล้ว ตำแหน่งนั้นจึงอยู่หลัง hook ครบ
⛔ **ห้ามวางบนสุดของ component** — early return ของด่านจะตัดไม่ให้ hook อื่นทำงาน แล้วพัง *"rendered fewer hooks than expected"* ตอน `allowed` พลิกค่า
⛔ **ห้ามใส่ใน page.tsx ที่เป็น server component** (thin wrapper ที่ห่อ client component) — `tsc` ผ่านแต่พังตอน `next build` · หน้าแบบนั้นให้ใส่ด่านใน component ที่มี `'use client'` แทน

### ด่านฟีเจอร์ ≠ ด่านสิทธิ์ — ต้องมีทั้งคู่

`can()` = "คนนี้ทำได้ไหม" · `guardFeature()` = "ร้านนี้เปิดฟีเจอร์นี้ไว้ไหม + แพ็กเกจรองรับไหม" — คนละเรื่อง ใส่คู่กันได้
ด่านฟีเจอร์มี 4 ชั้นอ่านทะเบียนเดียวกัน: เมนู (Sidebar) · หน้า (`<FeatureGuard>` ใน `Layout` + `lib/feature-routes.ts`) · สวิตช์ (หน้า Feature เสริม) · **API (`guardFeature()` จาก `lib/package-gates-server.ts`)**
เพดานแพ็กเกจอยู่ที่ `packages.features` (`locked_features[]` · `max_shops_per_platform` · `stock_enabled`) → `lib/package-features.ts` แปลงให้ทุกชั้นใช้ร่วมกัน
