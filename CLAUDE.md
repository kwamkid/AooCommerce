# CLAUDE.md — Project Instructions & Knowledge Base

## Project Overview

ระบบ E-Commerce สำหรับร้านขายของออนไลน์หลายช่องทาง (Shopee, LINE, Facebook, Instagram, เปิดบิลตรง, POS)
- **Stack**: Next.js 16 (App Router, Turbopack) + Supabase + Tailwind CSS + pdfMake
- **Multi-tenant**: ทุก query ต้อง filter `company_id` (ชั้น UX) + **RLS บังคับจริงที่ DB แล้ว** (2026-07-24 — policy มาตรฐาน `is_company_member(company_id) or is_super_admin()` ทั้ง 62 ตาราง ตาม `aoo-techstack/multi-tenant/MULTI-TENANT.md`; API routes ใช้ service role จึง bypass — ห้ามลืม filter ใน code)
- **Language**: UI ภาษาไทย, code/comments ภาษาอังกฤษได้
- **Files**: `todo.md` = งานที่ยังไม่ได้ทำ

## 🏗 Techstack กลาง (ตระกูล aoo)

- คลัง pattern กลางอยู่ที่ **`/Users/ampstark/aoo-techstack/`** — **ก่อนออกแบบ/สร้าง
  ระบบใหม่ทุกครั้ง (auth, multi-tenant, billing, ฯลฯ) ให้เปิดค้นที่นั่นก่อนเสมอ**
  ถ้ามี pattern อยู่แล้ว → ทำตาม + copy จาก templates ห้ามออกแบบใหม่เอง
- ที่มีแล้ว: **auth** (server-auth + user-cache — `auth/AUTH.md`) ·
  **multi-tenant** (RLS-first — `multi-tenant/MULTI-TENANT.md`) — ดัชนีเต็มที่ `README.md`
- เจอบทเรียนใหม่/แก้ pattern → **อัปเดตที่คลังกลางด้วยเสมอ** แล้วค่อย sync กลับ
  โปรเจกต์อื่นที่ใช้ pattern เดียวกัน (คลังกลาง = source of truth ของ pattern)
- **bug ระดับสถาปัตยกรรม** (auth / RLS / middleware / พฤติกรรม Supabase — อะไรที่
  โปรเจกต์อื่นเจอได้ด้วย) → จดลง **`aoo-techstack/BUGS.md`** เพิ่มเติมจาก
  **`fix-bug.md`** (bug log ของโปรเจกต์นี้) เสมอ · bug เฉพาะโดเมนตัวเองจดแค่ในโปรเจกต์
- Auth ของโปรเจกต์นี้ = **hybrid variant** ตาม `aoo-techstack/auth/AUTH.md` §9
  (aoocommerce เป็นต้นทางของ variant นี้ — แก้ pattern ที่นี่ต้อง sync กลับคลังกลาง)

## 🚫 Git Workflow — **ห้าม `git push` จนกว่าจะได้รับคำสั่ง**

- **Commit ได้** เมื่องานเสร็จ (ตามคำสั่งหรือสมเหตุสมผล)
- **ห้าม `git push`** จนกว่า user จะบอกเองชัดๆ ("push เลย", "push ขึ้นไป", "deploy")
- ถ้าทำงานหลายรอบ → commit สะสมไว้ใน local จนกว่า user จะอนุมัติ push
- เหตุผล: user ต้องการ review/ทดสอบ local ก่อนขึ้น production
- เวลาแจ้งงานเสร็จ บอกแค่ "commit แล้ว" หรือระบุ hash — อย่าเสนอ push เอง

## 🐛 Fix Bug Log — **บังคับอ่านก่อนแก้ bug ทุกครั้ง!**

**ไฟล์**: [fix-bug.md](fix-bug.md) — log bug ที่แก้ไปแล้วทั้งหมด (root cause + วิธีแก้ + ป้องกัน regression)

**กฎ**:
1. ก่อนแก้ bug ใหม่ → **อ่าน `fix-bug.md` ก่อน** เพื่อเช็คว่าเคยเจอ/แก้คล้ายกันมั้ย — จะได้ไม่ผิดซ้ำ
2. หลังแก้ bug เสร็จ → **เพิ่ม entry ใหม่ที่ด้านบนสุด** ของ `fix-bug.md` (รูปแบบตามที่กำหนดในไฟล์)
3. ถ้า bug ที่แก้เกี่ยวข้องกับ entry เก่า → update entry เดิม + เพิ่มหมายเหตุว่า regression

## Rules (`.claude/rules/`) — อ่านก่อนเขียน code!

| Rule File | เนื้อหา |
|-----------|---------|
| `code-simplicity.md` | Shared components, hooks, services, API routes ทั้งหมด — ห้ามสร้างซ้ำ |
| `order-flows.md` | Customer type × sale type × status flow + auto-issue documents |
| `list-page-actions.md` | Focus action + ActionMenu ทุกหน้า list (per status) |
| `detail-page-actions.md` | Action buttons ทุกหน้า detail/edit (per status) |

---

## 🎨 Design System — **อ่านก่อนสร้างหน้าใหม่!**

### Reference templates (copy structure ได้เลย)
- **[app/dev/demo/page.tsx](app/dev/demo/page.tsx)** — Sales Dashboard ใช้ทุก shared component จริง (KPI Stat, BarChart, Sparkline, ProgressBar, DataTable, Card, Container, Badge, FormSelect, ExportButton). **ใช้เป็น template ตอนสร้าง dashboard / list page ใหม่**
- **[app/dev/design/page.tsx](app/dev/design/page.tsx)** — showcase ทุก variant ของ Button/Card/Badge/Alert/Modal/DataTable/FormInput. **ดูก่อนเลือก variant**
- **[.claude/rules/code-simplicity.md](.claude/rules/code-simplicity.md)** — รายการ shared comp + global CSS ครบ + ห้ามสร้างซ้ำ

### Shared components ใน `components/ui/` (20 ตัว — ใช้แทน inline class เสมอ)

| Component | ใช้สำหรับ |
|---|---|
| `Button` | ทุกปุ่ม — variants: primary/secondary/ghost/danger/success, sizes: sm/md/lg |
| `ExportButton` / `ImportButton` | ปุ่ม export/import — icon (Upload/Download) baked ห้ามใช้ผิด |
| `Card` | bg-white shadow box — padding: none/sm/md/lg, flat? |
| `Container` | page wrapper — size: full/2xl/4xl/5xl/6xl, gap: none/sm/md/lg |
| `Badge` | tag/pill — tones: gray/red/amber/emerald/blue/indigo/purple/orange, shape: pill/square, size: sm/md |
| `Alert` | banner เตือน — tones: danger/warning/info/success, มี icon + title? + onClose? |
| `PageHeader` | sub-page header — title + subtitle + backHref + actions slot |
| `Modal` | dialog — sizes: sm…4xl, footer slot, ESC + backdrop close |
| `Tabs` | underlined content tabs — `tabs={[{key,label,icon?,count?,href?,activeColorClass?}]}` + activeKey + onSelect (state-based) หรือ href (Link-based) |
| `StatusTabs` | list page status filter — `tabs={[{key,label,count,tooltip,hidden}]}` + activeKey + onSelect (ใช้ `getTabColor()` ภายใน) |
| `DataTable` | ตาราง list page — column toggle, resize, reorder, sort, inline edit, selection, mobile cards, pagination — ใช้ `storageKey` แยกแต่ละหน้า |
| `FormInput` | text input — มี **built-in validation** (required/min/max/pattern/custom validate), error/hint/icon/postfix/label all built-in, ใช้ ref handle `.validate()`/`.focus()` |
| `FormSelect` | dropdown — ห้ามใช้ native `<select>` |
| `SearchInput` | search box with X clear |
| `Toggle` | iOS-style on/off switch |
| `Checkbox` | checkbox |
| `ActionMenu` | row action dropdown (portal z-9999) — items: `[{key,label,icon,onClick,danger?,dividerBefore?}]` |
| `ImageLightbox` | fullscreen image viewer — `src` + `onClose` |
| `ProductImageThumb` | square product thumbnail (xs/sm/md/lg) — hover magnifying-glass overlay + click → `ImageLightbox` (internal state) + `fallbackIcon`. **ใช้แทน inline `<img>` + setLightboxSrc ทุกครั้ง** — เลิก duplicate ESC + lightbox div |
| `ListRow` | horizontal list row card สำหรับ sortable settings lists — slots: `icon` + `title` + `subtitle?` + `reorder?` + `actions?` + `inactive?`. **ใช้แทน inline `<Card padding="none"><div flex gap-3 p-4>...</div></Card>`** (payment-channels, pos-terminals) |
| `ReorderArrows` | vertical up/down arrow column สำหรับ manual sort — `onMoveUp`/`onMoveDown` + `disableUp?`/`disableDown?`/`disabled?`. ใช้ภายใน `ListRow` หรือ standalone |
| `PlatformIcon` | social icon — `id='line\|facebook\|instagram\|tiktok'` + size? + title? (จาก `/public/social/*.svg`) — ใช้ตอนแสดง chat platform / sales channel platform เสมอ |
| `StateCard` exports | `LoadingCard`, `EmptyCard`, `NoPermissionCard`, `DoneCard` |
| `Chart` exports | `Stat`, `BarChart`, `Sparkline`, `ProgressBar` |

