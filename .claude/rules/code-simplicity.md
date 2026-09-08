# Code Simplicity & Reuse Rules

## Core Principle
เขียน code ให้ simple ที่สุด โดยใช้ shared resources ที่มีอยู่ให้ได้มากที่สุด
ถ้าข้อมูลส่วนใหญ่เหมือนกัน ต้องใช้ component/hook/service เดียวกัน — **ห้ามสร้างใหม่ซ้ำซ้อน**

---

## 1. Shared UI Components (`components/ui/`)

### Layout Primitives — **ใช้แทน inline class ทุกครั้ง** (เพิ่ม 2026-05-27)
> 📐 **Reference**: [/dev/design](app/dev/design/page.tsx) — Showcase ทุก variant
> 🧪 **Demo**: [/dev/demo](app/dev/demo/page.tsx) — Sales Dashboard ใช้ทุก component (copy structure เป็น template ได้)

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
| Content tabs (underlined border-b style) | `Tabs` (state-based via `onSelect` หรือ route-based via `href`) | inline `<div className="flex border-b">...<button border-b-2>...` chain — **อย่าสับสนกับ `StatusTabs`** ที่ใช้สำหรับ list-page filter (count ใหญ่ + solid pill) |
| Social platform icon (FB / LINE / IG / TikTok / Shopee / Lazada) | `PlatformIcon` (`id`, `size`, `title`, **`mono`** = สีเดียวตาม currentColor สำหรับปุ่ม primary/พื้นสี) | inline `<Image src="/social/X.svg">` — **ห้ามสร้าง local FbIcon/LineIcon/IgIcon helper** ในแต่ละหน้า (duplicated 3 ครั้งแล้วต้อง refactor) |
| เลือกช่องทาง/บัญชี (รูปโปรไฟล์ + ค้นหา) | **`AccountPicker`** — ปุ่ม + ป๊อปอัป · `multiple` เลือกหลายอัน/อันเดียว · `allOption` แถว "ทุกช่องทาง" · `disabled`+`disabledReason` ต่อแถวสำหรับช่องทางที่ยังใช้ไม่ได้ · รูปวาดด้วย `ChannelBadge` (มี fallback ให้แล้ว) — **ใช้ทั้งหน้าแชทและหน้าสร้างบรอดแคสต์** | เรียงรายการติ๊กลงมาทั้งหมด (ร้านเดียวมีได้หลายสิบบัญชี — ABC the Baby มี FB 7 เพจ · Shopee 6 ร้าน) · เขียนป๊อปอัปเลือกบัญชีเองในหน้า · **ซ่อนช่องทางที่ใช้ไม่ได้ทิ้ง** (ผู้ใช้จะถามซ้ำว่าทำไมไม่มี Shopee — โชว์แบบกดไม่ได้พร้อมเหตุผลแทน) |
| Avatar ช่องทางขาย + ตัวห้อย platform icon (แสดงที่มาของ order — ทุก platform รวม Shopee/TikTok/Lazada) | `ChannelBadge` (`channel={platform, picture_url}`) + `PLATFORM_ICONS` map จากไฟล์เดียวกัน | สร้าง badge/overlay เอง หรือประกาศ PLATFORM_ICONS ซ้ำ (เคยอยู่ใน app/orders/components/types.ts แล้วขาด tiktok/lazada) |
| Dropdown/popover ที่ต้อง "พลิกขึ้นเมื่อที่ว่างข้างล่างไม่พอ" | **`useDropUp(triggerRef, {...})`** จาก [lib/useDropUp.ts](../../lib/useDropUp.ts) (คืน `dropUp` + `rect` + `height` จากการวัดครั้งเดียว) หรือ `shouldDropUp(rect, h, opts)` เมื่อ component วัดตำแหน่งเองอยู่แล้ว | คำนวณ `window.innerHeight - rect.bottom` เองในแต่ละ component (เคยซ้ำ 3 ที่แล้วเกณฑ์ไม่ตรงกัน — FormSelect/MonthYearPicker/ThaiAddressInput) |
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

**Export / Import icons** (recurring bug — ดู [fix-bug.md](../../fix-bug.md)):
- **Export = `Upload` icon (ลูกศรขึ้น)** — ส่งข้อมูลออกจากระบบ
- **Import = `Download` icon (ลูกศรลง)** — นำข้อมูลเข้าระบบ
- → ใช้ `<ExportButton />` / `<ImportButton />` เสมอ — icon ถูก bake ไว้แล้ว ห้ามใช้ raw Button + Upload/Download

