# CLAUDE.md — Project Instructions & Knowledge Base

## Project Overview

ระบบ E-Commerce สำหรับร้านขายของออนไลน์หลายช่องทาง (Shopee, LINE, Facebook, Instagram, เปิดบิลตรง, POS)
- **Stack**: Next.js 16 (App Router, Turbopack) + Supabase + Tailwind CSS + pdfMake
- **Multi-tenant**: ทุก query ต้อง filter `company_id` (ชั้น UX) + **RLS บังคับจริงที่ DB แล้ว** (2026-07-24 — policy มาตรฐาน `is_company_member(company_id) or is_super_admin()` ทั้ง 62 ตาราง ตาม `aoo-techstack/multi-tenant/MULTI-TENANT.md`; API routes ใช้ service role จึง bypass — ห้ามลืม filter ใน code)
- **เขียน RLS policy ใหม่ต้องครอบ `auth.uid()`/`auth.jwt()` ด้วย `(select …)` เสมอ** (2026-09-08) — ไม่ครอบ = ฐานข้อมูลแกะ JWT ใหม่ทุกแถว วัดจริงช้ากว่า **73 เท่า** (131.7ms → 1.8ms บนตาราง 5,939 แถว) · ทางที่ดีกว่าคือเรียกผ่าน `is_company_member(company_id)` ที่ครอบถูกให้แล้ว · แก้ policy เก่าครบ 35 ใบแล้ว (migration `20260908_rls_initplan_wrap_auth_calls`) — **ห้ามพิมพ์กฎใหม่ด้วยมือ** ให้สร้างคำสั่งจาก `pg_policies` แล้วตรวจย้อนกลับว่าเปลี่ยนเฉพาะการครอบ
- **Language**: UI ภาษาไทย, code/comments ภาษาอังกฤษได้
- **Files**: `todo.md` = งานที่ยังไม่ได้ทำ
- **Deploy**: Vercel function region = `sin1` ใน [vercel.json](vercel.json) ให้อยู่ที่เดียวกับ Supabase (`ap-southeast-1`) — **ห้ามลบ** · ไม่ตั้ง = function รันที่ iad1 (อเมริกา) ทุก query เสีย ~220ms (เจอ 2026-09-05 หน้าแชทช้า 1.5–2 วิทั้งที่ query 3–20ms — ดู `aoo-techstack/BUGS.md` §Deploy)

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

## 🚫 Git Workflow — **ห้าม `git push` จนกว่าจะได้รับคำสั่ง · push ได้เฉพาะ commit ของ session ตัวเอง**

- **Commit ได้** เมื่องานเสร็จ (ตามคำสั่งหรือสมเหตุสมผล)
- **ห้าม `git push`** จนกว่า user จะบอกเองชัดๆ ("push เลย", "push ขึ้นไป", "deploy")
- **ก่อน push ทุกครั้งต้องถามและได้รับคำยินยอมจาก user ของรอบนั้นก่อนเสมอ** (เพิ่ม 2026-09-08) — แสดงรายการ commit ที่จะขึ้น (`git log --oneline origin/main..HEAD`) แล้วรอคำตอบ "push ได้" · คำสั่ง push ครั้งก่อนไม่ครอบรอบถัดไป · "ทำต่อ / โอเค / ลุยเลย" ไม่ใช่การอนุมัติ push
- **push ได้เฉพาะ commit ของ session ตัวเอง** — user เปิดหลาย Claude session ใน repo เดียวกันพร้อมกัน จำ hash ของ commit ที่ตัวเองทำไว้ตลอด session · ก่อน push เช็ค `git log origin/main..HEAD` ถ้ามี commit ที่ session นี้ไม่ได้ทำ → **ห้าม push** บอก user ว่ามี commit ของ session อื่นค้างอยู่ (hash + ชื่อ) แล้วให้ user ตัดสินใจ · `git push` ขึ้นทั้ง branch แยกเฉพาะ commit ของเราไม่ได้ ถ้า commit ของคนอื่นอยู่ก่อนหน้าของเรา ต้องรอเขา push เอง หรือ user สั่งชัดว่า "เอาขึ้นทั้งหมด"
- **commit ด้วย pathspec ของไฟล์ที่แก้เสมอ** (`git commit -m "..." -- <files>`) ห้าม `git add -A` / `git commit -a` — ไม่งั้นไฟล์ที่ session อื่นแก้ค้างอยู่จะถูกกวาดเข้า commit ของเรา (เกิดแล้ว 7 ก.ย. 2026: งาน 10 ไฟล์ไปโผล่ใน commit ชื่อ "ช่องทาง Chat › LINE")
- ถ้าทำงานหลายรอบ → commit สะสมไว้ใน local จนกว่า user จะอนุมัติ push
- เหตุผล: user ต้องการ review/ทดสอบ local ก่อนขึ้น production
- เวลาแจ้งงานเสร็จ บอกแค่ "commit แล้ว" หรือระบุ hash — อย่าเสนอ push เอง

## 🐛 Fix Bug Log — **บังคับอ่านก่อนแก้ bug ทุกครั้ง!**

**ไฟล์**: [fix-bug.md](fix-bug.md) — log bug ที่แก้ไปแล้วทั้งหมด (root cause + วิธีแก้ + ป้องกัน regression)

**กฎ**:
1. ก่อนแก้ bug ใหม่ → **อ่าน `fix-bug.md` ก่อน** เพื่อเช็คว่าเคยเจอ/แก้คล้ายกันมั้ย — จะได้ไม่ผิดซ้ำ
2. หลังแก้ bug เสร็จ → **เพิ่ม entry ใหม่ที่ด้านบนสุด** ของ `fix-bug.md` (รูปแบบตามที่กำหนดในไฟล์)
3. ถ้า bug ที่แก้เกี่ยวข้องกับ entry เก่า → update entry เดิม + เพิ่มหมายเหตุว่า regression
4. **จดบันทึกห้ามทิ้ง diff ค้างไว้ในไฟล์ที่ git track** (เพิ่ม 2026-09-08) — `fix-bug.md` · `CLAUDE.md` · `.claude/rules/*` เป็นไฟล์ที่ track อยู่ ถ้ารอบนั้น **ยังไม่ถึงจังหวะ commit** (เจ้าของยังไม่อนุมัติ / กำลังมี session อื่นทำงานอยู่) ให้พัก entry ไว้ที่ [memo/bugs.md](memo/bugs.md) (git ไม่แตะ) โดย**ติดป้าย `⏳ รอย้ายไป fix-bug.md`** ทั้งใน Index และหัวข้อ แล้ว**ครั้งหน้าที่มีเหตุต้องแตะ `fix-bug.md` อยู่แล้วให้ย้ายก้อนนั้นไปวางบนสุดแล้วลบออกจาก memo/** · เหตุผล: ไฟล์ที่ track แล้วค้างไว้เคยถูก session อื่น `git add` กวาดเข้า commit ของเขา 2 รอบใน 1 วัน (7 ก.ย. 2026)
5. **บันทึกอื่นของ session ลง `memo/` เสมอ** (git ไม่ sync) — bug/trap ของเครื่องหรือเวิร์กโฟลว์ → `memo/bugs.md` · เทคนิคใหม่ → `memo/learning.md` · ไอเดีย/ผลสำรวจที่ยังไม่ทำ → `memo/ideas.md` · งานค้าง → `todo.md` หรือ `memo/devplan.md` — **ห้ามแก้ `CLAUDE.md` เองเพื่อจดบันทึก** ถ้าไม่ได้ถูกสั่งตรง ๆ

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
| `ProductImageThumb` | square product thumbnail (xs/sm/md/lg) — hover magnifying-glass overlay + click → `ImageLightbox` (internal state) + `fallbackIcon`. **ใช้แทน inline `<img>` + setLightboxSrc ทุกครั้ง** — เลิก duplicate ESC + lightbox div · **รูปจิ๋วโหลดผ่าน `thumbUrl()` ให้เอง** (lightbox ยังเปิดรูปเต็ม — ส่ง `src` เป็นรูปเต็มเสมอ) |
| `ListRow` | horizontal list row card สำหรับ sortable settings lists — slots: `icon` + `title` + `subtitle?` + `reorder?` + `actions?` + `inactive?`. **ใช้แทน inline `<Card padding="none"><div flex gap-3 p-4>...</div></Card>`** (payment-channels, pos-terminals) |
| `ReorderArrows` | vertical up/down arrow column สำหรับ manual sort — `onMoveUp`/`onMoveDown` + `disableUp?`/`disableDown?`/`disabled?`. ใช้ภายใน `ListRow` หรือ standalone |
| `PlatformIcon` | social icon — `id='line\|facebook\|instagram\|tiktok\|shopee\|lazada'` + size? + title? (จาก `/public/social/*.svg`) — ใช้ตอนแสดง chat platform / sales channel platform เสมอ · **`mono`** = วาดด้วย currentColor (ทุกแพลตฟอร์ม — CSS mask จากไฟล์ SVG เดิม · LINE วาด inline เจาะตัว L) สำหรับวางบนปุ่ม primary — โลโก้สีแบรนด์เต็มตัวบนพื้นส้มตีกัน ห้ามใช้แบบสี |
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
/* ปุ่มหลักในแถว list page ใช้ <Button variant> ไม่ใช่คลาสเฉพาะแล้ว (ยุบ 2026-09-08) */
.btn-primary                   /* รับออเดอร์ / ยืนยัน (สีแบรนด์) */
.btn-success                   /* ยืนยันชำระ, สำเร็จ, ยืนยันสลิป */
.btn-indigo                    /* รับออเดอร์เครดิต, ลูกค้าชำระแล้ว */
.btn-amber                     /* จัดส่ง */
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
- **รูปจิ๋วทุกที่ต้องผ่าน `thumbUrl()` จาก [lib/image-thumb.ts](lib/image-thumb.ts)** (2026-09-07) — Shopee CDN ต่อ `_tn` (190KB→42KB) · Lazada `_120x120q80.jpg` (150KB→6KB) · storage ของเรา → Supabase Image Transformation `render/image` (150KB→2KB, CDN แคช 1 ชม.) · เก็บรูปเดียว 1200px ไม่มีไฟล์ย่อ (ย่อตอนเรียก ไม่เพิ่มพื้นที่) · **Image Transformation เป็นของแผน Pro**: รวม 100 origin images/เดือน เกินคิด $5/1,000 (นับรูปต้นฉบับที่ถูกย่ออย่างน้อยหนึ่งครั้งในเดือน ไม่ใช่จำนวน request) · ห้ามใช้กับอวาตาร์/โลโก้/สลิป/QR/lightbox
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

### Env ของ marketplace/แชท — กติกาชื่อ `{PLATFORM}_{APP}_{FIELD}` (จัดใหม่ 2026-09-05)

app ทุกตัวของแพลตฟอร์มเดียวกัน**ต้องมีคำบอกบทบาท**ในชื่อ ไม่มี "ตัวหลัก" ที่ไม่มีคำนำหน้าอีก (ของเดิม `TIKTOK_APP_KEY` กับ `TIKTOK_CHAT_APP_KEY` / `SHOPEE_PARTNER_KEY` กับ `SHOPEE_SELLER_PARTNER_KEY` อ่านแล้วตีกัน)

| แพลตฟอร์ม | APP | ใช้ทำอะไร | ตัวแปร |
|---|---|---|---|
| Shopee | `PARTNER` | app กลางของ AOO (Third-party Partner Platform) ทุกร้าน · production | `SHOPEE_PARTNER_APP_ID` · `_KEY` · `_PUSH_KEY` (Live Push Partner Key) · `_ENV` |
| Shopee | `SELLER` | app ที่จดในนามร้านเอง (Seller In House) — **ของบริษัท ไม่ใช่ของระบบ** เก็บใน `marketplace_app_credentials` ต่อบริษัท (ABC the Baby: live partner_id `2043961`, test 1243244 · **Live API Partner Key หมดอายุ 4 มี.ค. 2027**) · env ด้านขวาเหลือเป็น **ทางถอย** ของบริษัทที่ยังไม่มีแถวในตาราง อ่านที่ [lib/shopee/app-credentials.ts](lib/shopee/app-credentials.ts) ที่เดียว | `SHOPEE_SELLER_APP_ID` · `_KEY` · `_PUSH_KEY` (ถ้าต่าง) · `_ENV` *(legacy fallback)* |
| TikTok | `SHOP` | TikTok Shop app หลัก (ออเดอร์/สินค้า) | `TIKTOK_SHOP_APP_KEY` · `_SECRET` |
| TikTok | `CHAT` | app หมวด Customer Support | `TIKTOK_CHAT_APP_KEY` · `_SECRET` |
| TikTok | `LOGIN` | Login Kit (developers.tiktok.com) เอา avatar มาเป็นโลโก้ร้าน | `TIKTOK_LOGIN_APP_KEY` · `_SECRET` |
| Lazada | `SHOP` | Seller In-house APP (ออเดอร์/สินค้า) | `LAZADA_SHOP_APP_KEY` · `_SECRET` |
| Lazada | `CHAT` | In-house IM Chat (ไม่ตั้ง = ใช้คู่ SHOP) | `LAZADA_CHAT_APP_KEY` · `_SECRET` |

- **ไม่มี fallback ชื่อเก่า** — เปลี่ยนชื่อในโค้ดต้องเปลี่ยนบน Vercel พร้อมกัน (ตั้งชื่อใหม่ก่อน deploy แล้วค่อยลบชื่อเก่า)
- Supabase ใช้คีย์รูปแบบใหม่เท่านั้น: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` — `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` ถอดออกจากโค้ดแล้ว
- `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` **ถอดออกจากโค้ดแล้ว 2026-09-07** (เคยเป็น fallback ยุคก่อน multi-tenant · `lib/line-config.ts` ลบทั้งไฟล์) — token ของ LINE OA อยู่ใน `chat_accounts` ต่อบริษัทเท่านั้น · webhook ของทุก OA ต้องชี้ `…/api/line/webhook?account=<uuid>` (ตัวเฝ้ายืนยันให้ทุก 6 ชม. — ทั้ง 3 OA ผ่าน) ไม่มี `?account=` = ลายเซ็นตก 401 · ค้างอยู่บน Vercel ไม่มีผล แต่ลบให้สะอาด
- เพิ่ม app ใหม่ = ตั้งชื่อตามตารางนี้ + จดในตารางนี้ · `.env.local` จัดหมวดตามลำดับเดียวกัน

### Shopee dual-app — app กลาง (partner) + app ของบริษัท (seller) (เพิ่ม 2026-09-04 · เป็น credentials ต่อบริษัท 2026-09-07)

Shopee ให้ **Chat API เฉพาะ app ประเภท "Seller In House"** (นโยบาย 18 พ.ย. 2024) และ app แบบนั้น
**ผูกกับบัญชี seller ที่จดมันขึ้นมา** ⇒ app กลางของ AOO ใช้แทนกันไม่ได้ **ทุกบริษัทที่อยากใช้แชท
Shopee ต้องจด app ของตัวเอง** — ออเดอร์/สินค้ายังเข้าทาง app กลางที่ร้านไหนก็ authorize ได้เหมือนเดิม

- **1 ร้าน = token ได้ 2 ชุด** — ชุดหลัก (`access_token`/`refresh_token`/`*_expires_at` เซ็นด้วย app กลาง) + ชุดแชท (`chat_*` เซ็นด้วย app ของบริษัท) โครงเดียวกับ TikTok/Lazada เป๊ะ
- **app ของบริษัทอยู่ในตาราง `marketplace_app_credentials`** (`company_id, platform, app_role` unique · RLS superadmin เท่านั้น — เข้าถึงผ่าน API route ที่ใช้ service role) · **key ต้องถูกปิดบัง (4 ตัวท้าย) ในทุก response** ผ่าน `maskSecret()`
- **ที่เดียวที่อ่าน env `SHOPEE_SELLER_APP_*` คือ [lib/shopee/app-credentials.ts](lib/shopee/app-credentials.ts)** (`getCompanyShopeeApp` ตาราง→env cache 60 วิ · `listActiveSellerPushKeys`) — env เหลือเป็นทางถอยของบริษัทที่ยังไม่มีแถว · grep แล้วต้องเจอแค่ไฟล์นี้
- **ลำดับ resolve**: creds ชุดหลัก = `shopeeAppOf(account)` (จาก `metadata.shopee_app`) → `resolveAppKeys(app, company_id)` · creds ขาแชท = `ensureValidToken(account, { purpose: 'chat' })` → **มี `chat_access_token` ไหม** ถ้ามีใช้ app ของบริษัท + คอลัมน์ `chat_*` ถ้าไม่มี**ตกกลับไปใช้ชุดหลัก** (พฤติกรรมเดิมเป๊ะ)
- ⚠️ **ห้ามเขียนเงื่อนไขว่า "แชท = seller"** — ถ้าวันหนึ่ง Shopee เปิด Chat API ให้ partner app ด้วย ร้านที่อยู่บน partner app จะใช้แชทได้ทันทีโดยไม่ต้องแก้โค้ด
- ⚠️ **ห้ามเก็บ token 2 ชุดของ app เดียวกันในร้านเดียว** — `refresh_token` ของ Shopee ใช้ได้ครั้งเดียว ใบใหม่ฆ่าใบเก่า · callback ขา seller จึงเช็คก่อน: ร้านที่ชุดหลักเป็น app seller อยู่แล้วถือเป็น "ต่ออายุการเชื่อมต่อเดิม" (เขียนทับชุดหลัก) ไม่ใช่เขียน `chat_*` เพิ่ม
- **โครงของบริษัทเป็น "ค่าที่ตั้งเอง" ไม่ใช่การเดาจากสภาพร้าน** — `marketplace_app_credentials.usage`: **`full`** (ครบในตัว) = ร้าน authorize ผ่าน app ของบริษัทเอง (`metadata.shopee_app='seller'`) ออเดอร์ สินค้า ค่าคอม แชท ใช้ token ชุดหลักชุดเดียว — **ABC the Baby ทั้ง 7 ร้านอยู่แบบนี้ ไม่ต้องย้ายไป app กลาง** · **`chat`** (แชทอย่างเดียว) = ร้านอยู่บน app กลาง แล้วกด "เชื่อมต่อแชท" ด้วย app ของบริษัท → token ชุดแชทลง `chat_*`
  ตั้งได้ทั้งการ์ด "app แชท Shopee ของบริษัท" (`/settings/chat-channels#shopee`) และ `/superadmin/marketplace-apps` · เดาไม่ได้เพราะบริษัทตั้ง app ไว้ก่อนเชื่อมร้านสักร้านก็มี (ของเดิมเดาแล้วได้ chat_only ร้านที่เชื่อมทีหลังจึงไม่มี push ออเดอร์)
