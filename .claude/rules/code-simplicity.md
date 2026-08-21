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
| Card / surface (white shadow box) | `Card` (padding: none/sm/md/lg) | inline `<div className="bg-white rounded-lg shadow-sm p-X">` |
| Container / page max-width wrapper | `Container` (size: sm…6xl/full + gap) | inline `<div className="max-w-5xl space-y-6">` |
| Badge / tag (8 tones × pill/square × sm/md) | `Badge` | inline `<span className="bg-X-50 text-X-700 px-2 py-0.5 rounded-full">` |
| Page header (back + title + subtitle + actions) | `PageHeader` | inline header layout ทุกครั้ง — **เมื่อใช้ PageHeader ห้ามใส่ `title`/`breadcrumbs` ใน `<Layout>` อีก** (จะ duplicate) |
| Content tabs (underlined border-b style) | `Tabs` (state-based via `onSelect` หรือ route-based via `href`) | inline `<div className="flex border-b">...<button border-b-2>...` chain — **อย่าสับสนกับ `StatusTabs`** ที่ใช้สำหรับ list-page filter (count ใหญ่ + solid pill) |
| Social platform icon (FB / LINE / IG / TikTok) | `PlatformIcon` (`id`, `size`, `title`) | inline `<Image src="/social/X.svg">` — **ห้ามสร้าง local FbIcon/LineIcon/IgIcon helper** ในแต่ละหน้า (duplicated 3 ครั้งแล้วต้อง refactor) |
| หน้าจอขายแบบ POS (product grid + ตะกร้า + barcode/กล้องสแกน + mobile tab) | `PosSaleScreen` (`components/pos/`) — props `warehouseId`/`topBar`/`onCheckout` + ref `clearCart()`/`refreshProducts()` + `enablePromotions?`/`extraProductParams?` | copy โค้ดหน้า `/pos` ไปแก้ — `/pos` (session+ชำระเงิน+ใบเสร็จ) และ `/pc` (บันทึกยอด PC ไม่จับเงิน) ห่อ component เดียวกันอยู่แล้ว |
| Loading **ชั้น 1** — ยังไม่รู้ว่าใคร/บริษัทไหน (เปิดเว็บครั้งแรก, refresh, สลับบริษัท, กลับจาก OAuth) | `FullPageLoading` (from `Loading.tsx`) — splash สีแบรนด์ + โลโก้หมุน บังทั้งจอ | สร้าง `border-4 border-primary animate-spin` เอง |
| Loading **ชั้น 2** — เปลี่ยนหน้าในระบบ (chrome วาดแล้ว) | **`loading.tsx` ของ segment นั้น → `AppSegmentLoading`** (ห่อ `PageSkeleton`) — segment ใหม่ต้องสร้าง `loading.tsx` ด้วยเสมอ | ปล่อยให้ตกไปใช้ `app/loading.tsx` (splash เต็มจอจะกระพริบทับ sidebar ทุกครั้งที่กดเมนู) |
| Loading **ชั้น 3** — อยู่ในหน้าแล้ว กำลัง**อ่าน**ข้อมูลของบล็อกใดบล็อกหนึ่ง | `LoadingCard` (from `StateCard.tsx`) | inline spinner + ข้อความเอง · `Loader2` ตัวใหญ่กลางบล็อก |
| Loading **ชั้น 4** — ผู้ใช้สั่งงานเป็นชุด ระบบกำลัง**เขียน**ข้อมูล | `LoadingOverlay` — บังจอกันกดซ้ำ + progress `(7/20)` | ปล่อยให้กดซ้ำได้ระหว่างทำงาน (ออเดอร์จะโดนรับสองรอบ) |
| Loading — spinner เล็กในปุ่ม/ในแถว | `Loader2` ของ lucide ตรง ๆ (`Button` มี `loading` prop อยู่แล้ว) | — |
| อยากได้ skeleton ในจุดอื่น | `PageSkeleton variant="list\|form\|dashboard\|detail"` หรือชิ้นย่อย `SkeletonTable/List/Form/Stats/Card/Text` (from `Skeleton.tsx`) | ใช้ spinner ทั้งที่รู้ layout (skeleton รู้สึกเร็วกว่า + หน้าไม่เด้ง) |

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
| Focus action button | `.btn-focus-action` + `.green/.indigo/.amber` | list page row action |

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
| Multi-select dropdown + search (chips trigger, checkbox list) | `MultiSelectSearch` | chip-toggle list เรียงยาว / สร้าง multi-select dropdown เอง |
| ค้นหาลูกค้า/สินค้า | `EntitySearchInput` | สร้าง search dropdown เอง |
| ค้นหาสินค้า (พร้อมราคา/รูป/variation) | `ProductSearchInput` | สร้าง product picker เอง |
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
| เลือกสี (ชุดสีสำเร็จรูป + จานสี + กรอกรหัสเอง) | `ColorPicker` — เปิด Modal จานสี · presets จาก `lib/color-presets.ts` | วาง `<input type="color">` ดิบ ๆ ในหน้า |
| ตัวเลือกที่ **อธิบายด้วยภาพได้ดีกว่าคำ** (สัดส่วนรูป, เลย์เอาต์, สไตล์แถบ) | `OptionCards` — การ์ดพร้อม `preview` ที่วาดรูปทรงจริง | ใช้ `FormSelect` แล้วให้ผู้ใช้เดาเองว่าหน้าตาเป็นยังไง |

