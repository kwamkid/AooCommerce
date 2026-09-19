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

## 🔣 ไอคอน — ทะเบียนกลาง [lib/icons.ts](../../lib/icons.ts) (บังคับ)

**หนึ่งความหมาย = หนึ่งไอคอน ทั้งระบบ** · เมนูข้าง หน้า list หน้าฟอร์ม โมดัล ต้องใช้ตัวเดียวกัน

```tsx
import { ProductIcon, CategoryIcon, AddIcon } from '@/lib/icons';
<ProductIcon className="w-4 h-4" />
```

- ⛔ **ห้าม `import { Package } from 'lucide-react'`** ในหน้า/คอมโพเนนต์ — ESLint (`no-restricted-imports` ใน [eslint.config.mjs](../../eslint.config.mjs)) จะ error ทันทีสำหรับไอคอนทุกตัวที่ทะเบียนถืออยู่แล้ว
- อยากเปลี่ยนไอคอนสินค้าทั้งระบบ = แก้บรรทัดเดียวใน `lib/icons.ts`
- ตั้งชื่อตาม **ความหมาย** ไม่ใช่ชื่อรูป (`CouponIcon` ไม่ใช่ `TicketIcon`) · ความหมายใหม่ที่ยังไม่มี → เพิ่มในหมวดที่ตรงของ `lib/icons.ts` แล้วใช้ชื่อนั้นทุกที่
- ไอคอนที่เป็นภาพประกอบเฉพาะหน้าจริง ๆ (ใช้ครั้งเดียว ไม่ได้แทน "ของ" ในระบบ) import จาก lucide ตรงได้
- คู่ที่ชนกันบ่อย — `ProductIcon` (ตัวสินค้า) ≠ `ParcelIcon` (กล่องที่จะส่ง) · `CategoryIcon` (หมวดหมู่) ≠ `TagIcon` (ป้ายกำกับ) ≠ `PromotionIcon` (โปรโมชั่น) · `CustomerIcon` (ลูกค้า) ≠ `UserIcon` (คนทั่วไป) ≠ `MemberIcon` (สมาชิกในทีม)
- โลโก้แพลตฟอร์ม (LINE/FB/IG/TikTok/Shopee/Lazada) ใช้ [PlatformIcon](../../components/ui/PlatformIcon.tsx) ไม่ใช่ทะเบียนนี้

## 🛍 การแสดงผลสินค้า — ตัวกลาง [lib/product-display.ts](../../lib/product-display.ts) + 4 component (บังคับ)

**รูป · ชื่อ · SKU/บาร์โค้ด · ราคา ของสินค้า ต้องผ่านของกลางเสมอ** — ห้ามประกอบเองในหน้า

| ต้องการ | ใช้ |
|---|---|
| ช่อง "สินค้า" ในตาราง/การ์ด (รูป+ชื่อ+รหัส/SKU) | `<ProductCell item={x} />` |
| ชื่อสินค้าอย่างเดียว | `<ProductName item={x} />` |
| ราคา (ลดแล้ว + ราคาปกติขีดฆ่า) | `<ProductPrice item={x} />` |
| รูปย่ออย่างเดียว | `<ProductImageThumb src={fullUrl} size="md" />` |
| ข้อความ (PDF · Excel · title) | `productDisplayName(x)` · `productSubtitle(x)` · `sellingPrice(x)` |

- **ตัดบรรทัด**: `<ProductName>`/`<ProductCell>` ตั้งต้น **2 บรรทัด** (`line-clamp-2`) · ช่องที่กว้างจริง ๆ หรือแถวที่ต้องสูงเท่ากันส่ง `lines={1}` · ใบเสร็จ/หน้ารายละเอียดที่ต้องเห็นชื่อเต็มส่ง `lines={0}`
- **ตัวคั่นชื่อกับตัวเลือก** = `VARIATION_SEPARATOR` (` - `) ตัวเดียวทั้งระบบ — ห้ามเขียน `— ` / ` (…)` เองอีก
- **รูป**: ส่ง **URL เต็ม** เข้า `src` เสมอ (คอมโพเนนต์ย่อเองด้วย `thumbUrl()`) — กดขยายแล้ว lightbox แสดงรูปเต็มขนาดจาก URL เดิม · ห้ามส่งรูปที่ย่อมาแล้ว
- **ราคาขายจริง** = `sellingPrice(v)` (มีส่วนลดใช้ส่วนลด) — ESLint บล็อกการเขียน `discount_price > 0 ? …` เองแล้ว · ราคานี้คือราคาที่ push ขึ้น marketplace ด้วย
- **ดูรูปเต็มจอ** ใช้ [ImageLightbox](../../components/ui/ImageLightbox.tsx) เสมอ (รูปสินค้า · สลิปโอนเงิน · รูปถ่ายการรับสินค้า) — `<ProductImageThumb>` เรียกให้เองอยู่แล้ว · โมดัลที่มี **ปุ่มให้ตัดสินใจ** (อนุมัติ/ปฏิเสธสลิป) ไม่ใช่ lightbox ให้ใช้ `Modal` กลาง · แกลเลอรีที่เลื่อนซ้ายขวา/มีวิดีโอเป็นคนละตัว (`app/chat/components/LightboxViewer` · `ImageUploader`)
- ยกเว้นที่ยังเขียน `<img>` เองได้: หน้าร้านออนไลน์ (`components/storefront/**` มีดีไซน์ของตัวเอง) · ตัวอย่างข้อความในบรอดแคสต์/แชท (จำลองหน้าตาแอปอื่น) · การ์ดสินค้าใน POS (`ProductGrid` เป็นไทล์เต็มใบ ไม่ใช่รูปจิ๋ว)

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