**Control heights — ต้องตรงกันทุก variant (global standard):**
- sm = `h-8` (32px)
- md = `h-10` (40px) ← **default for Button + FormSelect**
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
ดู [/dev/design](app/dev/design/page.tsx) สำหรับ live preview ทุก variant

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
| ค้นหาสินค้า (พร้อมราคา/รูป/variation) | `ProductSearchInput` — โหมด API เหมือนกัน (`onSearchChange` · ผ่าน `ItemsTable` ใช้ชื่อ `onProductSearchChange` · ผ่าน `CustomerSelectionCard` ใช้ `onCustomerSearchChange`) · **ฝั่ง parent ต่อกับ `useServerSearch`** คู่กับ `/api/products/search` | สร้าง product picker เอง · **ส่งสินค้าทั้งร้านมาให้กรองใน client** (ร้าน 5.8k สินค้าโดนเพดาน 1,000 แถวของ Supabase — ของที่มีอยู่จะ "หาไม่เจอ" เงียบ ๆ ดู fix-bug.md 2026-09-07) |
| ตารางสินค้าในฟอร์ม | `ItemsTable` | สร้าง items table เอง |
| ที่อยู่ไทย autocomplete | `ThaiAddressInput` | สร้าง address autocomplete เอง |
| ข้อมูลภาษี (บุคคล/นิติบุคคล toggle) | `TaxInfoForm` | สร้าง tax form เอง |
| Input ต่อท้ายหน่วย (฿, kg, %) | `PostfixInput` | สร้าง input+suffix เอง |
| ส่วนลด (% หรือ บาท) | `DiscountInput` | สร้าง discount toggle เอง |
| ราคา+ส่วนลด combo | `PriceDiscountCombo` | สร้าง price-discount pair เอง |
| Search box | `SearchInput` | สร้าง search input เอง |
| Date range | `DateRangePicker` | สร้าง date picker เอง |
| Month/Year | `MonthYearPicker` | สร้าง month picker เอง |
| Time | `TimePicker` | สร้าง time picker เอง |
| Radio | `Radio` | สร้าง radio เอง |
| Checkbox | `Checkbox` | สร้าง checkbox เอง |
| Tag input | `TagInput` | สร้าง tag input เอง |
| Upload รูป (drag-drop, reorder, compress) | `ImageUploader` | สร้าง uploader เอง |
| เลือกรูป **1 ใบ** (ลากวาง / วางจากคลิปบอร์ด / ถ่ายรูป / ย่อรูปให้) | **`ImageDropzone`** — คืน `File` ให้ผู้เรียกอัปเอง ไม่รู้จัก storage · ปรับหน้าตาผ่าน `classNames` (หน้าร้านส่ง `sf-*` ของธีมตัวเองเข้ามา) · `maxWidthOrHeight`/`maxSizeMB` ตั้งได้ (โลโก้ร้าน 300px · สลิป 1920px) | สร้าง dropzone ตัวที่สอง · `<input type="file">` ดิบ ๆ · ลืมย่อรูป |
| ชิปกรอง (pill + ไอคอน + จำนวน) เช่นกรองตามแพลตฟอร์ม | **`FilterChips`** (`chips` + `value` + `onChange` · `activeClass` ใส่สีประจำแพลตฟอร์ม) | เขียน `rounded-full border px-3 py-1.5` เองในแต่ละหน้า (เคย copy 2 ที่ในหน้าเดียวแล้วสไตล์หลุดกัน) — **อย่าสับสนกับ `StatusTabs`** ที่เป็น filter สถานะของหน้า list |
| เลือกสี (ชุดสีสำเร็จรูป + จานสี + กรอกรหัสเอง) | `ColorPicker` — เปิด Modal จานสี · presets จาก `lib/color-presets.ts` | วาง `<input type="color">` ดิบ ๆ ในหน้า |
| ตัวเลือกที่ **อธิบายด้วยภาพได้ดีกว่าคำ** (สัดส่วนรูป, เลย์เอาต์, สไตล์แถบ) | `OptionCards` — การ์ดพร้อม `preview` ที่วาดรูปทรงจริง | ใช้ `FormSelect` แล้วให้ผู้ใช้เดาเองว่าหน้าตาเป็นยังไง |

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
| `ShopeeShipModal` | Shopee ship (เลือก pickup address + time slot) |
| `TimeSlotPickerPanel` | Shopee time slot picker |
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
| `useColumnToggle()` | `lib/useColumnToggle.ts` | column visibility toggle (localStorage persist) — ใช้ใน DataTable |
| `useStableCallback()` | `lib/useStableCallback.ts` | callback ที่ **identity คงที่ตลอดอายุ component** แต่เรียกโค้ดล่าสุดเสมอ — ใช้ตอนส่ง callback เข้า component ที่ `memo()` โดยไม่ต้องไล่ deps ของฟังก์ชันใหญ่ · ส่ง arrow function ตรง ๆ หรือ `useCallback` ที่ deps เปลี่ยนบ่อย = **memo ไร้ผลทันที** (หน้าแชท: `ChatOrderPanel` · `MessageBubble`) · ⚠️ ห้ามเรียกระหว่าง render — handler/effect เท่านั้น |
| `useServerSearch()` | `lib/useServerSearch.ts` | **ช่องค้นหาที่ค้นฝั่ง server** — คืน `{ query, results, loading, search }` ต่อเข้า `onSearchChange` ของ `ProductSearchInput`/`EntitySearchInput` ได้ตรง ๆ · ทำ seq guard (ทิ้งผลของคำค้นเก่าที่มาช้า) · แคชผลต่อคำค้น 30 วิ · กรองต่อในเครื่องด้วย `narrow` เมื่อพิมพ์ต่อจากคำเดิมและชุดนั้น `complete` · พิมพ์ต่ำกว่า `minLength` (default 2) ไม่ยิง — **ห้ามเขียน seq/debounce/cache เองในหน้า** |
| `useSuperAdminGuard()` | `app/superadmin/hooks/` | guard superadmin pages |
| `usePromotionForm()` | `app/promotions/components/` | form state management สำหรับ promotion |

---

## 4. Shared Services (`lib/`)

