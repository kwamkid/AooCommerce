# Plan: Supplier + Purchase Order (PO) + Reports + Supplier Portal

## Context

ระบบจัดการ Supplier เป็น **feature เสริม** (toggle เปิด/ปิดที่หน้าข้อมูลบริษัท)
รองรับ 3 ประเภท supplier ที่มี payment flow ต่างกัน

**ความสัมพันธ์**: Supplier → Brand(s) → Product(s) → Variation(s)
**Feature flag**: `supplier` (เปิด/ปิดได้ที่หน้าข้อมูลบริษัท)
**Backward compatible**: ปิด feature = ทุกอย่างทำงานเหมือนเดิม, เปิดแล้วไม่ใช้ PO ก็รับของปกติได้

### Feature Toggle Safety (เปิด/ปิดได้ตลอด ไม่พังข้อมูล)

**หลักการ: Soft Hide** — ปิด feature = UI ซ่อน, ข้อมูลใน DB ยังอยู่ครบ, เปิดใหม่ = กลับมาทั้งหมด

| สถานการณ์ | ผลลัพธ์ |
|---|---|
| เปิด → สร้าง supplier/PO/snapshot → ปิด | ข้อมูลยังอยู่ใน DB, UI ซ่อนทั้งหมด |
| ปิด → เปิดใหม่ | ข้อมูลเก่ากลับมาแสดงครบ |
| เปิด → ผูก brand กับ supplier → ปิด | FK ยังอยู่, แค่ UI ไม่แสดง supplier column |
| เปิด → เปิด portal → ปิด feature | **Portal ปิดด้วย** (เช็ค company feature ก่อน) |

**เมื่อปิด feature:**
- ทุกหน้าที่เกี่ยวกับ supplier เช็ค `features.supplier` → ถ้า false:
  - **Sidebar**: ซ่อน menu supplier/PO/report ทั้งหมด
  - **หน้า supplier-related** (`/settings/suppliers`, `/inventory/purchase-orders`, `/reports/supplier`): **redirect ไปหน้ารับของ** (`/inventory/receives`)
  - **หน้ารับของ**: ไม่แสดง PO selector / supplier filter → ทำงานเหมือนเดิม 100%
  - **Supplier Portal**: API return 403 "Portal unavailable" (เช็ค 3 ชั้น: access_code + portal_enabled + company feature)
  - **ข้อมูลใน DB**: ไม่ลบ ไม่แก้ไข ไม่ cascade

**ไม่มี data migration เมื่อ toggle** — ไม่ต้อง cleanup อะไรเลย

### Supplier Types (3 ประเภท)

| Type | ความหมาย | Payment Flow | Report สิ้นเดือน |
|---|---|---|---|
| **Cash** | จ่ายเงินสดทันที | สั่ง PO → จ่ายเงิน → รับของ | ไม่จำเป็น (จ่ายทันที) |
| **Credit** | สั่งก่อน จ่ายทีหลัง | สั่ง PO → รับของ → จ่ายเงินตาม credit terms | **ยอดค้างจ่าย** (สรุปรับของ + มูลค่า) |
| **Consignment** | ฝากขาย (จ่ายเมื่อขายได้) | รับของ → ขาย → สิ้นเดือนสรุป | **ยอดขาย + stock คงเหลือ** (จ่ายตามที่ขายได้) |

### Report ต่าง Type

| | Credit | Consignment |
|---|---|---|
| **จ่ายอะไร** | จ่ายตาม **ของที่รับมา** ทั้งหมด | จ่ายตาม **ของที่ขายได้** |
| **Report** | สรุปยอดรับของ + ยอดค้างจ่าย | สรุปยอดขาย + stock snapshot |
| **ข้อมูลหลัก** | PO / ใบรับของ + มูลค่า | ยอดขายแยก channel + stock freeze |

---

## Phase 1: DB Migration + Feature Flag (Foundation)

### 1A. Feature Flag

**File**: [lib/features.ts](lib/features.ts)
- เพิ่ม `supplier: boolean` ใน `FeatureFlags` interface
- เพิ่ม `supplier: false` ใน preset defaults ทุกตัว
- อัปเดต `detectPreset()`, `parseFeatures()`

