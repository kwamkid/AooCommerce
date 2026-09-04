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
| `SaveButton` | ปุ่มบันทึกทุกฟอร์ม/โมดัล — คำว่า "บันทึก" + icon Save baked ห้ามประกอบเอง (ยกเว้นปุ่ม record-payment เช่น "บันทึกชำระ") |
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
| Loading 4 ชั้น | 1 `FullPageLoading` (เปิดเว็บครั้งแรก) · 2 `loading.tsx` + `AppSegmentLoading` (เปลี่ยนหน้า) · 3 `LoadingCard` (อ่านข้อมูลในบล็อก) · 4 `LoadingOverlay` (เขียนข้อมูลเป็นชุด) — **segment ใหม่ต้องมี `loading.tsx`** ไม่งั้น splash เต็มจอจะกระพริบทับ sidebar |
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

**List page (top-level)** — ไม่ส่ง `backHref` แปลว่าหน้าหลัก PageHeader จะใช้หัวข้อขนาดใหญ่ให้เอง:
```tsx
<Layout>
  <Container size="full">
    <PageHeader
      icon={<Package2 />}          // ขนาด/สีไอคอนคุมจาก PageHeader — ห้ามใส่ className เอง
      title="หัวข้อ"
      subtitle="..."
      actions={<><ExportButton /><Button variant="primary" icon={<Plus/>}>เพิ่ม</Button></>}
    />
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
⚠️ **ห้ามเขียนหัวข้อหน้าเองด้วย `<h1>`** ไม่ว่าจะ `heading-1` หรือ `text-3xl font-bold` — ทุกหน้าใช้ `PageHeader` ตัวเดียว (แก้ขนาด/ระยะที่ [components/ui/PageHeader.tsx](components/ui/PageHeader.tsx) ที่เดียว)

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

### ยอดเงินของออเดอร์ — **แอปเป็นเจ้าของ `orders.total_amount`** (2026-08-30)
- สูตรเดียวอยู่ที่ [lib/order-totals.ts](lib/order-totals.ts) — `computeOrderTotals()` = สินค้า − ส่วนลดท้ายบิล **+ ค่าจัดส่ง + ค่าการ์ดอวยพร** แล้วถอด VAT ออกจากยอดรวม (ราคาทุกที่เป็นราคารวม VAT แล้ว) · ใช้ร่วมทั้ง OrderForm กับ `/api/orders` — **ห้ามเขียนสูตร `/1.07` เองที่อื่นอีก**
- DB trigger เหลือ `sync_order_vat_split()` ที่**แตะแค่ `subtotal`/`vat_amount`** (แตกตาม `companies.vat_registered` จริง) — **ห้ามเอาการคิด `total_amount` กลับเข้า trigger** ตัวเก่าคิดจากรายการสินค้าอย่างเดียวจึงกินค่าส่งหายทุกบิล (ดู [fix-bug.md](fix-bug.md) 2026-08-30)
- **`shipping_fee` มีสองความหมาย** — บิลที่ร้านออกเอง = ค่าส่งที่บวกให้ลูกค้าจ่าย · ออเดอร์ marketplace = ค่าส่งที่แพลตฟอร์มหักเรา (`total_amount` มาจากยอดของแพลตฟอร์ม) **ห้ามบวกเข้ายอด**
- ค่าส่ง**แก้มือได้เสมอ** (เคส Lalamove/ส่งด่วน) — โซนจัดส่งเติมให้เป็นค่าตั้งต้นเท่านั้น ไม่ทับค่าที่ staff พิมพ์เอง · บิลที่ยังไม่มีที่อยู่ก็เก็บค่าส่งได้ (API รับ `shipping_fee` ตรงเป็นค่าสำรองเมื่อไม่มี `shipments`)

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

- **ไอคอนในเอกสารใช้ SVG เท่านั้น** (`{ svg: '<svg …>' }` ของ pdfMake — ฝังสีในตัว path เพราะ svg-to-pdfkit ไม่รู้จัก `currentColor`) · ตัวอย่าง: ชิป "แนบการ์ดอวยพร / ห้ามแนบใบเสร็จ / ขอใบกำกับภาษี" ในใบจัดของ
- ⛔ **ห้ามใส่ emoji/สัญลักษณ์แปลก ๆ ในเอกสาร PDF** — ฟอนต์ที่ฝังมีแค่ IBMPlexSansThai และ pdfMake ไม่มี font fallback → พิมพ์ออกมาเป็นกล่องเปล่า (เคยหลุด `🎁` กับ `※` ดู [fix-bug.md](fix-bug.md) 2026-08-30) · ที่ใช้ได้: `• · » → ✓ — –` · เช็คก่อนใช้ตัวใหม่ด้วย fontkit (`f.layout('X').glyphs[0].id === 0` = ไม่มี)
- **"กำหนดส่ง" (วันที่ + รอบเวลา) ใช้ `formatDeliverySchedule()` จาก [lib/pdf-utils.ts](lib/pdf-utils.ts) ที่เดียว** — มีแล้วใน ใบจัดของ · ใบปะหน้า · ใบเสร็จ/ใบกำกับ(ย่อ+เต็ม) · บิลออนไลน์ · เอกสารใหม่ให้เรียกตัวนี้ ห้ามประกอบข้อความเอง
- **ใบจัดของ ([lib/orders-packing-pdf.ts](lib/orders-packing-pdf.ts)) = 2 ออเดอร์/หน้า แต่ไม่ใช่กฎตายตัว** — ครึ่งบนเป็นตารางความสูงคงที่ 381pt + เส้นประ absolute ที่ y=421 (ตัดกระดาษตำแหน่งเดียวกันทุกใบ) · ออเดอร์ที่เนื้อหาไม่ลงครึ่งหน้า (การ์ดอวยพร + ที่อยู่ + หลายรายการ) **กินเต็มหน้าของตัวเอง** ไม่งั้นล้นไปทับออเดอร์ครึ่งล่าง · ตัวเลือกพิเศษของบิล (การ์ดอวยพร/ห้ามแนบราคา/ขอใบกำกับ) เป็น**ชิปแถวเดียว + ไอคอน** ไม่ใช่กล่องละ option (กินที่) · ขนาดรูปสินค้า 25–75pt คิดจากที่ว่างที่เหลือจริง — **เพิ่มบล็อกใหม่ในใบนี้ต้องบวกความสูงเข้า `compactPackingParts()` ด้วย**

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
- **📊 สถานะรายแพลตฟอร์มว่าใครถึงไหนแล้ว (เช็คจาก DB จริง) อยู่ที่ [memo/platform-status.md](memo/platform-status.md) — อ่าน/อัปเดตที่นั่นที่เดียว ห้ามทำตารางสถานะซ้ำในไฟล์นี้**
- **Multi-tenant SaaS** — หลายร้านค้าใช้ระบบเดียวกัน
- **Multi-platform** — Shopee ✅ | TikTok ✅ | Lazada ✅ (ออเดอร์+สินค้า+settlement ครบทั้ง 3 · LINE Shopping → planned)
- **Shared product helpers** — `lib/shopee/product-helpers.ts` (ใช้ร่วมระหว่าง order sync + product sync)

### Order Sync Mechanism (Shopee)

**3 ทางที่ orders เข้าระบบ:**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/shopee/webhook` | Shopee push → save `shopee_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/shopee/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/shopee/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs:** ตารางรวมของทุกแพลตฟอร์มอยู่ที่หัวข้อ TikTok ด้านล่าง (แหล่งเดียว — อย่าทำตารางซ้ำที่นี่)

**Auth:** ทุก cron route รองรับ `Authorization: Bearer {CRON_SECRET}` และ `x-cron-secret` header

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
| TO_CONFIRM_RECEIVE | shipping | paid |
| TO_RETURN (ลูกค้าขอคืนของหลังได้รับ) | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

- **สถานะใหม่ที่ mapping ไม่รู้จักห้ามปล่อยตก default** (default = new/pending จะลาก order ถอยหลัง — เคยเกิดกับ TO_RETURN, ดู fix-bug.md 2026-08-28) — เพิ่มสถานะต้องเพิ่มทั้ง `mapShopeeStatus()` และ rank ใน `SHOPEE_STATUS_ORDER`

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

**Cron Jobs (cron-job.org) — ครบทุกแพลตฟอร์มแล้ว 6 ตัว (ยืนยันหน้าจอ 2026-08-30):**
| Job | URL | Schedule |
|-----|-----|----------|
| Shopee Sync All | `GET /api/shopee/sync-all` | `*/15 * * * *` |
| Shopee Webhook Retry | `GET /api/shopee/webhook/retry` | `*/5 * * * *` |
| TikTok Sync All | `GET /api/tiktok/sync-all` | `*/15 * * * *` |
| TikTok Webhook Retry | `GET /api/tiktok/webhook/retry` | `*/5 * * * *` |
| Lazada Sync All | `GET /api/lazada/sync-all` | `*/15 * * * *` |
| Lazada Webhook Retry | `GET /api/lazada/webhook/retry` | `*/5 * * * *` |
| **Watchdog (เฝ้าสุขภาพทุกเจ้า)** | `GET /api/marketplace/watchdog` | `*/15 * * * *` |
| **Settlement รายวัน (ทั้ง 3 เจ้า)** | `GET /api/marketplace/settlements/sync` | `0 4 * * *` |

**เพิ่ม marketplace ใหม่ = ต้องตั้ง cron 2 ตัวเสมอ** (sync-all + webhook/retry)
ทุกตัวยิงด้วย header `x-cron-secret: {CRON_SECRET}`

### 🔔 Watchdog — ตัวเฝ้าที่ทำให้ "พังเงียบ" เป็นไปไม่ได้ (เพิ่ม 2026-09-02)

[lib/marketplace/watchdog.ts](lib/marketplace/watchdog.ts) — **แหล่งความจริงเดียว** ของ "ตอนนี้มีอะไรพังอยู่":
หน้า superadmin API Monitor · การ์ดบน dashboard ของร้าน ([SystemIssuesCard](components/ui/SystemIssuesCard.tsx)) ·
กระดิ่งบน Header · push แจ้งเตือน — **อ่านจาก `collectWatchdogIssues()` ตัวเดียวกันหมด** จึงไม่มีทางพูดคนละเรื่อง

- **ทุก issue ต้องมี `fix` (วิธีแก้ที่ลงมือได้จริง) + `actionLabel` + `url`** — บอกว่าพังเฉย ๆ แล้วให้ผู้ใช้ไปหาทางเอง ไม่นับว่าแจ้งเตือน
- **ใครได้รับ**: `scope: 'system'` → superadmin · ทุก issue ที่มี `companyId` → เจ้าของ/แอดมินของบริษัทนั้น (เรื่อง cron ตายก็บอกร้านด้วย เพราะกระทบตัวเลขที่ร้านเห็น)
- **กันสแปม**: เรื่องเดิมเตือนซ้ำได้ทุก 6 ชม. · เรื่องที่มี `groupKey` เดียวกันรวมเป็นใบเดียว (cron เจ้าหนึ่งตาย = 1 ใบ ไม่ใช่ 6 ใบ) · หายแล้วบอก "กลับมาปกติ" ครั้งเดียว · state เก็บใน `app_flags.watchdog_state`
- **push ส่งถึงคนไม่ใช่ถึงบริษัท** — `sendPushToUsers()` ยิงตาม `user_id` จึงถึง superadmin ได้ไม่ว่าตอนเปิดแจ้งเตือนจะอยู่บริษัทไหน (สวิตช์เปิดได้ทั้งกระดิ่งในแอปหลักและมุมขวาบนของ shell superadmin)
- ⚠️ **ตัวเฝ้าเองก็ตายเงียบได้** — ชั้นนอกสุดต้องเป็นของนอกระบบเรา: **เปิด "Notify on failure" ของ job นี้ใน cron-job.org เสมอ** · หน้า superadmin แสดง "ตัวเฝ้าตรวจล่าสุดเมื่อ ..." จาก `app_flags.watchdog_last_run` — ค่านี้ค้าง = ตัวเฝ้าตาย
- **ช่องทาง push (LINE/Facebook) จับด้วย "ความเงียบ" ไม่ใช่ "ตามหลัง"** — ไม่มี cron ให้ดู ถ้า webhook หลุด/token เพจหมดอายุจะเงียบสนิท · เกณฑ์ = **`1.5 × ช่องว่างที่ยาวที่สุดที่ช่องทางนี้เคยเงียบใน 30 วัน`** clamp 6–48 ชม. · ⚠️ **ห้ามกลับไปใช้ค่าเฉลี่ย** — ลูกค้าไม่ทักตอนตี 3 ค่าเฉลี่ยจึงต่ำกว่าความจริงเสมอแล้วเตือนผิดทุกเช้ามืด (เจอจริง 3–4 ก.ย. 2026 ดู [fix-bug.md](fix-bug.md)) และ**ข้ามช่องทางที่คุยน้อยกว่า 20 ข้อความ/สัปดาห์** เพราะแยกไม่ออกว่าเงียบเพราะพังหรือเพราะไม่มีคนทัก · สถิติมาจาก RPC `get_chat_channel_activity()` (call เดียวได้ทั้ง 2 แพลตฟอร์ม — ต่อบริษัท ~17ms)
- **LINE/Facebook มี integration log แล้ว** (เพิ่ม 2026-09-02) — ส่งข้อความ · ลายเซ็น webhook ไม่ตรง · webhook error · ทั้งหมด `await logIntegrationNow()` เพราะอยู่ใน request handler · **ไม่ log ข้อความขาเข้าที่สำเร็จ** (วันละ ~350 ใบ จะท่วม) — ความเงียบจับด้วย watchdog แทน
- **เพิ่มเรื่องที่ต้องเฝ้า = เพิ่ม check ในไฟล์เดียว** ห้ามไปเขียน logic ตรวจสุขภาพซ้ำในหน้าใดหน้าหนึ่ง

**⚠️ worker ของ retry ทั้ง 3 เจ้าเป็นตัวเดียวกันแล้ว** — [lib/marketplace/webhook-retry.ts](lib/marketplace/webhook-retry.ts)
(`runWebhookRetry()`) route ของแต่ละแพลตฟอร์มเหลือแค่บอกว่า "งานหนึ่งใบทำยังไง"
เพิ่ม marketplace ใหม่ = สร้าง route 3 บรรทัด **ห้าม copy worker ไปทั้งก้อนอีก** ·
worker หยิบทั้งใบที่ `failed` (รวม `next_retry_at` เป็น NULL) **และใบที่ค้าง
`processing` เกิน 10 นาที** (ฟังก์ชันตายกลางทาง) — ของเดิมมองแค่ `failed` ที่ถึงรอบ
จึงมีใบค้างถาวรทั้งสองแบบ (ดู [fix-bug.md](fix-bug.md) 2026-08-30)

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
| `product-sync.ts` | **Product import** — `syncProductsFromTikTok()` (ทั้งร้าน) + `upsertTikTokProduct()` (ทีละตัว) |
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
| `/api/tiktok/products/import` | GET พรีวิวสินค้าในร้าน · POST ดูดเข้าทั้งร้าน (SSE progress) |

### โลโก้ร้าน TikTok — **ไม่มีใน API ฝั่งขาย** (ยืนยัน 2026-08-30 อย่าไล่ scope ซ้ำ)
- `/authorization/202309/shops` → cipher/code/id/name/region/seller_type · `/seller/202309/shops` → **id กับ region เท่านั้น** (เปิด scope ได้ก็ไม่มีโลโก้)
- ค้นทั้ง OAS แล้ว avatar ของ**ร้าน**มีที่เดียวคือ `customer_service/*/conversations` — ที่เหลือเป็น avatar ของ creator/affiliate
- ทางที่ได้โลโก้จริงมี 2 ทาง: **chat sync** ([lib/services/chat/tiktok.ts](lib/services/chat/tiktok.ts) เก็บ avatar ของ participant `role='SHOP'`) หรือ **ผู้ใช้ใส่ URL เอง**
- **กดที่รูปโลโก้ในการ์ดร้าน = อัปเดตข้อมูลร้าน** (ชื่อ+โลโก้) ทุกแพลตฟอร์มผ่าน `/api/marketplace/accounts/resync` · แพลตฟอร์มไม่ส่งโลโก้มา → เด้งช่องใส่ URL ต่อทันที
- ⚠️ OAuth callback **ต้อง merge `metadata` ห้ามเขียนทับทั้งก้อน** — โลโก้ที่ตั้งเองจะหายทุกครั้งที่ re-authorize (เคยเกิดแล้ว)

### ยอดโอนจริง TikTok (settlement) — ใช้ `/finance/**202501**/orders/{id}/statement_transactions`
- **202309 คนละโครงและไม่มีสนามยอดเงินเลย** — เรียกผิดเวอร์ชันจะได้ ฿0 ทุกออเดอร์โดย API ตอบ `code 0` ไม่มี error ให้จับ
- ออเดอร์ที่ยังไม่ถึงรอบโอนก็ตอบ `code 0` + ค่า 0 ล้วนเหมือนกัน → **ห้ามบันทึกเป็นแถวยอด 0** (รายงานกำไรจะอ่านว่าขายแล้วไม่ได้เงิน) ให้นับเป็น pending รอบหน้าค่อยเก็บ
- ตรวจกับเงินจริงแล้ว: ขาย 720 → คอม 106.49 + ค่าส่ง 38 + อื่น ๆ 19.36 → **โอนจริง 477.15** ตรงกับที่ TikTok แจ้งในรอบจ่าย

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

### TikTok Product Import (เพิ่ม 2026-08-26)
- **ต้อง import ก่อนเปิดรับออเดอร์จริง** — ไม่มีสินค้าในระบบ ออเดอร์ที่เข้ามาจะสร้างสินค้าใหม่ตาม SKU ที่ได้รับจนคลังเละ
- หน้า [/tiktok/import](app/tiktok/import/page.tsx) (ปุ่มอยู่การ์ดร้านใน `/settings/sales-channels` แท็บ Marketplace) — **นำเข้าทั้งร้านรอบเดียว** ไม่ได้เลือกทีละตัว/แม็ป variation เองเหมือน Shopee (ตั้งใจ — ตัวที่ SKU ตรงจะผูกอัตโนมัติอยู่แล้ว)
- **ไม่มี batch detail** ต่างจาก Shopee — `GetProduct` ยิงทีละตัว คุม concurrency ด้วย `parallelLimit(..., 3)` · แบ่งหน้าด้วย **`page_token` ไม่ใช่ offset** (ข้ามไปหน้า N ตรงๆ ไม่ได้)
- endpoint ที่ใช้: `POST /product/202502/products/search` (เวอร์ชันล่าสุดของ search) + `GET /product/202309/products/{id}`
- ลำดับจับคู่เหมือน Shopee เป๊ะ: link เดิม → `products.code` (= seller_sku หรือ `TT-{product_id}`) → ปลุกของที่ soft-delete → สร้างใหม่ · **ของที่ user แก้เองไม่ถูกเขียนทับ** (`source` = `tiktok_edited`/`manual`)
- **ไม่ต้อง migration** — `products.source` ไม่มี CHECK และคอลัมน์ `platform_*`/`platform_data` ของ `marketplace_product_links` เป็น generic อยู่แล้ว
- **ยังไม่ทำ**: product-export (ส่งสินค้าขึ้น TikTok), push price/stock, deals — Shopee มีครบแล้ว TikTok ยังมีแค่ import

### helper กลางของทุก marketplace — [lib/marketplace/product-helpers.ts](lib/marketplace/product-helpers.ts) (เพิ่ม 2026-08-26)
`getOrCreateVariationTypeIds` · `upsertProductImage(s)` · `reactivateProduct` · `tryAutoMatchBySku` · `findMarketplaceLink` — เดิมอยู่ใน `lib/shopee/product-helpers.ts` ยกออกมาตอน TikTok ต้องใช้เหมือนกัน · **`platform` param default = `'shopee'`** ของเดิมจึงไม่เปลี่ยนพฤติกรรม และ shopee/product-helpers.ts re-export ต่อให้ call site เดิมใช้ได้เหมือนเดิม · **เพิ่ม marketplace ใหม่ → ใช้ตัวพวกนี้ ห้าม copy ไปไว้ใน `lib/<platform>/` ของตัวเอง**

### โควตา / rate limit ทุก marketplace — registry เดียวที่ [lib/marketplace/platforms.ts](lib/marketplace/platforms.ts) (แยก scope 2026-08-29)

- **circuit breaker แยกตาม scope** ไม่ใช่ต่อ platform ทั้งก้อน — scope = **กลุ่ม API ที่ใช้โควตาถังเดียวกัน**: `auth · order · fulfillment · product · inventory · promotion · chat` · flag ใน `app_flags` key `{platform}_quota_exhausted[:{scope}]` (key ไม่มี `:scope` = ทั้ง app, ของเดิมที่ live อยู่ยังใช้ได้)
- **เกณฑ์แบ่ง scope = platform ลงโทษเป็นก้อนไหน ไม่ใช่หน้าจอเราแบ่งยังไง** — (1) คนละ app_key = คนละถังเสมอ (แชท TikTok/Lazada เป็นคนละ app) (2) หลายเจ้าจำกัดราย API (`update_stock` เต็ม ไม่ได้แปลว่า `get_order_list` เต็ม)
- **client ทุก platform เขียนเหมือนกัน 2 บรรทัด** — `const scope = await beginMarketplaceCall('<platform>', apiPath)` ก่อน fetch (หน่วงจังหวะ + คืน scope) และ `reportMarketplaceError('<platform>', scope, errMsg, { httpStatus, code })` ตอนเจอ error · **ห้ามเรียก `markQuotaExhausted` ตรงๆ ในตัว client** และห้าม map path→scope เองนอก registry
- **cron/retry/manual sync ต้องเช็ค `isQuotaBlocked(platform, scope)` ก่อนยิงเสมอ พร้อมระบุ scope ให้ตรงงานตัวเอง** — เรียกเปล่าๆ จะเช็คแค่ระดับทั้ง app แล้วพลาดเคสที่ scope นั้นถูกบล็อก
- **มี breaker แล้วยังต้องมี throttle** ([lib/marketplace/throttle.ts](lib/marketplace/throttle.ts)) — breaker คือตาข่ายรับหลังโดนแบน ไม่ได้กันไม่ให้โดน · ค่าระยะห่างต่อ scope อยู่ใน registry (`minGapMs`) ปัจจุบันตั้งเฉพาะ Lazada (chat 350ms / อื่น 150ms) ที่เคยชนจริง · in-memory = best-effort ต่อ instance
- **ข้อความที่ผู้ใช้เห็นต้องตรงกับ scope ที่พักจริง** — `QUOTA_SCOPE_IMPACT` ที่เดียว (banner + กระดิ่ง อ่านจากนี่) · แชทพักแล้วขึ้นว่า "ออเดอร์เข้าช้า" = ส่งคนไปไล่หาปัญหาผิดที่
- **➕ เพิ่ม marketplace ใหม่**: เพิ่มชื่อใน `QUOTA_PLATFORMS` → TypeScript บังคับให้กรอก entry ใน `MARKETPLACE_PLATFORMS` → ครอบ request function 2 บรรทัด · จบ ไม่ต้องแตะ breaker/throttle/banner/กระดิ่ง/ปุ่มปลดใน superadmin เลย
- **ยังไม่ทำ**: breaker เป็นต่อ platform **ไม่ใช่ต่อร้าน** — ร้านเดียวชนลิมิต ร้านอื่นของ platform เดียวกันหยุดตาม (ต้องใส่ `shop_id` เข้า key + ส่ง shop ลงไปถึง request function)

### 💰 Settlement — เงินเข้าจริงจาก marketplace (เพิ่ม 2026-08-29 · Shopee ใช้ได้แล้ว)

ตอบว่า "ขายได้เท่าไหร่ โดนหักอะไรบ้าง เหลือเข้ากระเป๋าจริงเท่าไหร่ กำไรเท่าไหร่" — **ผลสำรวจฟิลด์จริงทั้ง 3 เจ้าอยู่ที่ [memo/settlement-analysis.md](memo/settlement-analysis.md) อ่านก่อนแตะเรื่องนี้เสมอ**

- **ช่องกลาง 13 ช่อง** ใน [lib/marketplace/fee-types.ts](lib/marketplace/fee-types.ts): `gross_sales · seller_discount · platform_discount · commission · payment_fee · service_fee · shipping_cost · affiliate · ads · campaign_fee · tax_withheld · adjustment` (+ `net_payout`) — **ทุกช่องเก็บเป็นบวกเสมอ** ทิศอยู่ที่ความหมายของช่อง ไม่ใช่เครื่องหมาย (แต่ละ platform ใช้ทิศไม่ตรงกัน)
- **เจอค่าธรรมเนียมชนิดใหม่ → หา bucket ที่ตรงที่สุด ห้ามเพิ่ม bucket ตามชื่อที่ platform เรียก** (สามเจ้ารวมกันมีเป็นร้อยชนิด จะได้รายงานร้อยคอลัมน์ที่เทียบข้าม platform ไม่ได้) · ชื่อจริงไม่หาย อยู่ใน `marketplace_settlement_lines` ทุกบรรทัด
- **ตาราง**: `marketplace_settlements` (1 แถว = 1 ออเดอร์ · query รายงานจากตัวนี้) + `marketplace_settlement_lines` (บรรทัดดิบตามที่ platform ส่งมา — ตัวที่ทำให้ Lazada ที่เป็น ledger รายบรรทัดลงได้) + `marketplace_account_charges` (ค่าใช้จ่ายที่ไม่ผูกออเดอร์ เช่น Sponsored Affiliates, ค่าโฆษณาที่กรอกเอง)
- **`gross_profit` เป็น null เมื่อไม่รู้ต้นทุน — ห้าม `coalesce(...,0)` ในรายงาน** ไม่งั้นออเดอร์ที่ไม่มีต้นทุนจะโชว์ margin 100% · `cogs_basis` บอกความน่าเชื่อ (`snapshot` = unit_cost ตอนขายครบ · `mixed`/`wac` = ใช้ WAC ปัจจุบันแทนบางส่วน/ทั้งหมด) · ปัจจุบัน Shopee รู้ต้นทุน 1,156 จาก 2,361 ออเดอร์
- ⚠️ **Shopee มีฟิลด์ชื่อ `cost_of_goods_sold` แต่หมายถึงราคาที่ลูกค้าจ่าย ไม่ใช่ต้นทุนผู้ขาย** (ยืนยันจากข้อมูลจริง = `order_original_price` ทุกแถว) — ต้นทุนจริงมาจาก `order_items.unit_cost` เท่านั้น
- ⚠️ **Lazada ส่งตัวเลขเป็น string ที่มีคอมมาคั่นหลัก** (`"3,490.00"` → `Number()` = NaN, เจอ 10/180 แถว และเป็นแถวยอดใหญ่ทั้งหมด) — **ใช้ `parseAmount()` จาก fee-types.ts เสมอ ห้าม `Number()` ตรงๆ กับตัวเลขจาก marketplace**
- **ออเดอร์ Shopee ใหม่สร้าง settlement เองอัตโนมัติ** — `fetchAndSaveEscrowDetail()` ใน [lib/shopee/sync.ts](lib/shopee/sync.ts) เรียก `normalizeShopeeEscrow()` + `saveSettlement()` ต่อท้าย (ล้มแยกจากกัน — escrow บันทึกแล้วถ้า mapping พังยัง backfill ทีหลังได้)
- **`buyer_paid`** = เงินที่ลูกค้าควักจ่ายจริง (nullable — Lazada/TikTok ไม่บอก **ห้ามเดาเป็น 0**) · ส่วนต่างจาก `gross_sales − seller_discount` คือเงินที่แพลตฟอร์มออกแทนลูกค้า → ตอบได้ว่า "สินค้าตัวนี้ขายได้เพราะของดี หรือเพราะแพลตฟอร์มแจกคูปอง"
- ⚠️ **ค่าคอมของ Shopee คิดจากราคาขายของเรา ไม่ใช่เงินที่ลูกค้าจ่าย** — ยืนยันจากข้อมูลจริง: คอม/ราคาขาย = 13.71% (sd 2.69 คงที่) · คอม/เงินลูกค้าจ่าย = 18.35% (sd 4.12 กระจาย) · แปลว่า Shopee แจกคูปองให้ลูกค้าแต่เก็บค่าคอมจากราคาเต็ม
- ⚠️ **ส่วนลดรายชิ้นของร้านไม่มีฟิลด์ของตัวเอง** — ซ่อนอยู่ในผลต่าง `order_original_price` (ราคาป้าย) กับ `original_cost_of_goods_sold` (ราคาขายจริง ซึ่งเป็นตัวตั้งต้นของสูตร escrow) · ใช้ราคาป้ายเป็นยอดขายเฉย ๆ = ยอดเกินจริง 8% และมีเงิน "หายไป" อธิบายไม่ได้ 1%
- **การแมป Shopee กระทบยอดลงศูนย์แล้ว** (2,363 ออเดอร์ ส่วนต่าง 0.00) — เทียบกับสูตร `escrow_amount` ที่เอกสาร Shopee เขียนไว้ · `final_product_protection` **ไม่อยู่ในสูตร** ห้ามนับเป็นค่าใช้จ่าย
- **2 เส้นทางเก็บข้อมูล**:
  - `POST /api/marketplace/settlements/backfill { platform:'shopee', limit, offset }` — **ไม่ยิง API เลย** แปลงจาก `orders.external_data.escrow_detail` ที่ดูดเก็บไว้แล้ว · **ต้องส่ง `offset` เลื่อนหน้าเอง** ไม่งั้นวนดึงชุดเดิม
  - `POST /api/marketplace/settlements/sync { platform:'shopee'|'lazada'|'tiktok'|'all', days }` · **`GET` = cron รายวัน** (เท่ากับ `all` + 30 วัน — job เดียวครอบทั้ง 3 เจ้า) — ยิง API จริง (เช็ค breaker scope `finance` ก่อนเสมอ) · **ควรตั้ง cron รายวัน** เพราะยอด settlement โผล่หลังออเดอร์จบหลายวัน ไม่ใช่ตอน sync ออเดอร์ · **shopee = ตามเก็บ escrow ของออเดอร์ที่จบแล้วแต่ยังไม่มียอด** (ทางกู้เมื่อพลาดรอบแรก — `/backfill` แปลงได้เฉพาะที่มี escrow อยู่แล้ว)
- ⚠️ **การดึง escrow ต้อง `await` ห้ามปล่อยลอย** — อยู่ในสายที่วิ่งใน `after()` ปล่อยลอยแล้วโดน freeze ทิ้ง เคยทำให้ 19/482 ออเดอร์ที่จบแล้วไม่มียอดเงินเลย (ดู [fix-bug.md](fix-bug.md) 2026-09-02)
- **Lazada**: ledger รายบรรทัดต่อ order item — `normalizeLazadaTransactions()` ประกอบเป็นออเดอร์เอง · แมปด้วย **`fee_type` (รหัสตัวเลข) ไม่ใช่ `fee_name`** · แถวที่ไม่มี `order_no` → `marketplace_account_charges`
- **TikTok**: ⚠️ **การแมปเขียนจากสเปค OAS ยังไม่เคยเจอข้อมูลจริง** — route คืน `unmapped_fields` มาให้ดูว่ามีค่าธรรมเนียมตัวไหนตกหล่น ต้องเช็คตอนดึงชุดแรก
- **ยังไม่ทำ**: รอบโอนเงิน/กระทบยอดธนาคาร · หน้ารายงาน UI · Shopee AMS (ค่าแอดที่ไม่ได้หักจาก escrow) · แยกทิศทาง `adjustment` (ตอนนี้เก็บค่าสัมบูรณ์ คืนเงินกับเงินชดเชยอยู่ถังเดียวกัน)

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
- **Shopee v2**: `api_doc_knowledge/Shopee/_INDEX.md` — refresh ได้ทุกเมื่อด้วย `node scripts/scrape-shopee-docs.mjs` (ดึงจาก JSON endpoint สาธารณะของ open.shopee.com — **ไม่ต้อง login/headless browser**; re-scrape ล่าสุด 2026-08-28: 444 APIs 29 หมวด รวมหมวดใหม่ BrandPortal)
- **Lazada**: `api_doc_knowledge/Lazada/_INDEX.md` — scrape ครบ 365 APIs จาก open.lazada.com (2026-08-28, headless Chrome — หน้า docs เป็น SPA ไม่ต้อง login) ยกเว้น 3 หมวดที่กางไม่ได้: LazCredit Risk / Content / Store Flash Sale · script อยู่ scratchpad session นั้น (เขียนใหม่ได้ง่าย: expand sidebar → เก็บ `a[href*=path=]` → เปิดทีละหน้า slice ตั้งแต่ "Latest update" ถึง "Please rate this article")
- **TikTok**: ใช้ skill **`tts-openapi-guide`** (จาก `npm i -g @tts-open-toolkit/cli` → `tts_open_toolkit skill add --agent cc`) — มี **OAS ฉบับเต็มเป็น JSON** ที่ `~/.claude/skills/tts-openapi-guide/references/oas/paths/*.json` อัปเดตได้ด้วย `tts_open_toolkit update` · สำเนา markdown เก่าใน api_doc_knowledge **ลบทิ้งแล้ว** (2026-08-28 — stale, เลข push code ผิด) · เรื่อง push code ยึดหน้า Partner Center เสมอ

### Scale & Queue Strategy

**ปัจจุบันยังไม่ใช้ queue — ใช้ "หยุดเองก่อนหมดเวลา แล้วบอกว่าค้างตรงไหน" แทน**

⚠️ **cron ที่ไล่งานจาก `last_sync_at` ต้องบันทึกความคืบหน้าเป็นช่วง ๆ ห้าม stamp ทีเดียวตอนจบ** — งานที่โตเกินเพดานเวลาจะโดนฆ่าก่อนถึงบรรทัด stamp แล้วรอบหน้าเริ่มที่เดิมแต่ช่วงยาวขึ้น = **วนตายตัวเอง** (Shopee ค้าง 21 ส.ค.–2 ก.ย. 2026 โดยไม่มีใครรู้เพราะ webhook ยังเข้า — ดู [fix-bug.md](fix-bug.md)) · ทางที่ใช้ได้มี 2 แบบ: **หั่นช่วง + stamp ทุกช่วงที่จบ** (`syncOrdersByTimeRange` ของ Shopee — รับ `deadlineAt`/`sliceSeconds`) หรือ **จำกัดช่วงย้อนหลังสูงสุด** (Lazada/TikTok เพดาน 24 ชม.)

งานยาว (import สินค้า, backfill, bulk accept) ทำแบบนี้ทุกตัว:
```ts
export const maxDuration = 300;        // เพดาน route
const TIME_BUDGET_MS = 210_000;        // งบเวลาจริง — หยุดเองก่อนโดนตัด
if (Date.now() - startedAt > TIME_BUDGET_MS) { result.next_offset = i; break; }
```
ผู้เรียกเห็น `next_offset` / `remaining_order_ids` แล้วยิงรอบต่อไป — **cursor อยู่ที่ผู้เรียก แทนที่จะอยู่ใน Redis**
ตัวอย่าง: [lib/lazada/product-sync.ts](lib/lazada/product-sync.ts) (788 สินค้า) · [settlements/backfill](app/api/marketplace/settlements/backfill/route.ts) (2,364 ออเดอร์ 8 รอบ) · [shopee/orders/bulk-ship](app/api/shopee/orders/bulk-ship/route.ts)

**⚠️ queue แก้ "ทำไม่ครบ" แต่ไม่แก้ "ทำแล้วไม่รู้ว่าทำแล้ว"** — ต่อให้มี queue ถ้า worker ตายหลังยิง
API แพลตฟอร์มสำเร็จแต่ก่อนเขียน DB ก็ยังได้สถานะผิดเหมือนเดิม · งานที่มีผลข้างเคียงข้างนอก
(กดรับออเดอร์ แพ็คพัสดุ ตัดสต็อก) **ต้องทำ idempotency ก่อนเสมอ ไม่ว่าจะมี queue หรือไม่**:
- เช็คสถานะฝั่งแพลตฟอร์มก่อนยิง — ถ้าเขารับไปแล้วให้ **ซ่อมสถานะเรา ไม่ใช่ยิงซ้ำ**
- บันทึกร่องรอย **ทันทีที่ผลข้างเคียงเกิด** ก่อนทำขั้นถัดไป (Lazada บันทึก `package_id` ก่อน ReadyToShip)
- ผลลัพธ์: จอปิด เน็ตหลุด ฟังก์ชันตาย → **กดซ้ำได้เสมอโดยไม่เกิดของซ้ำ**

**เมื่อไหร่ถึงค่อยเอา queue จริง** (ยังไม่ถึงสักข้อ):
- งานเดียวใช้เวลาเกิน 300s แม้แบ่งรอบแล้ว
- ต้องคุม concurrency/rate limit **ข้าม request** (ตอนนี้ throttle เป็น in-memory ต่อ instance — best-effort)
- ต้องการ retry + dead letter อัตโนมัติโดยไม่มีคนกด
- 10+ ร้าน หลาย marketplace ยิงพร้อมกันจนชนกันเอง

**ถ้าถึงจุดนั้น**: Upstash QStash (ง่ายกว่า ไม่ต้องดูแล Redis) หรือ BullMQ + Redis ·
Architecture เป้าหมาย: Webhook → save log → Queue → Worker (concurrency + rate limit ต่อ platform, retry + dead letter) ·
**จุดที่ต้องเปลี่ยนน้อยมาก** — webhook route เปลี่ยนจาก `after()` เป็นยิงเข้า queue และงาน bulk เปลี่ยนจากคืน cursor เป็น enqueue

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
- ⛔ **เปิดใช้จริงไม่ได้แล้วสำหรับ app แบบเรา** (คำตอบ ticket 2026-08-14): นโยบาย Shopee ตั้งแต่ 18 พ.ย. 2024 — **Chat API ให้เฉพาะ app ของ Individual/Registered Business Seller** · Third-party Partner Platform (ประเภทของ app AOO) ขอสิทธิ์ไม่ได้ (`set_app_push_config` code 10 → error_param "determined by your app type") — ดู open.shopee.com/announcements/1026 · ทางเดียวที่เหลือ: จด developer account ในนาม seller + app ของตัวเอง = ต้องรองรับ partner credentials ต่อบริษัท (ยังไม่ทำ) · script `scripts/enable-shopee-webchat-push.mjs` เก็บไว้เผื่อนโยบายเปลี่ยน
- media url จาก webhook อาจเป็น CDN file id เปล่า → `resolveShopeeCdnUrl()` แปลงเป็น URL เต็ม

### TikTok Chat — Customer Service API (เพิ่ม 2026-08-21)
- **แชท TikTok Shop เข้าหน้ารวม `/chat`** — platform ที่ 5 (table-per-platform pattern เดิม): `tiktok_contacts` (1 row = 1 conversation, buyer id เป็น **TEXT** — 19 หลักเกิน JS precision) + `tiktok_messages` + RPC + realtime + RLS มาตรฐาน
- **Ingest แบบ notify-then-pull เหมือน Lazada**: webhook `/api/tiktok/webhook` จับ chat push จาก**รูปร่าง payload** (`data.conversation_id`) ไม่ผูกเลข type code (NEW_MESSAGE/NEW_CONVERSATION ไม่มีเลขยืนยันใน docs) → sync จาก `/customer_service/202309/conversations` + `/messages` (idempotent, dedupe ด้วย message id) — [lib/services/chat/tiktok.ts](lib/services/chat/tiktok.ts) + wrappers ใน [lib/tiktok/chat.ts](lib/tiktok/chat.ts)
- **ส่งข้อความ**: text + รูป — **รูปต้อง upload เข้า `/customer_service/202309/images/upload` ก่อน** (TikTok ไม่รับ URL ภายนอก ต่างจาก Lazada; multipart **ห้าม sign body**) · ข้อความ `is_visible=false` จากระบบไม่เก็บ
- **chat_accounts platform 'tiktok'** = reference เหมือน shopee/lazada (`credentials: {marketplace_account_id, shop_id}`) — toggle ที่ `/settings/chat-channels#tiktok` (เปิดครั้งแรก backfill 10 conversations) · CHECK `chat_accounts_platform_check` เพิ่ม 'tiktok' แล้ว (migration `tiktok_chat_foundation`)
- **Dual-app + OAuth ขาแชทแยก (แก้ 2026-08-27)**: แชทใช้ app หมวด Customer Support คนละตัวกับ app ออเดอร์ (`TIKTOK_CHAT_APP_KEY/SECRET`) และ app แชทต้องเปิด target market Thailand ใน Partner Center เองด้วย · **callback ต่อขาแชทให้อัตโนมัติ (แก้ 2026-09-02 — เหมือน Lazada)** — จบขาออเดอร์แล้วพาไปหน้าอนุญาตแชทของ TikTok ต่อทันที ไม่มี ConfirmDialog ถามคั่น (ต่อเฉพาะเมื่อยังมีร้านที่ `chat_access_token` ว่าง) · ขาชวนดึงโลโก้จาก Login Kit ทำเฉพาะรอบที่**ไม่ได้**ต่อขาแชท ไม่งั้นผู้ใช้ต้องกดอนุญาต 3 หน้ารวด · ขาแชทเริ่มที่ `/api/tiktok/oauth/auth-url?app=chat` และ callback ขาแชทจบที่ `/settings/chat-channels?tiktok_chat=connected|failed|skipped#tiktok` · หน้าช่องทางแชท: ร้านที่ยังไม่มี token แชทแสดงปุ่ม "เชื่อมต่อแชท" แทน toggle (ธง `chat_connected` จาก `/api/shopee/accounts`) และ POST `/api/chat-accounts` ปฏิเสธ tiktok ที่ไม่มี `chat_access_token`
- **เปิดใช้จริง**: เชื่อมร้าน TikTok + เปิด scope Customer Service ของ app แชท + เปิด target market Thailand ทั้งสอง app + subscribe event **NEW_MESSAGE** ใน TikTok Partner Center > Webhooks

### Lazada Chat — IM API (เพิ่ม 2026-08-14 — Lazada integration แรกของระบบ)
- **Base layer ใหม่** [lib/lazada/api.ts](lib/lazada/api.ts): signing แบบ TOP (sort params → concat path+kv → HMAC-SHA256 **hex ตัวใหญ่**, timestamp เป็น **มิลลิวินาที**), OAuth `/auth/token/create|refresh` ที่ auth.lazada.com, `ensureValidToken(account, app)` + auto-deactivate — env: `LAZADA_APP_KEY`, `LAZADA_APP_SECRET` (สมัคร app ที่ open.lazada.com)
- **Dual-app รองรับแล้ว (2026-08-26)** — Lazada ให้สิทธิ์เป็น **category ต่อความสามารถ** (`Seller In-house APP` = ออเดอร์/สินค้า · `In-house IM Chat` = แชท) และ console สร้าง app ต่อ category → อาจได้ app key คนละชุด · ใส่ `LAZADA_CHAT_APP_KEY`/`LAZADA_CHAT_APP_SECRET` เมื่อได้ key ชุดที่สอง **ถ้าไม่ใส่ ทุกอย่าง fallback มาใช้คู่หลักเอง** (app เดียวถือทั้งสอง category ก็ทำงานได้ ไม่ต้องแก้ code) · token แชทเก็บใน `marketplace_accounts.chat_*` (คอลัมน์ร่วมกับ TikTok) · **ขาแชทต่ออัตโนมัติ (แก้ 2026-09-02)**: จบขาออเดอร์แล้ว callback **พาไปหน้าอนุญาตแชทของ Lazada ต่อทันที** ไม่มี dialog ถามคั่น — Lazada บังคับ authorize สองรอบอยู่แล้ว การถามเพิ่มไม่ได้ให้ทางเลือกที่มีความหมาย (กดยกเลิกที่หน้า Lazada ได้ผลเดียวกัน) · ยกเลิก = ไปจบที่หน้าช่องทางแชทพร้อมข้อความว่า **ร้านเชื่อมแล้ว** แค่ยังไม่เปิดแชท · ~~เดิม (2026-08-28) จบขาออเดอร์กลับ sales-channels พร้อม `chat=prompt`~~ (เฉพาะเมื่อตั้ง `LAZADA_CHAT_APP_*` แยกและยังมีร้านที่ `chat_access_token` ว่าง) → dialog ถามก่อน · ขาแชทเริ่มที่ `/api/lazada/oauth/auth-url?app=chat` จบที่ `/settings/chat-channels?lazada_chat=...#lazada` ซึ่งมีปุ่ม "เชื่อมต่อแชท" ต่อร้านด้วย (ธง `chat_connected` — ไม่ตั้ง chat app แยก = true เสมอเพราะ token หลักใช้แชทได้) · **ขาแชทล้มไม่ปิดร้าน** — `is_active=false` เกิดจากขาออเดอร์เท่านั้น · `verifyLazadaPushSignature()` ยอมรับลายเซ็นทั้งสอง app (order push + IM push ยิงมา webhook เดียวกัน)
- **OAuth**: `/api/lazada/oauth/auth-url` + `/callback` ใช้ signed state จาก [lib/oauth-state.ts](lib/oauth-state.ts) เหมือน Shopee/TikTok — account เก็บใน `marketplace_accounts` platform `'lazada'` (`shop_id` = seller_id) — เชื่อมที่ `/settings/sales-channels` แท็บ "เชื่อมต่อ Marketplace" (path เดิม `/settings/integrations` redirect มาที่นี่ — ย้ายรวมเมื่อ 2026-08-21)
- **Ingest แบบ notify-then-pull**: webhook `/api/lazada/webhook` (**ต้องตอบ 200 ใน 500ms** — ตอบทันที ทำทุกอย่างใน `after()` รวมถึง log) → payload IM ไม่มี spec แน่นอน → แค่ trigger `syncSession()`/`syncRecentSessions()` ใน [lib/services/chat/lazada.ts](lib/services/chat/lazada.ts) ดึงความจริงจาก `/im/session/*` + `/im/message/list` (idempotent, dedupe ด้วย message_id) — webhook signature: `Authorization` = HMAC(app_key + raw body)
- **Tables**: `lazada_contacts` (1 row = 1 session) + `lazada_messages` + RPC + realtime (pattern เดียวกับ shopee_)
- **ส่งข้อความ**: `/im/message/send` template_id 1=text 3=image (แนบ img_url ภายนอกได้) — direction จาก `from_account_type` (1=buyer, 2=seller)
- **Order sync Lazada ✅ (เพิ่ม 2026-08-22)** — [lib/lazada/sync.ts](lib/lazada/sync.ts) โครงเดียวกับ TikTok: webhook order push (message_type 0) → `syncSingleLazadaOrder()` (notify-then-pull จาก `/order/get` + `/order/items/get`) · cron `/api/lazada/sync-all` ทุก 15 นาที (CRON_SECRET, ไล่จาก `last_sync_at`, **ไม่ stamp เมื่อ collect ล้ม**) · manual `/api/lazada/sync` ต่อร้าน · **สถานะ Lazada เป็นราย item** — สถานะรวม = สถานะช้าสุดของชิ้นที่ไม่ถูกยกเลิก (`effectiveLazadaStatus`) · mapping: unpaid→new/pending, pending→ready_to_ship/paid, packed/ready_to_ship*→processing/paid, shipped/delivered→shipping/paid, confirmed→completed/paid, canceled/failed/returned→cancelled · เบอร์ลูกค้า Lazada mask เป็น `66****` — ห้ามใช้ match/บันทึก (เช็คใน `findOrCreateCustomer`) · cron ตั้งครบแล้วทั้ง `sync-all` (15 นาที) และ `webhook/retry` (5 นาที)
- **Product import Lazada ✅ (เพิ่ม 2026-08-28)** — [lib/lazada/product-sync.ts](lib/lazada/product-sync.ts) + [/api/lazada/products/import](app/api/lazada/products/import/route.ts) + หน้า [/lazada/import](app/lazada/import/page.tsx) (ปุ่มอยู่การ์ดร้านใน `/settings/sales-channels`) · **`/products/get` คืนทุกอย่างในคอลเดียว** (ชื่อ ไทย/อังกฤษ · description HTML · รูป product · ทุก SKU พร้อม `saleProp`/ราคา/สต็อก/รูปของตัวเอง) → ไม่ต้องยิง detail รายตัวแบบ TikTok · แบ่งหน้าด้วย offset (limit ≤50, **offset ตันที่ 10000**) · ลำดับจับคู่เหมือน Shopee/TikTok: link เดิม → `products.code` (= SellerSku ตัวแรก หรือ `LZ-{item_id}`) → ปลุกของที่ soft-delete → สร้างใหม่ · property ของหมวดหมู่ (มีเป็นสิบตัวและต่างกันทุกหมวด) เก็บทั้งก้อนใน `marketplace_product_links.platform_data.attributes` · **Lazada ไม่มีสนาม video ตายตัว** — เก็บที่ `platform_data.video_url` เมื่อเจอ (คลังสินค้าของเรายังไม่มีคอลัมน์วิดีโอ)
- **ตั้งโลโก้ร้านเองด้วย URL** — `PATCH /api/shopee/accounts { id, shop_logo }` (ทุก platform) validate https + โหลดได้จริงก่อนบันทึก · จำเป็นเพราะ `/seller/get` ของ Lazada **บางร้านไม่คืน `logo_url` เลย** ทั้งที่ Seller Center ตั้งรูปไว้แล้ว
- ⚠️ **token ที่ได้ตอน app ยังไม่ผ่านรีวิว อายุแค่ 1 วันทั้ง access และ refresh** (ของ app ที่ผ่านแล้ว = 7 วัน / refresh 30 วัน) — refresh ตายไปด้วยจึงต่ออายุเองไม่ได้ **พอ app ผ่านแล้วต้องกด "เชื่อมต่อแชทใหม่" เสมอ** · ธง `chat_connected` ดูวันหมดอายุของ refresh token ด้วยแล้ว (ดู [fix-bug.md](fix-bug.md) 2026-09-02)
- **เปิดใช้**: สร้าง app open.lazada.com → ใส่ env 2 ตัว → เชื่อมร้านที่ Integrations → เปิดแชทรายร้านที่ `/settings/chat-channels#lazada` (เปิดครั้งแรกจะ backfill 10 sessions ล่าสุดให้) → ตั้ง Callback URL `/api/lazada/webhook` ใน Lazada Console > Push Mechanism

---

## 🏬 PC Counter Sales (เพิ่ม 2026-07-26 — ครบทั้ง 3 Phase)

PC (พนักงานประจำจุดขายในห้าง) บันทึกยอดขายรายวันผ่านมือถือ — **overlay เท่านั้น ไม่ใช่ยอดขายจริงทางบัญชี**: ไม่สร้าง order ไม่ออกเอกสาร ไม่ตัดสต็อกจริง; DSR จาก report ห้างยังเป็นตัวจริง (ตัดสต็อก + INV/ST)

- **โครง**: `consignment_counters` (1 สาขา = 1 คลัง `warehouse_type:'consignment'`; สาขาแรก adopt คลังเดิมของลูกค้า) · `counter_assignments` (PC↔สาขา) · `counter_sales` (`report_id` null = ยังไม่เข้า DSR) · `counter_id` ใน replenishments/department_orders (ปลายทางเติมของ)
- **Role `pc`** + capabilities `counter.record` (pc+ADMIN) / `counter.manage` (ADMIN) · PC หนึ่งคน assign ได้หลายสาขา (many-to-many) · **หน่วยแทน** = `company_members.pc_all_counters` เข้าได้ทุกสาขาอัตโนมัติ — เช็คสิทธิ์ผ่าน [lib/counter-access.ts](lib/counter-access.ts) เสมอ (ห้าม query `counter_assignments` ตรงๆ) · **หน่วยแทนมี "สาขาประจำ" ควบได้** (2026-08-28): assignment ไม่ถูกลบตอนเปิดหน่วยแทน — GET `/api/counters` ติด flag `is_assigned` ให้ผู้เรียกที่เป็น pc และหน้า `/pc` เลือกสาขาประจำเป็น default (ไม่ใช่สาขาแรกในลิสต์)
- **สต็อกคงเหลือฝั่ง PC** = คลังสาขา − counter_sales ที่ `report_id IS NULL` (`/api/pos/products?counter_id=` ก็หักให้)
- **ห้าม query คลัง consignment ด้วย `.single()`** — ลูกค้ามีได้หลายคลังแล้ว ใช้ [lib/consignment-warehouse.ts](lib/consignment-warehouse.ts) (`getCustomerConsignmentWarehouse` = oldest, `getConsignmentDestinationWarehouse` = counter-aware) เสมอ
- **หน้า**: `/pc` (PC mobile — ห่อ `PosSaleScreen` ด้วย `enablePromotions=false`) · `/counter-sales` (admin dashboard realtime) · จัดการสาขา + assign PC + toggle หน่วยแทน อยู่ใน**หน้าลูกค้าฝากขายแต่ละราย** ([components/customers/CustomerCounters.tsx](components/customers/CustomerCounters.tsx) การ์ดใน `/customers/[id]`) — หน้า `/settings/counters` เดิมถูกยุบแล้ว (2026-08-28)
- **สิ้นเดือน (DSR)**: DSR ผูก `counter_id` → confirm ตัดสต็อกคลังสาขา + stamp `report_id` ลง counter_sales (void ย้อนทั้งคู่) · ฟอร์ม DSR มีปุ่ม "ดึงยอดจาก PC" (prefill จำนวน — ราคา resolve ผ่าน GP เสมอ เพราะยอด PC เป็นเงินหน้าร้าน) + ตาราง diff PC vs report ห้าง
- **ใบวางบิลรวมทุกสาขา**: `createOrAttachStatementForDeptReport()` ใน statement-service — DSR ทุกสาขาของ customer+period เดียวกันแชร์ ST ใบเดียว; จ่าย/ย้อน/void จัดการทั้งชุดใน `/api/department-store/reports/[id]` — **ห้ามเรียก `createStatementForReport` ตรงๆ สำหรับ DSR อีก**

## 🚚 Delivery Zones + Slots (เพิ่ม 2026-08-17 — ฐานของ storefront checkout)

จุดส่ง/โซนค่าส่ง + ช่วงเวลาส่ง สำหรับธุรกิจ delivery (aDay Fresh) — feature flags `delivery_zone` (**อิสระ** — ร้าน e-commerce ที่เปิดบิลเองก็ใช้คิดค่าส่งตามพื้นที่ได้ · ไม่แตะออเดอร์ marketplace ที่มีค่าส่งมาแล้ว) + `delivery_slot` (**ต้องเปิด `delivery_date` ก่อน** — UI ล็อก + API clamp)

- **Tables**: `delivery_zones` (พื้นที่ provinces/districts/postcodes + `fee_type: fixed|lalamove` + `fee`/`free_over`/`lead_minutes` + `sort_order` = ลำดับจับคู่) · `delivery_slots` (`start_time`-`end_time` เป็น**ช่วง 2-3 ชม. ห้ามเวลาเป๊ะ** + `days_of_week` + `capacity` + `cutoff_minutes`) · `delivery_zone_slots` (โซนไหนใช้รอบไหน — **ไม่มี row ของ zone = ใช้ได้ทุกรอบ**)
- **Logic กลาง** [lib/delivery.ts](lib/delivery.ts) (client-safe, pure): `resolveZone()` — ไล่ตาม sort_order ตัวแรกที่ match ชนะ เช็ค postcode → district → province; ไม่ match = **ไม่รับส่ง ต้องบอกชัด ห้ามเงียบ** · `resolveDeliveryFee()` — fixed คืน fee (0 เมื่อยอด ≥ free_over), lalamove คืน `needsQuote: true` (กรอกยอด quote เอง — API integration ยังไม่ทำ) · `getSlotAvailability()` — **เวลาคุมที่ `delivery_zones.lead_minutes` ที่เดียว** (= เวลาเตรียม+จัดส่งถึงโซนนั้น นับจากตอนกดสั่ง) · เกณฑ์คือ **"ส่งทันภายในรอบไหม" ไม่ใช่ "ทันก่อนรอบเริ่มไหม"**: `now + lead < slot END` — เช่น กทม. lead 2 ชม. สั่ง 08:00 รอบ 09:00-12:00 → ของถึง 10:00 ยังอยู่ในรอบ = เลือกได้ · lead หน่วยนาทีจึงคุมข้ามวันได้ในค่าเดียว (ต่างจังหวัด 1440 → รอบวันนี้ตกหมดเอง) · **`slots.cutoff_minutes` เลิกใช้แล้ว** (default 0, ไม่มีใน UI) — ห้ามเอากลับมาเป็นเกณฑ์เวลาที่สอง / day / capacity / zone×slot;
- **`getSlotWindow()` — แสดง/บันทึกช่วงที่ส่งได้จริง ไม่ใช่ช่วงเต็มของรอบ**: สั่ง 08:00 lead 2 ชม. รอบ 09:00-12:00 → แสดง **10:00-12:00** (ปัดขึ้นครึ่งชั่วโมงเสมอ ไม่สัญญาเร็วกว่าที่ทำได้) · `orders.delivery_slot_label/start` snapshot ค่านี้ = คำสัญญาที่ลูกค้าเห็นตอนกดสั่ง **ช่วงที่เลือกไม่ได้แสดงจาง + บอกเหตุผล ห้ามซ่อน**
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

**ตะกร้า + checkout** (เพิ่ม 2026-08-18)
- **ตะกร้าอยู่ใน localStorage ของโดเมนที่ผู้ใช้ยืนอยู่** ([lib/storefront-cart.ts](lib/storefront-cart.ts)) — **ห้ามย้ายไป cookie ของโดเมน aoo** เพราะตอนฝังใน WordPress ลูกค้าจะกลายเป็น third-party cookie → Safari ITP บล็อก → ตะกร้าหาย (เหตุผลเดียวกับที่ไม่เลือก iframe) · ยังไม่แตะ DB จนกดยืนยัน
- **`/api/storefront/checkout` = public write path — ถือว่าทุก field เป็นของปลอม**: company มาจาก shop slug ไม่ใช่ body · **อ่านราคา/ชื่อใหม่จาก DB ทั้งหมด ไม่เชื่อตัวเลขจาก client** · variation ต้อง active + storefront_visible + เป็นของ company นี้ · ค่าส่งคำนวณใหม่จาก zone · เช็ค slot availability ซ้ำฝั่ง server (อาจเต็มระหว่างลูกค้ากรอกฟอร์ม → 409) · rate limit ต่อ IP · items insert fail = rollback order ทิ้ง
- `/api/storefront/delivery-options` — resolve โซน+ค่าส่ง+รอบที่ว่างจากที่อยู่ (ใช้ตอนกรอก checkout)
- ออเดอร์ลงเป็น `source='storefront'`, `flow_type='r_retail'`, status `new`/`pending` → เด้งไป `/bills/[id]` ที่มีอยู่แล้วเป็นหน้าชำระเงิน/ติดตาม

**ไฟล์**: [/store/[slug]](app/store/[slug]/page.tsx) catalog + ItemList LD · [/p/[product]](app/store/[slug]/p/[product]/page.tsx) Product+Offer+BreadcrumbList LD · [/delivery](app/store/[slug]/delivery/page.tsx) **generate จาก `delivery_zones`/`delivery_slots` จริง** + FAQPage LD (หน้าที่ AEO อ้างมากสุด) · `sitemap.xml` / `robots.txt` (toggle AI crawler ต่อร้าน) / `llms.txt` · [/settings/storefront](app/settings/storefront/page.tsx)

## 📱 PWA + Push Notifications (เพิ่ม 2026-08-23 — pattern กลาง: `aoo-techstack/pwa-push/PWA-PUSH.md`)

เว็บติดตั้งเป็นแอพได้ (Add to Home Screen) + แจ้งเตือนแชทใหม่/ออเดอร์ใหม่ถึงมือถือแม้ปิดจอ — repo เดียวกับเว็บ deploy เดียวกัน

- **2 แอปแยกกัน (เพิ่ม 2026-09-02)** — ติดตั้งเป็นคนละไอคอน **และแจ้งเตือนแยกสายกันจริง**:
  | | แอปของร้าน | แอปผู้ดูแลระบบ |
  |---|---|---|
  | manifest | [app/manifest.ts](app/manifest.ts) → `/manifest.webmanifest` | [app/superadmin/manifest.webmanifest/route.ts](app/superadmin/manifest.webmanifest/route.ts) |
  | เปิดที่ (`start_url`) | `/dashboard` | `/superadmin` |
  | ไอคอน / ธีม | **โลโก้ขาวบนพื้นแดง `#F4511E`** | โลโก้แดงบนพื้น slate เข้ม (`admin-*.png`) · `#0f172a` |
  | manifest `scope` | `/` | `/` — **ห้ามจำกัดเป็น `/superadmin`** (ดูด้านล่าง) |
  | SW scope (แยกสายแจ้งเตือน) | `/` | `/superadmin/` |
  | ได้รับแจ้งเตือน | แชท · ออเดอร์ใหม่ · เรื่องที่ร้านแก้เอง | เรื่องระดับระบบจาก watchdog |
  - **กลไกที่ทำให้แยกได้**: ไฟล์ `/sw.js` ตัวเดียวกัน แต่ `register()` คนละ `scope` → เบราว์เซอร์นับเป็นคนละ registration → `pushManager.subscribe()` ได้คนละ endpoint · คอลัมน์ `push_subscriptions.audience` (`app`/`superadmin`) บอกว่าแถวนั้นเป็นของแอปไหน · `sendPushToUsers(ids, payload, { audience })` เลือกสายตอนส่ง
  - **1 เครื่องเปิดได้ทั้งสองสาย** ต้องกดเปิดแยกกัน 2 ครั้ง (สวิตช์ในกระดิ่ง = สาย `app` · สวิตช์มุมขวาบนของ shell superadmin = สาย `superadmin`)
  - ⚠️ **`scope` ของ manifest ต้องเป็น `/` ทั้งสองแอป** — ของเดิมจำกัดแอปแอดมินไว้ที่ `/superadmin` เพื่อกันเดินหลง แต่พอ session หมดอายุ ตัวกันสิทธิ์พาไป `/login` ซึ่งอยู่นอก scope → **iOS เตะออกไปเปิดใน Safari** ซึ่งล็อกอินเป็นผู้ใช้ปกติอยู่แล้ว เลยไปโผล่หน้า "เลือกบริษัท" แล้ววนแบบนี้ตลอด (แอปที่ติดตั้งบน iOS มีถังคุกกี้ของตัวเอง แยกจาก Safari และแยกจากกันเอง — **การล็อกอินต้องเกิดในแอปเดียวกันเท่านั้น**) · scope ของ manifest **คนละเรื่องกับ scope ของ service worker** ตัวหลังต่างหากที่แยกสายแจ้งเตือน
  - **ทางที่พาออกนอกแอปได้ต้องพก `?redirect=` กลับเสมอ** — `useSuperAdminGuard` + auth-context อ่านค่านี้แล้วพากลับที่เดิม ไม่งั้นล็อกอินเสร็จไปจบที่ `/onboarding` ทุกครั้ง
  - **เลขบนไอคอนแอปต้องเรียก Badging API เอง** — iOS/Android ไม่ได้แปะจำนวนแจ้งเตือนให้ PWA อัตโนมัติ · `sw.js` นับใน Cache API แล้ว `setAppBadge()` ตอน push เข้า · `clearAppBadge()` ใน [components/PwaRegister.tsx](components/PwaRegister.tsx) ตอนหน้าจอกลับมาเห็น (ค้างเลขไว้ = คนเลิกเชื่อ)
  - **safe area ของจอขอบโค้ง**: root layout ตั้ง `viewportFit: 'cover'` → **ทุกอย่างที่ fixed/sticky ติดขอบจอต้องเผื่อระยะเอง** ด้วยคลาส `.pt-safe* / .pb-safe* / .px-safe* / .top-safe-2 / .left-safe-3` ใน globals.css · ⚠️ `.px-safe` **แทนที่** padding ซ้ายขวาไม่ใช่บวกเพิ่ม — กล่องที่มี `p-4` อยู่แล้วให้ใช้ `.px-safe-4` · shell ของ superadmin ตั้ง status bar เป็น `black-translucent` (เนื้อหาไหลไปใต้นาฬิกา) จึงต้องเผื่อครบทั้ง header · ปุ่มเมนู · sidebar · ท้ายหน้า
  - **session บน iOS หลุดเพราะ Safari บีบอายุคุกกี้ที่ JS เขียนเหลือ 7 วัน** — `/api/auth/persist-session` ให้เซิร์ฟเวอร์เขียนคุกกี้ชุดเดิมทับด้วยอายุ 400 วัน (คุกกี้จาก `Set-Cookie` ไม่โดนเพดานนั้น) · [lib/auth/session-manager.ts](lib/auth/session-manager.ts) ยิงตามหลังทุก `SIGNED_IN`/`TOKEN_REFRESHED` เพื่อให้คนเขียนคนสุดท้ายเป็นเซิร์ฟเวอร์เสมอ
  - **สาย `superadmin` ขอได้เฉพาะ superadmin จริง** — `/api/push/subscribe` เช็ค `is_super_admin` ก่อนบันทึก
  - ⚠️ **แยกแอปไม่ใช่การกันสิทธิ์** — คนทั่วไปเข้า `/superadmin` ไม่ได้อยู่แล้วจาก `useSuperAdminGuard` + `checkSuperAdmin` (และไม่มีเมนูใน Sidebar) · manifest เป็นแค่ทางลัด
- **ชิ้นส่วน**: [app/manifest.ts](app/manifest.ts) (Next serve `/manifest.webmanifest` เอง) · [public/sw.js](public/sw.js) (**push-only — ห้ามเพิ่ม offline caching** stale cache กับ Next = บั๊กยาก) · [lib/push/client.ts](lib/push/client.ts) (browser: register SW + state `unsupported/ios-needs-install/denied/subscribed/unsubscribed`) · [lib/push/send.ts](lib/push/send.ts) (server: `sendPushToCompany` / `sendChatPush` / `sendNewOrderPushById` — **ไม่ throw เด็ดขาด** อยู่ใน webhook flow, endpoint ตาย 404/410 ลบ row อัตโนมัติ) · `/api/push/subscribe` (POST/DELETE) + `/api/push/test` · toggle ต่อ device ใน dropdown กระดิ่ง Header ([components/ui/PushNotificationToggle.tsx](components/ui/PushNotificationToggle.tsx)) · icon gen ด้วย [scripts/generate-pwa-icons.mjs](scripts/generate-pwa-icons.mjs)
- **Table**: `push_subscriptions` (unique `endpoint`, upsert ทับ = device ตาม company ล่าสุดที่เปิด, RLS มาตรฐาน) + `audience` (`app`/`superadmin`) แยกสายแจ้งเตือน
- **จุดยิง push ปัจจุบัน**: แชทขาเข้า 4 platform (line/facebook/shopee/lazada — หลัง insert message สำเร็จใน `lib/services/chat/*`) + ออเดอร์ใหม่ (shopee/tiktok/lazada `createNewOrder` + storefront checkout — ผ่าน `sendNewOrderPushById`)
- **หลายบริษัท: ยิงตาม "คน" ไม่ใช่ตาม `push_subscriptions.company_id`** — คอลัมน์นั้นเป็นแค่ *ร้านล่าสุดที่เครื่องนี้เปิดค้างไว้* (upsert ทับด้วย endpoint) ไม่ใช่สิทธิ์การรับแจ้งเตือน · `sendPushToCompany()` หาผู้รับจาก `company_members` ที่ยัง active → คนดูแลหลายร้านได้ครบทุกร้านโดยไม่ต้องกดสลับ · เคยกรองด้วย `company_id` แล้ว **บางบริษัทไม่มีเครื่องรับเลยสักเครื่อง** (ดู [fix-bug.md](fix-bug.md) 2026-09-04)
- **แจ้งเตือนต้องบอกว่าร้านไหน + กดแล้วพาไปร้านนั้น** — ชื่อบริษัทนำหน้า body เฉพาะคนที่อยู่หลายบริษัท · url ต่อ `?company=<id>` (`withCompanyParam`) แล้ว [lib/company-context.tsx](lib/company-context.tsx) สลับให้ตอน provider เริ่มทำงาน **โดยไม่ reload** (`switchCompany()` สั่ง reload จะหลุดจากหน้าปลายทาง) · **เพิ่มจุดยิง push ใหม่ต้องผ่าน `sendPushToCompany()` เสมอ** จะได้ของพวกนี้ครบเอง
- **Freshness guard บังคับ**: แชทเก่า >10 นาที / ออเดอร์เก่า >30 นาที (ใช้เวลาจริงของ platform) **ไม่ยิง** — กัน initial sync/backfill/webhook retry ถล่มแจ้งเตือนทุกเครื่อง · เพิ่ม event ใหม่ต้องคิดเรื่องนี้เสมอ
- **tag ต่อ conversation/order** — แจ้งเตือน tag เดียวกันแทนที่กัน กัน spam
- **Env 3 ตัว** (มีใน .env.local แล้ว — **ต้องเพิ่มบน Vercel ตอน deploy**): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **iOS**: push ได้เฉพาะ installed PWA (iOS 16.4+) — client.ts คืน state `ios-needs-install` ให้ UI สอนวิธี Add to Home Screen
- **ชวนติดตั้งแอป (เพิ่ม 2026-09-04)** — หน้า [/install](app/install/install-client.tsx) เป็น **public** (อยู่ใน `PUBLIC_PREFIXES` + `PUBLIC_ROUTES` ทั้งสองที่) ส่งลิงก์ให้พนักงานเปิดก่อน login ได้ · จับอุปกรณ์เองแล้วเปิดแท็บ iPhone/Android/คอม พร้อมขั้นตอน · **Android/Chrome กดติดตั้งทีเดียว** ผ่าน `beforeinstallprompt` ซึ่ง **ต้องดักไว้ใน inline script ของ [app/layout.tsx](app/layout.tsx) ก่อน React hydrate** (Chrome ยิงครั้งเดียวและเร็วมาก — ไว้ที่ `window.__aooBip` แล้ว [lib/pwa-install.ts](lib/pwa-install.ts) มารับช่วง) · เตือนเมื่อเปิดใน LINE/Facebook (ติดตั้งจากในนั้นไม่ได้) · แถบชวน [components/InstallAppBanner.tsx](components/InstallAppBanner.tsx) ใต้หัวเว็บเฉพาะ **<1024px + ไม่ใช่ standalone + ไม่ได้ปิดใน 14 วัน** ยกเว้น `/install` `/pos` `/pc` · **หน้าที่ต้องสูงเต็มพื้นที่ที่เหลือ (หน้าแชท) ห้ามคิดจาก `100dvh - <หัวเว็บ>`** — ใช้ `<Layout noPadding>` ที่ให้กล่องเนื้อหาเป็น `h-full` แล้วกล่องข้างในสูง `100%` (หัวเว็บจริง 65px ไม่ใช่ 64 · แถบชวนติดตั้งแทรกได้ · ผิด 1px ก็ทำให้ `main` เลื่อนแล้ว rubber band ดู [fix-bug.md](fix-bug.md) 2026-09-04) · แถบนี้ยังตั้ง `--app-banner-h` ไว้ให้หน้าเก่าที่ยังใช้ `calc(100vh-64px)` (fb-chat, line-chat) หักออก · `isStandalone()`/`detectPlatform()`/`getInAppBrowserName()` อยู่ที่ `lib/pwa-install.ts` ที่เดียว (`lib/push/client.ts` re-export) **ห้ามเขียน UA sniff ซ้ำ**
- proxy.ts matcher ยกเว้นไฟล์มีนามสกุลอยู่แล้ว → `/sw.js`, `/manifest.webmanifest`, `/icons/*` เป็น public โดยไม่ต้องแก้

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
- **หน้าคำเชิญพนักงาน `/invite/[token]` มีทางเข้าเดียว = Google** — ห้ามเพิ่มปุ่มล็อกอินทางอื่นหรือลิงก์ไป `/login` `/register` ในหน้านี้ ถ้าทางนั้นไม่ได้พา `invite_token` ไปด้วย (คนกดแล้วจะไปโผล่หน้า "สร้างบริษัทใหม่") · LINE Login เหลือใช้เฉพาะหน้าร้านฝั่งลูกค้า
- **อะไรที่ต้องรอดข้าม OAuth round trip ห้ามฝากไว้กับ cookie อย่างเดียว** — ใส่ใน `state` หรือ query ของ redirect (เบราว์เซอร์ในแอป LINE/FB สลับ context ได้ ทำ cookie หาย ดู fix-bug.md 2026-09-02)
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
  - **ที่อยู่บริษัท = textarea เดียวใน `companies.address`** (2026-08-28) — เอกสาร/PDF พิมพ์เฉพาะ `companies.address` (`buildCompanyStack`) · ค่าเก่าที่เคยแยก district/amphoe/province/postal_code ใน `companies.settings` ถูก merge เข้า textarea ตอนโหลด + เคลียร์ทิ้งตอนบันทึก — **ห้ามกลับไปเก็บที่อยู่บริษัทแบบแยก field ใน settings อีก**
  - **ข้อมูลภาษีแบ่งตามรูปแบบจดทะเบียน** (picker บุคคลธรรมดา/บจก./หจก. อยู่ในการ์ดข้อมูลภาษี) — บุคคล = เลขบัตรประชาชน, นิติบุคคล = เลขผู้เสียภาษี+สาขา+ชื่อจดทะเบียน · **ช่อง "สาขา" โชว์เฉพาะเมื่อเปิด VAT** (สาขาเป็นแนวคิด ภ.พ.20) ปิด VAT แล้วบันทึก = เคลียร์ค่า · เลข tax id ไม่ gate ด้วย VAT (ร้านไม่จด VAT ก็ต้องใช้บนใบเสร็จ/หัก ณ ที่จ่าย)
  - **บันทึกครั้งแรกแบบเปิด VAT → API PUT `/api/companies` seed สาขา VAT "สำนักงานใหญ่" code `00000` ให้อัตโนมัติ** (idempotent, address null = ใช้ที่อยู่บริษัท) — POS terminal picker จึงไม่มีทางว่าง
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