### Business Logic Services — ห้ามเขียน inline logic
| Service | Path | ใช้สำหรับ | ห้าม |
|---------|------|----------|------|
| `stock-service.ts` | `lib/stock-service.ts` | addStock, deductStock, reserveStock, transferStock, returnStock, adjustStock, deferStockOp | เขียน inline stock upsert |
| `invoice-service.ts` | `lib/invoice-service.ts` | insertTaxInvoice, insertReceipt, insertAbbreviatedInvoice, insertDeliveryNote, insertInvoice | เขียน auto-issue logic เอง |
| `statement-service.ts` | `lib/statement-service.ts` | createStatementForReport (auto สร้างใบวางบิล) | สร้าง statement เอง |
| `gp-resolver.ts` | `lib/gp-resolver.ts` | resolveGp (NET price), fetchCustomerOrderContext (1 RPC) | คำนวณ GP เอง |
| `cost-utils.ts` | `lib/cost-utils.ts` | fetchCostMap (batch WAC snapshot) | query WAC เอง |
| `promotion-service.ts` | `lib/promotion-service.ts` | getPromotionComponents, allocateBundlePrice, calculateQtyDiscount | คำนวณ promotion เอง |
| `credit-notes/auto-cn.ts` | `lib/credit-notes/auto-cn.ts` | createCreditNote (void/refund/exchange + stock return) | สร้าง CN เอง |
| `integration-logger.ts` | `lib/integration-logger.ts` | logIntegration (fire-and-forget API log) | เขียน integration log เอง |
| `marketplace/platforms.ts` | `lib/marketplace/platforms.ts` | **registry ของทุก marketplace** (client-safe) — ป้ายชื่อ · โควตาฟื้นยังไง · map API path→scope · ระยะห่างขั้นต่ำ · ข้อความ banner ต่อ scope · **เพิ่ม platform ใหม่ = เพิ่ม 1 entry ที่นี่** (Record บังคับให้กรอกครบ) แล้วครอบ request function ด้วย 2 บรรทัดตามหัวไฟล์ | ประกาศ map ป้ายชื่อ platform / ตารางโควตา / เวลาหน่วง ซ้ำที่อื่น |
| `marketplace/quota.ts` | `lib/marketplace/quota.ts` | Circuit breaker quota/rate-limit **แยกตาม scope** (`auth·order·fulfillment·product·inventory·promotion·chat`) — client ใช้ `beginMarketplaceCall(platform, apiPath)` ก่อนยิง + `reportMarketplaceError(platform, scope, msg, {httpStatus, code})` ตอน error · cron/retry/manual sync เช็ค `isQuotaBlocked(platform, scope)` **ต้องระบุ scope ให้ตรงงานตัวเอง** · `getBlockedPlatforms()` (UI) · flag ใน `app_flags` key `{platform}_quota_exhausted[:{scope}]` · banner ใช้ `MarketplaceQuotaPausedAlert` | เขียน breaker/flag quota เองต่อ platform · เรียก `isQuotaBlocked` เปล่าๆ ทั้งที่รู้ว่างานตัวเองอยู่ scope ไหน (จะพลาดเคสที่ scope นั้นถูกบล็อก) |
| `marketplace/fee-types.ts` | `lib/marketplace/fee-types.ts` | ช่องกลาง 13 ช่องของค่าธรรมเนียม marketplace + `parseAmount()` (**ห้าม `Number()` ตรงๆ กับตัวเลขจาก marketplace** — Lazada ส่งคอมมาคั่นหลัก) · เจอค่าธรรมเนียมใหม่ให้หา bucket ที่ตรงที่สุด | เพิ่ม bucket ตามชื่อที่ platform เรียก (จะได้รายงานร้อยคอลัมน์ที่เทียบข้าม platform ไม่ได้) |
| `marketplace/settlement.ts` | `lib/marketplace/settlement.ts` | เขียน settlement ลง DB ใช้ร่วมทุก platform — `saveSettlement()` + `computeOrderCogs()` · ตัว platform แค่แปลงเป็น `NormalizedSettlement` แล้วส่งมา | เขียน logic insert settlement/ต้นทุนซ้ำใน `lib/<platform>/` |
| `marketplace/throttle.ts` | `lib/marketplace/throttle.ts` | เว้นจังหวะระหว่าง call ของถังโควตาเดียวกัน — ค่าอยู่ที่ `minGapMs` ใน registry · เรียกผ่าน `beginMarketplaceCall()` ไม่ต้อง import เอง | ยิง API ภายนอกรัวเป็นชุดโดยไม่เว้นจังหวะ (breaker เป็นตาข่ายรับ ไม่ได้กันไม่ให้โดนแบน) |
| `marketplace/webhook-retry.ts` | `lib/marketplace/webhook-retry.ts` | **worker กลางของ retry webhook ทุก marketplace** — `runWebhookRetry(request, { platform, process })` จัดการ CRON_SECRET · circuit breaker · หยิบใบ `failed` (รวม `next_retry_at` NULL) **และใบค้าง `processing` เกิน 10 นาที** · backoff · dead letter · log สรุปรอบ ให้ครบ · route ของแต่ละเจ้าเหลือแค่ "งานหนึ่งใบทำยังไง" | copy worker ทั้งก้อนไปไว้ที่ `app/api/<platform>/webhook/retry` (เคยซ้ำ 2 ชุด แล้ว Lazada ไม่มีเลย = webhook ที่ fail ไม่มีใครหยิบ) · กรอง `failed` ด้วย `lte(next_retry_at)` เฉย ๆ (NULL จะหลุดตะแกรงถาวร) |
| `marketplace/shop-info.ts` | `lib/marketplace/shop-info.ts` | ดึง **ชื่อร้าน + โลโก้** จากแพลตฟอร์ม — `Record<QuotaPlatform, fetcher>` ที่ TypeScript บังคับให้กรอกครบ · **เพิ่มแพลตฟอร์มใหม่ = เพิ่ม 1 entry ที่นี่ ไม่ต้องแตะ route** · การ์ด `isReachableImage` อยู่ในตัวกลางแล้ว (โลโก้ที่เปิดไม่ได้ถูกตัดเป็น null เพื่อคงของเดิม) | เขียน if แยกแพลตฟอร์มใน route · ทับโลโก้ที่มีอยู่ด้วย URL ที่ยังไม่ได้เช็คว่าโหลดได้ |
| `marketplace/product-helpers.ts` | `lib/marketplace/product-helpers.ts` | helper import สินค้าที่ทุก marketplace ใช้ร่วม — `getOrCreateVariationTypeIds`, `upsertProductImage(s)`, `reactivateProduct`, `tryAutoMatchBySku`, `findMarketplaceLink` (มี `platform` param, default `'shopee'`) | copy helper พวกนี้ไปไว้ใน `lib/<platform>/` ของตัวเอง |
| `print-tracking.ts` | `lib/print-tracking.ts` | markPrinted, markPrintedOptimistic | track print status เอง |
| `order-totals.ts` | `lib/order-totals.ts` | **สูตรเดียวของยอดเงินทั้งระบบ** — `computeOrderTotals()` (สินค้า − ส่วนลด + ค่าส่ง + ค่าการ์ด แล้วถอด VAT) · `splitVatInclusive()` (ถอด VAT จากยอดที่รู้แล้ว) · client-safe · **ยุบมาครบทุกจุดแล้ว 2026-08-30**: OrderForm · OrderSummaryBox · `/api/orders` · POS (จอ+util+API) · storefront checkout · ReplenishmentForm · PDF ฝากขาย/ห้าง · department-orders · เครดิตเปลี่ยนสินค้า | เขียน `/1.07` หรือ `0.07` เองที่ไหนอีก (grep แล้วต้องเจอแค่ไฟล์นี้) · ให้ DB trigger คิด `total_amount` ทับ (เคยกินค่าส่งหายทุกบิล ดู fix-bug.md 2026-08-30) |
| `pdf-utils.ts` → `loadImageDataUrl()` | `lib/pdf-utils.ts` | โหลดรูปเป็น data URL ให้ pdfMake — ยิงตรงก่อน โดน CORS ค่อยวิ่งผ่าน `/api/image-proxy` | `fetch(url)` + `readAsDataURL` เองในไฟล์ PDF (รูปสินค้าที่ host อยู่เว็บอื่นจะขึ้น "-" ทั้งที่หน้าจอเห็นรูป) |
| `print-actions.ts` | `lib/print-actions.ts` | getAvailablePrintActions (by status/payment) | เช็ค print availability เอง |