### Form validation pattern (ใช้กับฟอร์มหลาย field)
```tsx
import FormInput from '@/components/ui/FormInput';
import { useFormValidation } from '@/lib/useFormValidation';

const form = useFormValidation();

<FormInput ref={form.register('name')} label="ชื่อ" required value={name} onChange={...} />
<FormInput ref={form.register('email')} label="อีเมล" required pattern="^[^@]+@[^@]+\.[^@]+$" patternMessage="รูปแบบอีเมลไม่ถูกต้อง" value={email} onChange={...} />
<FormInput ref={form.register('phone')} label="เบอร์โทร" pattern="^\d{10}$" value={phone} onChange={...} />

const onSubmit = () => {
  if (!form.validateAll()) return;  // ← shows all errors + focus first invalid
  submit();
};
```
Validation rules built-in: `required`, `requiredMessage`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `patternMessage`, `validate` (custom). External `error` prop overrides internal (สำหรับ server-side error)

### Page composition cheatsheet

**List page (top-level)**:
```tsx
<Layout>
  <Container size="full">
    <div className="flex justify-between">
      <div><h1 className="heading-1">หัวข้อ</h1><p className="page-subtitle">...</p></div>
      <div className="flex gap-2"><ExportButton /><Button variant="primary" icon={<Plus/>}>เพิ่ม</Button></div>
    </div>
    <StatusTabs activeKey={...} onSelect={...} tabs={[...]} />
    <div className="data-filter-card"><SearchInput /><FormSelect /></div>
    <DataTable storageKey="..." columns={...} data={...} ... />
  </Container>
</Layout>
```

**Sub-page (มี back)**:
```tsx
<Layout>
  <Container size="2xl">
    <PageHeader title="..." subtitle="..." backHref="/parent" actions={<Button/>} />
    <Card>...form...</Card>
  </Container>
</Layout>
```
⚠️ เมื่อใช้ `<PageHeader>` ห้ามใส่ `title`/`breadcrumbs` ใน `<Layout>` อีก (duplicate)

### Form action buttons (บังคับ)
ทุกฟอร์ม + Modal — **action group ชิดขวาของ container เสมอ**, secondary ก่อน primary, gap-3:
```tsx
<div className="flex justify-end gap-3">
  <Button variant="secondary" onClick={cancel}>ยกเลิก</Button>
  <Button variant="primary" loading={saving} onClick={save}>บันทึก</Button>
</div>
```
- กลุ่มปุ่ม **ชิดขวา** (`justify-end`) — ห้าม `justify-start` / `justify-between` / `justify-center`
- เรียงปุ่ม: **ยกเลิก (secondary) → บันทึก (primary)** ซ้ายไปขวา — ไม่กลับด้าน
- gap-3 = 12px ระหว่างปุ่ม | gap-2 = 8px เฉพาะใน Modal footer (กระชับขึ้น)
- ใช้กับทุกที่: form footer, Modal footer, action bars, danger zone ฯลฯ

---

## Standard Layout & Styling

### Page Template (List Page)
```
Header: title (icon + h1) + subtitle + ปุ่มสร้าง (bg-[#F4511E])
Tab Filter: flex gap-2 overflow-x-auto → rounded-xl px-4 py-2 min-w-[80px]
Search + Filter: data-filter-card → SearchInput + FormSelect
Table (desktop): data-table-wrap → table → data-thead/data-th/data-tbody/data-tr
Cards (mobile): md:hidden → divide-y cards
Pagination: Pagination component
```

### Global CSS Classes (`globals.css`)
```css
/* Table */
.data-table-wrap     /* bg-white rounded-lg shadow-sm */
.data-filter-card    /* filter bar container */
.data-thead          /* bg-gray-50 border-b */
.data-th             /* px-5 py-2.5 text-sm font-normal */
.data-tbody          /* bg-white divide-y */
.data-tr             /* hover:bg-gray-50 transition */

/* Focus Action Button (inline in table rows) */
.btn-focus-action              /* สีส้ม default — px-3 py-2 text-sm font-medium rounded-lg */
.btn-focus-action.green        /* ยืนยันชำระ, สำเร็จ, ยืนยันสลิป */
.btn-focus-action.indigo       /* รับออเดอร์, ลูกค้าชำระแล้ว */
.btn-focus-action.amber        /* จัดส่ง */
```

### Tab Filter Colors (`lib/status-tab-colors.ts`)
```typescript
import { getTabColor, getBadgeColor } from '@/lib/status-tab-colors';
// ทุกหน้าใช้สีเดียวกันตาม status key:
// all=indigo, new/draft=blue, ready_to_ship/pending_confirm=orange,
// processing/pending=indigo, shipping/shipped=amber,
// completed/paid/confirmed=emerald, overdue=red, cancelled=gray
```

### Color Palette
| ใช้สำหรับ | สี |
|---|---|
| Brand / Primary | `#F4511E` (orange-red) |
| Brand Hover | `#E64A19` |
| Success | emerald-600 |
| Warning | amber-500 |
| Danger | red-500/600 |
| Info | blue-600 |
| Neutral | gray-500 |

---

## UI Rules (บังคับ)

- **ห้ามใช้ native `<select>`** → ใช้ `FormSelect` แทนเสมอ
- **ห้าม text-xs/text-sm** สำหรับ body content → เฉพาะ badge/label/subtitle
- **Dropdown/Popover** → ใช้ `ActionMenu` (createPortal, z-9999) หรือ `z-[999]`
- **ห้ามสร้างหน้า view แยก** → ใช้หน้า edit form เดียว (`/xxx/new` + `/xxx/[id]`)
- **Mobile responsive** → table ใช้ `hidden md:block` + mobile cards `md:hidden`

---

## Business Domain (Critical Rules)

### GP Pricing
- `resolveGp()` returns **NET price** (หลังหัก GP แล้ว) — **ห้ามหัก GP ซ้ำ!**
- ใช้ `lib/gp-resolver.ts`
- **4 levels** (ลำดับความสำคัญ สูง→ต่ำ):
  1. **Customer Brand Override** — `customer_brand_commissions` table
  2. **Customer Default GP** — `customers.consignment_gp_rate`
  3. **Global Brand GP** — `companies.settings.brand_gp_overrides`
  4. **Global Default GP** — `companies.settings.consignment.default_gp_rate`