- **ทุกอย่างเดินตาม `usage` ตัวเดียว** — `POST /api/shopee/apps/[id]/push-config`: `full` = เปิดครบ `SHOPEE_PUSH_CODES_FULL` + `blockShopsOnPartnerApp` ร้านของบริษัทที่ app กลาง (`blocked_shop_id_list` เป็นการแทนที่ ต้องรวมของเดิมก่อน) · `chat` = `setChatOnlyPushConfig` (code 10 อย่างเดียว ปิด code ที่ค้าง) · ปุ่มเมนูเชื่อมร้านใน `/settings/sales-channels` ชู "ผ่าน app ของร้าน" ขึ้นบนสุดเมื่อ `full` · callback ขา seller ที่ได้ร้านใหม่ตอน `full` ตั้ง push ให้เองใน `after()`
  ⚠️ **ลดเป็น `chat` ขณะที่ยังมีร้าน `shopee_app='seller'` = ปฏิเสธ 409 ทุกทาง** (บริษัท/superadmin/ปุ่มตั้ง push) — ปิด code ออเดอร์ของ app ที่ร้านใช้รับออเดอร์อยู่ = ออเดอร์หายเงียบ ต้องย้ายร้านไป app กลางก่อน
- **webhook ตรวจลายเซ็นด้วย key ของ app กลาง + push key ของ app ทุกบริษัท** (`listActiveSellerPushKeys()`) — ตกใบใดใบหนึ่ง = push ของบริษัทนั้นถูกตีตกเงียบ ๆ ทั้งหมด
- **ขั้นตอนเปิดใช้ของบริษัทใหม่**: (1) เพิ่ม app ของบริษัทในการ์ด "app แชท Shopee ของบริษัท" ที่ `/settings/chat-channels#shopee` — ระบบยิง `get_app_push_config` ตรวจ key ให้ก่อนบันทึก (2) โหมด `full`: ตั้งโหมดในการ์ดนั้นเป็น "ทุกอย่าง" แล้วเชื่อมร้านด้วย "เชื่อมผ่าน app ของร้าน" ที่ `/settings/sales-channels` แล้วกด **"ตั้งค่า push (webchat)"** (ได้ครบทุก code) · โหมด `chat`: ร้านอยู่บน app กลางแล้ว → กด "ตั้งค่า push (webchat)" (ได้ code 10) → กด **"เชื่อมต่อแชท"** ทีละร้าน → `/api/shopee/oauth/auth-url?app=seller` → callback เขียน `chat_*` + `metadata.shopee_chat_app='seller'` แล้วกลับมาที่ `?shopee_chat=connected#shopee`
- **หน้า superadmin `/superadmin/marketplace-apps`** ดูว่าบริษัทไหนมี app ของตัวเองแล้ว · เปิด push แชทหรือยัง · **เปลี่ยนโหมด `usage` แทนบริษัทได้** · ปิดใบที่มีปัญหาได้ (key ปิดบังเสมอ)
- **สอง app อยู่คนละ environment ได้พร้อมกัน (เพิ่ม 2026-09-05 · seller app ผ่าน Go Live แล้ว 6 ก.ย. 2026 → ทั้งสอง app อยู่ production)** — ช่วง 4–5 ก.ย. partner app อยู่ production ส่วน seller app ยังเป็น Developing บน **Sandbox v2** → โฮสต์เลือก**ต่อ app** ด้วย `getBaseUrl(app)` / `resolveBaseUrl(creds)` (creds มี `app`) · env `SHOPEE_SELLER_APP_ENV=sandbox` (ไม่ตั้ง = ตาม `SHOPEE_PARTNER_APP_ENV`) · **ต้องตั้ง `SHOPEE_SELLER_APP_ID/KEY` + `SHOPEE_SELLER_APP_ENV` บน Vercel ด้วย** ไม่งั้น webhook ตีตกลายเซ็นของ app seller และ OAuth ขา seller ใช้ไม่ได้
- ⚠️ **Sandbox v2 ใช้โฮสต์ `https://openplatform.sandbox.test-stable.shopee.sg`** — `partner.test-stable.shopeemobile.com` เป็น sandbox รุ่นเก่า ตอบ `error_sign / Wrong sign` กับ partner ที่จดใน v2 (เสียเวลาไล่ key ไปรอบหนึ่ง 5 ก.ย. 2026) · sandbox ทดสอบได้กับ **test shop จากเมนู Test Account-Sandbox v2 เท่านั้น** ร้านจริง (gbthailandofficial) ต้องรอ app ผ่าน Go Live
- ✅ **ยืนยันแล้ว 5 ก.ย. 2026: app หมวด Seller In House เปิด push code 10 (webchat) ได้** (`set_app_push_config` → success บน sandbox, callback ชี้ `https://aoocommerce.vercel.app/api/shopee/webhook`) — นโยบายที่บล็อกแชทใช้กับ Third-party Partner app เท่านั้น · สคริปต์ `scripts/enable-shopee-webchat-push.mjs --app seller [--apply --callback URL]`
- **ตั้งแต่ 6 ก.ย. 2026 ร้านของ ABC the Baby ทั้ง 7 ร้านอยู่บน app seller ทั้งออเดอร์+แชท** — push config: app seller เปิด code `1,2,3,4,8,10,12,15,16,22` ชี้ `…/api/shopee/webhook` · app partner ยังเปิด `3,4,12,15` แต่ **block 7 ร้านนี้** (`blocked_shop_id_list`) กัน push ซ้ำสองทาง · app partner เก็บไว้สำหรับบริษัทอื่นในอนาคต · สคริปต์เดียวกันคุมทั้งคู่: `enable-shopee-webchat-push.mjs --app seller|partner --apply --codes 3,4,10,12,15 --block <shop_ids>` (ใส่ `--block` อย่างเดียว = ไม่แตะ code ที่เปิดอยู่) · ร้านใหม่ที่เชื่อมผ่าน app seller ในอนาคตต้องเพิ่มเข้า block list ของ partner ด้วย ไม่งั้นได้ออเดอร์ซ้ำ 2 ใบ (sync idempotent แต่เปลืองงาน)
- **Live Push Partner Key ≠ API key** — Shopee เซ็น push ด้วย "Live Push Partner Key" ที่ต้องกด Generate ในหน้า Push Mechanism → Set Push (ตอนสร้าง app ช่องนี้ว่าง) แล้วเก็บเป็น `SHOPEE_*_APP_PUSH_KEY` · webhook ลอง key ทั้งของ partner และ seller · **"Push Test Data" ในคอนโซลเซ็นด้วย key ทดสอบ ใช้ยืนยันลายเซ็นไม่ได้** (ตกทุกใบแม้ key ถูก) — พิสูจน์ด้วย push จริงเท่านั้น · วิธีเช็คว่าเป็น push ของ app ไหน: ระหว่างที่สอง app ยังไม่ block กัน push เดียวกันจะมา 2 ใบ msg_id เดียวกันแต่ signature ต่างกัน (6 ก.ย. 2026)
- **Push ระดับร้าน/สินค้า (code 1, 2, 8, 16, 22, 28) มีตัวรับแล้ว** ที่ [lib/shopee/push-handlers.ts](lib/shopee/push-handlers.ts) (`handleShopeeShopEvent` ใช้ทั้ง webhook และ retry worker): 2 = ปิดร้าน `is_active=false` + แจ้งเตือน · 1 = ปลุกร้านที่ปิด · 28 คะแนนโทษ / 16 สินค้าโดนแจ้งละเมิด = แจ้งเตือน + integration log · 22 ราคาเปลี่ยน → `marketplace_product_links.platform_price` (`original_price`) หรือ `platform_data.{field}` · 8 reserved stock → `platform_data.reserved_stock` · **ห้ามแตะ `product_variations`/inventory จาก push พวกนี้** · ร้าน/สินค้าที่ไม่รู้จัก = `skipped` ไม่ใช่ `failed` (ไม่งั้น retry worker วนจน dead letter) · ⚠️ **Shopee ส่ง `code`/`shop_id` เป็นสตริงในบาง push** (code 28 ทั้งใบ) — route coerce ด้วย `toShopeeNumber()` ก่อนเทียบเสมอ ของเดิม `payload.code ?? -1` กับ `"28"` ตกเป็น unhandled เงียบ ๆ · เปิด code ใหม่ที่ Shopee โดยไม่มีตัวรับ = ได้แค่ log skipped
- **ทุกที่ที่มี `creds` ต้องเซ็นด้วย `signForCreds(creds, …)` และใช้โฮสต์จาก `resolveBaseUrl(creds)`** (creds พก `env` ของ app ที่ออก token มาด้วย) — **`generateSign()` ถูกถอดออกแล้ว** เพราะมันอ่าน key จาก env ซึ่งเป็น key ผิดใบทันทีที่ app แบบ seller กลายเป็นของบริษัท · call ระดับ partner (OAuth / push config) ต้อง `resolveAppKeys(app, companyId)` แล้วส่ง keys เข้าไปเอง
- **เช็คว่า token ของทุกร้านเรียก Chat API ได้จริง**: `node scripts/check-shopee-chat-shops.mjs` (อ่านอย่างเดียว — ยิง `sellerchat/get_conversation_list` ด้วย key ของ app ที่ร้านผูก + token ใน DB · ผ่านครบ 7/7 หลัง Go Live 6 ก.ย. 2026) · ใช้ทุกครั้งหลัง re-authorize หรือเมื่อสงสัยว่าแชทร้านไหนเงียบผิดปกติ
- **ทดสอบสายแชทโดยไม่ต้องรอผู้ซื้อ**: `node scripts/simulate-shopee-webchat-push.mjs --shop <shop_id> --app seller` ยิง push code 10 ปลอม (เซ็นถูกต้อง) เข้า webhook production (ยิงหลายร้านให้ใส่ `--conversation 900000000000000000N --buyer 90000000N` แยกกัน — unique คือ (company_id, conversation_id) ใช้เลขเดิมจะไปทับผู้ติดต่อปลอมของร้านแรก) → ผู้ติดต่อ/ข้อความ/แจ้งเตือนต้องครบ (ผ่านแล้ว 5 ก.ย. 2026 กับ test shop 227886408) · **sandbox ของ Shopee ไม่มีฝั่งผู้ซื้อ** (Seller Center มีแค่ออเดอร์/สินค้า) push จริงพิสูจน์ได้หลัง Go Live เท่านั้น · ทดสอบเสร็จลบ `shopee_contacts`/`shopee_messages` ของ conversation ปลอมทิ้ง
- **ขั้นตอนตอนย้าย seller app จาก sandbox → live (6 ก.ย. 2026 — ทำครบแล้ว · ข้อ (3) ใช้บัญชีหลัก Shopee กดครั้งเดียวได้ทั้ง 7 ร้าน แม้ app จดด้วยบัญชีร้านเดียว)**: (1) เปลี่ยน env 3 ตัว `SHOPEE_SELLER_APP_ID/KEY/ENV` ทั้ง `.env.local` และ Vercel แล้ว redeploy — **ต้องทำก่อนเปิด push** ไม่งั้น webhook ตีตกลายเซ็นของ app ใหม่ทุกใบ (Shopee นับ callback ล้มเหลวแล้วปิด push ให้เอง) (2) ร้าน sandbox `OpenSANDBOX…` (shop 227886408) ใน `marketplace_accounts` + chat_account ของมัน set `is_active=false` แล้ว (token เป็นของ sandbox ต่ออายุบน production ไม่ได้) (3) re-authorize ร้านจริง (gb Thailand 1337059772) ผ่าน "เชื่อมผ่าน app ของร้าน" (4) `node scripts/enable-shopee-webchat-push.mjs --app seller --apply --callback https://aoocommerce.vercel.app/api/shopee/webhook` (5) ยิง `simulate-shopee-webchat-push.mjs --shop 1337059772 --app seller` เช็คสายแชท · **Live Push Partner Key ของ app seller ต้องกด Generate ในหน้า Push Mechanism → Set Push เอง (ตอนแรกว่าง)** แล้วตั้ง `SHOPEE_SELLER_APP_PUSH_KEY` ทั้ง `.env.local` และ Vercel (ทำแล้ว 6 ก.ย. 2026) — Shopee เซ็น push จริงด้วย key นี้ ไม่ใช่ API key · หน้าเดียวกันต้องเลือก "Deployment Service Area" = Singapore ถึงจะกด Save ได้
- UI: `GET /api/shopee/oauth/auth-url?app=seller&check=1` ตอบ `{ available, env, source: 'company'|'env'|null }` **ตามบริษัทที่ผู้ใช้อยู่** — ปุ่ม "เชื่อมผ่าน app ของร้าน" ในแท็บ Marketplace ของ `/settings/sales-channels` โชว์เสมอแต่กดไม่ได้พร้อมบอกเหตุผลเมื่อ `available: false` · การ์ดร้านที่ผูก app seller มี badge "app ของร้าน" · `chat_connected` ของ Shopee ใน `/api/marketplace/accounts` = มี `chat_access_token` ที่ refresh ยังไม่หมดอายุ **หรือ** ร้านนั้น `metadata.shopee_app='seller'` อยู่แล้ว (ร้านยุคก่อนแยกสอง token)

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
| **Settlement รายวัน** | `GET /api/marketplace/settlements/sync` (ไม่ใส่อะไร = ทั้ง 3 เจ้าเรียงคิวในงบ 300 วิเดียว) · **แนะนำแยก job ต่อเจ้า** `?platform=shopee` / `lazada` / `tiktok` (2026-09-08 — เจ้าแรกกินเวลาหมด เจ้าท้ายไม่โดนข้าม) | `0 4 * * *` |

**เพิ่ม marketplace ใหม่ = ต้องตั้ง cron 2 ตัวเสมอ** (sync-all + webhook/retry)
ทุกตัวยิงด้วย header `x-cron-secret: {CRON_SECRET}`

### 🔔 Watchdog — ตัวเฝ้าที่ทำให้ "พังเงียบ" เป็นไปไม่ได้ (เพิ่ม 2026-09-02)

[lib/marketplace/watchdog.ts](lib/marketplace/watchdog.ts) — **แหล่งความจริงเดียว** ของ "ตอนนี้มีอะไรพังอยู่":
หน้า superadmin API Monitor · การ์ดบน dashboard ของร้าน ([SystemIssuesCard](components/ui/SystemIssuesCard.tsx)) ·
กระดิ่งบน Header · push แจ้งเตือน — **อ่านจาก `collectWatchdogIssues()` ตัวเดียวกันหมด** จึงไม่มีทางพูดคนละเรื่อง

