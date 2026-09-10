---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "app/globals.css"
---
# Design System + Standard Layout & Styling — อ่านก่อนสร้างหน้าใหม่

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 🎨 Design System — **อ่านก่อนสร้างหน้าใหม่!**

### Reference templates (copy structure ได้เลย)
- **[app/dev/demo/page.tsx](../../app/dev/demo/page.tsx)** — Sales Dashboard ใช้ทุก shared component จริง (KPI Stat, BarChart, Sparkline, ProgressBar, DataTable, Card, Container, Badge, FormSelect, ExportButton). **ใช้เป็น template ตอนสร้าง dashboard / list page ใหม่**
- **[app/dev/design/page.tsx](../../app/dev/design/page.tsx)** — showcase ทุก variant ของ Button/Card/Badge/Alert/Modal/DataTable/FormInput. **ดูก่อนเลือก variant**
- **[.claude/rules/code-simplicity.md](../../.claude/rules/code-simplicity.md)** — รายการ shared comp + global CSS ครบ + ห้ามสร้างซ้ำ

### Shared components ใน `components/ui/` (20 ตัว — ใช้แทน inline class เสมอ)

| Component | ใช้สำหรับ |
|---|---|
| `Button` | ทุกปุ่ม — variants: primary/secondary/ghost/danger/success/indigo/amber, sizes: sm/md/lg |
| `ExportButton` / `ImportButton` | ปุ่ม export/import — icon (Upload/Download) baked ห้ามใช้ผิด |
| `SaveButton` | ปุ่มบันทึกทุกฟอร์ม/โมดัล — คำว่า "บันทึก" + icon Save baked ห้ามประกอบเอง (ยกเว้นปุ่ม record-payment เช่น "บันทึกชำระ") |
| `Card` | bg-white shadow box — padding: none/sm/md/lg, flat? |
| `Container` | page wrapper — size: full/2xl/4xl/5xl/6xl, gap: none/sm/md/lg |
| `Badge` | tag/pill — tones: gray/red/amber/emerald/blue/indigo/purple/orange, shape: pill/square, size: sm/md |
| `Alert` | banner เตือน — tones: danger/warning/info/success, มี icon + title? + onClose? |
| `PageHeader` | sub-page header — title + subtitle + backHref + actions slot |
| `Modal` | dialog — sizes: sm…4xl, footer slot, ESC + backdrop close |
| `Tabs` | segmented content tabs (รางเทา + แท็บที่เลือกเป็นการ์ดขาว · `fill` · `size="sm"`) — `tabs={[{key,label,icon?,count?,href?,activeColorClass?}]}` + activeKey + onSelect (state-based) หรือ href (Link-based) |
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
⚠️ **ห้ามเขียนหัวข้อหน้าเองด้วย `<h1>`** ไม่ว่าจะ `heading-1` หรือ `text-3xl font-bold` — ทุกหน้าใช้ `PageHeader` ตัวเดียว (แก้ขนาด/ระยะที่ [components/ui/PageHeader.tsx](../../components/ui/PageHeader.tsx) ที่เดียว)

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

### สถานะ (คำเรียก + สี + ไอคอน) — ทะเบียนกลาง [lib/status-labels.ts](../../lib/status-labels.ts)
ทุก badge สถานะทั้งระบบใช้ `<StatusBadge domain="…" status={…} />` ตัวเดียว — ส่ง 2 ค่าแล้วได้คำเรียก+สี+ไอคอนครบ
- **คำเรียก + ชื่อสีเชิงความหมาย** → `lib/status-labels.ts` (21 โดเมน · client-safe · PDF เรียกได้)
- **ค่าสีจริง** → ตัวแปร `--st-*` + คลาส `.badge-st-*` ใน [globals.css](../../app/globals.css) (`.st-dark` = สลับชุดมืดให้หน้าที่มีสวิตช์ธีมเอง เช่นบิลออนไลน์)
- **ไอคอนประจำโดเมน** → `DOMAIN_ICON` ใน [components/ui/StatusBadge.tsx](../../components/ui/StatusBadge.tsx)
- **ป้ายที่ไม่ใช่สถานะ** (กำหนดส่ง/ขนส่ง/บทบาท/สถานะดิบของ marketplace) → `InfoChip` จากไฟล์เดียวกัน
- ⛔ **ห้ามทำ map สถานะแบนใบเดียวทั้งระบบ** — key ชนกันข้ามตาราง: `draft` = "แบบร่าง" (ใบวางบิล) แต่ = "ที่ต้องจัดส่ง" (ออเดอร์ห้าง) · `pending` = "ที่ต้องจัดส่ง" (ใบเติมของ) แต่ = "รอชำระ" (การชำระเงิน) · `sent` = "รอชำระ" (ใบวางบิล) แต่ = "แจ้ง Sup แล้ว" (ใบสั่งซื้อ)
- ⛔ **ห้ามประกาศ `STATUS_CONFIG`/`STATUS_LABELS`/`statusBadge()` ในหน้าใด ๆ อีก** — เพิ่มโดเมนในทะเบียนแทน
- **หน้าที่ลูกค้าเปิดเองใช้คนละชุดคำ** (`customerOrder`/`customerPayment`) — "รอกดรับ" ของพนักงาน = "รับคำสั่งซื้อแล้ว" ของลูกค้า ห้ามสลับกัน

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