### Display Components
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| แสดงข้อมูลลูกค้า (ชื่อ+badge+เบอร์) | `CustomerInfoCard` | สร้าง customer display เอง |
| เลือกลูกค้า+ที่อยู่+ภาษี | `CustomerSelectionCard` | สร้าง customer picker เอง |
| ข้อมูลใบกำกับ (แสดง) | `TaxInvoiceInfo` | สร้าง tax display เอง |
| แก้ไขใบกำกับ (modal) | `TaxInvoiceEditModal` | สร้าง tax edit form เอง |
| สรุปยอด (editable) | `OrderSummaryBox` | สร้าง totals box เอง |
| สรุปยอด (แบบ card) | `OrderSummaryCard` | สร้าง totals card เอง |
| Tag/Badge | `TagBadge` | สร้าง badge เอง (8 สีพร้อมใช้) |
| Tooltip | `Tooltip` | สร้าง tooltip เอง |

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
| Dropdown menu (row action) | `ActionMenu` (portal, z-9999) | สร้าง inline dropdown เอง |
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
| `print-tracking.ts` | `lib/print-tracking.ts` | markPrinted, markPrintedOptimistic | track print status เอง |
| `print-actions.ts` | `lib/print-actions.ts` | getAvailablePrintActions (by status/payment) | เช็ค print availability เอง |

### Utility Libraries
| Utility | Path | ใช้สำหรับ |
|---------|------|----------|
| `api-client.ts` | `lib/api-client.ts` | `apiFetch()` — authenticated API client (auto token, company_id, dedup GET) |
| `supabase.ts` | `lib/supabase.ts` | `supabase` client (public) + `handleSupabaseError()` |
| `supabase-admin.ts` | `lib/supabase-admin.ts` | `supabaseAdmin` (service role — server only); re-exports `can` from `permissions.ts` |
| `permissions.ts` | `lib/permissions.ts` | **Single source of truth** สำหรับ role-based permissions — `can(roles, 'capability')` + 30 capabilities (`inventory.manage`, `customer.edit`, `settings.access`, ฯลฯ) |
| `useAuthGuard.ts` | `lib/useAuthGuard.ts` | Client hook ป้องกันหน้า: `useAuthGuard('cap')` (redirect ไป `/dashboard`) หรือ `useAuthGuard('cap', { noRedirect: true })` (render fallback เอง) |
| `flow-types.ts` | `lib/flow-types.ts` | `isCreditFlow()`, `isCashFlow()`, `isConsignmentFlow()`, `isDepartmentFlow()`, `getFlowLabel()` |
| `status-tab-colors.ts` | `lib/status-tab-colors.ts` | `getTabColor()`, `getBadgeColor()` — ห้ามกำหนดสี status เอง |
| `address-parser.ts` | `lib/address-parser.ts` | `parseThaiAddress()` — parse ที่อยู่ไทย/อังกฤษ |
| `product-display.ts` | `lib/product-display.ts` | `productDisplayName()`, `productSubtitle()`, `cleanVariationLabel()` |
| `parallel.ts` | `lib/parallel.ts` | `parallelLimit()` — async concurrency control |
| `stock-utils.ts` | `lib/stock-utils.ts` | `getStockConfig()` — stock feature by subscription tier |
| `pos-utils.ts` | `lib/pos-utils.ts` | `calculatePosOrderTotals()` — POS VAT calculation |
| `utils/format.ts` | `lib/utils/format.ts` | `formatPrice()`, `formatNumber()` |
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
| PDF building blocks | `lib/pdf-utils.ts` | `buildCompanyStack()`, `buildCornerTriangle()`, `buildSignatureFooter()`, `buildProductNameStack()`, `withOriginalAndCopy()`, `formatPdfPrice()`, `formatPdfDate()` |