### Utility Libraries
| Utility | Path | ใช้สำหรับ |
|---------|------|----------|
| `api-client.ts` | `lib/api-client.ts` | `apiFetch()` — authenticated API client (auto token, company_id, dedup GET) |
| `supabase.ts` | `lib/supabase.ts` | `supabase` client (public) + `handleSupabaseError()` |
| `supabase-admin.ts` | `lib/supabase-admin.ts` | `supabaseAdmin` (service role — server only); re-exports `can` from `permissions.ts` |
| `supabase-paging.ts` | `lib/supabase-paging.ts` | `fetchAllRows((from,to) => q.range(from,to))` — ดึงข้ามเพดาน **1,000 แถว** ที่ Supabase Cloud ตัดเงียบ ๆ (`.range()` กว้างแค่ไหนก็ได้ไม่เกินนี้) · ใส่ `{count:'exact'}` ใน query แล้วหน้าที่เหลือยิงขนาน — **query ที่ "ต้องได้ครบ" ต้องผ่านตัวนี้** ส่วนรายการใหญ่ที่ไม่จำเป็นต้องได้ทั้งตารางให้ค้นฝั่ง server แทน |
| `storage-key.ts` | `lib/storage-key.ts` | `storageSafeName(name)` / `storageKeyFor(name, ext?)` — **ทุกที่ที่ประกอบ path ของ Supabase Storage จากชื่อไฟล์ของผู้ใช้ต้องผ่านตัวนี้** · Storage ตีตก key ที่มีอักขระนอก ASCII ด้วย **400 `InvalidKey`** ⇒ ชื่อไฟล์ไทย/อีโมจิ/`#`/`%` อัปไม่ขึ้น และพลาดตั้งแต่ก่อนถึง API จึง**ไม่มี log ที่เซิร์ฟเวอร์ให้ไล่** (ส่งรูปในแชท "ไม่ไปเลย" แบบสุ่มตามชื่อไฟล์ — ดู memo/bugs.md 2026-09-08) · เคย inline กันเอง 3 ที่แล้วหน้าแชททั้ง 3 หน้าไม่มีเลย |
| `image-thumb.ts` | `lib/image-thumb.ts` | `thumbUrl(url, 96\|160\|320)` — URL รูปย่อตามโฮสต์: Supabase storage → `render/image` · Shopee `_tn` · Lazada `_{s}x{s}q80.jpg` · โฮสต์อื่นคืนเดิม · idempotent · **ห้ามใช้กับอวาตาร์/โลโก้/สลิป/QR/lightbox/ImageUploader** (ต้องเห็นของจริง) |
| `permissions.ts` | `lib/permissions.ts` | **Single source of truth** สำหรับ role-based permissions — `can(roles, 'capability')` + 30 capabilities (`inventory.manage`, `customer.edit`, `settings.access`, ฯลฯ) |
| `useAuthGuard.ts` | `lib/useAuthGuard.ts` | Client hook ป้องกันหน้า: `useAuthGuard('cap')` (redirect ไป `/dashboard`) หรือ `useAuthGuard('cap', { noRedirect: true })` (render fallback เอง) |
| `flow-types.ts` | `lib/flow-types.ts` | `isCreditFlow()`, `isCashFlow()`, `isConsignmentFlow()`, `isDepartmentFlow()`, `getFlowLabel()` |
| `status-tab-colors.ts` | `lib/status-tab-colors.ts` | `getTabColor()`, `getBadgeColor()` — ห้ามกำหนดสี status เอง |
| `address-parser.ts` | `lib/address-parser.ts` | `parseThaiAddress()` — parse ที่อยู่ไทย/อังกฤษ |
| `product-display.ts` | `lib/product-display.ts` | `productDisplayName()`, `productSubtitle()`, `cleanVariationLabel()` |
| `parallel.ts` | `lib/parallel.ts` | `parallelLimit()` — async concurrency control |
| `stock-utils.ts` | `lib/stock-utils.ts` | `getStockConfig()` — stock feature by subscription tier |
| `pos-utils.ts` | `lib/pos-utils.ts` | `calculatePosOrderTotals()` — POS VAT calculation |
| `utils/format.ts` | `lib/utils/format.ts` | `formatPrice()`, `formatNumber()`, `formatThaiDate()`, `formatThaiDateTime()` — **ห้ามเขียน `toLocaleDateString('th-TH')` / `toLocaleString` เงินเอง inline** (เคย copy กัน 96/31 จุด สูตร drift 16 แบบ) |
| `utils/download.ts` | `lib/utils/download.ts` | `downloadBlob(blob, filename)` — **ห้ามเขียน `createElement('a')` + `createObjectURL` เอง** (เคยลืม revokeObjectURL = memory leak) |
| `useDebounce.ts` | `lib/useDebounce.ts` | `useDebouncedCallback(fn, delayMs=400)` — debounce search ทุกหน้า list, clear timer ตอน unmount ให้เอง — **ห้ามเขียน setTimeout/clearTimeout debounce เอง** |
| `order-draft.ts` | `lib/order-draft.ts` | ร่างบิลที่กรอกค้างไว้ใน localStorage — `readOrderDraft` / `writeOrderDraft` / `clearOrderDraft` / `isDraftEmpty` + type `OrderDraftSnapshot` · key `chat-order-draft:<company>:<contact>` อายุ 24 ชม. · เปิดใช้โดยส่ง `draftKey` ให้ `OrderForm` (ไม่ส่ง = ไม่มีเรื่องร่าง) — **ห้ามให้ component แตะ localStorage เอง** (Safari โหมดส่วนตัว throw ทุกการเขียน · ห่อ try/catch ไว้ที่นี่แล้ว) · เก็บเฉพาะสิ่งที่ผู้ใช้กรอก **ห้ามใส่สต็อก/ผลค้นหา/รายการอ้างอิง** |
| `thai-address-data.ts` | `lib/thai-address-data.ts` | `searchAddress()`, `PROVINCES` — Thai address DB |

