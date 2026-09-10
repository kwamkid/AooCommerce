---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "lib/**/*.tsx"
  - "lib/use*.ts"
  - "app/globals.css"
---
# Code Simplicity & Reuse Rules

> แยกเป็น 3 ไฟล์ 2026-09-10 (ลด token): UI/hooks/CSS = ไฟล์นี้ · services/utilities/API routes = [lib-services.md](lib-services.md) · สิทธิ์ = [permissions.md](permissions.md)

## Core Principle
เขียน code ให้ simple ที่สุด โดยใช้ shared resources ที่มีอยู่ให้ได้มากที่สุด
ถ้าข้อมูลส่วนใหญ่เหมือนกัน ต้องใช้ component/hook/service เดียวกัน — **ห้ามสร้างใหม่ซ้ำซ้อน**

---

## 1. Shared UI Components (`components/ui/`)

### Layout Primitives — **ใช้แทน inline class ทุกครั้ง** (เพิ่ม 2026-05-27)
> 📐 **Reference**: [/dev/design](../../app/dev/design/page.tsx) — Showcase ทุก variant
> 🧪 **Demo**: [/dev/demo](../../app/dev/demo/page.tsx) — Sales Dashboard ใช้ทุก component (copy structure เป็น template ได้)

| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| ปุ่ม (primary/secondary/ghost/danger/success + sizes + loading + icon) | `Button` | inline `<button className="bg-[#F4511E]...">` |
| ปุ่ม Export / Import — **กัน icon สลับ** | `ExportButton` / `ImportButton` | สร้าง Button + Upload/Download icon เอง (สลับบ่อย!) |
| ปุ่มบันทึกฟอร์ม/โมดัล — **คำว่า "บันทึก" + icon Save baked** | `SaveButton` (กวาดทั้งระบบแล้ว 2026-08-21) | `<Button variant="primary">บันทึก</Button>` ประกอบเอง · label แปลกๆ ("บันทึกข้อมูล", "บันทึกการแก้ไข") — ปุ่ม record-payment (บันทึกชำระ/บันทึกยอด) เท่านั้นที่ยกเว้น |
| Card / surface (white shadow box) | `Card` (padding: none/sm/md/lg) | inline `<div className="bg-white rounded-lg shadow-sm p-X">` |
| Container / page max-width wrapper | `Container` (size: sm…6xl/full + gap) | inline `<div className="max-w-5xl space-y-6">` |
| Badge / tag (8 tones × pill/square × sm/md) | `Badge` | inline `<span className="bg-X-50 text-X-700 px-2 py-0.5 rounded-full">` |
| Badge แสดง **สถานะ** (ทุกโดเมน) | **`StatusBadge`** — `<StatusBadge domain="statement" status={x} />` ส่งแค่ 2 ค่าแล้วได้ **คำเรียก + สี + ไอคอนประจำโดเมน** ครบ · โดเมนที่มี: `order · orderDealer · payment · customerOrder · customerPayment · statement · replenishment · deptOrder · report · creditNote · creditNoteType · returnNote · promotion · transfer · stockDoc · posOrder · purchaseOrder · purchaseOrderSupplier · supplierReport · supplierType · broadcast` · props เสริม `size` `hideIcon` `trailing` | ประกาศ map คำเรียก/สีสถานะในหน้า (`STATUS_CONFIG`, `STATUS_LABELS`, `statusBadge()`) · เรียก `getBadgeColor()` มาทำ badge เอง · ใช้ `<Badge tone>` กับสถานะ (คนละพาเลต) — **เคยเพี้ยน 20+ จุดจริง** ดู fix-bug.md 2026-09-08 |
| ทางลัดของคู่ที่ใช้บ่อยสุด | **`OrderStatusBadge` / `PaymentStatusBadge`** ([components/ui/OrderStatusBadge.tsx](../../components/ui/OrderStatusBadge.tsx)) — `dealer` ออเดอร์ตัวแทน/ห้าง · `audience="customer"` หน้าที่ลูกค้าเปิด · `expired` บิลหมดอายุ (แดง ไม่ใช่เทา) | เขียน `<StatusBadge domain="order" …>` เองซ้ำ ๆ ในหน้า |
| ป้ายที่ **ไม่ใช่สถานะ** (กำหนดส่ง · ชื่อขนส่ง · บทบาทผู้ใช้ · สถานะดิบของ marketplace) | **`InfoChip`** จากไฟล์เดียวกัน — ทรงเดียวกับ badge แต่ส่งสีเองได้ | ยัดของพวกนี้เข้าทะเบียนสถานะ · หรือกลับไปเขียน `<span rounded-full …>` เอง |
| **สถานะใหม่ / คำเรียกใหม่ / โดเมนใหม่** | เพิ่มที่ [lib/status-labels.ts](../../lib/status-labels.ts) **ที่เดียว** (ทะเบียนกลาง: คำเรียก + ชื่อสีเชิงความหมาย) · ค่าสีจริง = ตัวแปร `--st-*` + คลาส `.badge-st-*` ใน globals.css · ไอคอนต่อโดเมน = `DOMAIN_ICON` ใน `StatusBadge.tsx` | ⛔ ห้ามทำ map สถานะแบนใบเดียวทั้งระบบ — key ชนกันข้ามตาราง (`draft` = "แบบร่าง" ที่ใบวางบิล แต่ = "ที่ต้องจัดส่ง" ที่ออเดอร์ห้าง · `pending` = "ที่ต้องจัดส่ง" ที่ใบเติมของ แต่ = "รอชำระ" ที่การชำระเงิน) |
| Page header (back + title + subtitle + actions) | `PageHeader` | inline header layout ทุกครั้ง — **เมื่อใช้ PageHeader ห้ามใส่ `title`/`breadcrumbs` ใน `<Layout>` อีก** (จะ duplicate) |
| Content tabs (**segmented control** — รางเทามุมมน + แท็บที่เลือกเป็นการ์ดขาวลอย · ไม่มีเส้นใต้แล้ว) | `Tabs` (state-based via `onSelect` หรือ route-based via `href`) · `fill` แบ่งเต็มแถว (POS มือถือ/หน้า PC) · `size="sm"` แท็บย่อยในการ์ด · `iconPosition="top"` · `activeColorClass` · ⚠️ แถบที่วาง Tabs ห้ามมี `bg-white` ของตัวเอง (ทับรางเทาจนการ์ดขาวจมหาย) | เขียนแท็บเอง (กวาดเหลือ 0 จุดแล้ว 2026-09-08) — **อย่าสับสนกับ `StatusTabs`** ที่ใช้สำหรับ list-page filter (count ใหญ่ + solid pill) — ห้ามรวมสองตัว |
| Social platform icon (FB / LINE / IG / TikTok / Shopee / Lazada) | `PlatformIcon` (`id`, `size`, `title`, **`mono`** = สีเดียวตาม currentColor สำหรับปุ่ม primary/พื้นสี) | inline `<Image src="/social/X.svg">` — **ห้ามสร้าง local FbIcon/LineIcon/IgIcon helper** ในแต่ละหน้า (duplicated 3 ครั้งแล้วต้อง refactor) |
| เลือกช่องทาง/บัญชี (รูปโปรไฟล์ + ค้นหา) | **`AccountPicker`** — ปุ่ม + ป๊อปอัป · `multiple` เลือกหลายอัน/อันเดียว · `allOption` แถว "ทุกช่องทาง" · `disabled`+`disabledReason` ต่อแถวสำหรับช่องทางที่ยังใช้ไม่ได้ · รูปวาดด้วย `ChannelBadge` (มี fallback ให้แล้ว) — **ใช้ทั้งหน้าแชทและหน้าสร้างบรอดแคสต์** | เรียงรายการติ๊กลงมาทั้งหมด (ร้านเดียวมีได้หลายสิบบัญชี — ABC the Baby มี FB 7 เพจ · Shopee 6 ร้าน) · เขียนป๊อปอัปเลือกบัญชีเองในหน้า · **ซ่อนช่องทางที่ใช้ไม่ได้ทิ้ง** (ผู้ใช้จะถามซ้ำว่าทำไมไม่มี Shopee — โชว์แบบกดไม่ได้พร้อมเหตุผลแทน) |
| Avatar ช่องทางขาย + ตัวห้อย platform icon (แสดงที่มาของ order — ทุก platform รวม Shopee/TikTok/Lazada) | `ChannelBadge` (`channel={platform, picture_url}`) + `PLATFORM_ICONS` map จากไฟล์เดียวกัน | สร้าง badge/overlay เอง หรือประกาศ PLATFORM_ICONS ซ้ำ (เคยอยู่ใน app/orders/components/types.ts แล้วขาด tiktok/lazada) |
| Dropdown/popover ที่ต้อง "พลิกขึ้นเมื่อที่ว่างข้างล่างไม่พอ" | **`useDropUp(triggerRef, {...})`** จาก [lib/useDropUp.ts](../../lib/useDropUp.ts) (คืน `dropUp` + `rect` + `height` จากการวัดครั้งเดียว) หรือ `shouldDropUp(rect, h, opts)` เมื่อ component วัดตำแหน่งเองอยู่แล้ว · dropdown ที่วางแบบ portal (`fixed`) ใส่ **`recalcOnScroll: true`** ด้วย ไม่งั้นเลื่อนหน้าแล้วกล่องลอยค้างแยกจากช่อง | คำนวณ `window.innerHeight - rect.bottom` เองในแต่ละ component (เคยซ้ำ 3 ที่แล้วเกณฑ์ไม่ตรงกัน — FormSelect/MonthYearPicker/ThaiAddressInput) |
| แถบขั้นตอน (checkout หลายหน้า · wizard ในหน้าเดียว · ติดตามสถานะออเดอร์) | **`Stepper`** (`steps=[{key,label,note?,state:'done'\|'current'\|'todo',href?}]`) — ข้ามหน้าใช้ `href` · เปลี่ยนขั้นในหน้าเดียวใช้ `onSelect` (ขั้น done กลายเป็นปุ่ม) · หน้าตา/สีอยู่ `.stepper*` ใน globals.css ที่เดียว | สร้าง step bar/progress ใหม่ (เคยมี 2 ตัวแล้วหลุดกัน — ยุบเหลือตัวนี้แล้ว) · ผูกสีแบรนด์ร้าน (ภาษาความคืบหน้าต้องหมายถึงสิ่งเดียวกันทุกที่) |
| หน้าจอขายแบบ POS (product grid + ตะกร้า + barcode/กล้องสแกน + mobile tab) | `PosSaleScreen` (`components/pos/`) — props `warehouseId`/`topBar`/`onCheckout` + ref `clearCart()`/`refreshProducts()` + `enablePromotions?`/`extraProductParams?` | copy โค้ดหน้า `/pos` ไปแก้ — `/pos` (session+ชำระเงิน+ใบเสร็จ) และ `/pc` (บันทึกยอด PC ไม่จับเงิน) ห่อ component เดียวกันอยู่แล้ว |
| Loading **ชั้น 1** — ยังไม่รู้ว่าใคร/บริษัทไหน (เปิดเว็บครั้งแรก, refresh, สลับบริษัท, กลับจาก OAuth) | `FullPageLoading` (from `Loading.tsx`) — splash สีแบรนด์ + โลโก้หมุน บังทั้งจอ | สร้าง `border-4 border-primary animate-spin` เอง |
| Loading **ชั้น 2** — เปลี่ยนหน้าในระบบ (chrome วาดแล้ว) | **`loading.tsx` ของ segment นั้น → `AppSegmentLoading`** (ห่อ `PageSkeleton`) — segment ใหม่ต้องสร้าง `loading.tsx` ด้วยเสมอ | ปล่อยให้ตกไปใช้ `app/loading.tsx` (splash เต็มจอจะกระพริบทับ sidebar ทุกครั้งที่กดเมนู) |
| Loading **ชั้น 3** — อยู่ในหน้าแล้ว กำลัง**อ่าน**ข้อมูลของบล็อกใดบล็อกหนึ่ง | `LoadingCard` (from `StateCard.tsx`) — ไม่ส่ง `title` = **skeleton** (ห้ามใส่ "กำลังโหลด..." ทั่วไป); ส่ง `title` เฉพาะงานประมวลผลที่ควรบอกผู้ใช้ เช่น "กำลังตรวจสอบข้อมูล..." → spinner + ข้อความ | inline spinner + ข้อความเอง · `Loader2` ตัวใหญ่กลางบล็อก · `title="กำลังโหลด..."` |
| Loading **ชั้น 4** — ผู้ใช้สั่งงานเป็นชุด ระบบกำลัง**เขียน**ข้อมูล | `LoadingOverlay` — บังจอกันกดซ้ำ + progress `(7/20)` | ปล่อยให้กดซ้ำได้ระหว่างทำงาน (ออเดอร์จะโดนรับสองรอบ) |
| Loading — spinner เล็กในปุ่ม/ในแถว | `Loader2` ของ lucide ตรง ๆ (`Button` มี `loading` prop อยู่แล้ว) | — |
| อยากได้ skeleton ในจุดอื่น | `PageSkeleton variant="list\|form\|dashboard\|detail"` หรือชิ้นย่อย `SkeletonTable/List/Form/Stats/Card/Text/Chat` (from `Skeleton.tsx` — `SkeletonChat` = ฟองแชทซ้าย/ขวา ใช้ตอนเปิดห้องแชท) | ใช้ spinner ทั้งที่รู้ layout (skeleton รู้สึกเร็วกว่า + หน้าไม่เด้ง) |

