# Super Admin Panel + Package Management

## Context
ต้องการหน้า Super Admin แยกจากระบบปกติ สำหรับจัดการ company ทั้งหมด, CRUD packages, และกำหนด package ให้ user
ปัจจุบันมี table `packages` (seeded Free/Pro/Enterprise) และ `user_subscriptions` อยู่แล้ว แต่ยังไม่มี UI จัดการ
และ `getStockConfig` hardcode อยู่ ต้องแก้ให้ query จาก package features จริง

## ไฟล์ที่ต้องสร้างใหม่ (12 ไฟล์)

### 1. Database Migration
**`supabase/migrations/20260216_super_admin.sql`**
- เพิ่ม column `is_super_admin BOOLEAN DEFAULT false` ใน `user_profiles`
- สร้าง index สำหรับ lookup
- Set super admin ให้ user ที่ต้องการ (ระบุ email)

### 2. Auth Helper
**`lib/supabase-admin.ts`** (แก้ไข) — เพิ่ม function `checkSuperAdmin(request)`
- Validate Bearer token → get user → check `user_profiles.is_super_admin`
- Return `{ isAuth, isSuperAdmin, userId }`

### 3. Auth Context
**`lib/auth-context.tsx`** (แก้ไข) — เพิ่ม `/superadmin` ใน routing bypass
- บรรทัด ~157: ถ้า `pathname.startsWith('/superadmin')` ไม่ redirect ไป onboarding

### 4. API Routes (4 ไฟล์)
ทุก route ใช้ `checkSuperAdmin()` เป็น auth guard → 403 ถ้าไม่ใช่ super admin

| Route | File | Operations |
|---|---|---|
| `/api/superadmin/stats` | `app/api/superadmin/stats/route.ts` | GET: รวมจำนวน users, companies, subscriptions by package |
| `/api/superadmin/companies` | `app/api/superadmin/companies/route.ts` | GET: list ทุก company + owner + member count, PUT: toggle active |
| `/api/superadmin/packages` | `app/api/superadmin/packages/route.ts` | GET/POST/PUT/DELETE: CRUD packages (name, slug, max_companies, max_members, price, features JSONB, sort_order) |
| `/api/superadmin/users` | `app/api/superadmin/users/route.ts` | GET: list users + subscription info, PUT: เปลี่ยน package ของ user (expire เก่า + สร้างใหม่) |

### 5. Super Admin Layout (3 ไฟล์)
**แยกจาก Layout ปกติ** — ไม่ใช้ useCompany(), ไม่มี company switcher

| File | Description |
|---|---|
| `app/superadmin/components/SuperAdminLayout.tsx` | Layout wrapper: sidebar + header (มี badge "SUPER ADMIN") + main content |
| `app/superadmin/components/SuperAdminSidebar.tsx` | Sidebar 4 เมนู: Dashboard, Companies, Packages, Users — style เดียวกับ sidebar ปกติ (#1A1A2E + #F4511E) |
| `app/superadmin/hooks/useSuperAdminGuard.ts` | Client-side hook: เช็ค login + เรียก API stats เพื่อ verify super admin → redirect ถ้าไม่มีสิทธิ์ |

### 6. Super Admin Pages (4 ไฟล์)

| Page | File | UI |
|---|---|---|
| Dashboard | `app/superadmin/page.tsx` | Stat cards: Total Users, Total Companies, Subscriptions by tier, Recent companies |
| Companies | `app/superadmin/companies/page.tsx` | ตาราง: ชื่อ, Owner, จำนวนสมาชิก, สถานะ, วันสร้าง + search + toggle active |
| Packages | `app/superadmin/packages/page.tsx` | Card/Table + Modal form: CRUD packages (name, slug, limits, price, features JSONB, active) |
| Users | `app/superadmin/users/page.tsx` | ตาราง: ชื่อ, email, package ปัจจุบัน, จำนวน company, วันสร้าง + search + filter by package + Modal เปลี่ยน package |

### 7. แก้ getStockConfig
**`lib/stock-utils.ts`** (แก้ไข) — query จาก `user_subscriptions` → `packages.features` จริง
- ถ้าไม่มี subscription หรือ features ว่าง → default เปิดหมด (stockEnabled: true)
- ถ้า `features.stock_enabled === false` → ปิด stock
- ใช้ `features.max_warehouses` สำหรับ limit

## ลำดับการทำงาน
1. Migration SQL + checkSuperAdmin helper
2. Auth context bypass + API routes ทั้ง 4
3. Layout + Sidebar + Guard hook
4. Pages ทั้ง 4
5. แก้ getStockConfig
6. Build verify

## UI Patterns ที่ใช้
- CSS classes: `data-table-wrap-shadow`, `data-table-fixed`, `data-thead`, `data-th`, `data-td`
- Modal: backdrop overlay + centered card (max-w-lg)
- Toast: `useToast()` → `showToast(message, type)`
- Form inputs: 42px height, `focus:ring-[#F4511E]`
- Icons: Lucide React

## การตรวจสอบ
- `npx next build` ผ่าน
- เข้า `/superadmin` ได้เฉพาะ user ที่เป็น super admin
- User ปกติเข้า `/superadmin` → redirect ไป `/dashboard`
- CRUD packages ได้ (สร้าง/แก้/ลบ)
- เปลี่ยน package ของ user ได้
- getStockConfig query จาก DB จริง (ไม่ hardcode)