**File**: [app/settings/company/page.tsx](app/settings/company/page.tsx)
- เพิ่ม `supplier` ใน `FEATURE_CONFIGS` (icon: `Factory` จาก lucide)
- ลบ `comingSoon: true` ออกจาก `consignment`
- เงื่อนไข: เปิด `consignment` ต้องเปิด `supplier` ด้วยอัตโนมัติ

### 1B. Migration: `suppliers` table

**File**: `supabase/migrations/20260228_suppliers.sql`

```sql
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  supplier_type TEXT NOT NULL DEFAULT 'cash'
    CHECK (supplier_type IN ('cash', 'credit', 'consignment')),
  payment_terms INT DEFAULT 0,  -- credit days (ใช้กับ credit type)
  bank_name TEXT,               -- ชื่อธนาคาร
  bank_account TEXT,            -- เลขบัญชี
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Supplier Portal
  access_code TEXT UNIQUE,      -- random code สำหรับ portal (nullable = ยังไม่เปิด)
  portal_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

-- Index for portal access
CREATE INDEX idx_suppliers_access_code ON public.suppliers(access_code) WHERE access_code IS NOT NULL;

-- RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_company_access" ON public.suppliers
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- เพิ่ม supplier_id FK บน product_brands
ALTER TABLE public.product_brands
  ADD COLUMN IF NOT EXISTS supplier_id UUID
  REFERENCES public.suppliers(id) ON DELETE SET NULL;
```

### 1C. Migration: `purchase_orders` tables

**File**: `supabase/migrations/20260228_purchase_orders.sql`

```sql
-- PO header
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','partial_received','received','closed','cancelled')),
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  notes TEXT,
  total_amount NUMERIC(15,2) DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, po_number)
);

-- PO items
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่ม PO reference บน inventory_receives (nullable)
ALTER TABLE public.inventory_receives
  ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- PO number generator (PO-YYYYMM-XXXX)
CREATE OR REPLACE FUNCTION public.generate_po_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  next_num int;
  result text;
BEGIN
  prefix := 'PO-' || to_char(now(), 'YYYYMM') || '-';
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(po_number FROM LENGTH(prefix) + 1) AS int)
  ), 0) + 1
  INTO next_num
  FROM public.purchase_orders
  WHERE company_id = p_company_id
    AND po_number LIKE prefix || '%';
  result := prefix || LPAD(next_num::text, 4, '0');
  RETURN result;
END;
$$;

-- RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_company_access" ON public.purchase_orders
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_items_access" ON public.purchase_order_items
  USING (po_id IN (SELECT id FROM public.purchase_orders WHERE company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )));
```

### 1D. Migration: Supplier Report Snapshot tables

**File**: `supabase/migrations/20260228_supplier_snapshots.sql`

```sql
-- Snapshot header (per supplier, per month) — ใช้ทั้ง credit + consignment
CREATE TABLE public.supplier_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_type TEXT NOT NULL,  -- 'credit' or 'consignment' (snapshot ณ ตอนสร้าง)
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','sent')),
  -- Consignment fields
  total_stock_remaining NUMERIC DEFAULT 0,
  total_sold_quantity NUMERIC DEFAULT 0,
  total_sold_amount NUMERIC(15,2) DEFAULT 0,
  -- Credit fields
  total_received_quantity NUMERIC DEFAULT 0,
  total_received_amount NUMERIC(15,2) DEFAULT 0,
  -- Common
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, supplier_id, period_year, period_month)
);

-- Stock items — freeze stock ณ วันที่สร้าง (per warehouse, per variation)
-- ใช้ทั้ง credit (ดู stock ที่เหลือ) + consignment (stock คงเหลือ)
CREATE TABLE public.supplier_snapshot_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.supplier_snapshots(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL,
  variation_id UUID NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0
);

-- Sales items (per channel/POS terminal, per variation) — consignment เท่านั้น
CREATE TABLE public.supplier_snapshot_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.supplier_snapshots(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL,
  source TEXT,                    -- manual, shopee, pos, tiktok, line, facebook
  pos_terminal_id UUID,           -- for POS breakdown
  quantity_sold NUMERIC NOT NULL DEFAULT 0,
  revenue NUMERIC(15,2) NOT NULL DEFAULT 0
);

-- Receive items (per PO / per receive, per variation) — credit เท่านั้น
CREATE TABLE public.supplier_snapshot_receives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.supplier_snapshots(id) ON DELETE CASCADE,
  receive_id UUID REFERENCES public.inventory_receives(id),
  po_id UUID REFERENCES public.purchase_orders(id),
  variation_id UUID NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.supplier_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_company_access" ON public.supplier_snapshots
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

ALTER TABLE public.supplier_snapshot_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshot_stock_access" ON public.supplier_snapshot_stock
  USING (snapshot_id IN (SELECT id FROM public.supplier_snapshots WHERE company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )));

ALTER TABLE public.supplier_snapshot_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshot_sales_access" ON public.supplier_snapshot_sales
  USING (snapshot_id IN (SELECT id FROM public.supplier_snapshots WHERE company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )));

ALTER TABLE public.supplier_snapshot_receives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshot_receives_access" ON public.supplier_snapshot_receives
  USING (snapshot_id IN (SELECT id FROM public.supplier_snapshots WHERE company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )));
```