- **ทุก issue ต้องมี `fix` (วิธีแก้ที่ลงมือได้จริง) + `actionLabel` + `url`** — บอกว่าพังเฉย ๆ แล้วให้ผู้ใช้ไปหาทางเอง ไม่นับว่าแจ้งเตือน
- **ใครได้รับ**: `scope: 'system'` → superadmin · ทุก issue ที่มี `companyId` → เจ้าของ/แอดมินของบริษัทนั้น (เรื่อง cron ตายก็บอกร้านด้วย เพราะกระทบตัวเลขที่ร้านเห็น)
- **กันสแปม**: เรื่องเดิมเตือนซ้ำได้ทุก 6 ชม. · เรื่องที่มี `groupKey` เดียวกันรวมเป็นใบเดียว (cron เจ้าหนึ่งตาย = 1 ใบ ไม่ใช่ 6 ใบ) · หายแล้วบอก "กลับมาปกติ" ครั้งเดียว · state เก็บใน `app_flags.watchdog_state`
- **push ส่งถึงคนไม่ใช่ถึงบริษัท** — `sendPushToUsers()` ยิงตาม `user_id` จึงถึง superadmin ได้ไม่ว่าตอนเปิดแจ้งเตือนจะอยู่บริษัทไหน (สวิตช์เปิดได้ทั้งกระดิ่งในแอปหลักและกระดิ่งบน header ของ shell superadmin)
- ⚠️ **ตัวเฝ้าเองก็ตายเงียบได้** — ชั้นนอกสุดต้องเป็นของนอกระบบเรา: **เปิด "Notify on failure" ของ job นี้ใน cron-job.org เสมอ** · หน้า superadmin แสดง "ตัวเฝ้าตรวจล่าสุดเมื่อ ..." จาก `app_flags.watchdog_last_run` — ค่านี้ค้าง = ตัวเฝ้าตาย
- **ช่องทางแชท LINE/Facebook — ตรวจของจริง ไม่ใช่เดาจากความเงียบ** (เปลี่ยน 2026-09-07) — [lib/chat/channel-health.ts](lib/chat/channel-health.ts) ถามแพลตฟอร์มตรง ๆ **ทุก 6 ชม./ช่องทาง** (รอบละไม่เกิน 10 ช่องทาง · concurrency 3 · งบเวลา 15 วิ เพราะ `collectWatchdogIssues()` วิ่งอยู่ในสายที่ผู้ใช้รอ — ตัวที่ไม่ทันรอรอบหน้า): **LINE** = `/v2/bot/info` (token ใช้ได้ไหม) → `/v2/bot/channel/webhook/endpoint` (URL ที่ LINE จดไว้ตรงกับ webhook ของบัญชีนี้ไหม + `active`) → `/v2/bot/channel/webhook/test` (LINE ยิงมาแล้วถึงจริงไหม — route เราตอบ 200 ให้ `events` ว่างอยู่แล้ว **ห้ามแก้ให้ตอบอย่างอื่น**) · **Facebook** = `/{page_id}?fields=id,name` (token, error code 190) → `/{page_id}/subscribed_apps` (เพจยัง subscribe `NEXT_PUBLIC_FACEBOOK_APP_ID` พร้อมฟิลด์ `messages` ไหม · ไม่ตั้ง env นี้ = ข้ามชั้นนี้ ห้ามฟันว่าพัง) · ผลเก็บที่ `chat_accounts.health_status/health_detail/health_checked_at` — ตัวเฝ้าอ่านค่านี้ไปแจ้ง (`token_invalid` = critical · อีกสองตัว = warning) และหน้า `/settings/chat-channels` โชว์ป้ายเตือนพร้อม tooltip · **`check_failed` ไม่แจ้งเตือน** (เน็ตสะดุด ≠ ช่องทางพัง)
- ⛔ **ห้ามกลับไปเตือนจาก "ความเงียบ" อีก** — เคยใช้ค่าเฉลี่ย แล้วเปลี่ยนเป็น `1.5 × ช่องว่างที่เคยเงียบนานสุดใน 30 วัน` ก็ยัง**เตือนผิดทุกสุดสัปดาห์** เพราะ "ไม่มีใครทัก" กับ "ช่องทางพัง" มองจากฝั่งเราแล้วเหมือนกันเป๊ะ ไม่ว่าจะปรับสูตร/เพดานยังไง (3–7 ก.ย. 2026 ดู [fix-bug.md](fix-bug.md)) · RPC `get_chat_channel_activity()` **ยังอยู่ใน DB** ไว้ทำหน้ารายงานสถิติในอนาคต แต่ไม่ใช่เกณฑ์แจ้งเตือนแล้ว
- **LINE/Facebook มี integration log แล้ว** (เพิ่ม 2026-09-02) — ส่งข้อความ · ลายเซ็น webhook ไม่ตรง · webhook error · ทั้งหมด `await logIntegrationNow()` เพราะอยู่ใน request handler · **ไม่ log ข้อความขาเข้าที่สำเร็จ** (วันละ ~350 ใบ จะท่วม) — ความเงียบจับด้วย watchdog แทน
- **เพิ่มเรื่องที่ต้องเฝ้า = เพิ่ม check ในไฟล์เดียว** ห้ามไปเขียน logic ตรวจสุขภาพซ้ำในหน้าใดหน้าหนึ่ง
- **cron ตัวเฝ้ายังลาก "งานดูแลรายวัน" ไปด้วย** (เพิ่ม 2026-09-08) — [lib/maintenance/log-retention.ts](lib/maintenance/log-retention.ts) `pruneOldLogs()` ลบ log เกินอายุ (`integration_logs` 60 วัน · `marketplace_sync_log`/`marketplace_webhook_log` 30 วัน) · เรียกทุกรอบได้เพราะตัวมันเองคุมให้ทำจริงวันละครั้ง (`app_flags.log_retention_last_run`) จึงไม่ต้องตั้ง cron ใบใหม่ · **ที่ต้องมีเพราะ log ที่ไม่เคยลบโตจนกินแคชของฐานข้อมูล แล้วทำให้ทุกหน้าช้า** — ล้างครั้งแรก 8 ก.ย. 2026 ฐานข้อมูล 257MB → 160MB หน้าออเดอร์ 257ms → 52ms (ดู [fix-bug.md](fix-bug.md)) · เพิ่มตาราง log ใหม่ต้องมาเพิ่มใน `RETENTION` ด้วยเสมอ
- **เฝ้าบริษัทที่เลิกใช้ด้วย** (เพิ่ม 2026-09-08) — 2 เรื่อง ทำเฉพาะตอนเรียกแบบทั้งระบบ (ไม่มี `opts.companyId`) และเป็น `scope: 'system'` + **`companyId: null`** เสมอ (ห้ามเด้งไปบอกเจ้าของร้านว่า "ร้านคุณเงียบ" — ไม่ใช่เรื่องที่เขาแก้): `company_quiet` = บริษัทที่ยังเปิดแต่ `last_activity` เกิน 30 วัน · `company_purgeable` = บริษัทที่ปิดแล้วครบ 30 วันจน `purge_company` ได้ · ทั้งคู่ตั้ง **`renotifyHours: 24 * 7`** (ฟิลด์ใหม่ของ `WatchdogIssue` — ไม่ใส่ = 6 ชม.ตามเดิม) เพราะเรื่องพวกนี้ไม่มีอะไรเปลี่ยนใน 6 ชม. · RPC `get_company_overview()` ล้มต้องไม่ทำให้ check อื่นหาย (ครอบ try/catch แล้ว)
- **หน้า superadmin Companies = ศูนย์รวมรายธุรกิจ** ([/superadmin/companies](app/superadmin/companies/page.tsx)) — ความเคลื่อนไหวล่าสุด + ป้าย "เงียบ N วัน" · รายชื่อสมาชิก (กดที่จำนวนเพื่อกาง) · จำนวนร้าน/ช่องทางแชท/ออเดอร์ · **ลบถาวร** ผ่าน RPC `purge_company(p_company_id)` (ลบทุกตารางที่มี `company_id` + ไฟล์ในสตอเรจ) โดยต้องพิมพ์ชื่อบริษัทให้ตรง และผ่านเงื่อนไข **ปิดครบ 30 วัน หรือ `is_empty`** ซึ่ง **API คำนวณใหม่เองเสมอ ห้ามเชื่อธงจากหน้าจอ** · ข้อมูลทั้งหน้ามาจาก RPC `get_company_overview()` (service role เท่านั้น) · ปิดบริษัท = stamp `companies.deactivated_at` (จุดเริ่มนับ 30 วัน) · **หน้า Users ถูกลบทิ้งแล้ว 2026-09-08** (บอกได้แค่ "มีคนชื่อนี้" ซึ่งไม่พาไปสู่การตัดสินใจอะไร)
- **สายที่ผู้ใช้รอ (กระดิ่ง `/api/header/summary`) อ่านผ่าน `collectWatchdogIssuesCached()` (cache 5 นาที/บริษัท, single-flight)** — ผลจริงเปลี่ยนตาม cron ทุก 15 นาทีอยู่แล้ว ไม่ต้องคำนวณใหม่ทุกหน้าโหลด · cron ล้าง cache หลังคำนวณรอบใหม่ · ตัวตรวจจริง LINE/Facebook รันใน `runWatchdog()` (cron) เท่านั้น ห้ามใส่ใน `collectWatchdogIssues` (เพิ่ม 2026-09-07)

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
- **มี breaker แล้วยังต้องมี throttle** ([lib/marketplace/throttle.ts](lib/marketplace/throttle.ts)) — breaker คือตาข่ายรับหลังโดนแบน ไม่ได้กันไม่ให้โดน · ค่าระยะห่างต่อ scope อยู่ใน registry (`minGapMs`) ปัจจุบันตั้งเฉพาะ Lazada (chat 1000ms / อื่น 150ms) ที่เคยชนจริง · **จองจังหวะที่ DB ข้าม instance แล้ว** (2026-09-07 — RPC `claim_marketplace_call_slot` บนตาราง `marketplace_call_slots`; in-memory เหลือเป็นชั้นแรก+ทางถอย) เพราะ push หลายใบวิ่งคนละ instance เคยรวมกันยิงเกินจนโดน "ban 1 seconds" ซ้ำ ๆ
- **แบนสั้น ≠ โควตาหมด** — `reportMarketplaceError` อ่านวินาทีที่ platform บอก (`parseBanSeconds`) แล้วพักเท่านั้น · พักสั้นกว่า 2 นาที (`isShortPause`) ไม่ขึ้น banner/กระดิ่ง/ตัวเฝ้า · Lazada client รอแล้วยิงซ้ำเองเมื่อแบน ≤5 วิ และลง `integration_logs` action `rate_limited` ทุกครั้งที่โดน (นับความถี่ได้ — ดู fix-bug.md 2026-09-07)
- **ข้อความที่ผู้ใช้เห็นต้องตรงกับ scope ที่พักจริง** — `QUOTA_SCOPE_IMPACT` ที่เดียว (banner + กระดิ่ง อ่านจากนี่) · แชทพักแล้วขึ้นว่า "ออเดอร์เข้าช้า" = ส่งคนไปไล่หาปัญหาผิดที่ · **สถานะ breaker อ่านผ่าน `getBlockedPlatforms()` ที่เดียว** ทั้ง banner/กระดิ่ง/หน้า superadmin API Monitor — ห้ามให้ SQL หรือหน้าไหน parse `app_flags` เอง (RPC เคยจับเฉพาะ key ที่ไม่มี scope จึงบอก "ปิดทุก platform" ทั้งที่เปิดอยู่ ดู fix-bug.md 2026-09-08)
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
- **TikTok**: ⚠️ **การแมปเขียนจากสเปค OAS ยังไม่เคยเจอข้อมูลจริง** — route คืน `unmapped_fields` มาให้ดูว่ามีค่าธรรมเนียมตัวไหนตกหล่น ต้องเช็คตอนดึงชุดแรก · **ยิงทีละใบเฉพาะใบที่ยังไม่มี settlement** (2026-09-08 — ของเดิมยิงทุกใบ 30 วันซ้ำทุกเช้า) · เจอ 429 รอ 5/10 วิ ลองซ้ำก่อน ยังโดนค่อยหยุดรอบ · 429 แบบ `dependent service` = ระบบข้างใน TikTok สะดุด ไม่ใช่โควตาเรา → พักแค่ 1 นาที ไม่ขึ้นป้าย/ไม่ push · มี bulk (`/finance/202309/statements` → `/finance/202501/statements/{id}/statement_transactions` 100 ใบ/หน้า แต่ไม่มี `sku_transactions`) ค่อยย้ายเมื่อยอดถึงหลักร้อยใบ/เดือน
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
- ✅ **เปิดใช้ได้ผ่าน app ของบริษัทเอง** (แก้ 2026-09-07): นโยบาย Shopee ตั้งแต่ 18 พ.ย. 2024 ให้ **Chat API เฉพาะ app ของ Individual/Registered Business Seller** — app กลางของ AOO (Third-party Partner Platform) ขอสิทธิ์ไม่ได้ (`set_app_push_config` code 10 → error_param "determined by your app type", ดู open.shopee.com/announcements/1026) ⇒ **แต่ละบริษัทจด app ของตัวเองแล้วใส่ใน `marketplace_app_credentials`** (ดูหัวข้อ "Shopee dual-app" ด้านบน) · ออเดอร์/สินค้ายังใช้ app กลางเหมือนเดิม
- media url จาก webhook อาจเป็น CDN file id เปล่า → `resolveShopeeCdnUrl()` แปลงเป็น URL เต็ม
- **notify-then-pull เหมือน Lazada/TikTok แล้ว (2026-09-06)** — push บอกแค่ "มีความเคลื่อนไหว" ความจริงอยู่ที่ `get_message` · หลังบันทึกใบที่ push มา จะดึง 20 ใบล่าสุดของห้องมาเติมเสมอ เพราะ **ข้อความที่ร้านตอบจากแอป Shopee กับข้อความอัตโนมัตินอกเวลา (`status: offwork_autoreply` / `source: server`) Shopee ไม่ push มาให้เลย** สายสนทนาจึงเป็นรู · ข้อความที่ดึงมาไม่บวก `unread_count` (ใบที่ควรนับถูกนับตอน push แล้ว) และ `last_message_at` ขยับเฉพาะเมื่อใหม่กว่าเดิม
- ⚠️ **`message_id`/`conversation_id` ของ sellerchat เป็น int64 ที่ส่งมาเป็นตัวเลขเปล่าใน JSON — `JSON.parse` ปัดทิ้งเงียบ ๆ** ⇒ ทุก call ของ sellerchat ต้องผ่าน `shopeeChatRequest()` ใน [lib/shopee/chat.ts](lib/shopee/chat.ts) ซึ่ง parse ด้วย `parseShopeeChatJson()` (เดินอ่านทีละตัวอักษร ครอบเลข ≥16 หลัก**นอกสตริง**ด้วยอัญประกาศ — เลขยาวในข้อความของลูกค้าไม่โดนแตะ) · **ห้ามเรียก `shopeeApiRequest()` กับ path `/sellerchat/*`**
- **การ์ด item/order ถูกเติมเนื้อตั้งแต่ตอนบันทึก** ([lib/shopee/chat-enrich.ts](lib/shopee/chat-enrich.ts)) — push ส่งมาแค่ `{item_id}` / `{order_sn}` ซึ่งพนักงานอ่านไม่ออกว่าเป็นตัวไหน · `raw_message.item` = ชื่อ/รูป/ราคาของเรา + `product_id` (จาก `marketplace_product_links`; ไม่มี link ค่อยถาม `get_item_base_info`) · `raw_message.order` = สถานะ+ยอดของออเดอร์ในระบบเรา · **การเติมเนื้อห้ามทำให้บันทึกข้อความล้ม** — พังเมื่อไหร่ตกไปเป็นการ์ดเปล่า + log `chat_enrich`
- **`bundle_message` ไม่เก็บเป็นแถว** — เป็นบทสนทนากับแชทบอทก่อนลูกค้ากด "คุยกับเจ้าหน้าที่" ที่ Shopee ส่งมาแค่ list ของ id (`content.messages`) · ระบบไล่ `get_message` สูงสุด 3 หน้าเพื่อดึงข้อความจริงมาแทน แล้วลบฟอง "[หลายข้อความ]" ทิ้ง · `faq_liveagent` = เหตุการณ์ (`raw_message.system_event`) หน้าแชทวาดเป็น**ชิปกลางจอ** ไม่ใช่ฟองคำพูด
- **backfill ของเก่า**: `node scripts/backfill-shopee-chat.mjs [--days 7] [--url https://...]` → `POST /api/shopee/chat/backfill` (CRON_SECRET หรือแอดมินของบริษัท) — ดึงข้อความที่ขาด + เติมเนื้อการ์ดเก่า + ลบฟอง bundle · มี time budget 210s แล้วคืน `next_before` ให้ยิงต่อ (cursor อยู่ที่ผู้เรียก)
- **เปิดสวิตช์แชทของร้าน = backfill 10 ห้องล่าสุด** (`get_conversation_list` + `get_message` ห้องละ 1 หน้า) ทั้งตอนสร้าง chat_account ใหม่และตอนเปิดสวิตช์กลับ — ไม่งั้นหน้าแชทว่างทั้งที่ลูกค้าทักมาแล้ว

### TikTok Chat — Customer Service API (เพิ่ม 2026-08-21)
- **แชท TikTok Shop เข้าหน้ารวม `/chat`** — platform ที่ 5 (table-per-platform pattern เดิม): `tiktok_contacts` (1 row = 1 conversation, buyer id เป็น **TEXT** — 19 หลักเกิน JS precision) + `tiktok_messages` + RPC + realtime + RLS มาตรฐาน
- **Ingest แบบ notify-then-pull เหมือน Lazada**: webhook `/api/tiktok/webhook` จับ chat push จาก**รูปร่าง payload** (`data.conversation_id`) ไม่ผูกเลข type code (NEW_MESSAGE/NEW_CONVERSATION ไม่มีเลขยืนยันใน docs) → sync จาก `/customer_service/202309/conversations` + `/messages` (idempotent, dedupe ด้วย message id) — [lib/services/chat/tiktok.ts](lib/services/chat/tiktok.ts) + wrappers ใน [lib/tiktok/chat.ts](lib/tiktok/chat.ts)
- **ส่งข้อความ**: text + รูป — **รูปต้อง upload เข้า `/customer_service/202309/images/upload` ก่อน** (TikTok ไม่รับ URL ภายนอก ต่างจาก Lazada; multipart **ห้าม sign body**) · ข้อความ `is_visible=false` จากระบบไม่เก็บ
- **chat_accounts platform 'tiktok'** = reference เหมือน shopee/lazada (`credentials: {marketplace_account_id, shop_id}`) — toggle ที่ `/settings/chat-channels#tiktok` (เปิดครั้งแรก backfill 10 conversations) · CHECK `chat_accounts_platform_check` เพิ่ม 'tiktok' แล้ว (migration `tiktok_chat_foundation`)
- **Dual-app + OAuth ขาแชทแยก (แก้ 2026-08-27)**: แชทใช้ app หมวด Customer Support คนละตัวกับ app ออเดอร์ (`TIKTOK_CHAT_APP_KEY/SECRET`) และ app แชทต้องเปิด target market Thailand ใน Partner Center เองด้วย · **callback พาไปหน้าคั่นถามก่อนต่อขาแชท (แก้ 2026-09-07 — เหมือน Lazada)** — จบขาออเดอร์แล้วไป `/settings/sales-channels/connected?platform=tiktok` ให้กด "เชื่อมต่อแชทเลย" เอง (เฉพาะเมื่อยังมีร้านที่ `chat_access_token` ว่าง) ไม่เด้งไปหน้า login รอบสองทันทีแล้ว · ขาชวนดึงโลโก้จาก Login Kit ทำเฉพาะรอบที่**ไม่ได้**ต่อขาแชท ไม่งั้นผู้ใช้ต้องกดอนุญาต 3 หน้ารวด · ขาแชทเริ่มที่ `/api/tiktok/oauth/auth-url?app=chat` และ callback ขาแชทจบที่ `/settings/chat-channels?tiktok_chat=connected|failed|skipped#tiktok` · หน้าช่องทางแชท: ร้านที่ยังไม่มี token แชทแสดงปุ่ม "เชื่อมต่อแชท" แทน toggle (ธง `chat_connected` จาก `/api/shopee/accounts`) และ POST `/api/chat-accounts` ปฏิเสธ tiktok ที่ไม่มี `chat_access_token`
- **เปิดใช้จริง**: เชื่อมร้าน TikTok + เปิด scope Customer Service ของ app แชท + เปิด target market Thailand ทั้งสอง app + subscribe event **NEW_MESSAGE** ใน TikTok Partner Center > Webhooks