> ❌ `PageLoading` กับ `Spinner` ใน `Loading.tsx` **ถูกลบแล้ว** (2026-08-21) — export ไว้แต่ทั้งระบบเรียก 0 จุด ทำให้เอกสารชี้คนละทางกับของจริง
| Empty / no-data state | `EmptyCard` (from `StateCard.tsx`) | สร้าง empty card เอง |
| ไม่มีสิทธิ์ guard | `NoPermissionCard` (from `StateCard.tsx`) | สร้าง guard เอง |
| Done / result screen (success/error icon + summary + actions) | `DoneCard` (from `StateCard.tsx`) | สร้าง done screen เอง |
| KPI box (label + value + delta trend + icon) | `Stat` (from `Chart.tsx`) | สร้าง stat box เอง |
| Bar chart (vertical bars, no axis) | `BarChart` (from `Chart.tsx`) | install chart lib สำหรับ simple bar |
| Sparkline (tiny SVG line) | `Sparkline` (from `Chart.tsx`) | สร้าง mini chart เอง |
| Progress bar | `ProgressBar` (from `Chart.tsx`) | inline `<div className="bg-X h-2">` |

**Button variants (ใช้ให้ตรง semantic):**
- `primary` — main CTA สีส้ม (สร้าง, บันทึก, ยืนยัน)
- `secondary` — outline neutral (ยกเลิก, Cancel)
- `ghost` — low emphasis (toolbar icon button)
- `danger` — destructive (ลบ, ยกเลิก order, void)
- `success` — confirmation (ยืนยันสลิป, สำเร็จ — หายาก)
- `indigo` / `amber` — ปุ่มหลักในแถว list page (รับออเดอร์เครดิต/ลูกค้าชำระแล้ว · จัดส่ง) — ยุบมาจาก `.btn-focus-action` 2026-09-08 · บนการ์ดมือถือใช้ `fullWidth`