---

## Phase 2: Supplier Management

### API + UI

| File | Action |
|---|---|
| `app/api/suppliers/route.ts` | Create — CRUD (GET list, POST, PUT, DELETE soft) |
| `app/api/suppliers/[id]/route.ts` | Create — GET detail, PUT update, DELETE |
| `app/api/suppliers/[id]/regenerate-code/route.ts` | Create — POST regenerate access_code |
| `app/settings/suppliers/page.tsx` | Create — ตาราง supplier + form modal |
| `app/api/brands/route.ts` | Edit — เพิ่ม supplier_id ใน response + accept filter |
| `app/settings/brands/page.tsx` | Edit — เพิ่ม supplier dropdown บน brand card (เมื่อ feature ON) |
| `app/products/[id]/edit/page.tsx` | Edit — แสดง "Supplier: xxx" readonly (ดึงจาก brand) เมื่อ feature ON |
| `components/layout/Sidebar.tsx` | Edit — เพิ่ม "ซัพพลายเออร์" ใน settings submenu (feature-gated) |

### Supplier Form Fields
- ชื่อ, ชื่อผู้ติดต่อ, เบอร์โทร, อีเมล, ที่อยู่, เลขผู้เสียภาษี
- ประเภท: **Cash** / **Credit** / **Consignment**
- เครดิต (วัน) — แสดงเฉพาะ Credit type
- ธนาคาร, เลขบัญชี — สำหรับจ่ายเงิน
- หมายเหตุ
- **Supplier Portal**: toggle เปิด/ปิด + แสดง access code + ปุ่ม regenerate

### Access Code Generation
- Format: `SUP-XXXXXX` (6 ตัว random alphanumeric uppercase)
- สร้างเมื่อเปิด portal ครั้งแรก
- Regenerate → สร้าง code ใหม่ ตัวเก่าใช้ไม่ได้ทันที

---

## Phase 3: Purchase Order (PO)

### API

| File | Action |
|---|---|
| `app/api/inventory/purchase-orders/route.ts` | Create — GET list + POST create |
| `app/api/inventory/purchase-orders/[id]/route.ts` | Create — GET detail, PUT update, PATCH status |
| `app/api/suppliers/[id]/products/route.ts` | Create — สินค้าของ supplier (ผ่าน brand) สำหรับ PO picker |

### UI

| File | Action |
|---|---|
| `app/inventory/purchase-orders/page.tsx` | Create — รายการ PO + status tabs |
| `app/inventory/purchase-order/page.tsx` | Create — สร้าง PO (เลือก supplier → filter สินค้าตาม brand) |
| `app/inventory/purchase-orders/[id]/page.tsx` | Create — รายละเอียด PO + ประวัติรับของ + สถานะรับครบ/ไม่ครบ |
| `components/layout/Sidebar.tsx` | Edit — เพิ่ม "ใบสั่งซื้อ (PO)" ใน inventory submenu |

### PO Status Flow
```
draft → sent → partial_received → received → closed
                                            ↘ cancelled
```
- **Draft**: ร่าง PO เลือก supplier + สินค้า + จำนวน + ราคา
- **Sent**: กดส่ง (อนาคต: ส่งเมลให้ supplier)
- **Partial Received**: รับของบางส่วนแล้ว (tracked per item — แสดง qty สั่ง vs qty รับ)
- **Received**: รับครบทุกรายการ (auto เมื่อ received_qty >= qty ทุก item)
- **Closed**: ปิด PO (manual)
- **Cancelled**: ยกเลิก (ได้เฉพาะ draft/sent)