### แชท LINE / Facebook / Instagram — ชนิดข้อความที่รองรับ (เพิ่ม 2026-09-08)
- **การ์ดสินค้าจาก Facebook Shop** — ลูกค้าแตะสินค้าในร้านค้าของเพจแล้วส่งมาถาม webhook ส่ง `attachments[].type='template'` + `payload.product.elements[]` (`id, retailer_id, image_url, title, subtitle`) **ไม่ใช่ `payload.elements`** (ของเดิมอ่านผิดที่ ได้ "[เทมเพลต]" เปล่า 265 ใบ ดู fix-bug.md 2026-09-08) → `message_type='item'` + `raw_message.item` โครงเดียวกับ marketplace · จับคู่สินค้าเราด้วย `retailer_id` = SKU ของ variation หรือรหัสสินค้า ผ่าน `findProductByRetailerId()` ใน [lib/marketplace/chat-enrich.ts](lib/marketplace/chat-enrich.ts) (ไม่มี URL ภายนอก การ์ดจึงมีแค่ "เปิดในระบบ" เมื่อผูกได้) · `subtitle` ที่ไม่ใช่ราคาเก็บไว้แสดงตามที่มา (`parsePriceLabel()` รับเฉพาะ "$40" "฿1,290" "THB 1,290" "1,290 บาท" หรือตัวเลขล้วน)
- **แชร์โพสต์/รีล/สตอรี่/ลิงก์** (`ig_post ig_reel reel share post ig_story ephemeral unsupported_type`) → `FallbackBubble` เมื่อมี `linkUrl` (กดเปิดต้นทางได้) · preview มีป้ายของตัวเองใน `PREVIEW_BY_TYPE`
- **unsend ทั้ง FB (`message.is_deleted`) และ LINE (event `unsend`)** = UPDATE แถวเดิมเป็น `[ข้อความถูกเรียกคืน]` + `raw_message.recalled` **ห้าม insert แถวใหม่ ไม่ขยับ last_message_at/unread/push** (ของเดิม FB บันทึกเป็น "[ข้อความ]" ใบใหม่) · `fb_message_id`/`line_message_id` ไม่มี unique index จึงหาแบบ `order created_at desc limit 1`
- **ตอบกลับแบบ quote** (FB `reply_to.mid` · LINE `quotedMessageId`) → `raw_message.reply_to_id` + snapshot `raw_message.quoted {content(preview), message_type, direction, image_url}` ตั้งแต่ตอนบันทึก (ไม่ join ตอนแสดง) · `QuotedMessage` ใน SharedRenderers ครอบทุกชนิดฟองผ่าน `MessageBubble` · LINE `quoteToken` เก็บที่ `raw_message.quote_token` ไว้ใช้ตอนเราตอบกลับแบบ quote (ยังไม่ทำขาส่ง)
- **LINE เพิ่ม**: `imageSet` → ป้าย index/total บนรูป · `emojis` (อีโมจิของ LINE เป็นตัวยึดตำแหน่ง `$`) → วาดรูปจาก `stickershop.line-scdn.net/sticonshop/v1/sticon/{productId}/android/{emojiId}.png` ตามช่วง index (UTF-16 code unit) · `mention` เก็บอย่างเดียว · `memberJoined/memberLeft` → แถว `message_type='system'` + `system_event member_joined/member_left` (ชิปกลางจอ ไม่บวก unread) · `postback` (LINE `data/params` · FB `title/payload`) → แถว `message_type='postback'` เนื้อ `[กดปุ่ม] …` นับเป็นข้อความเข้าปกติ
- **โครงที่ยังแกะไม่ได้ต้องเก็บดิบไว้เสมอ** — template ที่แกะอะไรไม่ได้ → `raw_message.raw_attachment` · ข้อความที่ไม่มี text/attachment/sticker → `raw_message.raw_event` (ของเดิมเก็บแค่ชื่อคีย์ จึงวิเคราะห์ย้อนหลังไม่ได้ว่า 265 ใบคืออะไร)
- **ตอบ LINE ด้วย reply token ก่อน push (เพิ่ม 2026-09-08)** — reply **ไม่นับโควตา** ของ OA (push/multicast/broadcast นับทุกใบตามผู้รับ — หน้า pricing ของ LINE) แต่ token ใช้ได้**ครั้งเดียว**และ**ภายในราว 1 นาที**: webhook เก็บ `raw_message.reply_token/reply_token_at` ไว้ที่ข้อความขาเข้า (message + postback) · `sendMessage` → `claimReplyToken()` จองด้วย UPDATE แบบมีเงื่อนไข (กันสองคนตอบพร้อมกันหยิบใบเดียวกัน) แล้วยิง `/message/reply` เมื่ออายุ ≤50 วิ · LINE ปฏิเสธ (หมดอายุ/ใช้แล้ว) → push ตามเดิมโดยผู้ใช้ไม่รู้สึก · ขาออกจด `raw_message.sent_via='reply'` + `reference_label` ใน integration log บอกว่าฟรีหรือตกไป push · ข้อมูล 30 วัน: ~40% ของการตอบทันใน 60 วิ · **ข้อความอัตโนมัติ (auto-reply ผ่าน reply token ฟรี) ยังไม่ทำ**
- **ยังไม่รองรับ**: FB reaction / message_edits / read receipt (ข้ามเงียบ ๆ) · ขาส่ง rich (Flex/template/quick reply/imagemap) ทุกแพลตฟอร์ม · การ์ดของ IG ขึ้นป้าย "Facebook" เพราะหน้าแชทส่ง `platform` ไม่ส่ง `source` เข้า MessageBubble

### บรอดแคสต์ / ส่งข้อความหาลูกค้าเป็นชุด — `/marketing/broadcast` (เพิ่ม 2026-09-08 · ย้ายมาจาก `/chat/broadcast` + รับหลายช่องทาง 2026-09-08)
- **ทำไมต้องส่งจากระบบเรา**: Messaging API ของ LINE **ไม่มี endpoint อ่านประวัติแชท** และ broadcast/การตอบจาก LINE OA Manager **ไม่วิ่งผ่าน webhook** → ส่งจากที่นี่เท่านั้นที่ข้อความจะไปโผล่ในห้องแชทของลูกค้าทุกคนและรู้ว่ากินโควตาเท่าไหร่ (push/multicast/broadcast กินโควตารายเดือนทุกใบ · reply token ไม่กิน)
- **เส้นแบ่งของทุกแพลตฟอร์มคือ "ถึงคนที่ยังไม่ได้เริ่มคุยกับเราได้ไหม" ไม่ใช่ "ส่งทีเดียวหลายคน vs ทักทีละคน"** — สำรวจของจริงแล้วทุกเจ้าทำได้หมด **ในกรอบของเขา** ทะเบียนอยู่ที่ [lib/broadcast/platforms.ts](lib/broadcast/platforms.ts) ที่เดียว (client-safe — หน้าจอกับ API อ่านตัวเดียวกัน เหตุผลที่ผู้ใช้เห็นจึงตรงกับที่ API ตอบเสมอ):

| ช่องทาง | ถึงใครได้ | สถานะ | ที่มา |
|---|---|---|---|
| **LINE** | ผู้ติดตามทุกคน แม้ไม่เคยทักมา | ✅ ทำแล้ว | `/message/multicast` (500/ใบ) + `/message/broadcast` |
| **TikTok Shop** | ลูกค้าที่สั่งใน **365 วัน** | **โค้ดพร้อมแล้ว — รอเปิด scope** | **Customer Engagement API** — `POST /customer_engagement/202502/engagement_tasks/custom` (หัวข้อ ≤70 + เนื้อ ≤500 + การ์ดสินค้า ≤4 + คูปอง 1 + วันหมดอายุ) → `POST /202412/messages` (`buyer_emails` = อีเมลนิรนามจาก Get Order Details) → `POST /202412/performances` (ยอดอ่าน/ยอดสั่ง) · ดูหัวข้อ TikTok ด้านล่าง |
| **Lazada** | ออเดอร์ **≤30 วัน** หรือห้องที่คุยอยู่ | ทำได้ ยังไม่ต่อ | `/im/session/open` **บังคับ `order_id`** และตอบ `-22 order out of day limit: 30` แล้วส่งทีละห้อง |
| **Shopee** | ห้องที่ลูกค้าทักมาแล้วเท่านั้น | ทำได้ ยังไม่ต่อ | sellerchat มีแค่ `send_message` เข้าห้องที่มีอยู่ · **ไม่มี API บรอดแคสต์** (Chat Broadcast มีเฉพาะใน Seller Center) |
| **Facebook / Instagram** | คนที่ทักมาภายใน **24 ชม.** | ทำได้ ยังไม่ต่อ | นอกกรอบ 24 ชม. **API ปฏิเสธเอง** (ไม่ใช่แค่เสี่ยง) เหลือแค่ message tag ที่ห้ามเนื้อหาโปรโมชัน · ไม่มี endpoint ส่งเป็นชุด ต้องยิงทีละ PSID |

- ⛔ **ห้ามหาทางอ้อมกรอบข้างบน** — ที่แพลตฟอร์มวัดว่าใครสแปมคือ **ปฏิกิริยาของผู้รับ** (block/report) ไม่ใช่วิธีที่เรากดส่ง · ทักคนที่ไม่อยากคุยทีละคนก็โดนคะแนนโทษเท่ากัน · เปลี่ยน `status` เป็น `'ready'` ได้เมื่อ **ต่อ API เสร็จและส่งได้จริง** เท่านั้น
- **โครง**: ตาราง **`broadcasts`** (เดิม `line_broadcasts` — RLS มาตรฐาน · `platform` + `chat_account_id` ซึ่งชี้ได้ทุกแพลตฟอร์มอยู่แล้ว · `batches` jsonb = แผนล็อตละ ≤500 พร้อม `retry_key` ต่อล็อต · `platform_request_ids`) · API `/api/broadcasts` + `/preview` + `/[id]/resume` **ปฏิเสธช่องทางที่ยังไม่ ready ด้วย `reason` จากทะเบียน** · ตัวส่งเลือกจาก [lib/broadcast/run.ts](lib/broadcast/run.ts) (`runBroadcast(id, platform)`) — **เพิ่มช่องทางใหม่ = เพิ่ม case ที่นั่น + แตกสาขาใน POST ตรงที่คอมเมนต์บอก + เปลี่ยน status ในทะเบียน**
- **ตัวส่ง LINE** [lib/line/broadcast.ts](lib/line/broadcast.ts) `runLineBroadcast()` **กดซ้ำได้เสมอ** — จดแผนล็อต+`X-Line-Retry-Key` ลง DB **ก่อน** ยิงใบแรก ฟังก์ชันตาย/หมดงบเวลา 240 วิ แล้วกด "ส่งต่อ" LINE จะไม่ส่งซ้ำ · `sent_count/failed_count` นับจากสถานะล็อกเสมอ ห้ามบวกสะสม · ค่าคงที่ที่หน้าจอใช้ด้วยอยู่ [lib/line/constants.ts](lib/line/constants.ts) (broadcast.ts แตะ supabaseAdmin ห้าม import จาก client)
- **กลุ่มผู้รับ** (`audience_type`) — **เส้นแบ่งที่ผู้ใช้ต้องเข้าใจคือ "เคยทักมา" vs "แอดเพื่อนแต่ไม่เคยทัก"** เพราะระบบเรารู้จักเฉพาะคนที่ทักมา (มาทาง webhook) ส่วน LINE รู้จักผู้ติดตามทุกคน:
  - `contacts` **คนที่เคยทักเข้ามา** — ผู้ติดต่อ active ที่เป็นบุคคล (`line_user_id` ขึ้น U — group/room ยิง multicast ไม่ได้)
  - `customers` คนที่เคยทัก **และ** ผูกกับลูกค้าในระบบแล้ว
  - `tags` ตามแท็ก **ทั้งที่ติดกับลูกค้า (`customer_tag_links`) และที่ติดกับผู้ติดต่อในแชทโดยตรง (`contact_tag_links` platform line)**
  - `all` **ผู้ติดตามทั้งหมด** = `POST /message/broadcast` ถึงทุกคนที่แอดเพื่อน รวมคนที่ไม่เคยทัก (เราไม่รู้รายชื่อ จึงบันทึกลงห้องแชทได้เฉพาะคนที่เคยทัก)
  - `contacts_pick` **เลือกรายคน** — ค้นชื่อแล้วเลือกทีละคน · **ทางเดียวที่ทดสอบส่งหาตัวเองได้ก่อนยิงจริง** และใช้ส่งกลุ่มเล็กโดยไม่ต้องไปติดแท็กก่อน
  - **แบ่งตามสถานะการซื้อ** (เพิ่ม 2026-09-08 — จัดกลุ่มตามเป้าหมายการตลาด ไม่ใช่ตามกลไกของระบบ): `not_bought` ยังไม่เคยซื้อ · `bought` ลูกค้าทั้งหมด · `bought_within` ซื้อล่าสุดภายใน N วัน · `bought_before` หายไปเกิน N วัน · `bought_once` ซื้อครั้งเดียวยังไม่กลับมา — สามตัวหลังใช้ `get_chat_customer_order_stats` (RPC เดียวกับหน้าแชท ตัวเลขจึงตรงกัน) · `audience_filter.days` เก็บจำนวนวัน
  - ⚠️ **"ยังไม่เคยซื้อ" ที่จริงคือ "ไม่มีหลักฐานว่าซื้อ"** — LINE **ไม่ให้เบอร์/อีเมลเลย** ระบบรู้ว่าใครเป็นลูกค้าได้ทางเดียวคือห้องแชทถูกผูกกับ `customers` (เกิดตอนเปิดบิลจากแชท) · **โมดัลเลือกกลุ่มจึงต้องโชว์ว่ารู้ประวัติของกี่คนเสมอ** (`contact_total`/`contact_linked` จาก preview) ไม่งั้นผู้ใช้จะอ่านว่าลูกค้าเก่าตัวเองไม่มีใครเคยซื้อ
  - **ตัวกรองซ้อน — หั่นกลุ่มที่เลือกให้แคบลง ไม่ใช่กลุ่มใหม่** (`audience_filter.min_messages` · `last_chat_days`): "คุยกันมาแล้วอย่างน้อย N ข้อความ" กับ "คุยล่าสุดภายใน M วัน" ใช้ได้กับทุกกลุ่มที่มีรายชื่อจริง — **ยกเว้น `all`** (ยิงถึงผู้ติดตามที่เราไม่มีรายชื่อ กรองไม่ได้) และ `contacts_pick` (เลือกมาเองแล้ว) · ทำเป็นตัวกรองไม่ใช่กลุ่มใหม่ ไม่งั้นจำนวนกลุ่มจะระเบิดเป็นทุกคู่ผสม
  - ⚠️ **ทั้งสองเกณฑ์นับเฉพาะ `direction='incoming'` — คือสิ่งที่ "ลูกค้าพิมพ์มา" ไม่ใช่ความเคลื่อนไหวของห้อง** (RPC `get_line_contact_message_counts` คืนทั้ง `incoming_count` และ `last_incoming_at` รอบเดียวต่อ OA ไม่ยิงนับทีละห้อง):
    - นับ**ขาออก**ด้วยเมื่อไหร่ **สำเนาบรอดแคสต์ที่เราเขียนลงห้องแชทเองจะไปเพิ่มตัวเลข** ยิ่งยิงบ่อยยิ่งดูเหมือนลูกค้าคุยเยอะ ซึ่งกลับหัวกลับหาง
    - ⛔ **ห้ามใช้ `line_contacts.last_message_at` เป็น "คุยล่าสุด"** — ค่านั้น**ขยับตอนแอดมินตอบ**ด้วย (`sendMessage` ใน [lib/services/chat/line.ts](lib/services/chat/line.ts)) ⇒ ห้องที่ลูกค้าเงียบมาครึ่งปีแต่แอดมินเพิ่งไปเคลียร์ค้างเมื่อวาน จะหลุดเข้ากลุ่ม "คุยล่าสุด 30 วัน" ทั้งที่ลูกค้าไม่ได้พูดอะไรเลย · (บรอดแคสต์ไม่ขยับค่านั้น แต่การตอบปกติขยับ) · **แก้จากการอ่านโค้ด ไม่ใช่จากการเห็นอาการ** — ตอนวัดสองแบบให้ผลเท่ากัน แต่ข้อมูลตอนนั้นสั้นเกินกว่าจะมีเคส "แอดมินไปตอบแชทเก่า" ให้เห็น
  - ⛔ **อย่าเอาตัวเลขจากฐานข้อมูลตอนนี้ไปสรุปพฤติกรรมลูกค้า** (เจ้าของท้วง 8 ก.ย. 2026 — ถูกต้อง) · aDay Fresh มีแชทมาตั้งแต่ 21 เม.ย. (12,317 ข้อความ) **แต่เพิ่งเริ่มเปิดบิลในระบบ 28 ส.ค. — 11 วัน 31 ใบ** ⇒ สัดส่วน "ยังไม่เคยซื้อ 1,417 : เป็นลูกค้า 15" **วัดว่าระบบถูกใช้มากี่วัน ไม่ได้วัดว่าลูกค้าซื้อหรือยัง** · ตัวเลขทำนองนี้ใช้ได้แค่ยืนยันว่า "ตัวกรองทำงาน/เร็วพอ" เท่านั้น ห้ามใช้ตั้งค่าเริ่มต้นหรือสรุปว่าฟีเจอร์คุ้มไม่คุ้ม จนกว่าจะใช้งานจริงสักระยะ
  - **มีผู้ติดต่อ 236 คนเคยพิมพ์เบอร์โทรในแชท** — เอาไป *สร้าง* ข้อมูลลูกค้าได้ (ยังไม่ทำ) · ที่ลอง *จับคู่* กับลูกค้าที่มีอยู่แล้วตรงแค่ 1 คน **ไม่ได้แปลว่าจับคู่ไม่เวิร์ก** — แปลว่าตอนนั้นระบบเพิ่งมีข้อมูลลูกค้า 41 คน (สร้างใน 11 วัน) จึงไม่มีอะไรให้จับคู่ · ต้องวัดใหม่เมื่อข้อมูลลูกค้าสะสมพอ
  - รายชื่อดึงผ่าน `fetchAllRows()` (aDay Fresh 1,409 คน เกินเพดาน 1,000) · ผู้ใช้ซ้ำ (`line_user_id` เดียวกัน) ส่งครั้งเดียว
  - ⚠️ **ป้ายกับคำอธิบายต้องอ่านเทียบกันได้ตลอด ไม่ใช่โชว์เฉพาะตัวที่เลือก** — "ผู้ติดต่อทั้งหมดใน OA นี้" กับ "ทุกคนที่แอดเพื่อน OA" (ป้ายเดิม) แยกไม่ออกว่าต่างกันตรงไหน เจ้าของถามตรง ๆ ว่ามันคืออะไร (8 ก.ย. 2026)