### Address System
- **ที่อยู่จัดส่ง** = `shipping_*` fields (ThaiAddressInput, แยก field)
- **ที่อยู่ออกบิล** = `billing_address` (textarea เดียว, ในส่วนข้อมูลภาษี)
- ถ้า billing ว่าง → `buildCustomerPayload()` join shipping fields
- ลูกค้าที่มี order แล้ว → lock customer_type (ห้ามเปลี่ยน)
- **Order shipments (chat-order flow)**: `/api/orders` POST/PUT จะ validate `shipments[]` **เฉพาะเมื่อ order มี `shipping_address_id`** (POST) หรือ **มี item ใดมี shipments entry** (PUT) — ถ้าไม่มี address ทั้ง order → ยอม `shipments = []` ทุก item ได้ → save ผ่าน
  - Use case: พนักงานพิมพ์ชื่อลูกค้า + สินค้า → save → ลูกค้ากรอกที่อยู่เองทีหลังผ่าน link (TBD)
  - `OrderForm.doSave()` auto-create shipping_address เมื่อ user กรอก delivery fields เท่านั้น — ถ้าไม่กรอก ก็ save with shipments=[] ได้

### Weighted Average Cost (WAC)
- `product_variations.cost_price` = WAC
- สูตร: `new_wac = (existing_qty × old_wac + received_qty × new_cost) / total_qty`
- **ห้ามเรียก WAC** จากย้ายคลัง, ส่งตัวแทน, ส่งห้าง, return — เฉพาะ inventory receives เท่านั้น

### Product variations — Soft-archive only (ห้าม hard-delete)
- `product_variations.id` ถูก FK reference **19 ตาราง** (order_items, inventory*, reports, supplier_snapshot_*, marketplace_product_links ฯลฯ); หลายตัวเป็น RESTRICT → DB reject; หลายตัวเป็น CASCADE → wipe history
- **ทุก "ลบ variation"** ใน API/RPC ต้องใช้ `UPDATE is_active=false` ไม่ใช่ `.delete()`
- **Type-switch (Simple ↔ Variation)** ใน `/api/products` PUT: detect ผ่าน `currentProduct.variation_label` vs incoming → soft-archive variations เก่าทั้งหมด → insert ตัวใหม่ใน branch ตามประเภทใหม่
- Front-end: ProductForm มี `pendingTypeChange` modal warning ก่อน toggle (เฉพาะ edit mode)

### Discount price < Default price (บังคับทั่วระบบ)
- กฎ: `discount_price > 0 AND discount_price >= default_price` → reject. `discount_price = 0` = "ไม่มีส่วนลด" อนุญาตเสมอ
- บังคับ 3 จุด:
  1. `ProductForm` UI — inline error "ราคาขายต้องน้อยกว่าราคาปกติ" (simple + per-variation)
  2. `bulk_create_products` RPC — error row, ระบุ variation label
  3. `bulk_update_variation_prices` RPC — เช็ค **FINAL value** (incoming OR existing) catch partial edit

### Bulk Excel templates — Format conventions
- **Row structure**: Row 1 = header (orange/white bold), Row 2 = instruction (gray italic — ใช้ **red bold** เฉพาะ required), Row 3+ = data
- ใช้ `addHeaderRow` / `addInstructionRow` / `addTemplateHeader` จาก [lib/bulk/excel-template.ts](lib/bulk/excel-template.ts) เสมอ
- Instruction cells: `string` = gray ปกติ; `{ text, required: true }` = red bold (เช่น "จำเป็นต้องกรอก")
- Status column: ใช้ `STATUS_COLUMN_HEADER` (= "สถานะ"), `STATUS_INSTRUCTION`, `STATUS_LABEL_ACTIVE/INACTIVE` จาก [lib/bulk/status-enum.ts](lib/bulk/status-enum.ts) — ห้าม hardcode "เปิด"/"ปิด" หรือ "ใช้งาน"/"ไม่ใช้งาน"
- **Create templates** = ตัวอย่างพอดี (1-3 records): create-categories 3 rows = 2 records (1 มี sub + 1 ไม่มี); create-brands 2 rows; create products 3 patterns (simple, 1-dim, 2-dim variation)
- **Edit templates** = export ของจริง + lock ID columns + instructions เป็น "(ค่าว่าง = ไม่แก้)"
- Variation product: ใช้ "ประเภทตัวเลือก 1/2 + ตัวเลือก 1/2" pattern; RPC จะ resolve / auto-create `variation_types` per company แล้ว set `products.selected_variation_types` + `product_variations.attributes`
- Freeze pane: `ySplit: 2` (lock both header + instruction rows)

---

## DB Schema (สำคัญ)

### Product System
```
products → product_variations (1:N) → product_images (variation-level)
                                    → inventory (per warehouse)
                                    → marketplace_product_links
```
- Simple: `variation_label IS NOT NULL`, 1 variation
- Variable: `variation_label IS NULL`, 2+ variations
- Image priority: `variation_image > product_image > null`
- Variable product: **ห้าม** fallback ไปรูป product ถ้า variation ไม่มีรูป

### Order System
```
orders → order_items → (promotion_components)
       → order_shipments
       → delivery_notes, tax_invoices, abbreviated_invoices, receipts
```

### Marketplace
```
marketplace_accounts → marketplace_product_links → product_variations
                     → orders (marketplace_account_id)
```
- Shopee status: `PROCESSED` = **processing** (ไม่ใช่ shipping!)

---

## PDF (Bill Template Design)

**Library**: pdfMake, **Font**: IBMPlexSansThai, **Page**: A4, **Margins**: `[40,40,40,110]`

**5 Sections**:
1. **Header** — Logo+company (left) + doc title 24pt + info box (right, 230pt)
2. **Sub-header** — Customer/warehouse info
3. **Item Table** — No vertical lines, 1px #333 header/footer, 0.5px #e5e7eb row dividers
4. **Summary** — Notes/QR (left) + totals table (right, 260pt), grand total bold 12pt
5. **Signature Footer** — 2 sides: ผู้ออกเอกสาร + ผู้รับ (absolute bottom)

**Corner triangle**: 50pt filled polyline, top-right, theme color
**ต้นฉบับ/สำเนา**: page 1 green "(ต้นฉบับ)", page 2 gray "(สำเนา)"

**PDF Color Palette**:
| Color | Hex | Usage |
|---|---|---|
| Green | `#15803d` | paid, receive, ต้นฉบับ |
| Dark Slate | `#1e293b` | unpaid, issue |
| Amber | `#b45309` | transfer, consignment |
| Red | `#dc2626` | credit note, void |
| Indigo | `#4f46e5` | statement |
| Orange | `#F4511E` | consignment report, brand accent |

---

## Marketplace

### Architecture Overview
- **Multi-tenant SaaS** — หลายร้านค้าใช้ระบบเดียวกัน
- **Multi-platform** — Shopee ✅ | TikTok ✅ | Lazada, LINE Shopping → planned
- **Shared product helpers** — `lib/shopee/product-helpers.ts` (ใช้ร่วมระหว่าง order sync + product sync)

### Order Sync Mechanism (Shopee)

**3 ทางที่ orders เข้าระบบ:**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/shopee/webhook` | Shopee push → save `shopee_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/shopee/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/shopee/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs (cron-job.org):**
| Job | URL | Schedule |
|-----|-----|----------|
| Shopee Webhook Retry | `GET /api/shopee/webhook/retry` | `*/5 * * * *` |
| Shopee Sync All | `GET /api/shopee/sync-all` | `*/15 * * * *` |

**Auth:** ทั้ง 2 routes รองรับ `Authorization: Bearer {CRON_SECRET}` และ `x-cron-secret` header