### PO Detail Page — แสดงสถานะรับของ
- แต่ละ item แสดง: สินค้า | จำนวนสั่ง | รับแล้ว | คงเหลือ
- Status badge per item: ✅ ครบ / ⏳ ยังไม่ครบ / ❌ ยังไม่รับ
- ประวัติใบรับของที่ผูกกับ PO นี้ (link ไป receive detail)

---

## Phase 4: แก้ไข Receive Flow (รับของ)

### เปลี่ยนแปลง

**File**: [app/inventory/receive/page.tsx](app/inventory/receive/page.tsx)
- เพิ่ม dropdown "ใบสั่งซื้อ (PO)" ด้านบน (แสดงเฉพาะเมื่อ `features.supplier` ON)
- เลือก PO → auto-fill warehouse + auto-populate items (แสดง qty สั่ง vs qty รับแล้ว)
- ไม่เลือก PO → ทำงานเหมือนเดิมทุกประการ

**File**: [app/api/inventory/receives/route.ts](app/api/inventory/receives/route.ts)
- POST รับ optional `po_id` + `supplier_id`
- เมื่อมี `po_id`:
  1. บันทึก `po_id`, `supplier_id` บน `inventory_receives`
  2. อัปเดต `purchase_order_items.received_quantity` ของแต่ละ item
  3. ตรวจสอบ PO ครบหรือยัง → auto-update status (partial_received / received)
- เมื่อไม่มี `po_id` → flow เดิม 100%

**File**: [app/inventory/receives/[id]/page.tsx](app/inventory/receives/[id]/page.tsx)
- แสดง PO reference + supplier name (ถ้ามี) ในส่วน header
- Link ไปหน้า PO detail

**File**: [app/inventory/receives/page.tsx](app/inventory/receives/page.tsx)
- เพิ่ม filter by supplier (เฉพาะเมื่อ feature ON)
- แสดง supplier name + PO number ในตาราง (ถ้ามี)

**File**: [lib/inventory-pdf.ts](lib/inventory-pdf.ts)
- เพิ่ม supplier name + PO number ใน info box ของ PDF ใบรับของ (ถ้ามี)

---

## Phase 5: Supplier Reports (รายงานซัพพลายเออร์)

### 5A. Credit Supplier Report (ยอดค้างจ่าย)

**ข้อมูล:**
- รายการรับของในเดือนนั้น (จาก `inventory_receives` ที่ผูก supplier)
- แยกตาม PO → แสดง items + จำนวน + มูลค่า
- **ยอดรวมที่ต้องจ่าย** = sum ของมูลค่ารับของทั้งหมดในเดือน
- Settlement status: ยังไม่จ่าย / จ่ายแล้ว (manual toggle)

### 5B. Consignment Report (ยอดขาย + stock)

**ข้อมูล:**
- **Stock คงเหลือ** (freeze ณ วันที่สร้าง snapshot): แยกตามคลัง → variation, SKU, จำนวน
- **ยอดขาย** ประจำเดือน: query `order_items` JOIN `orders` WHERE `order_status = 'completed'`
  - Filter เฉพาะสินค้าของ supplier: supplier → brands → products → variations → order_items
  - Group by variation, source, pos_terminal
- **Toggle**: "แยกช่องทาง+สาขา POS" vs "รวม"
- **ยอดที่ต้องจ่าย** = sum ยอดขาย (ราคาต้นทุน * จำนวนที่ขายได้)

### API

| File | Action |
|---|---|
| `app/api/reports/supplier/route.ts` | Create — GET list snapshots + POST generate snapshot |
| `app/api/reports/supplier/[id]/route.ts` | Create — GET detail + PATCH status |

### UI

| File | Action |
|---|---|
| `app/reports/supplier/page.tsx` | Create — หน้ารายงาน supplier (เลือก supplier + เดือน/ปี) |
| `app/reports/supplier/[id]/page.tsx` | Create — ดู snapshot detail |
| `components/layout/Sidebar.tsx` | Edit — เพิ่ม "รายงานซัพพลายเออร์" ใน reports section (feature-gated) |