- ⚠️ **จำนวนผู้รับของโหมด `all` ต้องใช้ `targetedReaches` ห้ามใช้ `followers`** — `followers` ของ `/insight/followers` คือ **ยอดสะสมของการกดแอด ไม่ลดลงเมื่อมีคนบล็อกหรือลบบัญชี** · วัดจริง 8 ก.ย. 2026: aDay Fresh `followers=41,490` แต่ OA Manager โชว์เพื่อน 15,751 = `targetedReaches` (15,752) ไม่ใช่ `followers−blocks` (23,837) · `getLineFollowerStats()` คืน `reachable/totalAdds/blocks` และหน้าจอโชว์ส่วนต่างให้ด้วย (ดู [fix-bug.md](fix-bug.md) 2026-09-08)
- **โควตา**: `GET /message/quota` + `/quota/consumption` → preview บอก ใช้ไป/เพดาน/เหลือ และ **ปฏิเสธตั้งแต่สร้าง** เมื่อเหลือไม่พอ (`quotaBlocks`) · ถามไม่ได้ = `unknown` ไม่ขวาง
- **สำเนาในห้องแชท**: หลังล็อตส่งสำเร็จ insert `line_messages` ขาออก (chunk 200) `raw_message.broadcast_id` → ฟองขึ้นป้าย "📣 บรอดแคสต์" · **ห้ามแตะ `last_message_at`/`unread_count`** ไม่งั้นรายชื่อแชททั้งร้านสลับลำดับพร้อมกัน · `sent_by` ต้องมีแถวใน `user_profiles` (FK) ไม่งั้น chunk ล้มทั้งชุด
- **เลือกได้หลายบัญชี/หลายช่องทางในใบเดียว** — เนื้อหาชนิดกลางชุดเดียวยิงได้หลาย OA/หลายร้าน (aDay Fresh มี LINE 2 บัญชี · ABC the Baby มี FB 7 เพจ · Shopee 6 ร้าน) · **1 บัญชี = บรอดแคสต์ 1 ใบ** (แต่ละใบมีสถานะ/ปุ่มส่งต่อของตัวเอง ใบไหนล้มไม่ลากใบอื่น) · รูปอัปครั้งเดียวใช้ร่วมทุกใบ · ลิมิตกลายเป็น **ค่าที่แคบที่สุดของทุกเจ้าที่เลือก** (`intersectCompose()` — เลือก LINE+TikTok ⇒ 500 ตัว ไม่มีรูป หัวข้อบังคับ) และกลุ่มผู้รับเหลือเฉพาะตัวที่ทุกเจ้ามีเหมือนกัน
- **หน้าสร้างเป็น 2 คอลัมน์บนจอกว้าง** — ซ้ายฟอร์ม (ช่องทาง + กลุ่มผู้รับ + เนื้อหา) · ขวาตรึงไว้ (จำนวนผู้รับ + โควตา + ตัวอย่าง + ปุ่มส่ง) เพราะจำนวนผู้รับกับตัวอย่างคือของที่ต้องเห็นตลอดเวลาที่แก้ข้อความ · **ช่องทางใช้ `AccountPicker` ตัวเดียวกับหน้าแชท** และช่องทางที่ยังส่งไม่ได้อยู่ในรายการเดียวกันแบบกดไม่ได้พร้อมเหตุผล (หนึ่งแถวต่อแพลตฟอร์ม ไม่ต้องยิง API โหลดร้าน/เพจของเจ้าที่ยังใช้ไม่ได้) — **ห้ามซ่อนหาย** ไม่งั้นผู้ใช้จะถามซ้ำว่าทำไมไม่มี Shopee
- **กลุ่มผู้รับอยู่ในโมดัล ไม่ใช่การ์ดเรียงในหน้า** — รายการจะยาวขึ้นเรื่อย ๆ (จะเพิ่ม "ไม่ได้ซื้อมา N วัน" · "ทักมาแต่ยังไม่เคยซื้อ") และบางตัวเลือกมีของให้กรอกต่อ (แท็ก · รายชื่อ · จำนวนวัน) ซึ่งยัดใน dropdown แล้วอึดอัด · ปุ่มบนหน้าโชว์ชื่อกลุ่ม + จำนวนผู้รับ/สิ่งที่ยังต้องเลือก
- **สิทธิ์** `chat.broadcast` = ADMIN_TIER (กินโควตาของช่องทาง) · **เมนูอยู่กลุ่ม "การตลาด" ใน Sidebar** (คู่กับ "โปรโมชั่น" ที่ย้ายมาจากกลุ่มสินค้า) — บรอดแคสต์คนละงานกับ Chat ซึ่งเป็นงานตอบประจำวัน · `/chat/broadcast` เดิม redirect ให้ใน [next.config.ts](next.config.ts) · หน้า `/marketing/broadcast` (รายการ poll 4 วิเฉพาะตอนมีใบกำลังส่ง) + `/marketing/broadcast/new` (เลือกช่องทาง — **ช่องทางที่ยังไม่ ready ขึ้นเป็นรายการพร้อมเหตุผลใต้ตัวเลือก ห้ามซ่อน** → กลุ่มผู้รับ + preview จำนวน/โควตา → ข้อความ + รูปผ่าน `chat-media/broadcast-images/`)
- **TikTok Shop — โค้ดครบแล้ว ติดแค่สิทธิ์ (2026-09-08)**: [lib/tiktok/engagement.ts](lib/tiktok/engagement.ts) (API 4 ตัว) + [lib/tiktok/broadcast.ts](lib/tiktok/broadcast.ts) (`runTikTokBroadcast` — โครงล็อตเหมือน LINE) · ผู้รับ = **distinct `orders.external_data->>'buyer_email'` ภายใน 365 วัน** (อีเมลนิรนามของ TikTok ที่ติดมากับออเดอร์ ไม่ต้องยิง API ถามใหม่ · คนเดียวสั่งหลายใบส่งครั้งเดียว) · กลุ่มผู้รับที่รองรับ: `buyers_365d` · `tags` (แท็กลูกค้า **และ** ต้องมีออเดอร์ในกรอบ)
  - ⛔ **ตัวบล็อกจริงคือ "ไม่มี scope ให้ขอ" ไม่ใช่ "ยังไม่ได้กดเปิด"** (สำรวจหน้า Partner Center จริง 8 ก.ย. 2026 — **อย่าไล่ตามทางนี้ซ้ำ**): รายการ scope ถูกกรองตาม**หมวดของ app** และค้นแล้ว **ไม่เจอ Customer Engagement ทั้งสอง app** — `AooCommerce` (หมวด Order Management/OMS-WMS, key `6gec3d4s4o88v`) ค้น "customer" ได้ **0 รายการ** · `AooCommerce-Chat` (หมวด Customer Support, key `6gtqs1d4tp7u0`) ค้น "customer" เจอแค่ `seller.customer_service` (**Under review** + Sensitive data · ตัว app ยัง Draft) และค้น "engagement" ได้ **0 รายการ**
  - **"ต้องเป็น app หมวดอื่น" ตัดทิ้งได้แล้ว** — หน้าสร้าง app ใหม่มีให้เลือกแค่ **4 หมวด**: `Customer Service → Customer Support` · `eCommerce Management → Multi-Channel Management` · `Finance → Accounting` · `Shipping & Fulfillment → Order Management (OMS/WMS)` · **ไม่มีหมวดการตลาด/CRM เลย** และเรามี 2 ใน 4 หมวดนั้นอยู่แล้ว
  - **เหลือความเป็นไปได้เดียว**: `/customer_engagement/*` แฝงอยู่ใน **`seller.customer_service`** ของ app หมวด Customer Support (= AooCommerce-Chat ที่ยัง Draft + scope Under review) ⇒ `getEngagementCreds()` จึง**ใช้ token ของ app Chat ก่อนถ้ามี** แล้วตกไป app ออเดอร์ · **วันที่ scope ผ่านรีวิว ไม่ต้องแก้โค้ด** แค่ต่อ chat token ของร้านแล้วรัน `node scripts/check-tiktok-engagement.mjs` (มันลองให้ทั้งสอง app) · ถ้ายังไม่ผ่านอีก = ต้องถาม partner manager ของ TikTok ตรง ๆ ว่า API กลุ่มนี้เปิดให้ใครบ้าง
  - **ด่านที่สองยังอยู่เหมือนเดิม**: ต่อให้ผ่านเรื่อง scope แล้ว **ร้าน** ยังต้องได้ฟีเจอร์ `FUNDAMENTAL` + `CUSTOM_MSG` จาก TikTok อีกชั้น (`GET /202502/permissions`)
  - ⚠️ **ทั้ง 2 ร้านยังไม่เคยต่อ chat token เลย** (`chat_access_token` ว่าง) — ถ้าคำตอบคือสมมติฐาน (ก) ต้องเชื่อมแชท TikTok ก่อนถึงจะยิงการตลาดได้
  - **เช็คก่อนเปิดใช้เสมอ**: `node scripts/check-tiktok-engagement.mjs` (อ่านอย่างเดียว บอกว่าติดด่านไหน + นับออเดอร์ที่ทักได้) — **ผ่านครบค่อยเปลี่ยน `status` เป็น `'ready'`** ห้ามเปลี่ยนก่อน ไม่งั้นผู้ใช้กดส่งแล้วเจอ error ดิบของ TikTok
  - ⚠️ **`message_templates` ตอบ "Locale is a required field" ทั้งที่ยังไม่มี scope** — validate param ก่อนเช็คสิทธิ์ อย่าอ่านว่า "ผ่านแล้ว" (เสียเวลาไปรอบหนึ่ง 8 ก.ย. 2026)
  - ⚠️ **ไม่มี idempotency key ระดับข้อความ** (task มี `idempotency_key` แต่ `messages` ไม่มี) — ตายหลังยิงสำเร็จแต่ก่อนบันทึกสถานะล็อต แล้วกด "ส่งต่อ" = ลูกค้าชุดนั้นได้ซ้ำ · จึงใช้ล็อตเล็ก (`TIKTOK_ENGAGEMENT_BATCH_SIZE = 50` — **เพดานจริงไม่มีในเอกสาร ยืนยันตอนส่งใบแรก**) + บันทึกทันทีที่ยิงเสร็จ
  - **creds มาจาก `getEngagementCreds()` ที่เดียว** — วันนี้ใช้ token ของ app ออเดอร์ · ถ้า TikTok ย้าย API กลุ่มนี้ไป app หมวดแยกเหมือนที่ทำกับ Customer Support ให้แก้ที่ฟังก์ชันนั้นฟังก์ชันเดียว
  - **ไม่มีสำเนาลงห้องแชท** (ต่างจาก LINE) — ข้อความไปโผล่ในแชท TikTok ฝั่งผู้ซื้อซึ่งเราไม่มีห้องนั้นในระบบ
- **ตาราง `broadcasts` รับต้นทางได้ 2 แบบ**: `chat_account_id` (LINE/FB/IG) **หรือ** `marketplace_account_id` (ร้าน marketplace) — DB บังคับให้มีอย่างใดอย่างหนึ่งเสมอด้วย `broadcasts_one_account_check` · แปลงจาก "ผู้ใช้เลือกอะไร" เป็นต้นทางจริงที่ [lib/broadcast/accounts.ts](lib/broadcast/accounts.ts) `resolveBroadcastTarget()` **ห้าม query ตารางบัญชีเองใน route** · `platform_data` เก็บของที่แพลตฟอร์มคืนมาแล้วต้องใช้ตอนส่งต่อ (TikTok: `task_id` + `idempotency_key`)
- **เนื้อหาเป็น "ชนิดกลาง" ไม่ผูกกับแพลตฟอร์ม** ([lib/broadcast/content.ts](lib/broadcast/content.ts)) — `announce` (ข้อความ+รูป) · `promo` (แบนเนอร์+หัวข้อ+ข้อความ+ปุ่ม) · `products` (การ์ดสินค้าเลือกจากคลังเรา) · แต่ละเจ้าแปลงเป็นของตัวเองตอนส่ง: **LINE** → `template buttons` / `template carousel` · **TikTok** → `title`+`body`+`product_ids` (แปลง uuid ของเราเป็น id ฝั่ง TikTok ผ่าน `marketplace_product_links.external_item_id` — ตัวที่ยังไม่ผูกก็ตกไปเฉย ๆ ไม่ล้มทั้งใบ)
  - ⛔ **ห้ามให้ผู้ใช้เลือกเป็นศัพท์ของ LINE** (`flex`/`carousel`) — แปลไปเจ้าอื่นไม่ได้ และร้านค้าไม่ควรต้องรู้ว่า LINE เรียกอะไร
  - **`validateBroadcastContent(platform, content)` ตัวเดียว หน้าจอกับ API เรียกร่วมกัน** — ผู้ใช้จึงไม่มีทางเจอกรณีที่หน้าจอบอกว่าได้แล้ว API ปฏิเสธ
  - **การ์ดสินค้าที่ไม่ใส่ลิงก์ → ปุ่มเป็น "สนใจสินค้านี้" (message action)** ลูกค้ากดแล้วข้อความเข้าห้องแชท ⇒ ใช้ได้เลยโดยไม่ต้องเปิดหน้าร้านออนไลน์ และได้บทสนทนาให้แอดมินปิดการขายต่อ (LINE บังคับว่าทุกคอลัมน์ต้องมี ≥1 ปุ่ม)
- ⚠️ **LINE นับโควตาต่อ "การส่ง 1 ครั้ง" ไม่ใช่ต่อ message object — สูงสุด 3 bubble ยังนับเป็น 1 ข้อความ** (เจ้าของยืนยัน 8 ก.ย. 2026) ⇒ การ์ดที่มีรูป+หัวข้อ+ปุ่ม **ไม่แพงกว่าส่งข้อความเปล่าเลย** (และ `template buttons` มีรูปในตัว = object เดียวด้วยซ้ำ) · ตัวเช็คโควตาที่คิด 1 ข้อความ/ผู้รับจึงถูกอยู่แล้ว · `LINE_MAX_BUBBLES = 3` กันไว้ใน `buildLineMessagesFromContent()` — **เกิน 3 เมื่อไหร่กลายเป็น 2 credit ต่อคนเงียบ ๆ**
- **ลิมิตของแต่ละเจ้าอยู่ในทะเบียน (`compose`)** — `titleMax` (TikTok 70) · `bodyMax` (LINE 5,000 · TikTok 500) · `image` · `kinds` (ชนิดที่ทำได้) · `buttonsMax` (LINE 4 · TikTok 0) · `productsMax` (LINE 10 · TikTok 4) · `quickReplyMax` (LINE 13 · เจ้าอื่น 0) — **หน้าจอกับ API อ่านชุดนี้ชุดเดียว ห้าม hardcode ซ้ำ**
- **ปุ่มตอบเร็ว (quick reply) แนบไปกับ object สุดท้าย ไม่นับเป็น bubble เพิ่ม** — LINE แสดงของ object ท้ายสุดเท่านั้น
- **ลิงก์ปลายทางของปุ่ม/การ์ด ผู้ใช้ใส่เองได้เสมอ** — จะให้ผูกกับหน้าร้านออนไลน์อัตโนมัติต้องเปิด storefront ก่อน (`companies.settings.storefront`) ซึ่ง**ยังไม่เปิดสักร้านจริง** (8 ก.ย. 2026 — เปิดอยู่แค่ "ร้านค้าทดสอบ" ที่ไม่มีสินค้า) · ลิงก์หน้าสินค้า = `storefrontUrl(cfg, slug, '/p/<product-slug>')` · **`companies.slug` เปลี่ยนเป็นชื่อร้านจริงแล้ว** (`ampstark`→`abcthebaby` · `joolz-juice`→`adayfresh`) เพราะ slug โผล่ในลิงก์ที่ลูกค้าเห็น — เปลี่ยนตอนนี้ได้เพราะ storefront ยังไม่เปิด ยังไม่มีลิงก์เก่าให้พัง
- **ยังไม่ทำ**: ต่อ Lazada/Shopee/FB/IG ตามตารางข้างบน · คูปอง — **ตั้งใจไม่ใช้คูปองของ LINE/TikTok** เพราะจะทำระบบคูปองของเราเองให้ใช้ข้ามช่องทางได้ (`coupon_ids` ของ TikTok จึงยังไม่ต่อ) · `GET /202412/performances` (ยอดอ่าน/ยอดสั่งกลับของแคมเปญ TikTok)