**Export / Import icons** (recurring bug — ดู [fix-bug.md](../../fix-bug.md)):
- **Export = `Upload` icon (ลูกศรขึ้น)** — ส่งข้อมูลออกจากระบบ
- **Import = `Download` icon (ลูกศรลง)** — นำข้อมูลเข้าระบบ
- → ใช้ `<ExportButton />` / `<ImportButton />` เสมอ — icon ถูก bake ไว้แล้ว ห้ามใช้ raw Button + Upload/Download

**Control heights — ต้องตรงกันทุก variant (global standard):**
- sm = `h-8` (32px)
- md = **42px** ← **default for Button + FormSelect + FormInput** (FormInput md เคยเป็น 40px — แก้ 11 ก.ย. 2026) (`.btn-md` / `.form-control-md` = 42px เท่า `<input>` · แก้ 2026-09-08 เดิม 40px)
- lg = `h-11` (44px)
- → ถ้าวาง Button + FormSelect ข้างกัน ใช้ size เดียวกัน → height ตรงกันอัตโนมัติ

### Global CSS classes (`app/globals.css`) — เปลี่ยนที่นี่ที่เดียว
> ทุก style ของ Button / Card / Badge / Modal อยู่ใน `globals.css` ภายใต้ `@layer components`
> DOM แสดงเป็น `class="btn btn-md btn-primary"` ไม่ใช่ utility chain ยาวๆ

| Group | Classes | ใช้กับ |
|---|---|---|
| Typography | `.heading-{1/2/3/4}`, `.body-text`, `.subtitle-text`, `.helper-text`, `.page-subtitle`, `.section-desc`, `.field-label` | ใช้แทน inline `text-Nxl font-bold text-gray-900 ...` ทุกที่ |
| Button | `.btn` + `.btn-{sm/md/lg}` + `.btn-{primary/secondary/ghost/danger/success}` | `<Button>` component |
| Card | `.card` + `.card-flat?` + `.card-p-{sm/md/lg}` | `<Card>` component |
| Badge | `.badge` + `.badge-{sm/md}` + `.badge-{pill/square}` + `.badge-{tone}` | `<Badge>` component |
| Modal | `.modal-root`, `.modal-backdrop`, `.modal-panel`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-title`, `.modal-close-btn` | `<Modal>` component |
| Table | `.data-table-wrap`, `.data-thead`, `.data-th`, `.data-tbody`, `.data-tr`, `.data-td`, `.data-pagination` | `<DataTable>` + list pages |
| Filter card | `.data-filter-card` | list page filter section |
| Focus action button (ปุ่มหลักในแถว list page) | `<Button variant="primary\|success\|indigo\|amber">` — **คลาส `.btn-focus-action` ถูกยุบทิ้งแล้ว 2026-09-08** เพราะเตี้ยกว่า `<Button>` 6px พอวางในแถบเดียวกันเห็นเป็นขั้นบันได · ปุ่มเต็มความกว้างบนการ์ดมือถือใช้ `fullWidth` |

**Typography mapping**:
- `.heading-1` = `text-3xl font-bold` — list page title
- `.heading-2` = `text-2xl font-bold` — sub-page (PageHeader)
- `.heading-3` = `text-lg font-semibold` — section / card title
- `.heading-4` = `text-base font-semibold` — small section
- `.body-text` = `text-base` — paragraph
- `.subtitle-text` = `text-sm` — description
- `.helper-text` = `text-xs` — label / caption
- `.page-subtitle` = under h1 (`text-gray-600 mt-1`)
- `.section-desc` = under h2/h3 (`text-sm text-gray-500 mt-0.5`)
- `.field-label` = form input label — **16px** `font-medium` (ไม่ใช่ text-sm แล้ว)
- Mobile responsive auto-included — h1 + h2 scale down at < 768px

**กฎ**: เมื่ออัพเดท visual style ของ Button/Card/Badge/Modal → แก้ใน `globals.css` ไม่ใช่ใน Tailwind className ของ component
ดู [/dev/design](../../app/dev/design/page.tsx) สำหรับ live preview ทุก variant

**Container sizes**:
- `full` — list pages (DataTable spans full)
- `6xl` — wide content (design showcase, dashboards)
- `5xl` — bulk action pages (**default**)
- `4xl` — bulk hub, mid-width
- `2xl` — detail/edit forms
- `xl` — narrow settings forms

**Page title pattern** — ทุกหน้าใช้ `PageHeader` ตัวเดียว (อัพเดท 2026-08-21):
- **List page (top-level)**: `<PageHeader icon title subtitle actions />` — ไม่ส่ง `backHref` = ได้หัวข้อใหญ่ (`heading-1`)
- **Sub-page (มี back)**: `<PageHeader backHref="/parent" title subtitle actions />` — ได้ปุ่มย้อนกลับ + หัวข้อเล็กลงหนึ่งขั้น (`heading-2`)
- ปุ่มไปช่อง `actions` เสมอ (หลายปุ่มห่อ `<>...</>`) — ห้ามวาง PageHeader คู่กับ div ปุ่มใน flex เอง
- ไอคอนส่ง `icon={<Package2 />}` เปล่า ๆ — ขนาด (w-8) กับสี (text-primary) PageHeader จัดให้
- หน้าที่ไม่ได้อยู่ใน `Container` (ไม่มี space-y) ใช้ `className="mb-6"` เว้นระยะ
- ❌ **ห้ามเขียน `<h1>` เอง** ทั้ง `heading-1` และ `text-3xl font-bold text-gray-900 dark:text-white`
- ❌ ห้ามใช้ Layout `title` + `breadcrumbs` props พร้อมกับ PageHeader (duplicate)

### DataTable — Full-featured table สำหรับทุก list page (อัพเดท 2026-05-27)

> **มาตรฐานใหม่** — ทุก list page ใหม่ต้องใช้ DataTable นี้ + features ทั้งหมดที่มี

```tsx
<DataTable
  storageKey="orders"                          // unique per page → localStorage (widths, order, visibility)
  columns={[
    {
      key: 'order_no', label: 'เลขที่',
      sortable: true, resizable: true, reorderable: true,  // ← features per column
      defaultWidth: 130,
      render: (r) => <div>{r.order_no}</div>,
      edit: {                                  // ← cell inline edit
        type: 'number' | 'text' | 'select',
        getValue: (r) => r.value,
        onSave: async (r, v) => await api.update(r.id, { value: v }),
        options: [{ value, label }],           // for select
        validate: (v) => Number(v) > 0 ? null : 'error msg',
      },
    },
  ]}
  data={rows}
  getRowId={(r) => r.id}

  // Pagination — ใช้ DEFAULT_RECORDS_PER_PAGE = 20 (enum 20/50/100/200)
  currentPage={page}
  totalPages={totalPages}
  totalRecords={total}
  recordsPerPage={perPage}
  onPageChange={setPage}
  onRecordsPerPageChange={setPerPage}

  // Sort (controlled)
  sortBy={sortBy}                              // 'order_no'
  sortDir={sortDir}                            // 'asc' | 'desc' | undefined
  onSort={(key, dir) => { setSortBy(...); setSortDir(...); }}