### Bulk Excel Templates — Per-action import/export (อัพเดท 2026-05-27)
| Utility | Path | ใช้สำหรับ |
|---------|------|----------|
| `parse-template.ts` | `lib/bulk/parse-template.ts` | `readFileToRows()`, `rowsToSheet()`, `getCell()`, `validateHeaders()`, `isInstructionRow()` — **header-based** parser (xlsx + csv) |
| `BulkUploadCard` | `components/bulk/BulkUploadCard.tsx` | Upload area (file input + template download + help slot) |
| `BulkPreviewBar` | `components/bulk/BulkPreviewBar.tsx` | Sticky bar เหนือ preview table (badges + cancel/confirm) |
| `BulkErrorModal` | `components/bulk/BulkErrorModal.tsx` | Modal 3 section (Header / Row / Other issues) |
| Hub page | `/products/bulk` | Tiles เลือก action — เพิ่ม action ใหม่ตรงนี้ |
| Module pattern | `/products/bulk/<action>/page.tsx` + `/api/products/bulk/<action>/{export,apply}/route.ts` | Filter → Export → Upload → dry-run preview → Apply |

**ทุก bulk action ใหม่ต้องใช้**:
- `lib/bulk/parse-template.ts` — **ห้ามอ่าน column ตามตำแหน่ง** (เคยมี bug, ดู [fix-bug.md](../../fix-bug.md))
- `BulkUploadCard` + `BulkPreviewBar` + `BulkErrorModal` (no inline copies)
- ExcelJS + lock ID columns (gray + protection) + sheet protection (no password)
- Dedicated RPC ที่ return `{ results, summary: {updated, unchanged, errors}, dry_run }`
- ห้าม double-confirm (ปุ่ม "ยืนยัน" ใน `BulkPreviewBar` เป็น confirmation step เดียว)
- ห้ามรวมหลาย action ใน 1 mega template (parser bug + UX สับสน)

### PDF Generators — ทุกไฟล์ return `Promise<Blob>`
| Generator | Path | เอกสาร |
|-----------|------|--------|
| `generateFullInvoicePdf()` | `lib/order-invoice-full-pdf.ts` | ใบกำกับภาษีแบบเต็ม / ใบส่งสินค้า |
| `generateOrderInvoicePdf()` | `lib/order-invoice-pdf.ts` | ใบกำกับอย่างย่อ / ใบเสร็จ |
| `generateAbbreviatedInvoicePdf()` | `lib/order-invoice-abbreviated-pdf.ts` | ใบกำกับอย่างย่อ |
| `generateDnPdf()` | `lib/order-dn-pdf.ts` | ใบส่งสินค้า |
| `generatePackingPdf()` | `lib/orders-packing-pdf.ts` | ใบจัดของ |
| `generateShippingLabelPdf()` | `lib/order-shipping-label-pdf.ts` | ใบปะหน้า |
| `generateReplenishmentPdf()` | `lib/replenishment-pdf.ts` | ใบเติมสินค้า |
| `generateConsignmentReportPdf()` | `lib/consignment-report-pdf.ts` | ใบแจ้งหนี้ฝากขาย |
| `generateDeptStorePdf()` | `lib/department-store-report-pdf.ts` | ใบแจ้งหนี้ห้าง |
| `generateStatementPdf()` | `lib/statement-pdf.ts` | ใบวางบิล |
| `generateCreditNotePdf()` | `lib/credit-note-pdf.ts` | ใบลดหนี้ |
| `generatePaymentReceiptPdf()` | `lib/payment-receipt-pdf.ts` | ใบเสร็จรับเงิน |
| `showPdfPreview()` | `lib/print-pdf.ts` | แสดง PDF preview + print |
| `mergePdfBlobs()` | `lib/print-pdf.ts` | รวม PDF หลายใบ |
| PDF building blocks | `lib/pdf-utils.ts` | `buildCompanyStack()`, `buildCornerTriangle()`, `buildSignatureFooter()`, `buildProductNameStack()`, `withOriginalAndCopy()`, `formatPdfPrice()`, `formatPdfDate()`, **`formatDeliverySchedule()`** (วันที่+รอบส่ง — ห้ามประกอบเอง) · ⛔ ห้ามใส่ emoji ในเอกสาร (ฟอนต์ไม่มี glyph → กล่องเปล่า) |