### Lazada Chat — IM API (เพิ่ม 2026-08-14 — Lazada integration แรกของระบบ)
- **Base layer ใหม่** [lib/lazada/api.ts](lib/lazada/api.ts): signing แบบ TOP (sort params → concat path+kv → HMAC-SHA256 **hex ตัวใหญ่**, timestamp เป็น **มิลลิวินาที**), OAuth `/auth/token/create|refresh` ที่ auth.lazada.com, `ensureValidToken(account, app)` + auto-deactivate — env: `LAZADA_SHOP_APP_KEY`, `LAZADA_SHOP_APP_SECRET` (สมัคร app ที่ open.lazada.com)
- **Dual-app รองรับแล้ว (2026-08-26)** — Lazada ให้สิทธิ์เป็น **category ต่อความสามารถ** (`Seller In-house APP` = ออเดอร์/สินค้า · `In-house IM Chat` = แชท) และ console สร้าง app ต่อ category → อาจได้ app key คนละชุด · ใส่ `LAZADA_CHAT_APP_KEY`/`LAZADA_CHAT_APP_SECRET` เมื่อได้ key ชุดที่สอง **ถ้าไม่ใส่ ทุกอย่าง fallback มาใช้คู่หลักเอง** (app เดียวถือทั้งสอง category ก็ทำงานได้ ไม่ต้องแก้ code) · token แชทเก็บใน `marketplace_accounts.chat_*` (คอลัมน์ร่วมกับ TikTok) · **ขาแชท = หน้าคั่นให้เลือก (แก้ 2026-09-07)**: จบขาออเดอร์แล้ว callback พาไป [/settings/sales-channels/connected](app/settings/sales-channels/connected/page.tsx) ที่บอกว่า "เชื่อมร้าน X แล้ว · แชทเป็นแอปแยก (AooCommerce Chat) ต้องล็อกอินอีกครั้ง" พร้อมปุ่ม **เชื่อมต่อแชทเลย** / **ไว้ทีหลัง** — เคยลองทั้ง dialog (28 ส.ค.) และเด้งไปหน้า login รอบสองทันที (2 ก.ย.) แบบหลังผู้ใช้งงว่า "เพิ่ง login แล้วทำไมให้ login อีก" (เจ้าของแจ้ง 7 ก.ย.) · ไปหน้าคั่นเฉพาะเมื่อตั้ง `LAZADA_CHAT_APP_*` แยกและยังมีร้านที่ `chat_access_token` ว่าง · TikTok ใช้หน้าคั่นเดียวกัน (`?platform=tiktok`) · ขาแชทเริ่มที่ `/api/lazada/oauth/auth-url?app=chat` จบที่ `/settings/chat-channels?lazada_chat=...#lazada` ซึ่งมีปุ่ม "เชื่อมต่อแชท" ต่อร้านด้วย (ธง `chat_connected` — ไม่ตั้ง chat app แยก = true เสมอเพราะ token หลักใช้แชทได้) · **ขาแชทล้มไม่ปิดร้าน** — `is_active=false` เกิดจากขาออเดอร์เท่านั้น · `verifyLazadaPushSignature()` ยอมรับลายเซ็นทั้งสอง app (order push + IM push ยิงมา webhook เดียวกัน)
- **OAuth**: `/api/lazada/oauth/auth-url` + `/callback` ใช้ signed state จาก [lib/oauth-state.ts](lib/oauth-state.ts) เหมือน Shopee/TikTok — account เก็บใน `marketplace_accounts` platform `'lazada'` (`shop_id` = seller_id) — เชื่อมที่ `/settings/sales-channels` แท็บ "เชื่อมต่อ Marketplace" (path เดิม `/settings/integrations` redirect มาที่นี่ — ย้ายรวมเมื่อ 2026-08-21)
- **Ingest แบบ notify-then-pull**: webhook `/api/lazada/webhook` (**ต้องตอบ 200 ใน 500ms** — ตอบทันที ทำทุกอย่างใน `after()` รวมถึง log) → payload IM ไม่มี spec แน่นอน → แค่ trigger `syncSession()`/`syncRecentSessions()` ใน [lib/services/chat/lazada.ts](lib/services/chat/lazada.ts) ดึงความจริงจาก `/im/session/*` + `/im/message/list` (idempotent, dedupe ด้วย message_id) — webhook signature: `Authorization` = HMAC(app_key + raw body)
- **Tables**: `lazada_contacts` (1 row = 1 session) + `lazada_messages` + RPC + realtime (pattern เดียวกับ shopee_)
- **ส่งข้อความ**: `/im/message/send` template_id 1=text 3=image (แนบ img_url ภายนอกได้) — direction จาก `from_account_type` (1=buyer, 2=seller)
- **ข้อความขาเข้าทุก template แปลงที่ [lib/lazada/chat.ts](lib/lazada/chat.ts) `parseLazadaMessageContent()` แล้วเติมเนื้อการ์ดที่ [lib/lazada/chat-enrich.ts](lib/lazada/chat-enrich.ts) `normalizeLazadaMessage()`** (แก้ 2026-09-07 — ของเดิมรู้จักแค่ text/image/item/order แบบผิว ๆ · รูปร่างจริงเก็บจาก API ทั้ง 5 ร้าน ~500 ข้อความ): `content` เป็น JSON string และ `ext` ข้างในเป็น JSON string อีกชั้น · template **1/4** text (bot prompt มี `ext.actionType`) · **2 หรือ `type=2` = ข้อความจากระบบ** (เตือนหลอกลวง / "ทักได้เฉพาะลูกค้าที่สั่งใน 30 วัน") → `message_type='system'` วาดเป็นชิปกลางจอ · **3** image (`imgUrl` · width/height มาเป็น string ได้) · **6** video · **10006** item (`itemId/skuId/title/price:"฿ 1,990.00"/iconUrl/actionUrl/newProduct.voucherPrice`) · **10007** order (`orderId/subOrderId/content=ชื่อสินค้า/iconUrl` · จากบอทฝั่งร้านมี `totalPrice/newOrder.orderType=ReturnOrder`) · **10008** voucher · **10010** ชวนติดตามร้าน · **10015 auto-reply ต้อนรับ — `txt` เป็น JSON i18n `{"th","en"}` ต้องแกะเอา th** · **200016 ประกาศ "Seller Engagement" จาก Lazada — `txt` เป็น HTML มี `<img>`/`<a>`** (มาใน session ที่ `from_account_type=1` เหมือนลูกค้าทัก · ฟองวาดผ่าน richText · preview ใช้ `ext.summary`) · `status=1` = เรียกคืน · template ที่ไม่รู้จักตกเป็น text พร้อม `lazada_template_id` ใน raw_message
- **การ์ดสินค้า/ออเดอร์ของ Lazada ใช้โครงเดียวกับ Shopee** (`raw_message.item` / `raw_message.order` · `order_sn` = เลขของแพลตฟอร์ม · `order_id` = uuid ออเดอร์ของเรา · `platform_url`) — หาสินค้า/ออเดอร์ของเราผ่าน [lib/marketplace/chat-enrich.ts](lib/marketplace/chat-enrich.ts) `findLinkedProduct()`/`findSyncedOrder()` (ตัวเดียวกับ Shopee) · Lazada ส่งชื่อ/รูป/ราคามาในการ์ดอยู่แล้วจึง**ไม่ต้องยิง API** เมื่อยังไม่มี link · renderer การ์ดใน `app/chat/components/renderers/ShopeeRenderers.tsx` รับ `platform` (ป้าย "ดูบน Lazada" + สีแบรนด์) ห้ามสร้างการ์ดชุดใหม่ต่อแพลตฟอร์ม
- **แถวเก่าที่ parser รุ่นก่อนบันทึกไว้ซ่อมตัวเองตอน sync** — `saveMessages` เทียบ `content`/`message_type`/การ์ด ของใบที่มีอยู่แล้วกับผลแปลงรอบใหม่ ต่างกัน = UPDATE (ไม่แตะเวลา/ทิศทาง) · **preview ในรายชื่อและแจ้งเตือนต้องผ่าน `buildMessagePreview()`** ([lib/chat/message-preview.ts](lib/chat/message-preview.ts)) ซึ่งถอด HTML/JSON i18n ให้ — ห้ามส่ง `content` ดิบขึ้นรายชื่อ (เคยเห็น `<img width="250"…` ทั้งแถว 7 ก.ย. 2026)
- **Order sync Lazada ✅ (เพิ่ม 2026-08-22)** — [lib/lazada/sync.ts](lib/lazada/sync.ts) โครงเดียวกับ TikTok: webhook order push (message_type 0) → `syncSingleLazadaOrder()` (notify-then-pull จาก `/order/get` + `/order/items/get`) · cron `/api/lazada/sync-all` ทุก 15 นาที (CRON_SECRET, ไล่จาก `last_sync_at`, **ไม่ stamp เมื่อ collect ล้ม**) · manual `/api/lazada/sync` ต่อร้าน · **สถานะ Lazada เป็นราย item** — สถานะรวม = สถานะช้าสุดของชิ้นที่ไม่ถูกยกเลิก (`effectiveLazadaStatus`) · mapping: unpaid→new/pending, pending→ready_to_ship/paid, packed/ready_to_ship*→processing/paid, shipped/delivered→shipping/paid, confirmed→completed/paid, canceled/failed/returned→cancelled · เบอร์ลูกค้า Lazada mask เป็น `66****` — ห้ามใช้ match/บันทึก (เช็คใน `findOrCreateCustomer`) · cron ตั้งครบแล้วทั้ง `sync-all` (15 นาที) และ `webhook/retry` (5 นาที)
- **Product import Lazada ✅ (เพิ่ม 2026-08-28)** — [lib/lazada/product-sync.ts](lib/lazada/product-sync.ts) + [/api/lazada/products/import](app/api/lazada/products/import/route.ts) + หน้า [/lazada/import](app/lazada/import/page.tsx) (ปุ่มอยู่การ์ดร้านใน `/settings/sales-channels`) · **`/products/get` คืนทุกอย่างในคอลเดียว** (ชื่อ ไทย/อังกฤษ · description HTML · รูป product · ทุก SKU พร้อม `saleProp`/ราคา/สต็อก/รูปของตัวเอง) → ไม่ต้องยิง detail รายตัวแบบ TikTok · แบ่งหน้าด้วย offset (limit ≤50, **offset ตันที่ 10000**) · ลำดับจับคู่เหมือน Shopee/TikTok: link เดิม → `products.code` (= SellerSku ตัวแรก หรือ `LZ-{item_id}`) → ปลุกของที่ soft-delete → สร้างใหม่ · property ของหมวดหมู่ (มีเป็นสิบตัวและต่างกันทุกหมวด) เก็บทั้งก้อนใน `marketplace_product_links.platform_data.attributes` · **Lazada ไม่มีสนาม video ตายตัว** — เก็บที่ `platform_data.video_url` เมื่อเจอ (คลังสินค้าของเรายังไม่มีคอลัมน์วิดีโอ)
- **ตั้งโลโก้ร้านเองด้วย URL** — `PATCH /api/shopee/accounts { id, shop_logo }` (ทุก platform) validate https + โหลดได้จริงก่อนบันทึก · จำเป็นเพราะ `/seller/get` ของ Lazada **บางร้านไม่คืน `logo_url` เลย** ทั้งที่ Seller Center ตั้งรูปไว้แล้ว
- ⚠️ **token ที่ได้ตอน app ยังไม่ผ่านรีวิว อายุแค่ 1 วันทั้ง access และ refresh** (ของ app ที่ผ่านแล้ว = 7 วัน / refresh 30 วัน) — refresh ตายไปด้วยจึงต่ออายุเองไม่ได้ **พอ app ผ่านแล้วต้องกด "เชื่อมต่อแชทใหม่" เสมอ** · ธง `chat_connected` ดูวันหมดอายุของ refresh token ด้วยแล้ว (ดู [fix-bug.md](fix-bug.md) 2026-09-02)
- **เปิดใช้**: สร้าง app open.lazada.com → ใส่ env 2 ตัว → เชื่อมร้านที่ Integrations → เปิดแชทรายร้านที่ `/settings/chat-channels#lazada` (เปิดครั้งแรกจะ backfill 10 sessions ล่าสุดให้) → ตั้ง Callback URL `/api/lazada/webhook` ใน Lazada Console > Push Mechanism

---

## 💳 Beam Checkout (บิลออนไลน์จ่ายบัตร/QR) — webhook + reconcile (แก้ 2026-09-06)

- **ทางเข้าเงินมี 2 ทางเสมอ**: webhook `/api/beam/webhook` (Beam push ทันที) **และ** reconcile ถาม Beam เอง ([lib/beam/settle.ts](lib/beam/settle.ts)) — หน้าบิลเรียก `POST /api/beam/reconcile {order_id}` ทันทีที่ลูกค้ากลับมาจาก Beam (`?payment=success`) · cron ตัวเฝ้าเรียก `reconcilePendingBeamPayments()` ทุก 15 นาที (แถว pending ≤3 วัน) · **ห้ามพึ่ง webhook อย่างเดียว** — มันขึ้นกับการตั้งค่าใน Beam Lighthouse ซึ่งเงียบมาทั้งเดือนโดยไม่มีใครรู้
- **"เงินเข้า → ออเดอร์ชำระแล้ว" ทำที่ `settleGatewayPayment()` ที่เดียว** (webhook + reconcile ใช้ร่วม) — idempotent · ออเดอร์ที่ร้านบันทึกชำระมือไปแล้ว → ปิดแถว gateway เป็น cancelled + จดว่า Beam ตัดเงินจริง ไม่สร้างยอดซ้ำ
- **merchant เดียวใช้ได้หลายบริษัท** — webhook ตรวจลายเซ็นด้วย HMAC key ของบริษัทไหนก็ได้ที่ตั้ง merchant นั้น (webhook ต่อ merchant มีตัวเดียว key จึงตัวเดียวกัน ตั้งไว้ที่บริษัทเดียวพอ) แล้ว**หาบริษัทจากออเดอร์** (referenceId/ลิงก์) ในขอบเขตบริษัทที่ใช้ merchant นี้ — ห้ามผูกบริษัทกับ config ที่ key ตรง (7 ก.ย. 2026)
- **webhook เลือก config จาก `merchantId` ใน body** · ตรวจลายเซ็นด้วย `payment_channels.config.webhook_secret` = **HMAC key ที่ Lighthouse ให้ตอนสร้าง webhook (คนละตัวกับ API key)** · header `X-Beam-Signature` (base64 HMAC-SHA256 ของ body ดิบ) + `X-Beam-Event` · event ที่ใช้ `payment_link.paid` (`{paymentLinkId, merchantId, status, order.referenceId}`) และ `charge.succeeded` (`source/sourceId`)
- **ทุกทางที่ webhook ปฏิเสธต้องลง `integration_logs` (integration `beam`) พร้อมบอกวิธีแก้** — เคยตอบ 401 เงียบ ๆ 3 รอบจนไล่ไม่เจอ (ดู [fix-bug.md](fix-bug.md) 2026-09-06) · watchdog issue `beam_webhook_silent` เตือนเมื่อระบบต้อง settle ผ่าน reconcile
- **event ที่รองรับ** (ติ๊กใน Lighthouse ตามรูปในหน้าตั้งค่า): `payment_link.paid` / `charge.succeeded` = จ่ายสำเร็จ → settle · `charge.failed` (+ `card_authorization.failed|canceled`) = จ่ายไม่ผ่าน → แถว gateway ติดป้าย FAILED (คง pending ลูกค้าลองใหม่ได้) + push ร้าน · `refund.succeeded|failed` = Beam คืนเงิน → ป้าย REFUNDED + push ร้าน **ไม่เปลี่ยนสถานะออเดอร์เอง** (ใบลดหนี้/คืนสต็อกเป็นเรื่องที่ร้านตัดสินใจ) · ทุกอย่างขึ้นบนหน้าออเดอร์ผ่าน `summarizeBeamRaw()` ([lib/beam/labels.ts](lib/beam/labels.ts)) ที่อ่านจาก `gateway_raw_response` (เก็บ `last_failure` / `refund` ซ้อนไว้ในก้อนเดิม) · event อื่น (bolt_intent · transaction.created · purchase V0 = API รุ่นเก่า) แค่ log
- **ค่าธรรมเนียม → `marketplace_settlements` platform `beam`** ([lib/beam/transactions.ts](lib/beam/transactions.ts)) — 1 แถว/ออเดอร์ (account null): `gross_sales` = ยอดตัดเงิน · `payment_fee` = ค่าธรรมเนียม + VAT ของค่าธรรมเนียม (จริง: RATE 2.5% + VAT 7% ของ fee ทั้งบัตรและ QR) · คืนเงิน → `adjustment` และหัก `net_payout` · บรรทัดย่อย `BEAM_FEE`/`BEAM_REFUND` เก็บ vat แยก · มาได้ 2 ทาง: webhook `transaction.created` **และ** `GET /api/v1/transactions?referenceId=<order.id>` (ตัวกรองนี้ใช้ได้จริง · `transactionType` กรองไม่ได้) ตอน settle/คืนเงิน + `backfillBeamSettlements()` ใน cron sweep · **referenceId ที่ไม่ใช่ UUID = ระบบอื่นที่ใช้ merchant เดียวกัน (aDay Fresh มี 1,400+ ใบแบบ ONL…) ข้ามเงียบ ๆ ห้าม log**
- **วงจรชีวิตลิงก์** — ลิงก์ Beam **ไม่หมดอายุเอง** จึงตั้ง `expiresAt` 30 วันตอนสร้าง และ `closeBeamLinksForOrder()` ปิด**ที่ Beam** (`PATCH …/disable`) ทุกครั้งที่ลิงก์ไม่ควรจ่ายได้แล้ว: สร้างลิงก์ใหม่ · จ่ายผ่านลิงก์อื่นสำเร็จ · ออเดอร์ชำระทางอื่น (`/api/orders` PUT payment_status paid) · ออเดอร์ยกเลิก — ปิดแค่ใน DB ไม่พอ ลูกค้าที่ค้างหน้าจอเก่าจ่ายซ้ำได้
- **เทียบยอดที่ตัดจริงกับยอดบิลเสมอ** (`paidAmount` ใน settle) — ไม่ครบ = แถวชำระบันทึกยอดจริง ออเดอร์**ไม่** paid + push `settled_partial` · เกิน = paid + push · ป้ายแดงบนหน้าออเดอร์ · เบอร์ที่ลูกค้ากรอกที่ Beam (`customer.primaryPhone`) เติมให้ออเดอร์/ลูกค้าที่ยังไม่มีเบอร์ ไม่ทับของเดิม
- เรียก Beam API ผ่าน [lib/beam/client.ts](lib/beam/client.ts) เท่านั้น (`loadBeamGateways` · `getBeamPaymentLink` · `getBeamPaymentLinkCharges`) — ห้ามประกอบ Basic auth เองใน route
- เอกสาร: https://docs.beamcheckout.com (Payment Links API · Webhook Notifications)

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
- **ตัวตนของ "ร้าน" แยกขาดจาก "บริษัท" แล้ว (2026-09-08)** — ตั้งที่ `/settings/storefront` · ทุกช่องยกเว้นชื่อลิงก์ **เว้นว่าง = ตกไปใช้ของบริษัทตอนแสดงผล ไม่ copy มาเก็บ** (copy ไว้แล้วแก้ข้อมูลบริษัททีหลัง หน้าร้านจะค้างของเก่าโดยไม่มีใครรู้):