/>
```

**Features ที่ DataTable มี (all built-in):**
| Feature | Per-column flag | Persistence |
|---|---|---|
| Sort | `sortable: true` + DataTable props `sortBy/sortDir/onSort` | — (controlled) |
| Resize | `resizable: true` + `defaultWidth: 130` | localStorage `dt-widths:{storageKey}` |
| Reorder (drag-and-drop with FLIP animation) | `reorderable: true` | localStorage `dt-order:{storageKey}` |
| Cell edit (inline) | `edit: { type, getValue, onSave, options?, validate? }` | — (caller controls) |
| Column visibility toggle | (auto) | localStorage `col-toggle:{storageKey}` |
| Reset button | (auto — `↻` icon in footer) | clears all 3 localStorage entries |
| Pagination | (auto) | enum `[20, 50, 100, 200]` |
| Mobile responsive | (auto) | desktop table + mobile cards |
| Last column auto-flex | (auto) | pins to right edge always |

**ข้อสังเกตสำคัญ:**
- **Last column ไม่ resize ได้** — มันเป็น auto-flex (เพื่อ pin ขวา)
- ถ้าอยาก resize column ที่มัน lock เป็น last → reorder ให้มันไม่อยู่ตำแหน่งสุดท้ายก่อน
- Column widths เริ่มต้นใช้ **%** (proportional ของ defaultWidth) — table เต็ม container เสมอ
- หลัง user resize ครั้งแรก → snapshot ทุก width เป็น px → resize ตัวเดียวเปลี่ยนแค่ตัวเดียว
- Resize min = 80px (กัน header text หาย)
- Header text มี `min-width: max-content` → cell ไม่หดต่ำกว่า header content

### Form Inputs
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| Dropdown | `FormSelect` | native `<select>` |
| ช่องกรอก **ตัวเลข** (ราคา ส่วนลด จำนวน น้ำหนัก สต็อก) | `NumberInput` (state เป็น number) · `FormInput type="number"` / `PostfixInput` / `DiscountInput` / `PriceDiscountCombo` (state เป็น string) — ทุกตัววาดเป็น `type="text" inputMode="decimal"` แล้วกรองอักขระผ่าน [lib/numeric-input.ts](../../lib/numeric-input.ts) · `<input>` ดิบที่เลี่ยงไม่ได้ให้ใส่ `{...NUMERIC_TEXT_INPUT_PROPS}` + `onNumericChange(...)` | **`<input type="number">`** — เบราว์เซอร์ปรับค่าเองทีละ `step` เมื่อเลื่อนล้อเมาส์/สองนิ้วบนแทร็กแพดขณะช่องยัง focus อยู่ ผู้ใช้ไม่รู้ตัวเลย (ค่าส่ง 100 → 99.96 ทั้งบิลจริง ลูกค้าจ่ายตามยอดผิดไปแล้ว · 7 ก.ย. 2026) · CSS ห้ามไม่ได้เพราะเป็นพฤติกรรมของเบราว์เซอร์ ไม่ใช่สไตล์ |
| Multi-select dropdown + search (chips trigger, checkbox list) | `MultiSelectSearch` | chip-toggle list เรียงยาว / สร้าง multi-select dropdown เอง |
| ค้นหาลูกค้า/สินค้า | `EntitySearchInput` — รายการใหญ่ให้ส่ง **`onSearchChange`** (โหมด API: ข้ามการกรองภายใน + debounce 300ms) คู่กับ `loading`/`minSearchLength` · **ฝั่ง parent ต่อกับ `useServerSearch`** | สร้าง search dropdown เอง · โหลดทั้งตารางมาให้มันกรอง · เขียน seq/debounce/cache เองในหน้า |
| ค้นหาสินค้า (พร้อมราคา/รูป/variation) | `ProductSearchInput` — โหมด API เหมือนกัน (`onSearchChange` · ผ่าน `ItemsTable` ใช้ชื่อ `onProductSearchChange` · ผ่าน `CustomerSelectionCard` ใช้ `onCustomerSearchChange`) · **ฝั่ง parent ต่อกับ `useServerSearch`** คู่กับ `/api/products/search` · **ผลค้นหาวางแบบ portal (`fixed z-[9999]`) ลอยเหนือทุกกรอบ** — วางในกล่อง `overflow:hidden` · การ์ด · โมดัล ได้โดยไม่ถูกตัด (แก้ 10 ก.ย. 2026) | สร้าง product picker เอง · **ส่งสินค้าทั้งร้านมาให้กรองใน client** (ร้าน 5.8k สินค้าโดนเพดาน 1,000 แถวของ Supabase — ของที่มีอยู่จะ "หาไม่เจอ" เงียบ ๆ ดู fix-bug.md 2026-09-07) |
| ตารางสินค้าในฟอร์ม | `ItemsTable` | สร้าง items table เอง |
| ที่อยู่ไทย autocomplete | `ThaiAddressInput` | สร้าง address autocomplete เอง |
| ข้อมูลภาษี (บุคคล/นิติบุคคล toggle) | `TaxInfoForm` | สร้าง tax form เอง |
| Input ต่อท้ายหน่วย (฿, kg, %) | `PostfixInput` — override สไตล์ด้วย **`classNames={{frame,text}}`** (แทนที่ ไม่ใช่ต่อท้าย: `frame` = กรอบ/focus/พื้น/มุม · `text` = ขนาด/ชิด/สี) · ⚠️ div ครอบ 2 ชั้น: `className` = ชั้นนอก (ใส่ `flex-1` ที่นี่) · `width` = ชั้นใน | สร้าง input+suffix เอง · หนีไปเขียน `<input>` เพราะ `inputClassName` ทับสี base ไม่ได้ (เคย 12 จุด) |
| ส่วนลด (% หรือ บาท) | `DiscountInput` | สร้าง discount toggle เอง |
| ราคา+ส่วนลด combo | `PriceDiscountCombo` | สร้าง price-discount pair เอง |
| Search box | `SearchInput` | สร้าง search input เอง |
| Date range | `DateRangePicker` | สร้าง date picker เอง |
| Month/Year | `MonthYearPicker` | สร้าง month picker เอง |
| Time | `TimePicker` | สร้าง time picker เอง |
| Radio | `Radio` | สร้าง radio เอง |
| Checkbox | `Checkbox` | สร้าง checkbox เอง |
| Tag input | `TagInput` | สร้าง tag input เอง |
| ช่องข้อความหลายบรรทัด | **`FormTextarea`** — คู่ของ `FormInput` (ป้าย · คำอธิบาย · **ตัวนับ n/max เมื่อส่ง `maxLength`** · error · สีขอบ/โฟกัสชุดเดียวกัน) | `<textarea className="w-full px-4 py-2.5 border …">` ดิบ + ตัวนับที่เขียนเอง (ยังค้างอยู่ใน CustomerSelectionCard · ItemsTable · TaxInfoForm — เจอแล้วให้ย้าย) |
| ช่องกรอก **หลายค่าสั้น ๆ** (ปุ่มตอบเร็ว · คำค้น · อีเมลหลายคน) | **`ChipsInput`** — พิมพ์แล้ว Enter/`,` กลายเป็นเม็ดยาในกล่องเดียวกัน · Backspace ตอนช่องว่างถอดตัวท้าย · `max`/`maxLength` · เม็ด = `Badge onRemove` · กรอบ/โฟกัสชุดเดียวกับ FormInput | ช่องกรอก + ปุ่ม "เพิ่ม" แยกกัน หรือช่องกรอกเต็มแถวใบละอัน (บรอดแคสต์เคยเป็นแบบนั้น เจ้าของท้วง 10 ก.ย. 2026) · `TagInput` ซึ่งผูกกับตารางแท็กของบริษัท |
| กล่องพิมพ์ **1 ฟองข้อความ** (ข้อความล้วน · ข้อความ+รูปในฟองเดียว · รูปอย่างเดียวเมื่อไม่ส่ง `value/onChange`) | **`MessageComposer`** — textarea + รูปจิ๋วใต้ข้อความ + แถบล่าง (ปุ่มแนบรูป · `toolbar` slot เช่นชิปเลือกแบบรูป · ตัวนับ) · ลาก/วาง/paste รูปได้ทั้งกล่อง · รูปวิ่งผ่าน `ImageDropzone` ตัวเดิมด้วย ref `accept()/open()` · **1 กล่อง = 1 ฟองที่ลูกค้าได้รับ** — ของที่ส่งเป็นหลายฟอง (ประกาศ = ข้อความ + รูป) ต้องวางเป็นหลายกล่องเรียงตามลำดับส่ง | รวมข้อความกับรูปที่ส่งแยกฟองไว้กล่องเดียว (เจ้าของ: "สวยแต่ไม่ดี คนจะเข้าใจผิดว่าเป็นฟองเดียว" 10 ก.ย. 2026) · textarea + dropzone เส้นประเต็มกว้างแยกกัน · เขียน drop/paste/ย่อรูปเองในกล่อง |
| **การ์ดตัวเลือกที่กดได้ทั้งใบ** (Radio/Checkbox ที่ส่ง `children` · OptionCards) | คลาสกลาง **`.choice-card`** + **`.choice-card-active`** ใน globals.css (ขอบ/hover/สีที่เลือก/dark ครบ) ใส่คู่กับ padding ของตัวเอง | พิมพ์ `border-[#F4511E] bg-orange-50/50 dark:bg-orange-950/20 …` เอง (เคยซ้ำ 4 ที่ในวันเดียว 2026-09-09) |
| **กล่องที่ซ้อนอยู่บนการ์ดขาว** (รายการบล็อก/แถวที่กางแก้ได้ — ข้างในมีช่องกรอกสีขาว) | คลาสกลาง **`.inner-panel`** + **`.inner-panel-head`** + **`.inner-panel-body`** ใน globals.css (พื้นจมหนึ่งขั้น + หัวแถบเข้ม + dark ครบ) · ⚠️ **ห้ามใส่ `overflow:hidden` ให้ `.inner-panel`** — เคยตัด dropdown ของช่องในบล็อกทิ้ง (มุมหัวแถบใส่ radius เองแทน) | `bg-gray-50 dark:bg-slate-900/40` พิมพ์เองในหน้า · ปล่อยขาวบนขาวจนแยกไม่ออกว่าก้อนไหนเป็นก้อนไหน (เจ้าของท้วง 10 ก.ย. 2026) |
| ชิปที่ผู้ใช้เลือกมาเองแล้วถอดได้ (ผู้รับที่เลือกรายคน ฯลฯ) | `Badge` + **`onRemove`** (+ `removeLabel` ให้ screen reader) — ปุ่มกากบาทเป็นคลาส `.badge-remove` | `<li rounded-full border><button><X/></button></li>` ที่เขียนเอง |
| ชิปกรองที่ไม่ผูกกับแพลตฟอร์ม (ค่าที่ใช้บ่อย 30/60/90 · ไม่กรอง/≥3/≥5) | `FilterChips` + `activeClass={FILTER_CHIP_PRIMARY_ACTIVE}` (export จากไฟล์เดียวกัน — สีแบรนด์ผ่าน token `primary`) · **`variant="segmented"`** = ปุ่มติดกันเป็นกลุ่มเดียว ใช้กับตัวเลือกย่อย**ภายในช่องกรอก** (เช่น "กดแล้วเกิดอะไร" ของ ActionPicker) เพื่อไม่ให้ปนกับชิป pill ที่อยู่ใกล้กัน · **`size="md"`** = สูง 42px เท่า `<input>`/`<Button>` ต้องใส่เมื่ออยู่แถวเดียวกับช่องกรอก ไม่งั้นเห็นเป็นขั้นบันได — หรือใช้ sm แล้วครอบด้วย `form-control-md flex items-center` ให้ชิปอยู่กลางบรรทัดสูงเท่าช่องกรอก (ActionPicker ทำแบบนี้ เจ้าของอยากได้ชิปเล็ก 11 ก.ย. 2026) · `disabled` ต่อชิป (ใส่ `tooltip` บอกเหตุผลคู่กันเสมอ) · **ป้ายชิปไม่พับบรรทัด (nowrap)** — ที่แคบให้ส่งป้ายสั้นเข้ามาแทน (เช่น ActionPicker ใช้ ลิงก์/สินค้า/ข้อความ) ปล่อยพับแล้วชิป md ที่สูงคงที่ล้นขอบบนล่าง (11 ก.ย. 2026) | ประกาศ `CHIP_ACTIVE = 'border-[#F4511E] …'` ประจำไฟล์ · วาง pill สองชุดติดกันจนแยกไม่ออกว่าอันไหนคุมอะไร (เจ้าของท้วง 10 ก.ย. 2026) |
| Upload รูป (drag-drop, reorder, compress) | `ImageUploader` | สร้าง uploader เอง |
| เลือกรูป **1 ใบ** (ลากวาง / วางจากคลิปบอร์ด / ถ่ายรูป / ย่อรูปให้) | **`ImageDropzone`** — คืน `File` ให้ผู้เรียกอัปเอง ไม่รู้จัก storage · มี ref handle `accept(file)`/`open()` ให้กล่องข้างนอก (เช่น `MessageComposer`) ป้อนไฟล์ที่ตกลงมานอกปุ่มเข้ามาได้ · **`aspect="1:1"|"3:4"`** = กรอบตามสัดส่วนจริง (3:4 = รูปสินค้าแนวตั้งแบบ Shopee) · **`square`** = ตัวย่อของ `aspect="1:1"` — กรอบจัตุรัสจริงทั้งตอนว่างและตอนมีรูป (บอกว่า 1:1 แต่กรอบเป็นสี่เหลี่ยมผืนผ้า ผู้ใช้เข้าใจสัดส่วนผิดตั้งแต่ตอนเลือก) · **`changeOnClick`** = กดที่รูปแล้วเปลี่ยนรูปได้เลย · ปรับหน้าตาผ่าน `classNames` (หน้าร้านส่ง `sf-*` ของธีมตัวเองเข้ามา) · `maxWidthOrHeight`/`maxSizeMB` ตั้งได้ (โลโก้ร้าน 300px · สลิป 1920px) | สร้าง dropzone ตัวที่สอง · `<input type="file">` ดิบ ๆ · ลืมย่อรูป |
| ชิปกรอง (pill + ไอคอน + จำนวน) เช่นกรองตามแพลตฟอร์ม | **`FilterChips`** (`chips` + `value` + `onChange` · `activeClass` ใส่สีประจำแพลตฟอร์ม · `tooltip` ต่อชิปเมื่อป้ายสั้นจนต้องขยายความ เช่น ไม่แสดง/แสดง/บังคับกรอก — ผ่าน `Tooltip` กลางให้เอง) | เขียน `rounded-full border px-3 py-1.5` เองในแต่ละหน้า (เคย copy 2 ที่ในหน้าเดียวแล้วสไตล์หลุดกัน) — **อย่าสับสนกับ `StatusTabs`** ที่เป็น filter สถานะของหน้า list |
| เลือกสี (ชุดสีสำเร็จรูป + จานสี + กรอกรหัสเอง) | `ColorPicker` — เปิด Modal จานสี · presets จาก `lib/color-presets.ts` | วาง `<input type="color">` ดิบ ๆ ในหน้า |
| ตัวเลือกที่ **อธิบายด้วยภาพได้ดีกว่าคำ** (สัดส่วนรูป, เลย์เอาต์, สไตล์แถบ) | `OptionCards` — การ์ดพร้อม `preview` ที่วาดรูปทรงจริง · `layout="horizontal"` = พรีวิวใหญ่ซ้าย ตัวหนังสือขวา (ใช้เมื่อต้อง "ดูออก" ว่าต่างกันตรงไหน เช่นรูปแบบข้อความบรอดแคสต์ — พรีวิวใส่รูปจริงของผู้ใช้ได้) · **`previewSize="lg"`** = กรอบพรีวิว 128px เต็มความกว้างการ์ดสำหรับ**มอคอัปทั้งใบ** (คอลัมน์พับตามจอให้เอง 2 → 4) — ใช้กับการ์ดเลือกชนิดเนื้อหาบรอดแคสต์ที่วาดห้องแชทจำลองจาก `app/marketing/broadcast/new/components/KindMockups.tsx` | ใช้ `FormSelect` แล้วให้ผู้ใช้เดาเองว่าหน้าตาเป็นยังไง · พรีวิว 48px ที่เป็นแท่งเทา 2 แท่งซึ่งดูไม่ออกว่าคืออะไร (เจ้าของท้วง 10 ก.ย. 2026) |
| ตัวอย่าง "ลูกค้าจะเห็นอะไรในแชท" (บรอดแคสต์ · ข้อความส่งเป็นชุดในอนาคต) | **`LinePhonePreview`** ([components/broadcast/LinePhonePreview.tsx](../../components/broadcast/LinePhonePreview.tsx)) — กรอบมือถือจอสูงคงที่ เลื่อนในจอ ติดท้ายห้อง · ส่ง `messages=[{key, wide?, node}]` (1 ก้อน = 1 message object ที่ LINE ส่ง) · `wide` = การ์ด/รูปเต็มจอ **ตกบรรทัดใต้รูปโปรไฟล์** · ชื่อ+รูปบนหัวห้องแชท = บัญชีแรกที่เลือก · `size="md"` ในแผงที่มีการ์ดอื่นอยู่ด้วย · สี/กรอบอยู่ `.phone-mock*` ใน globals.css · แถวเลื่อนแนวนอนใช้ `.phone-mock-hscroll` · เนื้อหาชนิดกลางวาดผ่าน `BroadcastPreview` | วาดห้องแชทจำลองเองในหน้า (พื้นฟ้า/avatar/แถบพิมพ์) · วางการ์ดข้างรูปโปรไฟล์ (ของจริงตกบรรทัด — เจ้าของเทียบรูปแคป 10 ก.ย. 2026) · ใส่ชื่อร้านเหนือข้อความ (แชท 1:1 กับ OA ไม่มี) |

### Display Components
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| แสดงข้อมูลลูกค้า (ชื่อ+badge+เบอร์) | `CustomerInfoCard` | สร้าง customer display เอง |
| เลือกลูกค้า+ที่อยู่+ภาษี | `CustomerSelectionCard` — `bare` (ที่แคบ/แผงแชท: ไม่วาดกรอบการ์ด ได้ความกว้างคืน) · `onEditCustomer`/`editCustomerUrl` (ดินสอบนชิปลูกค้า → แก้ **ตัวลูกค้า** เพราะช่องเบอร์/ที่อยู่ในการ์ดเป็นของ**บิลใบนี้**) · `shipToOther`+`onShipToOtherChange` วาดเป็น **แท็บ** (`Tabs`) ที่เป็นหัวข้อของบล็อกที่อยู่ในตัว — ส่งมาแล้วห้ามวาดหัวข้อ "ที่อยู่จัดส่ง" ซ้ำ | สร้าง customer picker เอง · วาดตัวเลือก สั่งเอง/ส่งให้คนอื่น เป็นปุ่มลอย ๆ แยกจากช่องที่อยู่ (ผู้ใช้ไม่เห็นว่าเกี่ยวกัน) |
| ข้อมูลใบกำกับ (แสดง) | `TaxInvoiceInfo` | สร้าง tax display เอง |
| แก้ไขใบกำกับ (modal) | `TaxInvoiceEditModal` | สร้าง tax edit form เอง |
| สรุปยอด (editable) | `OrderSummaryBox` | สร้าง totals box เอง |
| Tag/Badge | `TagBadge` | สร้าง badge เอง (8 สีพร้อมใช้) |
| รูปสินค้าจิ๋ว (dropdown / ตาราง / การ์ด) | `ProductImageThumb` (xs/sm/md/lg — **โหลด URL ย่อผ่าน `thumbUrl()` ให้เอง** · กดขยายได้รูปเต็ม) หรือ `<img src={thumbUrl(url, 96\|160\|320)}>` เมื่อ layout พิเศษ | `<img src={image_url}>` รูปเต็มในกรอบ 32–64px (Shopee 190KB/แถว — ดู fix-bug.md 2026-09-07 รอบ 3) |
| Tooltip / คำอธิบายปุ่มไอคอน | **`Tooltip`** (`text`, `position?`, `box?`) — portal + delay 350ms + คีย์บอร์ด + **มือถือแตะค้าง** + พลิกเมื่อชนขอบจอ · ใส่ `aria-label` บนปุ่มควบเสมอ (tooltip ไม่ใช่ชื่อ accessible) · **ปุ่มที่ `disabled` ได้ต้องใส่ `box="inline-flex"`** — ค่า default `display:contents` ไม่มีกล่อง ปุ่ม disabled จึงไม่ยิง pointer event เลย | `title=""` ของเบราว์เซอร์บนปุ่ม/ไอคอน (แต่งไม่ได้ · ขึ้นช้า ~1 วิ · **มือถือไม่ขึ้นเลย**) · สร้าง tooltip เอง |
| เตือน "กำลังเปิดในแอป LINE/FB/IG/TikTok" (Google บล็อกล็อกอินใน webview — `disallowed_useragent`) | `InAppBrowserNotice` ([components/auth/](../../components/auth/InAppBrowserNotice.tsx)) + `detectInAppBrowser()` · `IN_APP_LABELS` · `withExternalBrowserFlag()` จาก [lib/in-app-browser.ts](../../lib/in-app-browser.ts) (LINE เท่านั้นที่เปิดเบราว์เซอร์จริงได้ด้วยธง `openExternalBrowser=1`) · อ่าน UA ผ่าน `useSyncExternalStore` | UA sniff เอง · `useEffect + setState` (lint + hydration mismatch) |

### Data Table — ทุกหน้า list ต้องใช้
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| ตาราง list page (table + mobile cards + pagination + column toggle) | `DataTable` | สร้าง table/pagination เอง |

**`DataTable`** (`components/ui/DataTable.tsx`) — all-in-one component:
- Desktop table (`data-table-wrap`, `data-thead`, `data-tbody`, `data-tr`)
- Mobile cards (auto หรือ custom `mobileCardRender`)
- Pagination + records per page + load time
- Column toggle (localStorage persist via `useColumnToggle`)
- Row selection (optional `selectedIds` + `onSelectionChange`)
- Loading / empty states
- Row click + row className

```typescript
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

const columns: DataTableColumn<Order>[] = [
  { key: 'name', label: 'ชื่อ', alwaysVisible: true, render: (row) => row.name },
  { key: 'status', label: 'สถานะ', render: (row) => <Badge>{row.status}</Badge> },
  { key: 'actions', label: '', stopPropagation: true, render: (row) => <ActionMenu items={...} /> },
];
```

### Action Components
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| Dropdown menu (row action) | `ActionMenu` (portal, z-9999) — สไตล์อยู่ที่ `.action-menu-item` ใน globals.css · เน้นเมนูสำคัญสุดด้วย `primary: true` (1 ตัว/เมนู) · ลบ/ยกเลิกใช้ `danger: true` | สร้าง inline dropdown เอง · **ส่ง `className` สีเทา/สีเน้นเข้ามาเอง** (ตัวหนังสือจะจางเหมือนกดไม่ได้) |
| Modal จัดส่ง (3 วิธี) | `ShipModal` | สร้าง ship dialog เอง |
| Modal ชำระเงิน+แนบ slip | `PaymentModal` | สร้าง payment dialog เอง |
| Confirm dialog | `ConfirmDialog` | สร้าง confirm modal เอง |
| ปุ่มพิมพ์เอกสาร (TAX/DN/ABB/label) | `OrderPrintButtons` | สร้าง print buttons เอง |
| เลือก promotion | `PromotionSelectModal` | สร้าง promotion picker เอง |
| Loading overlay + progress bar | `LoadingOverlay` | สร้าง loading screen เอง |
| แถบลอยตอนติ๊กหลายแถว (bulk action) | `BulkActionBar` (`count` + `onClear` + ปุ่มเป็น children · ซ่อนเองเมื่อ 0 · `pb-safe`) — **ปุ่มข้างในต้องเป็น `<Button>` ทั้งหมด** ไม่งั้นสูงไม่เท่ากัน | copy โครงแถบลอยเอง (เคยซ้ำ 2 ที่) |
| แถบบันทึกติดขอบล่างของหน้า form/settings (1 หน้า = ปุ่มบันทึกเดียว บันทึกทั้งหน้า) | `StickyActionBar` (`onSave` `saving` `dirty?` `disabled?` `onCancel?` `saveLabel?` `extraActions?` `primary?` `inset?`) · ไม่ส่ง `dirty` = ไม่ขึ้นข้อความสถานะ (ห้ามเดา) · ส่ง = ต้อง seed baseline จากค่าที่โหลดมา · `<form>` → `onSave={() => formRef.current?.requestSubmit()}` | ปุ่ม save แยกต่อ section · (ไม่ใช้กับ Modal footer / list-CRUD ที่เพิ่ม-ลบมีผลทันที) |

---

## 2. Order Form Components

### 3 ฟอร์มหลัก — ห้ามสร้างเพิ่ม
| Form | ใช้สำหรับ | Path |
|------|----------|------|
| `OrderForm` | ลูกค้าปลีก (r_retail) | `components/orders/OrderForm.tsx` |
| `DealerOrderForm` | ตัวแทน/ห้าง ทุก mode (w_cash, w_credit, c_consign, d_consign) | `components/dealer/DealerOrderForm.tsx` |
| `ReplenishmentForm` | เติมของตัวแทน | `components/replenishments/ReplenishmentForm.tsx` |

### Order Page Components (`app/orders/components/`)
| Component | ใช้สำหรับ |
|-----------|----------|
| `ActionMenu` | Portal dropdown menu (z-9999) — ใช้ทุกหน้า list |
| `PaymentModal` | บันทึกชำระเงิน+แนบ slip |
| `SplitParcelModal` | แบ่งกล่อง (Shopee + manual) |
| `HandoverPickerPanel` | จอเดียวสำหรับ "ให้ขนส่งมารับที่ไหน เมื่อไหร่" ของทุก marketplace (Shopee เลือกที่อยู่+รอบ · TikTok เลือกรอบ) — ห้ามสร้าง modal รับออเดอร์แยกต่อแพลตฟอร์ม |
| `TaxInvoiceModal` | ออกใบกำกับภาษี (personal/corporate) |
| `PrintStatusDots` | จุดแสดงสถานะพิมพ์ (label, packing, invoice) |
| `OrderCard` | Mobile card view |
| `ReadyToShipTab` | Tab ready_to_ship (verify slip, accept, split) |
| `ProcessingTab` | Tab processing (ship, carrier group) |
| `PrintAfterActionModal` | เลือกเอกสารพิมพ์หลัง action |

---

## 3. Shared Hooks

### Context Hooks (ใช้ผ่าน Provider — ห้ามสร้าง context ซ้ำ)
| Hook | Path | ใช้สำหรับ |
|------|------|----------|
| `useAuth()` | `lib/auth-context.tsx` | user, session, profile, sign in/out |
| `useCompany()` | `lib/company-context.tsx` | current company, roles, company switching |
| `useToast()` | `lib/toast-context.tsx` | success/error toast notification |
| `useFeatures()` | `lib/features-context.tsx` | feature flags, business presets |
| `useTheme()` | `lib/theme-context.tsx` | light/dark/system theme |

### Utility Hooks
| Hook | Path | ใช้สำหรับ |
|------|------|----------|
| `useCustomerPrefill()` | `lib/useCustomerPrefill.ts` | prefill customer data ในฟอร์ม (shipping, tax, GP context) — ใช้ใน OrderForm, DealerOrderForm, ReplenishmentForm |
| `useConfirmDialog()` | `lib/useConfirmDialog.tsx` | promise-based confirm dialog แทน native `confirm()` |
| `useFetchOnce()` | `lib/use-fetch-once.ts` | run callback ครั้งเดียวเมื่อ ready (กัน duplicate API calls) |
| `useColumnToggle()` | `lib/useColumnToggle.ts` | column visibility toggle (localStorage persist) — ใช้ใน DataTable · เก็บ `{fp, visible}` โดย fp = ชื่อคอลัมน์ตามลำดับที่ประกาศ (เหมือน `dt-order`) — **เพิ่มคอลัมน์ในโค้ดแล้ว fp เปลี่ยน = รีเซ็ตเป็นค่าเริ่มต้น** ไม่งั้นคอลัมน์ใหม่ซ่อนเงียบ ๆ สำหรับคนที่เคยกดเปิด/ปิด (แก้ 2026-09-09) |
| `useStableCallback()` | `lib/useStableCallback.ts` | callback ที่ **identity คงที่ตลอดอายุ component** แต่เรียกโค้ดล่าสุดเสมอ — ใช้ตอนส่ง callback เข้า component ที่ `memo()` โดยไม่ต้องไล่ deps ของฟังก์ชันใหญ่ · ส่ง arrow function ตรง ๆ หรือ `useCallback` ที่ deps เปลี่ยนบ่อย = **memo ไร้ผลทันที** (หน้าแชท: `ChatOrderPanel` · `MessageBubble`) · ⚠️ ห้ามเรียกระหว่าง render — handler/effect เท่านั้น |
| `useServerSearch()` | `lib/useServerSearch.ts` | **ช่องค้นหาที่ค้นฝั่ง server** — คืน `{ query, results, loading, search }` ต่อเข้า `onSearchChange` ของ `ProductSearchInput`/`EntitySearchInput` ได้ตรง ๆ · ทำ seq guard (ทิ้งผลของคำค้นเก่าที่มาช้า) · แคชผลต่อคำค้น 30 วิ · กรองต่อในเครื่องด้วย `narrow` เมื่อพิมพ์ต่อจากคำเดิมและชุดนั้น `complete` · พิมพ์ต่ำกว่า `minLength` (default 2) ไม่ยิง — **ห้ามเขียน seq/debounce/cache เองในหน้า** |
| `useSuperAdminGuard()` | `app/superadmin/hooks/` | guard superadmin pages |
| `usePromotionForm()` | `app/promotions/components/` | form state management สำหรับ promotion |

---

## 6. Rules Summary

### ก่อนสร้างอะไรใหม่ ต้อง:
1. **เช็ค `components/ui/`** — มี component ที่ทำหน้าที่เดียวกันมั้ย?
2. **เช็ค `lib/`** — มี service/utility ที่ทำเรื่องเดียวกันมั้ย?
3. **เช็ค hooks** — มี hook ที่จัดการ state เดียวกันมั้ย?
4. **เช็ค `app/api/`** — มี API route ที่ให้ข้อมูลเดียวกันมั้ย?

### ถ้ามีแล้ว:
- ใช้ของเดิม → ถ้าขาด feature → **เพิ่ม prop/option** ให้ component เดิม
- ห้าม copy-paste แล้วแก้ → extract เป็น shared component/utility แทน

### ถ้าไม่มีจริงๆ:
- UI component → สร้างใน `components/ui/` (reuse ได้ทุกหน้า)
- Business logic → สร้างใน `lib/` (ไม่ใช่ inline ในหน้า)
- Hook → สร้างใน `lib/` (ถ้าใช้หลายหน้า)

### List page pattern:
- Copy pattern จาก `/orders/page.tsx` หรือ `/replenishments/page.tsx`
- ใช้ CSS: `data-table-wrap`, `data-filter-card`, `data-thead`, `data-th`, `data-tbody`, `data-tr`
- Focus action + ActionMenu = `getFocusAction()` + `getMenuItems()` pattern

### DealerOrderForm = 1 form หลายโหมด
ใช้ `mode` prop แยก wholesale/consignment/department — **ห้ามสร้างฟอร์มแยก**