### Shopee Shared Helpers (`lib/shopee/product-helpers.ts`)
- ใช้ร่วมระหว่าง `sync.ts` (order sync) และ `product-sync.ts` (product import)
- Functions: `getOrCreateVariationTypeIds`, `buildVariationAttributes`, `upsertProductImage`, `upsertProductImages`, `getCategoryName`, `findExistingLink`, `upsertMarketplaceLink`, `tryAutoMatchBySku`, `resolveShopeePrice`, `reactivateProduct`, `backfillSiblingVariations`
- **ห้ามสร้าง helper ซ้ำ** ใน sync.ts หรือ product-sync.ts — ใช้จาก product-helpers.ts เสมอ

### Shopee Status Mapping (`lib/shopee/sync.ts` → `mapShopeeStatus()`)
| Shopee | → order_status | → payment_status |
|---|---|---|
| UNPAID | new | pending |
| READY_TO_SHIP | ready_to_ship | paid |
| PROCESSED | **processing** | paid |
| SHIPPED | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

### Product Matching Priority (Order Sync — ใช้ร่วม Shopee + TikTok)
1. `marketplace_product_links` (external_item_id + external_model_id)
2. SKU match
3. Product Code match
4. สร้างใหม่อัตโนมัติ (+ backfill ALL variations ถ้าเป็น variation product)

### Order Sync Mechanism (TikTok)

**3 ทางที่ orders เข้าระบบ (เหมือน Shopee):**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/tiktok/webhook` | TikTok push → save `marketplace_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/tiktok/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/tiktok/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs (cron-job.org) — เพิ่มจาก Shopee:**
| Job | URL | Schedule |
|-----|-----|----------|
| TikTok Webhook Retry | `GET /api/tiktok/webhook/retry` | `*/5 * * * *` |
| TikTok Sync All | `GET /api/tiktok/sync-all` | `*/15 * * * *` |

### TikTok Status Mapping (`lib/tiktok/sync.ts` → `mapTikTokStatus()`)
| TikTok | → order_status | → payment_status |
|---|---|---|
| UNPAID | new | pending |
| ON_HOLD | ready_to_ship | paid |
| AWAITING_SHIPMENT | ready_to_ship | paid |
| PARTIALLY_SHIPPING | processing | paid |
| AWAITING_COLLECTION | processing | paid |
| IN_TRANSIT | shipping | paid |
| DELIVERED | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

### TikTok Integration Files (`lib/tiktok/`)
| File | ใช้สำหรับ |
|------|----------|
| `api.ts` | API client (signing, OAuth, token management, endpoints) |
| `sync.ts` | Order sync (manual + polling) + `mapTikTokStatus()` |
| `webhook-processor.ts` | Webhook order sync (shared with retry) |
| `errors.ts` | Error translation (TikTok → Thai messages) |

### TikTok API Routes (`app/api/tiktok/`)
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/tiktok/oauth/auth-url` | Generate OAuth URL |
| `/api/tiktok/oauth/callback` | OAuth callback (token exchange + shop setup) |
| `/api/tiktok/webhook` | Webhook endpoint + background processing |
| `/api/tiktok/webhook/retry` | Retry failed TikTok webhooks |
| `/api/tiktok/sync` | Manual sync by account |
| `/api/tiktok/sync-all` | Cron: sync all active TikTok accounts |
| `/api/tiktok/sync-order` | Sync single order by ID |

### TikTok Sign Algorithm
```
1. Extract all query params EXCEPT 'sign', 'access_token'
2. Sort alphabetically by key
3. Concat {key}{value} pairs (no separator)
4. Prepend request PATH
5. If not GET and not multipart, append request BODY
6. Wrap: APP_SECRET + string + APP_SECRET
7. HMAC-SHA256(APP_SECRET, wrapped_string) → hex lowercase
```

### TikTok vs Shopee Key Differences
| | Shopee | TikTok |
|---|---|---|
| Shop identifier | `shop_id` (number) | `shop_cipher` (encrypted string) |
| Auth header | Query param `access_token` | Header `x-tts-access-token` |
| API versioning | `/api/v2/...` | `/{resource}/{YYYYMM}/...` |
| Order ID | `order_sn` (string) | `id` (string, 18 digits) |
| Webhook auth | HMAC(url + body, partner_key) | HMAC(app_key + body, app_secret) in `Authorization` header |
| Token exchange | Partner-level → shop tokens | Seller auth → get shops via `/authorization/202309/shops` |

### Marketplace Label Printing
- ใช้ `printOrder(orderId, 'marketplace_label', { source })` จาก `OrderPrintButtons`
- Route map อยู่ใน `MARKETPLACE_LABEL_ROUTES` (`components/ui/OrderPrintButtons.tsx`)
- ปัจจุบัน: Shopee ✅ | TikTok, Lazada, LINE Shopping, Shippop → ยังไม่มี API

### Orders Page — Flow Type Filter
- หน้าคำสั่งซื้อ (`/orders`) exclude `w_cash,w_credit,c_consign,d_consign` อัตโนมัติ
- ใช้ `p_exclude_flow_types` parameter ใน RPC `get_orders_list`

### API Docs (Local — ดูก่อน web search!)
- **Shopee v2**: `api_doc_knowledge/Shopee/_INDEX.md`
- **TikTok**: ` api_doc_knowledge/Tiktok/_INDEX.md` (19 categories, 233 endpoints)

### Scale & Queue Strategy
- **ปัจจุบัน**: Vercel serverless + Supabase — รองรับได้หลักพัน orders/วัน ไม่ต้อง queue
- **เมื่อ scale ขึ้น** (10+ ร้าน, หลาย marketplace): เพิ่ม **Upstash QStash** หรือ **BullMQ + Redis**
- **Architecture เป้าหมาย**: Webhook → save log → Queue → Worker (controlled concurrency, rate limit per platform, retry + dead letter)
- **จุดที่ต้องเปลี่ยน**: แค่ webhook route — เพิ่มยิง queue แทน `after()` async

### Shopee Description Sync + Central Product Upsert (เพิ่มเมื่อ 2026-05-21)
- **Description**: ดึง description จริงจาก Shopee เก็บใน `products.description` + per-platform ใน `marketplace_product_links.platform_description` (column ใหม่) — ลบ stub `"Shopee Item #..."`
- **Extended description** (whitelist sellers): flatten text → description, image URLs → `marketplace_product_links.platform_description_images` JSONB (ไม่ปนกับ product_images หลัก)
- **Central function** `upsertShopeeProduct()` ใน [lib/shopee/product-helpers.ts](lib/shopee/product-helpers.ts) — ใช้ร่วม 3 entry points (UI import / bulk sync / order sync) ผ่าน `backfillSiblingVariations` เสมอ → variations ครบทุกตัว
- **Export priority**: `platform_description` (account ปลายทาง) → `products.description` → `product.name`
- **UI**: textarea per-platform ใน Shopee tab ของ product edit page + thumbnail สำหรับ description images

### Shopee Chat — SellerChat API (เพิ่ม 2026-08-14)
- **แชท Shopee เข้าหน้ารวมแชท `/chat` เหมือน LINE/FB** — platform ที่ 3 ของระบบแชท (table-per-platform pattern เดิม)
- **Tables**: `shopee_contacts` (1 row = 1 conversation, `conversation_id` เป็น **TEXT** — int64 เกิน JS precision **ห้ามอ่าน conversation_id จาก API response เด็ดขาด** ใช้ค่า string จาก webhook เท่านั้น) + `shopee_messages` + RPC `get_latest_shopee_messages`/`search_shopee_contacts` + realtime publication (มี RLS มาตรฐานแล้ว)
- **ขาเข้า**: webhook push **code 10 (webchat)** ใน `/api/shopee/webhook` → `processShopeeWebchatPush()` ใน [lib/services/chat/shopee.ts](lib/services/chat/shopee.ts) (retry worker จัดการ code 10 ด้วย) — dedupe ด้วย `message_id`, direction จาก `from_shop_id`
- **ขาออก**: `ShopeeChatService.sendMessage()` ผ่าน dispatcher เดิม — **ส่งได้แค่ text + รูป** (รูปต้อง upload ผ่าน `sellerchat/upload_image` ≤2MB ก่อน แล้วค่อย send) — sellerchat API wrappers อยู่ [lib/shopee/chat.ts](lib/shopee/chat.ts)
- **chat_accounts platform 'shopee'** = reference เฉยๆ (`credentials: {marketplace_account_id, shop_id}` — token จริงอยู่ marketplace_accounts + ensureValidToken) — **auto-create ตอน push แรก**, toggle เปิด/ปิดที่ `/settings/chat-channels#shopee` (ปิด → webhook skip) — **ไม่ mirror ไป sales_channels**
- **เปิดใช้ครั้งแรก**: รัน `node scripts/enable-shopee-webchat-push.mjs --apply` (partner-level, ครั้งเดียวต่อ app) เพื่อเปิด push code 10
- media url จาก webhook อาจเป็น CDN file id เปล่า → `resolveShopeeCdnUrl()` แปลงเป็น URL เต็ม