| อยากตั้งทับ | เก็บที่ | ว่างแล้วตกไปใช้ |
|---|---|---|
| **URL ของร้าน** | **`companies.storefront_slug`** (คอลัมน์จริง unique) | **ไม่มีทางถอย — ไม่ตั้ง = เปิดร้านไม่ได้** |
| ชื่อร้าน | `storefront.display_name` | `companies.name` |
| โลโก้ | `storefront.logo_url` | `companies.logo_url` |
| คำโปรย | `storefront.tagline` | `companies.description` |
| เบอร์ / อีเมล / ที่อยู่ (ท้ายหน้าร้าน) | `storefront.contact_phone/_email/_address` | `companies.phone/email/address` |

- ⛔ **`/store/[slug]` อ่านจาก `storefront_slug` อย่างเดียว ห้ามเอา `companies.slug` กลับมาเป็นทางถอย** — `companies.slug` เป็นตัวระบุภายในที่ลูกค้าไม่เคยเห็น (ไม่มีช่องแก้ใน UI · สร้างครั้งเดียวตอนสมัคร · `PUT /api/companies` ไม่รับด้วยซ้ำ) · เคยให้มันเป็นทางถอยแล้วกลายเป็น **สอง namespace ปนกัน** ต้องคอยกันชนข้ามคอลัมน์ทุกจุดที่เขียน — ตัดออกแล้วเหลือความจริงเดียวและ unique index ของ DB กันซ้ำให้พอ
- **ไม่มีชื่อลิงก์ = เปิดหน้าร้านไม่ได้** (กันทั้งที่ toggle และที่ API) — เปิดได้แต่ไม่มีใครเข้าถึงคือสภาพที่ไม่ควรมี · หน้าตั้งค่าเติม `companies.slug` ให้เป็น **ค่าที่แนะนำ** ตอนยังไม่เคยตั้ง แก้ทับได้ก่อนบันทึก
- **ชื่อลิงก์เปลี่ยนได้ครั้งเดียวทุก 30 วัน — แต่นับเฉพาะการเปลี่ยนที่เกิดตอนร้านเปิดอยู่** (`companies.storefront_slug_changed_at` · `STOREFRONT_SLUG_LOCK_DAYS`) · ปิดร้านอยู่ = ยังไม่มีลิงก์ไหนอยู่ข้างนอก แก้คำที่พิมพ์ผิดได้อิสระ **และไม่ stamp เวลา** (stamp ตอนปิดร้านด้วย = เปิดร้านปุ๊บติดล็อกทันทีทั้งที่ยังไม่เคยส่งลิงก์ให้ใคร)
- **ช่องที่ต้องเช็คความซ้ำ ต้องบอกผลตั้งแต่ตอนพิมพ์** — `GET /api/settings/storefront/slug-check?slug=` (debounce 400ms) คืน `available/current/taken/invalid` + วันที่เหลือของล็อก → ไอคอนในช่องกรอก (หมุน/✓/✕) · **ต้องใช้กติกาชุดเดียวกับ PUT เป๊ะ ๆ** ไม่งั้นหน้าจอบอกว่าว่างแล้วบันทึกโดนปฏิเสธ
- **`StorefrontCompany.slug` = slug สาธารณะที่ใช้ประกอบลิงก์ทุกที่** (sitemap · canonical · llms.txt) ไม่ใช่ `companies.slug` ดิบ — ใช้ตัวดิบจะได้ URL ที่พาไปคนละหน้า
- `companies.slug` **ไม่มีช่องแก้ใน UI** (สร้างอัตโนมัติจากชื่อบริษัทตอนสมัคร) และไม่ต้องแก้แล้ว — อยากได้ URL สวยให้ตั้ง `storefront_slug` แทน · ที่เคยแก้ `ampstark`→`abcthebaby` เป็นการ UPDATE ตรงที่ DB

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
  | ไอคอน / ธีม | **โลโก้แดงบนพื้นขาว** (theme `#F4511E`) | **โลโก้ม่วง `#9333ea` บนพื้นขาว** (`admin-*.png`) · theme `#0f172a` |
  | manifest `scope` | `/` | `/` — **ห้ามจำกัดเป็น `/superadmin`** (ดูด้านล่าง) |
  | SW scope (แยกสายแจ้งเตือน) | `/` | `/superadmin/` |
  | ได้รับแจ้งเตือน | แชท · ออเดอร์ใหม่ · เรื่องที่ร้านแก้เอง | เรื่องระดับระบบจาก watchdog |
  - **ไอคอนทั้งสองแอป = โลโก้สีบนพื้นขาว แยกกันด้วยสีโลโก้ (แดง/ม่วง) ไม่ใช่สีพื้น** (2026-09-05) — iOS 18+ ย้อมไอคอนที่ไม่มีเวอร์ชัน dark ให้เองตอนหน้าจอโฮมเป็นโหมดมืด: พื้นกลายเป็นดำ โลโก้คงสี → ได้ "พื้นดำ+โลโก้แดง / พื้นดำ+โลโก้ม่วง" ตามต้องการโดยไม่ต้องมีไอคอน dark (PWA ส่งแยกไม่ได้อยู่แล้ว) · ⚠️ **พื้นสีอิ่มไม่รอดจากการย้อม** — เคยลองพื้นแดง+โลโก้ขาว iOS ย้อมพื้นเป็นดำเหมือนกัน (จอจริง 5 ก.ย.) อย่ากลับไปพึ่งสีพื้น · เปลี่ยนสี = แก้จานสีใน [scripts/generate-pwa-icons.mjs](scripts/generate-pwa-icons.mjs) แล้วรันใหม่
  - **กลไกที่ทำให้แยกได้**: ไฟล์ `/sw.js` ตัวเดียวกัน แต่ `register()` คนละ `scope` → เบราว์เซอร์นับเป็นคนละ registration → `pushManager.subscribe()` ได้คนละ endpoint · คอลัมน์ `push_subscriptions.audience` (`app`/`superadmin`) บอกว่าแถวนั้นเป็นของแอปไหน · `sendPushToUsers(ids, payload, { audience })` เลือกสายตอนส่ง
  - **1 เครื่องเปิดได้ทั้งสองสาย** ต้องกดเปิดแยกกัน 2 ครั้ง (สวิตช์ในกระดิ่งของแอปร้าน = สาย `app` · สวิตช์ในกระดิ่งบน header ของ shell superadmin ([SuperAdminNotificationBell](app/superadmin/components/SuperAdminNotificationBell.tsx) — โชว์ issue ของตัวเฝ้าด้วย) = สาย `superadmin`) · ⚠️ **SW ของสายไหนต้องถูกจดตั้งแต่เปิดแอป ไม่ใช่ตอนกดสวิตช์** — `pushManager.subscribe()` บน worker ที่ยังไม่ active ล้มทันที (แอปร้าน PwaRegister จดให้ · shell superadmin จดใน SuperAdminLayout) และ `enablePush` รอ active + เช็คว่าเซิร์ฟเวอร์รับ subscription จริงก่อนบอกว่าเปิดแล้ว
  - ⚠️ **`scope` ของ manifest ต้องเป็น `/` ทั้งสองแอป** — ของเดิมจำกัดแอปแอดมินไว้ที่ `/superadmin` เพื่อกันเดินหลง แต่พอ session หมดอายุ ตัวกันสิทธิ์พาไป `/login` ซึ่งอยู่นอก scope → **iOS เตะออกไปเปิดใน Safari** ซึ่งล็อกอินเป็นผู้ใช้ปกติอยู่แล้ว เลยไปโผล่หน้า "เลือกบริษัท" แล้ววนแบบนี้ตลอด (แอปที่ติดตั้งบน iOS มีถังคุกกี้ของตัวเอง แยกจาก Safari และแยกจากกันเอง — **การล็อกอินต้องเกิดในแอปเดียวกันเท่านั้น**) · scope ของ manifest **คนละเรื่องกับ scope ของ service worker** ตัวหลังต่างหากที่แยกสายแจ้งเตือน
  - **ทางที่พาออกนอกแอปได้ต้องพก `?redirect=` กลับเสมอ** — `useSuperAdminGuard` + auth-context อ่านค่านี้แล้วพากลับที่เดิม ไม่งั้นล็อกอินเสร็จไปจบที่ `/onboarding` ทุกครั้ง
  - **เลขบนไอคอนแอป = unread จริงจากเซิร์ฟเวอร์ (2026-09-07)** — `countUnreadChatForUser()` ใน [lib/push/badge.ts](lib/push/badge.ts) (ผลรวม unread_count ทุกคู่สนทนา ทุกบริษัทของผู้ใช้ = สูตรเดียวกับตัวเลขในแอป) แนบ `badge` ไปกับ push ทุกใบ (SW ตั้งตรง ๆ · FCM ใส่ `aps.badge`) และ `/api/header/summary` คืน `badgeTotal` ให้ `HeaderSummaryProvider` เรียก `syncAppBadge()` ทุกครั้งที่เลขเปลี่ยน · **ห้ามกลับไปล้างเลขตอนเปิดแอป/แตะ/แตะแจ้งเตือน** (ผู้ใช้ตีกลับว่าเปิดแอปแล้วเลขหายทั้งที่ยังอ่านไม่หมด) · SW ยังบวกหนึ่งเป็น fallback เมื่อ push ไม่มี badge
  - **เลขบนไอคอนแอปต้องเรียก Badging API เอง** — iOS/Android ไม่ได้แปะจำนวนแจ้งเตือนให้ PWA อัตโนมัติ · `sw.js` นับใน Cache API (ต่อคิวงานตัวนับเส้นเดียว กัน push 2 ใบพร้อมกันอ่านค่าเดิม) แล้ว `setAppBadge()` ตอน push เข้า — **ตั้งเลขก่อน แล้วค่อยเขียนตัวนับ** และอ่านตัวนับมี timeout 1.5 วิ (อ่านไม่ทัน = ตั้ง 1 ไปก่อน) เพราะ SW ที่ถูกปลุกจากศูนย์อาจโดนฆ่าก่อน Cache API ตอบ · **SW จดผลครั้งล่าสุดไว้** (`/__badge_last_push` = ตั้งได้ไหม/เลขอะไร · `/__badge_last_clear` = ใครสั่งล้าง: เปิดแอป/แตะ/กดแจ้งเตือน) → สวิตช์แจ้งเตือนในกระดิ่งโชว์บรรทัดสรุป + ปุ่ม "ทดสอบเลขบนไอคอน" (ตั้งจากหน้าเว็บตรง ๆ แยกว่า OS ปิดป้ายกำกับ หรือสาย push พัง) — **เลขไม่ขึ้นครั้งหน้าให้ดูบรรทัดนี้ก่อน ห้ามเดา** · **ล้างเลขเมื่อผู้ใช้ "เห็น" จริง** ใน [components/PwaRegister.tsx](components/PwaRegister.tsx): เปิดแอปใหม่ (mount) = ล้างทันที · แต่ **กลับมา visible (ปลดล็อกจอ/สลับแอปกลับ) แค่ตั้งท่ารอ แล้วล้างเมื่อแตะ/กดครั้งแรก** — เดิมล้างทันทีตอน visible ทำให้เคส "เปิดแอปค้างไว้แล้วล็อกจอ → push เข้า → ปลดล็อก" เลขหายก่อนได้เห็น = "มีบ้างไม่มีบ้าง" (4 ก.ย. 2026) · ยิง push พลาดลง `integration_logs` (`webpush`) แล้ว ขาสำเร็จไม่ log
  - **รูดลงเพื่อรีเฟรช** ([components/PullToRefresh.tsx](components/PullToRefresh.tsx) ใน Layout) — **เฉพาะ standalone** (เบราว์เซอร์มีท่าของตัวเอง เปิดซ้อนจะรีเฟรชสองรอบ) · ฟัง touch ที่ `<main>` แล้ว `location.reload()` เมื่อลากลง ≥80px (หน้าเป็น client component ที่ fetch เอง `router.refresh()` ไม่ได้ข้อมูลใหม่) · ไล่เช็คทุกกล่องที่เลื่อนได้ตั้งแต่จุดแตะถึง main ต้องอยู่ที่ยอด (scrollTop 0) · กล่องที่ไม่อยากให้ท่านี้ทำงานใส่ `data-ptr-ignore` (รายการข้อความในหน้าแชท — เลื่อนขึ้นดูของเก่าแล้วลากต่อไม่ควรรีเฟรชทิ้ง)
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
- **หน้าตาแจ้งเตือน (เปลี่ยน 2026-09-06)** — หัวข้อคือ **ช่องทาง** ไม่ใช่ชื่อคนทัก: แชท = `{ชื่อร้าน/เพจ/OA} · {แพลตฟอร์ม}` + เนื้อ `{ชื่อลูกค้า}: {ข้อความ}` · ออเดอร์ = `{ชื่อร้าน} · {แพลตฟอร์ม}` + เนื้อ `ออเดอร์ใหม่ ฿1,290 · {ชื่อลูกค้า}` (**ไม่ใส่เลขที่บิล** — กดแล้วเปิดใบนั้นอยู่แล้ว) · ไม่รู้ชื่อร้าน = เหลือชื่อแพลตฟอร์มอย่างเดียว **ห้ามเหลือหัวข้อเปล่า**
- **ไอคอนแจ้งเตือน `/api/push/icon`** — ประกอบ PNG 192px: รูปช่องทาง (โลโก้ร้าน / รูปเพจ / รูป OA) ครอบวงกลม + ตราแพลตฟอร์มมุมขวาล่าง · ไม่มีรูป → วงกลมสีแบรนด์ + ตราตัวใหญ่ · **พังเมื่อไหร่ตกไปที่ไอคอนแอปเสมอ ห้าม 500** (ไอคอนพังต้องไม่ทำให้แจ้งเตือนพัง) · แคชที่ edge ต่อร้าน (`s-maxage`) · ที่มาของรูปใช้ `resolveAccountPicture()` จาก [lib/chat/account-picture.ts](lib/chat/account-picture.ts) **ตัวเดียวกับหน้าตั้งค่าช่องทาง** · SVG โลโก้อ่านจาก `public/` จึงต้องมีชื่ออยู่ใน `outputFileTracingIncludes` ของ [next.config.ts](next.config.ts) ไม่งั้นบน Vercel หาไฟล์ไม่เจอแบบเงียบ ๆ
- ⚠️ **iOS ไม่สนไอคอนที่เราส่งไป** — แจ้งเตือนบน iPhone ใช้ไอคอนแอปเสมอ **ข้อความจึงต้องบอกช่องทางให้ครบด้วยตัวเอง** ไอคอนเป็นของแถมสำหรับ Android/เดสก์ท็อป ห้ามย้ายข้อมูลสำคัญไปฝากไว้กับรูป
- **Env 3 ตัว** (มีใน .env.local แล้ว — **ต้องเพิ่มบน Vercel ตอน deploy**): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **iOS**: push ได้เฉพาะ installed PWA (iOS 16.4+) — client.ts คืน state `ios-needs-install` ให้ UI สอนวิธี Add to Home Screen
- **ชวนติดตั้งแอป (เพิ่ม 2026-09-04)** — หน้า [/install](app/install/install-client.tsx) เป็น **public** (อยู่ใน `PUBLIC_PREFIXES` + `PUBLIC_ROUTES` ทั้งสองที่) ส่งลิงก์ให้พนักงานเปิดก่อน login ได้ · จับอุปกรณ์เองแล้วเปิดแท็บ iPhone/Android/คอม พร้อมขั้นตอน · **Android/Chrome กดติดตั้งทีเดียว** ผ่าน `beforeinstallprompt` ซึ่ง **ต้องดักไว้ใน inline script ของ [app/layout.tsx](app/layout.tsx) ก่อน React hydrate** (Chrome ยิงครั้งเดียวและเร็วมาก — ไว้ที่ `window.__aooBip` แล้ว [lib/pwa-install.ts](lib/pwa-install.ts) มารับช่วง) · เตือนเมื่อเปิดใน LINE/Facebook (ติดตั้งจากในนั้นไม่ได้) · แถบชวน [components/InstallAppBanner.tsx](components/InstallAppBanner.tsx) ใต้หัวเว็บเฉพาะ **<1024px + ไม่ใช่ standalone + ไม่ได้ปิดใน 14 วัน** ยกเว้น `/install` `/pos` `/pc` · **หน้าที่ต้องสูงเต็มพื้นที่ที่เหลือ (หน้าแชท) ห้ามคิดจาก `100dvh - <หัวเว็บ>`** — ใช้ `<Layout noPadding>` ที่ให้กล่องเนื้อหาเป็น `h-full` แล้วกล่องข้างในสูง `100%` (หัวเว็บจริง 65px ไม่ใช่ 64 · แถบชวนติดตั้งแทรกได้ · ผิด 1px ก็ทำให้ `main` เลื่อนแล้ว rubber band ดู [fix-bug.md](fix-bug.md) 2026-09-04) · แถบนี้ยังตั้ง `--app-banner-h` ไว้ให้หน้าเก่าที่ยังใช้ `calc(100vh-64px)` (fb-chat, line-chat) หักออก · `isStandalone()`/`detectPlatform()` อยู่ที่ `lib/pwa-install.ts` ที่เดียว (`lib/push/client.ts` re-export) · เบราว์เซอร์ในแอป (LINE/FB/IG/TikTok) = `detectInAppBrowser()` + `IN_APP_LABELS` ใน [lib/in-app-browser.ts](lib/in-app-browser.ts) ที่เดียว ใช้ทั้งหน้า /install (LINE ได้ปุ่ม "เปิดด้วยเบราว์เซอร์" ผ่านธง `openExternalBrowser=1`) และ `InAppBrowserNotice` หน้า login — ยุบ `getInAppBrowserName()` ที่เคยซ้ำแล้ว 2026-09-07 **ห้ามเขียน UA sniff ซ้ำ**
- proxy.ts matcher ยกเว้นไฟล์มีนามสกุลอยู่แล้ว → `/sw.js`, `/manifest.webmanifest`, `/icons/*` เป็น public โดยไม่ต้องแก้