### Chat Services
| Service | Path | ใช้สำหรับ |
|---------|------|----------|
| `getChatService()` | `lib/services/chat/index.ts` | Dispatcher (LINE/Facebook) |
| `LineChatService` | `lib/services/chat/line.ts` | LINE messaging |
| `FacebookChatService` | `lib/services/chat/facebook.ts` | Facebook Messenger |
| `buildMessagePreview()` / `htmlToPlainText()` | `lib/chat/message-preview.ts` | ข้อความตัวอย่างบรรทัดเดียว (รายชื่อแชท · push) — ถอด HTML / JSON i18n ให้ · server+client · **ห้ามส่ง `content` ดิบขึ้นรายชื่อหรือแจ้งเตือน** |
| `lineStickerUrl()` / `lineSticonUrl()` | `lib/chat/line-sticker.ts` | ที่อยู่รูปสติกเกอร์/อีโมจิ LINE — วิ่งผ่าน `/api/chat/line-sticker` ของเราเสมอ (แคช edge ถาวร) · ⛔ **ห้ามใส่ `https://stickershop.line-scdn.net/...` ใน `<img src>` ตรง ๆ** โฮสต์ภายนอกแปลว่ารูปจะขึ้นหรือไม่ขึ้นกับเน็ตของคนเปิดหน้าจอ → "บางคนเห็น บางคนไม่เห็น" โดยฝั่งเราไม่มี log อะไรเลย (ดู fix-bug.md 2026-09-09) |
| `findLinkedProduct()` / `findProductByRetailerId()` / `findSyncedOrder()` | `lib/marketplace/chat-enrich.ts` | แปลง item_id ของ marketplace / `retailer_id` ของ Facebook Shop / เลขออเดอร์ เป็นสินค้า/ออเดอร์ในระบบเรา (DB อย่างเดียว · ชื่อ/รูป/ราคาประกอบที่ `buildProductInfo` ที่เดียว) — Shopee/Lazada/FB ใช้ร่วม · ห้าม query `marketplace_product_links`/`products`/`orders` เองใน service ของแพลตฟอร์ม |
| `BROADCAST_PLATFORMS` · `canBroadcastVia()` | `lib/broadcast/platforms.ts` | **ทะเบียนช่องทางส่งข้อความเป็นชุด** — ช่องทางไหนส่งได้ ถึงใครได้ และ **เหตุผลที่ยังส่งไม่ได้** (client-safe: หน้าจอกับ API อ่านตัวเดียวกัน ข้อความที่ผู้ใช้เห็นจึงตรงกับที่ API ตอบ) · เพิ่มช่องทางใหม่ = แก้ที่นี่ + เพิ่ม case ใน `lib/broadcast/run.ts` — **ห้ามเขียนเงื่อนไข "แพลตฟอร์มนี้ส่งได้ไหม" ซ้ำในหน้าหรือ route** |
| `runBroadcast(id, platform)` | `lib/broadcast/run.ts` | จุดเดียวที่แปลง "ใบนี้อยู่ช่องทางไหน" เป็น "เรียกตัวส่งของใคร" — route ทั้งสามตัวเรียกผ่านนี่ **ห้ามเรียก `runLineBroadcast()`/`runTikTokBroadcast()` ตรง ๆ จาก route** |
| `validateBroadcastContent()` · `BroadcastContent` | `lib/broadcast/content.ts` | **เนื้อหาบรอดแคสต์เป็นชนิดกลาง** (`announce`/`promo`/`products`) ไม่ผูกกับแพลตฟอร์ม — หน้าจอกับ API validate ด้วยฟังก์ชันนี้ตัวเดียวกัน · **ห้ามให้ผู้ใช้เลือกเป็นศัพท์ของ LINE** (flex/carousel) และห้าม hardcode ลิมิตซ้ำ (อยู่ใน `compose` ของทะเบียน) |
| `resolveBroadcastTarget()` | `lib/broadcast/accounts.ts` | แปลง "ช่องทาง + บัญชีไหน" เป็นต้นทางจริง — LINE/FB/IG อยู่ `chat_accounts` ส่วน marketplace อยู่ `marketplace_accounts` · **ห้าม query ตารางบัญชีเองใน route** (การเช็คสิทธิ์ข้ามบริษัทจะกระจายแล้วตกหล่น) |
| `runTikTokBroadcast()` · `resolveTikTokRecipients()` | `lib/tiktok/broadcast.ts` + `lib/tiktok/engagement.ts` | ตัวส่งฝั่ง TikTok (Customer Engagement API) — ผู้รับคือ `buyer_email` จากออเดอร์ ≤365 วัน · **ไม่มี idempotency key ระดับข้อความ** จึงใช้ล็อตเล็ก + บันทึกทันที · creds มาจาก `getEngagementCreds()` ที่เดียว |
| `runLineBroadcast()` · `resolveBroadcastRecipients()` · `getLineQuota()` · `getLineFollowerStats()` | `lib/line/broadcast.ts` | ตัวส่งฝั่ง LINE (multicast ล็อตละ 500 + retry key · โควตา · สำเนาลงห้องแชทโดยไม่ขยับ last_message_at) — ห้ามยิง `/message/multicast\|broadcast` เองที่อื่น · **จำนวนผู้ติดตามใช้ `reachable` (= `targetedReaches`) ห้ามใช้ `followers` ซึ่งเป็นยอดสะสมที่ไม่ลดเมื่อโดนบล็อก** · ค่าคงที่ client-safe อยู่ `lib/line/constants.ts` |
| `QuotedMessage` · `renderLineEmojis` (ใน TextBubble) | `app/chat/components/renderers/SharedRenderers.tsx` | บล็อก "ตอบกลับ" จาก `raw_message.quoted` (ครอบทุกชนิดฟองใน MessageBubble) · อีโมจิ LINE จาก `raw_message.emojis` — ห้ามวาดซ้ำในหน้า |
| `normalizeLazadaMessage()` · `normalizeShopeeMessage()` | `lib/lazada/chat-enrich.ts` · `lib/services/chat/shopee.ts` | แปลงข้อความ IM ทุก template + เติมการ์ด (`raw_message.item/order` โครงเดียวกันทุก marketplace — renderer การ์ดใน `app/chat/components/renderers/ShopeeRenderers.tsx` รับ `platform`) |