### Lazada Chat — IM API (เพิ่ม 2026-08-14 — Lazada integration แรกของระบบ)
- **Base layer ใหม่** [lib/lazada/api.ts](lib/lazada/api.ts): signing แบบ TOP (sort params → concat path+kv → HMAC-SHA256 **hex ตัวใหญ่**, timestamp เป็น **มิลลิวินาที**), OAuth `/auth/token/create|refresh` ที่ auth.lazada.com, `ensureValidToken()` + auto-deactivate — env: `LAZADA_APP_KEY`, `LAZADA_APP_SECRET` (สมัคร app ที่ open.lazada.com)
- **OAuth**: `/api/lazada/oauth/auth-url` + `/callback` ใช้ signed state จาก [lib/oauth-state.ts](lib/oauth-state.ts) เหมือน Shopee/TikTok — account เก็บใน `marketplace_accounts` platform `'lazada'` (`shop_id` = seller_id) — เชื่อมที่ `/settings/integrations` tab Lazada
- **Ingest แบบ notify-then-pull**: webhook `/api/lazada/webhook` (**ต้องตอบ 200 ใน 500ms** — ตอบทันที ทำทุกอย่างใน `after()` รวมถึง log) → payload IM ไม่มี spec แน่นอน → แค่ trigger `syncSession()`/`syncRecentSessions()` ใน [lib/services/chat/lazada.ts](lib/services/chat/lazada.ts) ดึงความจริงจาก `/im/session/*` + `/im/message/list` (idempotent, dedupe ด้วย message_id) — webhook signature: `Authorization` = HMAC(app_key + raw body)
- **Tables**: `lazada_contacts` (1 row = 1 session) + `lazada_messages` + RPC + realtime (pattern เดียวกับ shopee_)
- **ส่งข้อความ**: `/im/message/send` template_id 1=text 3=image (แนบ img_url ภายนอกได้) — direction จาก `from_account_type` (1=buyer, 2=seller)
- **Order sync Lazada ยังไม่ทำ** — webhook log order push (message_type 0) ไว้เป็น audit เฉย ๆ; ต่อยอดภายหลังได้จาก base layer นี้
- **เปิดใช้**: สร้าง app open.lazada.com → ใส่ env 2 ตัว → เชื่อมร้านที่ Integrations → เปิดแชทรายร้านที่ `/settings/chat-channels#lazada` (เปิดครั้งแรกจะ backfill 10 sessions ล่าสุดให้) → ตั้ง Callback URL `/api/lazada/webhook` ใน Lazada Console > Push Mechanism

---

## 🏬 PC Counter Sales (เพิ่ม 2026-07-26 — ครบทั้ง 3 Phase)

PC (พนักงานประจำจุดขายในห้าง) บันทึกยอดขายรายวันผ่านมือถือ — **overlay เท่านั้น ไม่ใช่ยอดขายจริงทางบัญชี**: ไม่สร้าง order ไม่ออกเอกสาร ไม่ตัดสต็อกจริง; DSR จาก report ห้างยังเป็นตัวจริง (ตัดสต็อก + INV/ST)

- **โครง**: `consignment_counters` (1 สาขา = 1 คลัง `warehouse_type:'consignment'`; สาขาแรก adopt คลังเดิมของลูกค้า) · `counter_assignments` (PC↔สาขา) · `counter_sales` (`report_id` null = ยังไม่เข้า DSR) · `counter_id` ใน replenishments/department_orders (ปลายทางเติมของ)
- **Role `pc`** + capabilities `counter.record` (pc+ADMIN) / `counter.manage` (ADMIN) · PC หนึ่งคน assign ได้หลายสาขา (many-to-many) · **หน่วยแทน** = `company_members.pc_all_counters` เข้าได้ทุกสาขาอัตโนมัติ — เช็คสิทธิ์ผ่าน [lib/counter-access.ts](lib/counter-access.ts) เสมอ (ห้าม query `counter_assignments` ตรงๆ)
- **สต็อกคงเหลือฝั่ง PC** = คลังสาขา − counter_sales ที่ `report_id IS NULL` (`/api/pos/products?counter_id=` ก็หักให้)
- **ห้าม query คลัง consignment ด้วย `.single()`** — ลูกค้ามีได้หลายคลังแล้ว ใช้ [lib/consignment-warehouse.ts](lib/consignment-warehouse.ts) (`getCustomerConsignmentWarehouse` = oldest, `getConsignmentDestinationWarehouse` = counter-aware) เสมอ
- **หน้า**: `/pc` (PC mobile — ห่อ `PosSaleScreen` ด้วย `enablePromotions=false`) · `/counter-sales` (admin dashboard realtime) · `/settings/counters` (จัดการสาขา + assign + toggle หน่วยแทน)
- **สิ้นเดือน (DSR)**: DSR ผูก `counter_id` → confirm ตัดสต็อกคลังสาขา + stamp `report_id` ลง counter_sales (void ย้อนทั้งคู่) · ฟอร์ม DSR มีปุ่ม "ดึงยอดจาก PC" (prefill จำนวน — ราคา resolve ผ่าน GP เสมอ เพราะยอด PC เป็นเงินหน้าร้าน) + ตาราง diff PC vs report ห้าง
- **ใบวางบิลรวมทุกสาขา**: `createOrAttachStatementForDeptReport()` ใน statement-service — DSR ทุกสาขาของ customer+period เดียวกันแชร์ ST ใบเดียว; จ่าย/ย้อน/void จัดการทั้งชุดใน `/api/department-store/reports/[id]` — **ห้ามเรียก `createStatementForReport` ตรงๆ สำหรับ DSR อีก**

## 🚚 Delivery Zones + Slots (เพิ่ม 2026-08-17 — ฐานของ storefront checkout)

จุดส่ง/โซนค่าส่ง + ช่วงเวลาส่ง สำหรับธุรกิจ delivery (aDay Fresh) — feature flags `delivery_zone` (**อิสระ** — ร้าน e-commerce ที่เปิดบิลเองก็ใช้คิดค่าส่งตามพื้นที่ได้ · ไม่แตะออเดอร์ marketplace ที่มีค่าส่งมาแล้ว) + `delivery_slot` (**ต้องเปิด `delivery_date` ก่อน** — UI ล็อก + API clamp)