## 📲 แอป native (เปลือก Capacitor) — `mobile/` (เพิ่ม 2026-09-07 · ยังไม่เคย build/ขึ้น store)

- **เปลือกเปิดเว็บตัวจริงใน WebView** (`server.url = https://aoocommerce.vercel.app`) — โค้ดเว็บ/API แก้แล้ว push Vercel ใช้ได้ทันที **ไม่ต้องยื่น review** · ยื่นเฉพาะตัวเปลือก (ไอคอน/splash/plugin/SDK ประจำปี) · runbook ครบใน [mobile/README.md](mobile/README.md) (บัญชี Apple/Google/Firebase · Xcode/Android Studio · TestFlight · closed testing 14 วันของ Google · review notes)
- **ฝั่งเว็บรู้ว่าอยู่ในแอปด้วย `isNativeApp()`** จาก [lib/native/bridge.ts](lib/native/bridge.ts) — เรียก plugin ผ่าน `window.Capacitor.registerPlugin()` ที่เปลือกฉีดให้ **ไม่ต้องติดตั้ง @capacitor/\* ใน repo เว็บ** (native side อยู่ใน `mobile/package.json`) · ทุกฟังก์ชันเงียบเมื่อไม่ใช่แอป
- **push ของแอป native = FCM** ทั้ง iOS/Android ([lib/push/fcm.ts](lib/push/fcm.ts) เซ็น JWT service account ด้วย jose · env `FIREBASE_SERVICE_ACCOUNT_JSON`) · `push_subscriptions.kind` = `'webpush'` | `'fcm'` (`device_token`, `platform` · endpoint = `fcm:<token>` ใช้ unique เดิม) · `deliver()` ใน [lib/push/send.ts](lib/push/send.ts) แยกทางตาม kind · **เลขบนไอคอนแอป native = จำนวนคู่สนทนาที่ยังไม่อ่านทุกบริษัทของคนนั้น ส่งมากับ push** (iOS รับแต่เลขจริง) — PWA ยังนับใน SW เหมือนเดิม
- **OAuth ในแอป**: Google/LINE เปิดใน system browser (`openInSystemBrowser`) แล้วกลับเข้าแอปด้วย Universal Link/App Link ที่ `/auth/callback` `/line-callback` — ไฟล์ [public/.well-known/](public/.well-known/) (AASA ใส่ `TEAM_ID` · assetlinks ใส่ SHA256) · `/.well-known` อยู่ใน `PUBLIC_PREFIXES` ของ proxy.ts · next.config ตั้ง content-type ให้ AASA · ยังไม่ตั้ง = login ไปจบที่ Safari
- ⚠️ **ห้ามมีปุ่มซื้อ/อัปเกรดแพ็กเกจในแอป** (Apple บังคับ IAP หัก 15–30%) · appId `com.aoocommerce.app` เปลี่ยนไม่ได้หลังขึ้น store · แอปผู้ดูแลระบบไม่ขึ้น store (ใช้ PWA ต่อ)

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
| `/api/orders/new/init` | **ลูกค้าล่าสุด 30 คน** + warehouses + sales_channels + stockConfig + default-warehouse inventory (แบ่งหน้าด้วย `fetchAllRows`) — **ไม่มี products แล้ว** | OrderForm `fetchInitBundle()` (non-marketplace path) → 1 call; fallback เป็น individual fetches ถ้า /init error · **สินค้า/ลูกค้าค้นฝั่ง server** ตอนผู้ใช้พิมพ์ (**`/api/products/search`** = RPC `search_order_products` รอบเดียว ~30KB · `/api/customers?search=`) ผ่านโหมด API ของ `ProductSearchInput`/`EntitySearchInput` |

- **ช่องค้นหาที่ค้นฝั่ง server ทุกตัวใช้ `useServerSearch`** ([lib/useServerSearch.ts](lib/useServerSearch.ts)) — seq guard · แคช 30 วิ · กรองต่อในเครื่องเมื่อพิมพ์ต่อจากคำเดิม (ชุดที่ `complete`) · พิมพ์ ≥2 ตัวอักษรค่อยยิง — **ห้ามเขียน seq/debounce/cache เองในหน้า**

⛔ **ห้ามส่งรายการทั้งตารางให้ client กรองเอง** — ร้านที่มีสินค้า/ลูกค้าหลักพันจะโดน **เพดาน 1,000 แถวของ Supabase** (ตัดเงียบ ไม่มี error) และ **4.5MB ของ Vercel** · ของที่ต้องได้ครบจริง ๆ ใช้ `fetchAllRows()` จาก [lib/supabase-paging.ts](lib/supabase-paging.ts) · ที่เหลือค้นฝั่ง server (ดู [fix-bug.md](fix-bug.md) 2026-09-07 — ร้าน 5.8k สินค้า ค้น "yoyo" ไม่เจอ)

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

### หน้าแชท `/chat` — กติกาที่ทำให้เร็วและไม่กิน server (ปรับ 2026-09-05)
ก่อนปรับ: โหลดรายชื่อ = 5–6 wave ต่อคิวไป DB · ทุกข้อความเข้า → ทุกหน้าแชทที่เปิด **ดึงรายชื่อใหม่ทั้งก้อน** + ทุกแท็บดึง header summary (9 query) · คลิกเปิดแชท = UPDATE `unread_count=0` แม้เป็น 0 อยู่แล้ว → realtime → ดึงซ้ำอีกรอบ · รูปโปรไฟล์ FB = 1 function invocation ต่อรูปต่อคน
- **`/api/chat/contacts` = 2 wave หลัง auth** — wave 1 ดึงรายชื่อ 5 แพลตฟอร์ม + `chat_accounts` + โลโก้ร้าน + แท็กของบริษัท + ยอดรวม (RPC `get_chat_contact_totals`) พร้อมกัน → เรียง/ตัดหน้า → wave 2 enrich **เฉพาะ 30 แถวที่จะส่ง** (ข้อความล่าสุด · แท็ก · สถิติออเดอร์ผ่าน RPC `get_chat_customer_order_stats` เฉพาะตอนกรอง "เชื่อมลูกค้าแล้ว"/ช่วงวันสั่ง) · ห้ามเพิ่ม wave ใหม่ต่อท้าย — ของใหม่ต้องเข้า wave ใดwave หนึ่ง
- **ข้อความตัวอย่าง ("ข้อความล่าสุด") ใช้ `buildMessagePreview()` จาก [lib/chat/message-preview.ts](lib/chat/message-preview.ts) ที่เดียว** ทั้ง API และหน้าแชท — หน้าแชท patch แถวจาก realtime payload เอง ถ้าแปลคนละแบบแถวจะกระพริบ
- **Realtime = 1 channel ต่อบริษัท + `filter: company_id=eq.` ทุก listener** (เหมือน `HeaderSummaryProvider`) · ข้อความเข้า → **patch แถวในที่** (เลื่อนขึ้นบน · +unread · เปลี่ยน preview) · ดึงรายชื่อใหม่เฉพาะเมื่อ contact ไม่อยู่ในหน้าที่โหลด หรือ `customer_id` เปลี่ยน · `totalUnread` ปรับจากส่วนต่าง `unread_count` ใน UPDATE payload
- **UPDATE ที่ค่าไม่เปลี่ยนก็ยิง realtime event** — mark-read ทุกจุดต้อง `.gt('unread_count', 0)` (services `getMessages` · `/read` · `/read-all`)
- **header summary: event จากตาราง contacts ใช้ throttle 5 วิ** (ออเดอร์ยังเป็น debounce 500ms) — ร้านคุย 250 ข้อความ/วัน × ทุกแท็บที่เปิด × 9 query
- **รูปโปรไฟล์ FB/IG ผ่าน `/api/chat/profile-picture` ต้องมี `s-maxage`** — edge ของ Vercel cache เฉพาะ response ที่มี `s-maxage` (`max-age` อย่างเดียว = browser cache ต่อคน) · key = URL (psid+account_id) จึงใช้ร่วมทั้งร้าน · ยืนยันบน production 2026-09-05: รูปเดิมครั้งแรก MISS 1.2 วิ → ครั้งต่อไป HIT 0.12 วิ โดยไม่ปลุก function · ⚠️ **Vercel กิน `s-maxage` ไว้เอง ไม่ส่งต่อให้ browser** (curl จะเห็นแค่ `max-age`) ดูว่า cache ทำงานไหมให้ดู `x-vercel-cache: HIT` · **204 ไม่ถูก cache ที่ edge** (เห็น MISS ตลอด) เหลือแค่ browser cache ต่อคน
- **ฟอร์มหนักในแผงข้าง (`OrderForm` 3.3k บรรทัด · `CustomerForm`) โหลดด้วย `dynamic()`** — `buildCustomerPayload`/`CustomerFormData` แยกอยู่ [components/customers/customer-payload.ts](components/customers/customer-payload.ts) (pure) จะได้ import ได้โดยไม่ลาก UI มาด้วย
- **ข้อความเข้าต้องไม่ทำให้ทั้งหน้า render ซ้ำ** (เพิ่ม 2026-09-08) — 3 ชั้นที่ต้องอยู่ครบ ขาดชั้นใดชั้นหนึ่งอีกสองชั้นก็ไร้ผล: (1) `handleContactChange` **patch `selectedContact` เฉพาะเมื่อค่าเปลี่ยนจริง** (คืน `prev` เดิม) — object ใหม่ทุก UPDATE = ทั้งหน้า render และมันมาทุกข้อความเพราะ `unread_count`/`last_message_at` วิ่งทางเดียวกัน (2) แผงเปิดบิล = [ChatOrderPanel](app/chat/components/ChatOrderPanel.tsx) ที่ `memo` (3) [MessageBubble](app/chat/components/MessageBubble.tsx) ที่ `memo` · ⚠️ **ส่ง object ทั้งก้อน (เช่น `selectedContact`) หรือ inline lambda เข้า component พวกนี้เมื่อไหร่ memo ไร้ผลทันที** — callback ต้อง identity คงที่ผ่าน [useStableCallback](lib/useStableCallback.ts) หรือ `useCallback` deps ว่าง (`openLightbox` เคยผูกกับ `mediaList` ซึ่งคิดจาก `messages` จึงเปลี่ยนทุกข้อความ = ฟองทุกใบ render ใหม่พอดีตอนที่ memo ควรช่วยที่สุด) · วัดผลจริงแล้ว: ข้อความเข้า 1 ใบ เดิม = ฟองทุกใบ + แผงเปิดบิล + OrderForm render ใหม่ทั้งหมด · หลังแก้ = เฉพาะฟองใบใหม่
- **ร่างบิลต่อห้องแชท** (เพิ่ม 2026-09-08) — [lib/order-draft.ts](lib/order-draft.ts) key `chat-order-draft:<company>:<contact>` ใน localStorage **อายุ 24 ชม.** · `OrderForm` รับ `draftKey` = เปิดโหมดนี้ (**ไม่ส่ง = ไม่มีเรื่องร่างเลย** ทุกหน้าเดิมทำงานเหมือนเดิม · โหมดแก้ไขไม่มีร่างเสมอ) · **กู้ร่างหลัง `/init` เสร็จ + เลือกลูกค้าเสร็จเท่านั้น** เพราะ `handleSelectCustomer` prefill ที่อยู่/ภาษีทับทุกช่อง — กู้ก่อนแล้วของที่กรอกหายเกลี้ยง (จึงยุบ effect preselected กับ effect กู้ร่างเป็น flow เดียว) · ล้างเมื่อ**บันทึกบิลสำเร็จ** หรือกด "ล้างร่าง" · **ไม่ล้างตอนปิดแผง (ตั้งใจ — นั่นคือจุดประสงค์ทั้งหมด)** · เก็บเฉพาะสิ่งที่ผู้ใช้กรอก — **ห้ามใส่ `inventoryMap`/ผลค้นหา/รายการอ้างอิง** (สต็อกต้องสดเสมอ ไม่งั้นกู้ร่างเก่ามาแล้วขายเกินจำนวนจริง)
- RPC ค้นหา `search_*_contacts` มี `LIMIT 100` — route enrich ทุกแถวที่ RPC คืน · `/api/chat-accounts` + `/api/settings/crm` cache 60 วิใน `apiFetch`
- **เปิดห้องแชทต้องขึ้นทันที (แก้ 2026-09-08)** — DB ของ `/api/chat/messages` แค่ ~4.5ms ที่ช้าคือ cold start + รอบเดินทาง: (1) **prefetch ตอนเมาส์ชี้รายชื่อ** (`prefetchMessages` → `apiFetch` cache 20 วิ · `CACHED_GET_PATHS` มี `/api/chat/messages?`) คลิกแล้วใช้ผลเดิม · realtime ข้อความใหม่ของห้องไหน `invalidateApiCache('/api/chat/messages?contact_id=<id>')` ทิ้ง (2) GET เป็น **`peek=1` เสมอ** (ทั้ง prefetch และคลิก — URL ต้องตรงกันถึงใช้ cache ร่วมได้) `getMessages({ markRead: false })` ไม่ mark read · เปิดอ่านจริงค่อย `POST /api/chat/contacts/[id]/read` เฉพาะเมื่อมีเลขค้าง (3) route ใช้ **`getChatServiceLazy()`** ([lib/services/chat/registry.ts](lib/services/chat/registry.ts) dynamic import เฉพาะแพลตฟอร์ม) แทน `getChatService()` ของ index.ts ที่ import ครบ 5 เจ้า และ `sharp` ใน line.ts โหลดตอนย่อรูปเท่านั้น — cold start ไม่ต้องประเมิน Shopee/Lazada/TikTok/sharp เพื่ออ่านข้อความ LINE (4) ระหว่างโหลดใช้ `SkeletonChat` (ฟองซ้าย/ขวา) ไม่ใช่ spinner · **ห้ามเอา mark read กลับเข้า GET** ไม่งั้น hover จะล้างเลขค้างของห้องที่ยังไม่ได้เปิด

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
- **Tab "แท็กลูกค้า"** ([/settings/tags](app/settings/tags/page.tsx) · [TagManager](components/customers/TagManager.tsx)) — จัดการแท็กที่ใช้ร่วมกันทั้งหน้าลูกค้าและหน้าแชท (ย้ายมาจาก Modal ในหน้า /customers 2026-09-06) · แท็บของหมวดนี้อยู่ที่เดียวใน [components/settings/GeneralSettingsTabs.tsx](components/settings/GeneralSettingsTabs.tsx) · สิทธิ์ `masterdata.tags` (ADMIN) สำหรับแก้/ลบ ส่วนสร้างเปิดให้ทุกคนผ่าน quick-add ใน `TagInput`
- **ติด/ปลดแท็กต้องส่ง diff ผ่าน [lib/tag-links.ts](lib/tag-links.ts) (`PATCH {add, remove}`) ห้าม PUT ทั้งชุด** — replace-all จาก snapshot ฝั่ง client เคยลบแท็กของคนอื่นเงียบ ๆ (ดู [fix-bug.md](fix-bug.md) 2026-09-06) · baseline ของ diff = ชุดที่เซิร์ฟเวอร์ยืนยันเท่านั้น

Sidebar entry "ทั่วไป" link ไป `/settings/company` (= tab แรก) — active state ครอบ `/settings` · `/settings/company` · `/settings/tags` (เพิ่มแท็บใหม่ต้องเพิ่มที่นี่ด้วย)

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