### Chat Services
| Service | Path | ใช้สำหรับ |
|---------|------|----------|
| `getChatService()` | `lib/services/chat/index.ts` | Dispatcher (LINE/Facebook) |
| `LineChatService` | `lib/services/chat/line.ts` | LINE messaging |
| `FacebookChatService` | `lib/services/chat/facebook.ts` | Facebook Messenger |

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
| Customers | `/api/customers` | GET, POST, PUT, DELETE |
| Inventory | `/api/inventory` | GET, POST |

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

### Permissions — ใช้ `can()` + `useAuthGuard()` เสมอ (อย่าใช้ role check แบบเดิม)
- **Single source of truth**: [lib/permissions.ts](../../lib/permissions.ts) — 30 capabilities (`inventory.manage`, `customer.edit`, `settings.access`, `marketplace.sync`, ฯลฯ)
- **เพิ่ม/แก้สิทธิ์** → แก้ที่ `lib/permissions.ts` ไฟล์เดียว (capability matrix + role groups)
- **ห้ามเขียน** `roles.includes('admin') || roles.includes('owner') || ...` กระจายในไฟล์ — ใช้ `can(roles, 'capability')` เสมอ
- **ห้ามใช้** deprecated helpers: `isAdminRole`, `isStrictAdmin`, `canBulkEdit`, `canManageInventory`, `hasAnyRole` (เก็บไว้เป็น @deprecated alias ใน supabase-admin.ts)

**Pattern**:
```ts
// API route
import { can } from '@/lib/supabase-admin';  // or '@/lib/permissions'
if (!can(auth.companyRoles, 'inventory.manage')) return 403;

// Client page — redirect (default /dashboard)
import { useAuthGuard } from '@/lib/useAuthGuard';
useAuthGuard('customer.edit');

// Client page — render NoPermissionCard
const { allowed, loading } = useAuthGuard('settings.access', { noRedirect: true });
if (loading) return <LoadingCard />;
if (!allowed) return <NoPermissionCard />;

// Conditional UI flag
import { can } from '@/lib/permissions';
const canEdit = can(userProfile?.roles, 'customer.edit');
```

**Capability ที่มี (เลือกตัวที่ตรงความหมายที่สุด)**:
- `company.*` — delete, edit
- `members.*` — view, invite, grant_admin (strict, ป้องกัน privilege escalation)
- `settings.*` — access, delete_all_data
- `masterdata.*` — warehouses, carriers, suppliers, payment_channels, sales_channels, pos_terminals, chat_channels, brands, categories
- `inventory.*` — view, manage (transfer/receive/issue/adjust)
- `product.bulk_edit`
- `customer.*` — view, edit
- `supplier.edit`, `report.supplier.*` — view, create, delete
- `marketplace.*` — connect, sync, ship, push
- `order.split`, `pos.manage`, `onboarding.manage`, `logs.view`, `invoice.backfill`

ถ้าต้อง capability ใหม่ → เพิ่มใน `CAPABILITIES` matrix ของ [lib/permissions.ts](../../lib/permissions.ts) (ใช้ pattern `{domain}.{action}`)