## กับดักของหน้าจอที่เจอซ้ำ (เพิ่ม 2026-09-18)

- ⛔ **`window.scrollTo` ไม่มีผลในแอปนี้** — ตัวที่เลื่อนคือ `<main>` ของ [Layout](../../components/layout/Layout.tsx) (`overflow-y-auto`) ไม่ใช่ window · เลื่อนขึ้นหัวหน้าใช้ `document.querySelector('main')?.scrollTo({ top: 0 })` (เจอตอนวิซาร์ดข้ามขั้นแล้วค้างกลางหน้า)
- ⛔ **คลาสของ design system ใน `globals.css` ชนะ utility ของ Tailwind** — `.card { background-color:#fff }` ทับ `bg-orange-50` เงียบ ๆ · จะเปลี่ยนสีการ์ดเป็นรายจุดต้องใส่ `!` นำ (`!bg-orange-50/60 !border-primary`) หรือเพิ่มคลาสใหม่ใน `globals.css`
- **ชิปของ `MultiSelectSearch` เป็นโทนเขียว ห้ามเปลี่ยนกลับเป็นส้ม/แดงของแบรนด์** — ชิปคือ "ค่าที่เลือกไว้แล้ว" แต่โทนแดงทำให้ผู้ใช้อ่านเป็น error (เจ้าของท้วง 18 ก.ย. 2026) · ในหน้าเดียวกันให้สีสื่อความหมายชุดเดียว: **เขียว = เรียบร้อย/เลือกแล้ว · เหลือง = ยังต้องทำ · แดง = ผิดจริงเท่านั้น**

## ฟอร์มยาว ๆ ที่ผู้ใช้ต้องไล่แก้ทีละรายการ (บทเรียนจากวิซาร์ดส่งสินค้าขึ้นร้าน 2026-09-18)

- ⛔ **ห้ามเอาการ์ด/แถวออกจากจอทันทีที่ผ่านเกณฑ์** — ผู้ใช้กำลังพิมพ์อยู่แล้วของหายใต้มือ ตกใจและหาที่ที่ค้างไว้ไม่เจอ · ให้เปลี่ยนสี/ป้ายบอกว่าผ่านแล้วแต่คงตำแหน่งไว้ แล้วให้ผู้ใช้ **กดเก็บเอง** (ชิปกรองซ้ำ / ปุ่มเก็บกวาด)
- **สถานะต้องอ่านจากพื้นการ์ด ไม่ใช่จากป้ายเล็ก ๆ** — ยังขาด = พื้นเหลือง · ครบแล้ว = พื้นเขียว กวาดตาทีเดียวรู้ว่าเหลือกี่ตัว
- **ค่าที่ตั้งทีเดียวได้ทั้งชุด ต้องแยกกล่องและแยกสีจากของรายตัว** + ปุ่ม "เติมให้ทุกรายการ" อยู่**ล่างสุดของกล่องเสมอ** (ฟิลด์ที่งอกตามหมวดหมู่จะดันปุ่มให้ลอยกลางกล่อง)
- **ปุ่มสลับกาง/ย่อ ต้องหน้าตาเดียวกันทุกแถว** — คำที่สลับไปมา ("ย่อ"/"แก้") ทำให้ดูเหมือนคนละปุ่มคนละหน้าที่ · ใช้ลูกศร ▲/▼ + คำเดียวกัน
- **ตัวนับ/เพดานที่ผู้ใช้ต้องทำให้ถึง ต้องเห็นตลอดเวลาที่พิมพ์** (`21/25 ตัวอักษร` แดง→เทา) ไม่ใช่โผล่เฉพาะตอนผิดหรือตอนผ่าน
- **ตัวเลขในวงเล็บต้องบอกว่าตัวเลขของอะไร** — `ร้าน A (15)` ไม่มีใครเดาถูก ให้เขียน `ร้าน A — มีข้อมูล 15 จาก 29 รายการ`

## หน้าที่คุมธีมเอง (บิลออนไลน์ · พอร์ทัลคู่ค้า · หน้ารับของด้วยลิงก์) — 2026-09-19

- **ต้องเรียก `useStandaloneTheme(dark)`** ([lib/use-standalone-theme.ts](../../lib/use-standalone-theme.ts)) ทันทีที่มี state ธีม — sync class `dark` บน `<html>` ให้ตรงกับที่หน้าแสดงจริง แล้วคืนค่าเดิมตอนออก · component กลางทุกตัว (`Badge` `Button` `Stepper` `ProductCell` …) ได้สีถูกเองทั้งหมด
- ⛔ **ห้ามระบายสีเองด้วย `dark ? 'a' : 'b'`** — ใช้ `x dark:y` ตามปกติ (กวาดออกไป 406 จุดแล้ว เหลือ 62 จุดที่เป็น inline style/ตัวสลับธีม) · `Stepper` prop `dark` เป็น deprecated
- ผลพลอยได้: หน้าพวกนี้ใช้ `ProductCell`/ของกลางได้แล้ว — ตารางสินค้าใน portal ที่ยังวาดเอง 5 ไฟล์ ย้ายได้เมื่อแตะ
- **ไม่มี `window.print()` ในระบบแล้ว** — ทุกเอกสารเป็น PDF (ดู [domains/pdf.md](domains/pdf.md)) · `@media print` ใน globals.css เหลือแค่ `.print\:hidden` กับกฎใบเสร็จ POS ที่ครอบ `body:has(#receipt-content)` (สำรองสำหรับ Cmd+P) — ห้ามเขียน print CSS แบบซ่อนทั้งหน้าอีก