### Shopee Integration (`lib/shopee/`)
| File | ใช้สำหรับ |
|------|----------|
| `api.ts` | Shopee API client (signing, OAuth, CRUD) |
| `sync.ts` | Order sync (manual + polling) + `mapShopeeStatus()` |
| `product-sync.ts` | Import products from Shopee |
| `product-export.ts` | Export products to Shopee |
| `webhook-processor.ts` | Webhook order sync |
| `auto-sync.ts` | Polling auto-sync |
| `deals.ts` | Promotion push |
| `errors.ts` | Error translation |

### TikTok Integration (`lib/tiktok/`)
| File | ใช้สำหรับ |
|------|----------|
| `api.ts` | TikTok API client (signing, OAuth, token management, endpoints) |
| `sync.ts` | Order sync (manual + polling) + `mapTikTokStatus()` |
| `webhook-processor.ts` | Webhook order sync (shared with retry) |
| `errors.ts` | Error translation (TikTok → Thai messages) |

### งานเบื้องหลังใน route handler — **ต้อง `after()` เสมอ** (เพิ่ม 2026-08-29)

| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| งานที่ไม่อยากให้ผู้ใช้รอ แต่**ต้องได้ทำจริง** (push ขึ้น marketplace, ส่ง noti, ออกเอกสารอัตโนมัติ) | **`after(() => work())`** จาก `next/server` — เรียกใน request handler ตรงๆ และฟังก์ชันเบื้องหลังต้อง **return promise** | `work().catch(() => {})` ลอยๆ ก่อน `return NextResponse.json()` |
| log ที่หายไม่ได้ (error ของ API ภายนอก) | `await logIntegrationNow()` | `logIntegration()` แบบปล่อยลอยในงานที่กำลังจะจบ |

- **เหตุผล**: Vercel **freeze ฟังก์ชันทันทีที่ response ออก** — งานที่ยังไม่จบตายกลางทาง (request ออกไปถึงปลายทางแต่ไม่จบ = ปลายทางนับเป็น fail) · push stock ขึ้น Shopee ตายแบบนี้เงียบๆ **3 เดือน** เพราะ log ก็ปล่อยลอยเหมือนกัน **งานตาย + หลักฐานตาย พร้อมกัน** (ดู [fix-bug.md](../../fix-bug.md) 2026-08-29)
- **`after()` ต้องมีอะไรให้รอ** — ฟังก์ชัน `void` ใส่ใน `after()` ไม่ช่วยอะไร · `lib/shopee/auto-sync.ts` จึงมีคู่: `syncStockNow/syncPriceNow/syncInfoNow/syncCategoryNow` (await ได้ — **ใช้ตัวนี้ใน route**) กับ `triggerShopee*Sync` (void — เหลือไว้ให้ที่ที่ไม่มี request context เท่านั้น)
- **วาง log ให้ชิดจุดยิง API ภายนอกที่สุด** ไม่ใช่ที่ชั้นงาน — บั๊กข้างบนหาไม่เจอ 3 เดือนเพราะ log อยู่ชั้นบนสุดที่ตายพร้อมงาน · ตอนนี้ `shopeeApiRequest` log ทุก call ที่ fail ให้เองผ่าน [lib/shopee/api-log.ts](../../lib/shopee/api-log.ts)
- **field ที่ stamp เฉพาะตอนสำเร็จ** (เช่น `last_stock_pushed_at`) คือสัญญาณเดียวที่จับ "พังเงียบ" ได้ — ค้างนานผิดปกติ = ต้องไปดู

---

## 5. Key API Routes (ใช้ existing routes — ห้ามสร้าง duplicate)