### Snapshot Generation Logic
1. เลือก supplier + เดือน/ปี
2. หา brands ของ supplier → หา variations ของ products ใน brands นั้น
3. **If Consignment**:
   - Stock: query `inventory` table → freeze จำนวนคงเหลือ per warehouse per variation
   - Sales: query `orders` + `order_items` ของเดือนนั้น → group by variation, source, pos_terminal
4. **If Credit**:
   - Stock: query `inventory` table → freeze จำนวนคงเหลือ (optional, สำหรับ portal)
   - Receives: query `inventory_receives` + items ของเดือนนั้น → group by PO, variation
5. INSERT snapshot header + stock/sales/receives items
6. Status: draft → confirmed → sent (manual progression)

### Report UI
- เลือกเดือน/ปี + supplier
- **Auto-detect type**: ดู supplier_type → แสดง report ที่ตรงกับ type
- **Credit**: ตารางรับของ → PO, items, มูลค่า, ยอดรวมค้างจ่าย
- **Consignment**: ตาราง stock คงเหลือ (แยก warehouse) + ตารางยอดขาย
- Toggle: "แยกช่องทาง+สาขา" vs "รวม" (consignment)
- ปุ่ม "สร้าง Snapshot" + ดู snapshot เก่าที่เคยสร้าง

### Monthly Snapshot
- **Manual trigger**: Admin กดสร้าง snapshot จากหน้า report
- ไม่ต้องมี cron ตอนนี้ — อนาคตเพิ่ม Supabase Edge Function auto-generate draft ทุกต้นเดือนได้

---

## Phase 6: Supplier Portal (Online Stock View)

### Concept
ให้ supplier เข้ามาดูข้อมูลของตัวเองผ่าน link + access code — **ไม่ต้อง login**

### URL
- `/supplier-portal/[access_code]` — public page
- เช่น: `https://app.aoo.co/supplier-portal/SUP-A3X9K7`

### Security (3-Layer Validation)
- **Layer 1**: `access_code` valid → ต้องตรงกับ record ใน suppliers table
- **Layer 2**: `portal_enabled = true` → supplier ต้องเปิด portal ไว้
- **Layer 3**: `company.settings.features.supplier = true` → company ต้องเปิด feature supplier
- ถ้า Layer ใดไม่ผ่าน → return 403 "Portal unavailable"
- Regenerate code → code เก่าใช้ไม่ได้ทันที
- **Read-only ทั้งหมด** — ไม่แสดงข้อมูลลูกค้า

### Portal Pages (Public — no auth required)

| Page | แสดงอะไร |
|---|---|
| `/supplier-portal/[code]` | Landing — ชื่อ supplier + tabs |
| Tab: **Stock** | Stock คงเหลือ แยกตามคลัง → สินค้า, SKU, จำนวน |
| Tab: **ยอดขาย** | สรุปยอดขาย (เดือนนี้/เลือกเดือน) แยก channel ได้ **(consignment only)** |
| Tab: **ใบสั่งซื้อ** | รายการ PO ทั้งหมด + สถานะ |
| Sub: **PO Detail** | รายละเอียด PO → items, จำนวนสั่ง vs รับแล้ว, สถานะรับครบ/ไม่ครบ |
| Tab: **Report** | ดู snapshot ที่เราสร้างไว้ (credit: ยอดรับของ, consignment: ยอดขาย+stock) |

### API for Portal

| File | Action |
|---|---|
| `app/api/supplier-portal/[code]/route.ts` | GET — validate code + return supplier basic info |
| `app/api/supplier-portal/[code]/stock/route.ts` | GET — stock คงเหลือ (ผ่าน brand → product → variation → inventory) |
| `app/api/supplier-portal/[code]/sales/route.ts` | GET — ยอดขาย (consignment only) |
| `app/api/supplier-portal/[code]/purchase-orders/route.ts` | GET — PO list |
| `app/api/supplier-portal/[code]/purchase-orders/[id]/route.ts` | GET — PO detail |
| `app/api/supplier-portal/[code]/reports/route.ts` | GET — snapshot list |
| `app/api/supplier-portal/[code]/reports/[id]/route.ts` | GET — snapshot detail |

### UI Files (Public pages)