- **Tables**: `delivery_zones` (พื้นที่ provinces/districts/postcodes + `fee_type: fixed|lalamove` + `fee`/`free_over`/`lead_minutes` + `sort_order` = ลำดับจับคู่) · `delivery_slots` (`start_time`-`end_time` เป็น**ช่วง 2-3 ชม. ห้ามเวลาเป๊ะ** + `days_of_week` + `capacity` + `cutoff_minutes`) · `delivery_zone_slots` (โซนไหนใช้รอบไหน — **ไม่มี row ของ zone = ใช้ได้ทุกรอบ**)
- **Logic กลาง** [lib/delivery.ts](lib/delivery.ts) (client-safe, pure): `resolveZone()` — ไล่ตาม sort_order ตัวแรกที่ match ชนะ เช็ค postcode → district → province; ไม่ match = **ไม่รับส่ง ต้องบอกชัด ห้ามเงียบ** · `resolveDeliveryFee()` — fixed คืน fee (0 เมื่อยอด ≥ free_over), lalamove คืน `needsQuote: true` (กรอกยอด quote เอง — API integration ยังไม่ทำ) · `getSlotAvailability()` — day/cutoff+lead/capacity/zone; **ช่วงที่เลือกไม่ได้แสดงจาง + บอกเหตุผล ห้ามซ่อน**
- **Snapshot ลง orders เสมอ** (pattern เดียวกับ tax invoice): `delivery_zone_id/label` + `delivery_slot_id/label/start/end` ผ่าน `resolveDeliverySnapshot()` ใน [lib/delivery-server.ts](lib/delivery-server.ts) (validate company ownership) — ค่าส่งลง `orders.shipping_fee` **เดิม** ไม่มี column ใหม่
- **API**: `/api/delivery-zones` + `/api/delivery-slots` (CRUD, capability `masterdata.delivery`) — slots รองรับ `?date=YYYY-MM-DD` คืน `booked_count` ต่อ slot (เช็ค capacity) · DELETE = hard delete ถ้าไม่มี order อ้าง, มี → soft-disable
- **UI**: [/settings/delivery](app/settings/delivery/page.tsx) (2 tabs, ListRow + reorder = ลำดับจับคู่โซน) · OrderForm auto-resolve โซนจากที่อยู่ → auto-fill ค่าส่ง (**ไม่ทับค่าที่ staff แก้เอง** — เช็คผ่าน `lastAppliedZoneFeeRef`) + slot chips ใต้วันที่ส่ง · order detail แสดง badge โซน+รอบจาก snapshot

## 🛍 Storefront (เพิ่ม 2026-08-18 — หน้าร้านออนไลน์ + SEO/AEO)

**สถาปัตยกรรม: 1 engine 2 shells** — ตัดสินใจแล้วหลังเทียบ WooCommerce sync / custom WP plugin / iframe (ดู memory `storefront-architecture`)
1. **Standalone = surface หลัก** — `/store/[slug]` chrome ของ aoo เอง theme ต่อ company **ต้องทำ SEO+AEO ได้เต็ม ไม่ต้องมี WordPress**
2. **Embedded = add-on** สำหรับลูกค้าที่มีเว็บ WordPress อยู่แล้ว — plugin ดึง "เนื้อ" จาก aoo มาแปะในหน้า WP จริง (ยังไม่ทำ)
3. **Checkout อยู่บน aoo เต็มหน้าเสมอ** ทั้ง 2 ทาง (ยังไม่ทำ)
- ❌ **ห้ามย้อนไปเสนอ**: sync สินค้าเข้า WooCommerce · iframe (SEO ตาย + cookie ตะกร้าพังบน Safari ITP)

**กติกา SEO/AEO ที่ห้ามพัง**
- **ไม่มี `public_base_url` (โดเมนของร้านเอง) = `noindex` เสมอ** — SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า + หลาย tenant โดเมนเดียวกัน · หน้า filter (`?cat=`) ก็ `noindex` กัน facet ระเบิด
- **ข้อเท็จจริงต้องเป็น text ใน server HTML** — AI crawler ส่วนใหญ่ไม่รัน JS · เขียนเป็น**ประโยคเต็ม** เพราะ AEO อ้างอิงทีละ passage
- **`/store/[slug]` ต้องอยู่ใน `PUBLIC_PREFIXES` ของ [proxy.ts](proxy.ts)** ไม่งั้น Googlebot โดนเด้งไป `/login`
- Config เก็บใน `companies.settings.storefront` (JSONB) — [lib/storefront.ts](lib/storefront.ts) (client-safe: theme token + URL builder) + [lib/storefront-server.ts](lib/storefront-server.ts) (service role — **select เฉพาะ field ที่เปิดเผยได้** ห้ามหลุด cost_price/stock count/supplier) ห่อ `cache()` ให้ generateMetadata + page ใช้ fetch เดียว
- **สต็อกเปิดเผยเป็น boolean เท่านั้น** (`in_stock`) ห้ามส่งจำนวนจริงออกหน้าร้าน
- `products.slug` (unique ต่อ company, Thai-safe, backfill จากชื่อ) + `products.storefront_visible` (แยกจาก `is_active`)

**ไฟล์**: [/store/[slug]](app/store/[slug]/page.tsx) catalog + ItemList LD · [/p/[product]](app/store/[slug]/p/[product]/page.tsx) Product+Offer+BreadcrumbList LD · [/delivery](app/store/[slug]/delivery/page.tsx) **generate จาก `delivery_zones`/`delivery_slots` จริง** + FAQPage LD (หน้าที่ AEO อ้างมากสุด) · `sitemap.xml` / `robots.txt` (toggle AI crawler ต่อร้าน) / `llms.txt` · [/settings/storefront](app/settings/storefront/page.tsx)

## Promotion Module

### Types
`bundle_set`, `buy_get_free`, `buy_get_discount`, `qty_discount`

### Shopee Push
- `PushDealModal` → SSE progress → auto-export product if no link
- Action matrix: create/edit/push/sync/unsync/resync/delete × status

---

## Product Import/Export

### Export (1 ไฟล์ใหญ่ — ทุก field)
- ปุ่ม Export ในหน้าสินค้า — RPC `export_products` (products + shops + marketplace links)
- ID columns (A,B) สีเทา + locked | Parent row bold | Child rows แยกชัด
- ราคา marketplace แยกทุกร้าน (dynamic columns) | ชื่อไฟล์: `{all|filter}-product-{count}-{date}.xlsx`

### Bulk Edit (อัพเดท 2026-05-27 — แยก action เหมือน Shopee)
**Hub**: `/products/bulk` — เลือก action แล้วได้ template เฉพาะส่วนนั้น (เลียนแบบ Shopee mass_update_*)

| Action | URL | RPC | Editable fields |
|---|---|---|---|
| เพิ่มสินค้าใหม่ | `/products/bulk/create` | `bulk_create_products` | code, name, variations, brand, category, description (create-only, error if code exists) |
| ข้อมูลพื้นฐาน | `/products/bulk/basic-info` | `bulk_update_product_basic_info` | code, name, is_active, brand (by name), category (by name), description |
| ราคา | `/products/bulk/price` | `bulk_update_variation_prices` | default_price, discount_price, cost_price (perm) |
| สต็อก | `/inventory/bulk-stock-update` | (inline) | stock per warehouse |
| ราคา Marketplace | (planned) | — | per-shop prices |

**Pattern ทุก module**: Filter → Export → แก้ใน Excel → Upload → **Dry-run preview (diff)** → Confirm → Apply
- **Parser**: [lib/bulk/parse-template.ts](lib/bulk/parse-template.ts) — header-based (ทนต่อ column reorder) — **ห้ามอ่าน column ตามตำแหน่ง** (เคยมี bug, ดู [fix-bug.md](fix-bug.md))
- **APIs**: `/api/products/bulk/<action>/export` (GET, template data) + `/api/products/bulk/<action>/apply` (POST, dry_run + import)
- **RPC pattern**: ทุก bulk RPC return `{ results[], summary: {updated, unchanged, errors}, dry_run }`