### Core CRUD Patterns
| Resource | Route | Methods |
|----------|-------|---------|
| Orders | `/api/orders` | GET, POST, PUT, DELETE |
| Dealer Orders | `/api/dealer-orders` | GET, POST + `[id]` GET, PUT |
| Department Orders | `/api/department-orders` | GET, POST + `[id]` GET, PUT |
| Replenishments | `/api/replenishments` | GET, POST + `[id]` GET, PUT |
| Products | `/api/products` | GET, POST, PUT, DELETE |
| **ค้นสินค้าให้ช่อง dropdown** | `/api/products/search` | GET `?q=&limit=` → `{ items, complete }` — RPC `search_order_products` รอบเดียว คืนแถวแบน ~30KB (`/api/products?search=` ยิง DB 3 รอบ ~220KB เพราะคืนสินค้าทั้งก้อนให้หน้า `/products`) · คู่กับ `useServerSearch` |
| Customers | `/api/customers` | GET, POST, PUT, DELETE |
| Inventory | `/api/inventory` | GET, POST |
| **ร้าน marketplace ที่เชื่อมต่อ (ทุกแพลตฟอร์ม)** | `/api/marketplace/accounts` | GET `?platform=shopee\|tiktok\|lazada\|all` · PUT (คลัง/auto-sync) · PATCH `{id, shop_logo}` ตั้งลิงก์รูปเอง · DELETE · **ย่อย**: `/resync` ดึงชื่อ+โลโก้ใหม่ · `/logo` อัปโหลดไฟล์ — *เดิมอยู่ที่ `/api/shopee/accounts` ย้ายมาชื่อกลาง 2026-08-30* |

### Customer Context (1 RPC — ห้ามเรียกหลาย API)
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/customers/order-context?customer_id=xxx` | ดึง customer + shipping + brand commissions + GP settings ใน 1 call |

### Document Routes
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/consignment/reports` | GET, POST + `[id]` GET, PUT |
| `/api/department-store/reports` | GET, POST + `[id]` GET, PUT |
| `/api/statements` | GET, POST + `[id]` GET, PUT |
| `/api/credit-notes` | GET, POST + `[id]` GET, PATCH |
| `/api/payment-records` | GET, POST |
| `/api/payment-records/verify` | POST (approve/reject slip) |

### Shopee Routes
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/shopee/sync` | Manual sync by order_sn |
| `/api/shopee/sync-order` | Sync single order |
| `/api/shopee/orders/ship` | Ship Shopee order |
| `/api/shopee/orders/shipping-document` | Get shipping label |
| `/api/shopee/products/export` | Export product to Shopee |
| `/api/shopee/products/import` | Import from Shopee |
| `/api/shopee/webhook` | Webhook endpoint |

### TikTok Routes
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/tiktok/oauth/auth-url` | Generate OAuth URL |
| `/api/tiktok/oauth/callback` | OAuth callback (token exchange) |
| `/api/tiktok/webhook` | Webhook endpoint |
| `/api/tiktok/webhook/retry` | Retry failed webhooks |
| `/api/tiktok/sync` | Manual sync by account |
| `/api/tiktok/sync-all` | Cron: sync all TikTok accounts |
| `/api/tiktok/sync-order` | Sync single order |

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

**Capability ที่มี** (เลือกตัวที่ตรงความหมายที่สุด): `company.*` · `members.*` · `settings.*` · `masterdata.*` (12 หน้า) · `order.{view,manage,split,delete}` · `chat.{view,reply}` · `product.{view,manage,bulk_edit}` · `inventory.{view,manage}` · `customer.{view,edit}` · `finance.{view,manage}` · `pos.{sell,view,manage}` · `counter.{record,manage}` · `marketplace.*` · `supplier.edit` · `report.supplier.*` · `onboarding.manage` · `logs.view` · `invoice.backfill`

**เพิ่ม capability ใหม่** = เพิ่ม 1 บรรทัดใน `CAPABILITIES` (pattern `{domain}.{action}`) แล้วใส่ token: `ADMIN_TIER` / `ADMIN_PLUS` / `OWNER_ONLY` และ (ถ้าเปิดให้ staff) token ของกลุ่มงาน เช่น `[...ADMIN_TIER, 'orders:manage']` — เมนูใน Sidebar อ้าง capability นี้ได้ทันที

**UI ของตำแหน่ง/สิทธิ์มีชุดเดียว — `components/members/`** (ห้ามสร้างใหม่):

| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| ตั้งตำแหน่ง + กลุ่มงาน + ขอบเขตคลัง/POS + ต้นทุน + PC หน่วยแทน | **`PermissionEditor`** — โมดัลเชิญกับโมดัลแก้ไขใช้ตัวเดียวกัน (`showPcRover={false}` ตอนเชิญ เพราะ `company_invitations` ไม่มีคอลัมน์นั้น) | checkbox หลาย role · dropdown ตำแหน่ง · บล็อกเลือกคลังที่ประกอบเอง |
| แสดงว่า "คนนี้เป็นใคร เห็นอะไร" | **`AreaBadges`** (ตำแหน่ง + กลุ่มงาน) · `RoleBadge` (ตำแหน่งอย่างเดียว) · `AreaCell` + `AreaLegend` (ตาราง "ใครเห็นอะไร") | ตาราง `ROLE_LABELS`/`ROLE_COLORS` ประจำไฟล์ (เคยมี 3 ชุดแล้วชื่อ/สีไม่ตรงกันสักชุด) |

- ป้ายกำกับ/คำอธิบายทั้งหมดอ่านจาก `ROLE_LEVELS` · `AREAS` · `STAFF_PRESETS` — **ห้าม hardcode ชื่อตำแหน่งหรือชื่อกลุ่มงานเป็นสตริงในหน้าใด ๆ**
- ระดับสิทธิ์อ่านจาก `role` + `permissions` ที่ API ส่งมา **ห้ามอ่านจาก `roles[]` ดิบ** (ค่าเก่ายังค้างใน DB — `mainRoleOf()`/`permissionsFromLegacyRoles()` แปลงให้แล้วที่ชั้น API)