| File | Action |
|---|---|
| `app/supplier-portal/[code]/page.tsx` | Create — Landing with tabs (stock/sales/PO/report) |
| `app/supplier-portal/[code]/purchase-orders/[id]/page.tsx` | Create — PO detail view |
| `app/supplier-portal/[code]/reports/[id]/page.tsx` | Create — Snapshot detail view |
| `app/supplier-portal/layout.tsx` | Create — Minimal layout (no sidebar, no auth) |

### Portal Data Flow
```
access_code → suppliers table → company_id + supplier_id
→ product_brands (where supplier_id) → products → product_variations
→ inventory (stock), order_items (sales), purchase_orders (POs), supplier_snapshots (reports)
```

**Security Note**: Portal API ใช้ access_code เป็น auth แทน — ไม่ผ่าน Supabase auth
- API routes ใช้ service_role key (bypass RLS)
- **ทุก request ต้องผ่าน 3-layer validation**:
  1. `access_code` ตรงกับ record → ได้ `supplier_id` + `company_id`
  2. `suppliers.portal_enabled = true`
  3. `companies.settings.features.supplier = true` (query company settings)
- ถ้า layer ใดไม่ผ่าน → 403 "Portal unavailable"
- ไม่ return ข้อมูลลูกค้า, ราคาขาย (ยกเว้น consignment ที่ต้องรู้ยอดขาย)

---

## Phase 7: PDF Generation

### PO PDF
- ตาม pattern `lib/inventory-pdf.ts` สีใหม่ (เช่น `#2563eb` blue)
- Title: "ใบสั่งซื้อ"
- Info box: เลขที่ PO, วันที่, supplier name, สถานะ
- Table: # | รายละเอียด | จำนวน | ราคา | ยอดรวม
- Footer: ลายเซ็น ผู้สั่งซื้อ / ซัพพลายเออร์

### Supplier Report PDF
- **Credit**: สรุปรับของ + ยอดค้างจ่าย
- **Consignment**: สรุป stock + ยอดขาย
- ส่งให้ supplier ได้ (อนาคต: ทางเมล)

---

## Files Summary

### New Files (~25)

| File | Phase | Description |
|---|---|---|
| `supabase/migrations/20260228_suppliers.sql` | 1 | suppliers table + portal fields + product_brands.supplier_id |
| `supabase/migrations/20260228_purchase_orders.sql` | 1 | PO tables + inventory_receives alteration |
| `supabase/migrations/20260228_supplier_snapshots.sql` | 1 | snapshot tables (stock + sales + receives) |
| `app/api/suppliers/route.ts` | 2 | Supplier list + create |
| `app/api/suppliers/[id]/route.ts` | 2 | Supplier detail + update + delete |
| `app/api/suppliers/[id]/regenerate-code/route.ts` | 2 | Regenerate portal access code |
| `app/api/suppliers/[id]/products/route.ts` | 3 | Products by supplier (via brand) |
| `app/settings/suppliers/page.tsx` | 2 | Supplier management UI |
| `app/api/inventory/purchase-orders/route.ts` | 3 | PO list + create |
| `app/api/inventory/purchase-orders/[id]/route.ts` | 3 | PO detail + status |
| `app/inventory/purchase-orders/page.tsx` | 3 | PO list UI |
| `app/inventory/purchase-order/page.tsx` | 3 | PO create UI |
| `app/inventory/purchase-orders/[id]/page.tsx` | 3 | PO detail UI |
| `app/api/reports/supplier/route.ts` | 5 | Snapshot list + generate |
| `app/api/reports/supplier/[id]/route.ts` | 5 | Snapshot detail + status |
| `app/reports/supplier/page.tsx` | 5 | Supplier report UI |
| `app/reports/supplier/[id]/page.tsx` | 5 | Snapshot detail UI |
| `app/api/supplier-portal/[code]/route.ts` | 6 | Portal: validate code + supplier info |
| `app/api/supplier-portal/[code]/stock/route.ts` | 6 | Portal: stock data |
| `app/api/supplier-portal/[code]/sales/route.ts` | 6 | Portal: sales data (consignment) |
| `app/api/supplier-portal/[code]/purchase-orders/route.ts` | 6 | Portal: PO list |
| `app/api/supplier-portal/[code]/purchase-orders/[id]/route.ts` | 6 | Portal: PO detail |
| `app/api/supplier-portal/[code]/reports/route.ts` | 6 | Portal: snapshot list |
| `app/api/supplier-portal/[code]/reports/[id]/route.ts` | 6 | Portal: snapshot detail |
| `app/supplier-portal/[code]/page.tsx` | 6 | Portal landing + tabs |
| `app/supplier-portal/[code]/purchase-orders/[id]/page.tsx` | 6 | Portal PO detail |
| `app/supplier-portal/[code]/reports/[id]/page.tsx` | 6 | Portal snapshot detail |
| `app/supplier-portal/layout.tsx` | 6 | Portal minimal layout |