### Legacy (ลบแล้ว 2026-05-27)
- ~~`/products/import`~~ (mega template) → แทนที่ด้วย `/products/bulk` hub
- ~~`/api/products/bulk-import`~~ → แทนที่ด้วย `/api/products/bulk/<action>/apply`
- `bulk_upsert_products` RPC ยังอยู่ใน DB (รอ drop ใน migration ต่อไป)

## Shopee API Success Rate Fixes (เพิ่มเมื่อ 2026-04-12)

### Auto-deactivate expired shops
- `sync-all`, `refresh-tokens`, `ensureValidToken` — ถ้า refresh_token หมดอายุ → set `is_active=false` อัตโนมัติ
- ป้องกัน cron ยิง API เปล่าที่ทำให้ success rate ตก

### mass_ship_order fix (ออเดอร์หาย)
- **ปัญหา**: กดรับ 5 ออเดอร์ เหลือ 3 — เพราะ code assume success สำหรับ unsplit orders
- **แก้**: ส่ง package_number เสมอ + ไม่ assume success ถ้าไม่อยู่ใน success_list + เพิ่ม detailed logging

### update_item category fix
- coerce `category_id` เป็น Number (Postgres bigint → string → Shopee reject)
- skip push ถ้า mandatory attribute auto-fill ไม่ได้

### get_buyer_invoice_info fix
- skip API call ถ้า order list ว่าง

### Header Notification
- `/api/marketplace/health` — คืน expired/disconnected shop count
- Header bell badge แสดง counter จำนวนร้านที่มีปัญหา (poll ทุก 5 นาที)

---

## 🔐 Auth Architecture (เพิ่มเมื่อ 2026-07-24 — cookie-based แบบเดียวกับ aoosocial/aoobooking)

### ภาพรวม
- **Session เก็บใน cookie** (`sb-<projectRef>-auth-token`, chunked ได้) ผ่าน `createBrowserClient` ของ `@supabase/ssr` — ไม่ใช่ localStorage แล้ว (key เดิม `joolzjuice-auth` มี one-time migration ตอน boot ใน session-manager)
- **[proxy.ts](proxy.ts)** (Next.js 16 middleware) กัน route ตั้งแต่ edge — ไม่มี auth cookie → redirect `/login?redirect=...`; อยู่ `/login|/register` พร้อม token ที่ verify ผ่าน → `/onboarding`. **Matcher ยกเว้น `/api` ทั้งหมด** (routes กันตัวเอง + webhook/cron ใช้ secret ของตัวเอง) — PUBLIC_PREFIXES ใน proxy.ts ต้อง sync กับ PUBLIC_ROUTES ใน auth-context.tsx เสมอ
- **API auth เป็น dual-mode**: `Bearer` header (apiFetch — ทางหลัก) → fallback อ่านจาก auth cookie (`extractRequestToken`) — SSR pages ในอนาคตเรียก API ได้เลย

### โมดูล `lib/auth/`
| File | Runtime | หน้าที่ |
|---|---|---|
| [lib/auth/login-methods.ts](lib/auth/login-methods.ts) | client | ฟังก์ชัน login ต่อ provider (password/Google/LINE) + `verifyMfaCode()` — คืน `LoginResult` (`success/redirect/mfa_required/error`) — **เพิ่มวิธี login ใหม่ = เพิ่มฟังก์ชันในไฟล์นี้ไฟล์เดียว** (provider ที่ server mint session ปิดท้ายด้วย `adoptSession()`) |
| [lib/auth/session-manager.ts](lib/auth/session-manager.ts) | client | เจ้าของ token cache ตัวเดียว — `getAccessToken()` (apiFetch ใช้), `adoptSession()`, `clearSession()`, `migrateLegacyLocalStorageSession()` |
| [lib/auth/jwt-local.ts](lib/auth/jwt-local.ts) | **edge-safe** | `verifyJwtLocally()` — jose + JWKS (ES256) ล้วน ไม่แตะ Supabase client — ใช้ได้ทั้ง proxy.ts และ API routes |
| [lib/auth/cookie-token.ts](lib/auth/cookie-token.ts) | edge-safe | parse auth cookie (chunk + `base64-` prefix) + `extractRequestToken()` (Bearer → cookie) + `hasAuthCookie()` |
| [lib/auth/verify-token.ts](lib/auth/verify-token.ts) | server (node) | `verifyAccessToken()` — local verify ผ่าน jwt-local → fallback `auth.getUser()` network (retry transient, warn ครั้งเดียว/process); expired = reject ทันที |

### กติกา
- `checkAuthWithCompany` / `checkAuth` / `checkSuperAdmin` ใน [lib/supabase-admin.ts](lib/supabase-admin.ts) ใช้ `extractRequestToken` + `verifyAccessToken` แล้ว — **ห้ามเรียก `supabaseAdmin.auth.getUser(token)` ตรงๆ ใน route ใหม่**
- Google OAuth เป็น **PKCE** แล้ว (default ของ @supabase/ssr) — [app/auth/callback/page.tsx](app/auth/callback/page.tsx) poll getSession สูงสุด 10×300ms รอ exchange
- `AuthResult.aal` = `'aal2'` เมื่อ session ผ่าน 2FA — ไว้บังคับ MFA per-route ในอนาคต
- Trade-off ที่ยอมรับ: ban user กลางทาง token เดิมยังผ่าน local verify จนหมดอายุ (~1 ชม.) แต่ปิด membership (`is_active=false`) มีผล ≤30s เท่าเดิม (auth cache TTL); middleware เช็คแค่ cookie presence สำหรับหน้า protected (token หมดอายุแต่ refresh ได้ต้องผ่านเข้าไปให้ client refresh)
- **2FA พร้อมเชิงโครงสร้าง**: `loginWithPassword` คืน `mfa_required` เมื่อบัญชี enroll TOTP → login page มี step กรอกรหัส 6 หลัก → `completeMfaLogin()`; state `mfaPending` กัน redirect ระหว่างกรอกรหัส — เหลือแค่หน้า enroll (settings) ตอนเปิดใช้จริง

## 🌐 Public Online Pages — SSR pattern (เพิ่มเมื่อ 2026-07-25)

หน้า public (ลิงก์แชร์ผ่าน LINE, ไม่ต้อง login) ใช้ pattern **server wrapper + client island**:
- `page.tsx` = server component: ดึงข้อมูลโดย **import GET handler ของ API route มาเรียก in-process** (single source of truth, ไม่มี HTTP hop) ห่อด้วย React `cache()` (dedupe ระหว่าง generateMetadata กับ page) + `generateMetadata` ทำ OG preview + **`robots: noindex` เสมอ** (ลิงก์ส่วนตัว)
- `*-client.tsx` = UI เดิมทั้งหมด รับ `initialData` prop — มีข้อมูลตั้งแต่ first paint; ถ้า server fetch fail จะ fallback fetch ฝั่ง client เอง

| หน้า | สถานะ |
|---|---|
| [/bills/[id]](app/bills/[id]/page.tsx) (บิลออนไลน์) | ✅ SSR + OG (เลขบิล/ร้าน/ยอด/สถานะ + โลโก้) |
| [/transfers/receive/[token]](app/transfers/receive/[token]/page.tsx) (รับของโอนย้าย) | ✅ SSR + OG |
| [/replenishments/receive/[token]](app/replenishments/receive/[token]/page.tsx) (รับของเติม) | ✅ SSR + OG |
| /portal/consignment + /supplier-portal + /invite | ⚠️ **static metadata เท่านั้น** (layout) — มี PIN/code gate ฝั่ง client **ห้าม SSR ข้อมูล** ไม่งั้นข้อมูลอยู่ใน HTML ก่อนผ่าน PIN |