### Modified Files (~10)

| File | Phase | Changes |
|---|---|---|
| `lib/features.ts` | 1 | เพิ่ม `supplier` flag |
| `app/settings/company/page.tsx` | 1 | เพิ่ม supplier toggle, ลบ consignment comingSoon |
| `app/settings/brands/page.tsx` | 2 | เพิ่ม supplier dropdown บน brand |
| `app/api/brands/route.ts` | 2 | เพิ่ม supplier_id ใน response |
| `app/products/[id]/edit/page.tsx` | 2 | แสดง supplier info readonly (จาก brand) |
| `app/inventory/receive/page.tsx` | 4 | เพิ่ม PO selector (feature-gated) |
| `app/api/inventory/receives/route.ts` | 4 | รับ po_id + update PO status |
| `app/inventory/receives/[id]/page.tsx` | 4 | แสดง PO ref + supplier name |
| `app/inventory/receives/page.tsx` | 4 | เพิ่ม filter by supplier |
| `lib/inventory-pdf.ts` | 4 | เพิ่ม supplier + PO ref ใน PDF |
| `components/layout/Sidebar.tsx` | 2-5 | เพิ่ม menu items (feature-gated) |

---

## Implementation Order

| Phase | Scope | Dependency |
|---|---|---|
| 1 | Feature flag + DB migrations | - |
| 2 | Supplier CRUD + Brand linking + Product edit | Phase 1 |
| 3 | Purchase Order (PO) CRUD | Phase 2 |
| 4 | แก้ไข Receive flow (PO integration + supplier filter) | Phase 3 |
| 5 | Supplier Reports + Snapshot (Credit + Consignment) | Phase 2 |
| 6 | Supplier Portal (Online Stock/Sales/PO View) | Phase 3 + 5 |
| 7 | PDF generation (PO + Report) | Phase 3 + 5 |

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
                  ↘ Phase 5 (ทำขนานกับ 3-4 ได้)
                       ↓
            Phase 6 (ต้องรอ 3+5 เสร็จ)
                       ↓
                  Phase 7 (optional)
```

---

## Verification

### Feature Toggle Safety
1. `next build` passes ทุก phase
2. **Feature OFF** → ไม่มี supplier/PO/report menu ใน sidebar, รับของทำงานปกติ
3. **Feature ON** → เห็น supplier settings, PO menu, report
4. **เข้า URL ตรง** (`/settings/suppliers`) ขณะ feature OFF → **redirect ไป `/inventory/receives`**
5. **เปิด → สร้างข้อมูล → ปิด → เปิดใหม่** → ข้อมูลเก่ากลับมาครบ ไม่หาย
6. **ปิด feature** → Portal return 403 แม้ access_code ถูกต้อง

### Core Features
7. สร้าง supplier (3 types: cash/credit/consignment) → ผูก brand → สร้าง PO → รับของจาก PO → PO status auto-update
8. รับของโดยไม่เลือก PO → ทำงานเหมือนเดิม
9. **Credit Report**: สรุปรับของ + ยอดค้างจ่ายถูกต้อง
10. **Consignment Report**: freeze stock + ยอดขาย ถูกต้องตาม supplier's brands
11. Report แยก channel/POS terminal ได้ (toggle)

### Supplier Portal
12. access code → เห็น stock, ยอดขาย, PO, report (read-only)
13. Regenerate code → code เก่าใช้ไม่ได้
14. `portal_enabled = false` → return 403
15. `features.supplier = false` → return 403 (แม้ portal_enabled = true)

### PDF
16. PO + Report สร้างได้ถูกต้อง