หน้า public ใหม่ทุกหน้า → ใช้ pattern นี้ตั้งแต่แรก (หน้า gated → metadata อย่างเดียว)

## ⚡ Performance Architecture (เพิ่มเมื่อ 2026-05-29)

ระบบ caching + consolidation layer หลายชั้น — เปลี่ยน /orders/new cold load จาก 12 calls → 3 calls (cumulative ~10s → ~1.2s)

### Consolidated read endpoints (1 ปลายทางแทนหลาย call)
| Endpoint | รวมอะไร | ใช้กับ |
|---|---|---|
| `/api/header/summary` | warehouses+stockConfig+low_stock_count+chat_unread+orders_ready_count+marketplace_health | `HeaderSummaryProvider` ใน [lib/header-summary-context.tsx](lib/header-summary-context.tsx) → Sidebar + Header. Realtime subs: orders, line_contacts, fb_contacts (debounced 500ms refresh) + 5-min interval สำหรับ marketplace health |
| `/api/orders/new/init` | customers + products + warehouses + sales_channels + stockConfig + default-warehouse inventory | OrderForm `fetchInitBundle()` (non-marketplace path) → 1 call แทน 5; fallback เป็น individual fetches ถ้า /init error |

### apiFetch cache layer ([lib/api-client.ts](lib/api-client.ts))
- **In-memory response cache** key by `(URL, companyId)` พร้อม TTL ต่อ path:
  - `/api/warehouses`, `/api/sales-channels`, `/api/settings/features`, `/api/carriers` → 60s
  - `/api/orders/new/init` → 30s
- **Auto-invalidate** เมื่อ POST/PUT/PATCH/DELETE ปลายทางเดียวกัน
- **`CACHE_DEPENDENCIES` map** — write `/api/orders|customers|products|warehouses|sales-channels|inventory` → invalidate `/api/orders/new/init` ด้วย (composite cache)
- **Export `invalidateApiCache(prefix)`** สำหรับ manual invalidation

### Server-side auth cache ([lib/supabase-admin.ts](lib/supabase-admin.ts))
- `checkAuthWithCompany` ทำ 2 round-trips ทุก call (JWT verify + company_members query) → cache result 30s, key by `${token}|${companyId}`
- Cache เฉพาะ `isAuth=true` (invalid token re-check ได้ราคาถูก)
- Auto-cleanup ที่ size > 256 (bounded memory)
- Stale role/forced-logout propagate ใน ≤30s — acceptable

### Realtime patterns ที่ใช้
- **Sidebar badges** (orders, chat) — Supabase Realtime postgres_changes ใน `HeaderSummaryProvider` → debounced 500ms refresh
- **OrderForm inventory** — subscribe `inventory` table filter `warehouse_id=eq.${selectedWarehouseId}` → patch `inventoryMap` per variation (insert/update/delete). Channel name `inv-${companyId}-${warehouseId}` กัน cross-tenant ชน
- **Marketplace health** — polling 5 นาที (ไม่มี webhook event สำหรับ token expiry) — ใน `HeaderSummaryProvider`

### Defer non-critical fetches
- `/api/promotions?status=active&limit=200` + `/api/products/top-sellers` ใน OrderForm — defer 300ms หลัง mount เพื่อให้ critical burst (init endpoint) settle ก่อน

### Prefetch on hover
- ปุ่ม "+ สร้างคำสั่งซื้อ" ใน `/orders` — `onMouseEnter` ยิง `router.prefetch('/orders/new')` + `apiFetch('/api/orders/new/init')` พร้อมกัน → click หลัง hover ~1s = เปิดทันที

### Feature flags hydration ([lib/features-context.tsx](lib/features-context.tsx))
- `DEFAULT_FEATURES` = all-off baseline (ไม่ใช่ delivery preset) — ป้องกัน feature-gated UI flash visible→hidden ตอน config โหลด
- localStorage cache per company id → returning user เห็น feature state ถูกต้องทันทีตอน first render
- Network error → ใช้ค่า cache ล่าสุด (ไม่ใช่ defaults)

### กฎทั่วไป
- **เพิ่ม endpoint cacheable** → เพิ่มเข้า `CACHED_GET_PATHS` ใน [lib/api-client.ts](lib/api-client.ts) (อย่ายุ่ง CACHE_DEPENDENCIES ถ้าไม่ใช่ composite)
- **เพิ่ม composite endpoint** → ใส่ `CACHE_DEPENDENCIES` ให้ครอบ underlying resources
- **ห้าม polling** ถ้ามี realtime ทำหน้าที่ได้ — ยกเว้น external system ที่ไม่มี webhook (Shopee marketplace token expiry)

---

## ⚙️ Settings Pages Convention (อัพเดท 2026-05-29)

### Split tabs สำหรับ manual + integrations
หน้า settings ที่มีทั้ง user-managed entries และ API integrations → ใช้ **2 tabs**:
- **Tab 1 "ของฉัน" / "รับเงินตรง"** — user เพิ่ม/แก้/ลบเอง (manual + preset auto-fill)
- **Tab 2 "เชื่อมต่อ API"** — system integrations (Beam Gateway, Shippop, ฯลฯ) — ไม่มี "+ เพิ่ม"

ใช้กับ:
- [/settings/carriers](app/settings/carriers/page.tsx) — manual carriers / Shippop integration (placeholder)
- [/settings/payment-channels](app/settings/payment-channels/page.tsx) — Cash/PromptPay/Bank / Beam Gateway

### "ทั่วไป" — รวม CRM-style + business profile
[/settings/page.tsx](app/settings/page.tsx) ใช้ Tabs:
- **Tab "ข้อมูลร้านค้า"** ([/settings/company](app/settings/company/page.tsx)) — ชื่อ/โลโก้/ที่อยู่/ภาษี/business type (รองรับทั้ง individual + corporation)
- **Tab "บิล และสินค้า"** — variation types + bill expiry settings

Sidebar entry "ทั่วไป" link ไป `/settings/company` (= tab แรก) — `(pathname === '/settings' || pathname === '/settings/company')` ใช้ active state

### Card density mất ทุก list row
- Card inner padding: `px-3 py-2.5` (ไม่ใช่ `p-4`)
- Icon container: `w-8 h-8` (ไม่ใช่ `w-10 h-10`) — `<Banknote className="w-4 h-4">`
- List gap: `space-y-2` (ระหว่างใบ — ไม่ใช่ `space-y-4`)
- ห้ามใช้ `text-gray-300` กับ icons ที่ต้องการ visibility — `text-gray-500` minimum
- ListRow ครอบ pattern นี้ให้แล้ว ใช้แทนการ inline เสมอ

### Preset auto-fill pattern (sharing constants)
สำหรับ entities ที่มี curated list (carriers/payment methods/ฯลฯ):
1. Constants ใน `lib/constants/<entity>.ts` — shared ระหว่าง onboarding + settings
2. Settings create modal: filter presets `!existingCodes.has(code)` → pill chips
3. Click pill → fill form fields (name + code + ทุก field ที่จำเป็น)
4. Manual entries (ไม่ใช่ preset) ก็ยัง create ได้
- ตัวอย่าง: [lib/constants/carriers.ts](lib/constants/carriers.ts) `CARRIER_PRESETS`

### Modal padding gotcha
`.modal-body` + `.modal-footer` ใน [globals.css](app/globals.css) **ไม่มี padding built-in** — caller ต้องใส่ `px-6 py-5` (body) + `px-6 py-4` (footer) เอง ดู [TaxInvoiceEditModal](components/ui/TaxInvoiceEditModal.tsx) เป็น reference

---

## File References
- **todo.md** — งานที่ยังไม่ได้ทำ (ไม่ sync git)
- **memory/** — Claude memory files (auto-loaded)
- **.claude/rules/** — Modular rules (code simplicity, flows, actions)
