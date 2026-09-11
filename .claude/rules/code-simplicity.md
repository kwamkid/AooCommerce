---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "lib/**/*.tsx"
  - "lib/use*.ts"
  - "app/globals.css"
---
# Code Simplicity & Reuse Rules

> UI/hooks/CSS = ไฟล์นี้ · services/utilities/API routes = [lib-services.md](lib-services.md) · สิทธิ์ = [permissions.md](permissions.md)
> **เขียนสั้น**: 1 แถว = ของกลาง + กติกา + สิ่งที่ห้าม · ไม่ใส่วันที่/เล่าประวัติ (ไปอยู่ fix-bug.md / commit message)

## Core Principle
เช็ค `components/ui/` · `lib/` · hooks · `app/api/` ก่อนสร้างอะไรใหม่เสมอ — ข้อมูลส่วนใหญ่เหมือนกัน = ใช้ตัวเดียวกัน **ห้ามสร้างใหม่ซ้ำซ้อน** · ขาด feature → เพิ่ม prop ให้ตัวเดิม · ห้าม copy-paste แล้วแก้ (extract เป็นของกลาง) · ไม่มีจริง: UI → `components/ui/` · logic → `lib/` · hook ใช้หลายหน้า → `lib/`

Reference: [/dev/design](../../app/dev/design/page.tsx) (ทุก variant) · [/dev/demo](../../app/dev/demo/page.tsx) (template dashboard/list)

## 1. Shared UI Components (`components/ui/`)

### Layout / สถานะ / Loading
| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| ปุ่ม | `Button` (variants ด้านล่าง · sizes · `loading` · `icon` · `fullWidth`) | `<button className="bg-[#F4511E]…">` |
| ปุ่ม Export / Import | `ExportButton` / `ImportButton` (icon baked: Export = `Upload` ↑ · Import = `Download` ↓) | Button + Upload/Download เอง (สลับบ่อย) |
| ปุ่มบันทึกฟอร์ม/โมดัล | `SaveButton` (คำ "บันทึก" + icon Save baked) | ประกอบเอง · label แปลก ("บันทึกข้อมูล") — ยกเว้นปุ่มบันทึกชำระ/บันทึกยอด |
| Card | `Card` (padding none/sm/md/lg) | `<div className="bg-white rounded-lg shadow-sm p-X">` |
| Page wrapper | `Container` (size: `full` list · `6xl` dashboard · `5xl` bulk (default) · `4xl` hub · `2xl` detail/edit · `xl` settings แคบ · + gap) | `<div className="max-w-5xl space-y-6">` |
| Badge / tag | `Badge` (8 tones × pill/square × sm/md) | `<span className="bg-X-50 text-X-700 …rounded-full">` |
| Badge **สถานะ** ทุกโดเมน | **`StatusBadge`** `<StatusBadge domain="statement" status={x} />` → คำเรียก+สี+ไอคอน · โดเมน: `order · orderDealer · payment · customerOrder · customerPayment · statement · replenishment · deptOrder · report · creditNote · creditNoteType · returnNote · promotion · transfer · stockDoc · posOrder · purchaseOrder · purchaseOrderSupplier · supplierReport · supplierType · broadcast` · props `size` `hideIcon` `trailing` | map สถานะในหน้า (`STATUS_CONFIG`/`STATUS_LABELS`/`statusBadge()`) · `getBadgeColor()` ทำ badge เอง · `<Badge tone>` กับสถานะ |
| ทางลัดคู่ที่ใช้บ่อย | **`OrderStatusBadge` / `PaymentStatusBadge`** ([OrderStatusBadge.tsx](../../components/ui/OrderStatusBadge.tsx)) — `dealer` · `audience="customer"` (หน้าที่ลูกค้าเปิด) · `expired` (แดง) | `<StatusBadge domain="order">` ซ้ำ ๆ ในหน้า |
| ป้ายที่ **ไม่ใช่สถานะ** (กำหนดส่ง · ขนส่ง · บทบาท · สถานะดิบ marketplace) | **`InfoChip`** (ไฟล์เดียวกัน ส่งสีเองได้) | ยัดเข้าทะเบียนสถานะ · `<span rounded-full>` เอง |
| สถานะ/คำเรียก/โดเมนใหม่ | [lib/status-labels.ts](../../lib/status-labels.ts) **ที่เดียว** · สีจริง `--st-*` + `.badge-st-*` ใน globals.css · ไอคอน `DOMAIN_ICON` ใน `StatusBadge.tsx` | ⛔ map สถานะแบนใบเดียวทั้งระบบ — key ชนข้ามตาราง (`draft` = แบบร่าง ที่ใบวางบิล / ที่ต้องจัดส่ง ที่ออเดอร์ห้าง · `pending` = ที่ต้องจัดส่ง ที่ใบเติมของ / รอชำระ ที่การชำระ) |
| Page header | `PageHeader` — list page ไม่ส่ง `backHref` (heading-1) · sub-page ส่ง `backHref` (heading-2) · ปุ่มใส่ `actions` · `icon={<Package2 />}` เปล่า ๆ (ขนาด/สีจัดให้) · นอก `Container` ใช้ `className="mb-6"` | `<h1>` เอง · ใส่ `title`/`breadcrumbs` ใน `<Layout>` คู่กับ PageHeader · วาง PageHeader คู่ div ปุ่มเอง |
| Content tabs | `Tabs` (segmented control · `onSelect` หรือ `href` · `fill` เต็มแถว · `size="sm"` แท็บย่อยในการ์ด · `iconPosition="top"` · `activeColorClass`) · ⚠️ แถบที่วาง Tabs ห้ามมี `bg-white` ของตัวเอง (ทับรางเทา) | เขียนแท็บเอง · สับสนกับ `StatusTabs` (filter สถานะหน้า list — ห้ามรวม) |
| Social platform icon | `PlatformIcon` (`id` `size` `title` · **`mono`** = currentColor บนปุ่ม primary/พื้นสี) | `<Image src="/social/X.svg">` · helper FbIcon/LineIcon เองในหน้า |
| เลือกช่องทาง/บัญชี | **`AccountPicker`** (`multiple` · `allOption` · `disabled`+`disabledReason` ต่อแถว · รูปผ่าน `ChannelBadge`) — หน้าแชทและบรอดแคสต์ใช้ร่วม | เรียงรายการติ๊กยาว (ร้านมีได้หลายสิบบัญชี) · ป๊อปอัปเอง · **ซ่อนช่องทางที่ใช้ไม่ได้** (โชว์กดไม่ได้ + เหตุผล) |
| Avatar ช่องทางขาย + icon platform | `ChannelBadge` (`channel={platform, picture_url}`) + `PLATFORM_ICONS` จากไฟล์เดียวกัน | overlay เอง · ประกาศ `PLATFORM_ICONS` ซ้ำ |
| Dropdown ที่ต้องพลิกขึ้น | **`useDropUp(triggerRef, {...})`** ([lib/useDropUp.ts](../../lib/useDropUp.ts) → `dropUp` `rect` `height`) หรือ `shouldDropUp(rect, h, opts)` · dropdown แบบ portal (`fixed`) ใส่ **`recalcOnScroll: true`** | คำนวณ `window.innerHeight - rect.bottom` เอง |
| แถบขั้นตอน (checkout · wizard · ติดตามออเดอร์) | **`Stepper`** (`steps=[{key,label,note?,state:'done'\|'current'\|'todo',href?}]` · `href` ข้ามหน้า · `onSelect` ในหน้า) · สไตล์ `.stepper*` | step bar เอง · ผูกสีแบรนด์ร้าน |
| จอขายแบบ POS | `PosSaleScreen` (`components/pos/` · `warehouseId` `topBar` `onCheckout` · ref `clearCart()`/`refreshProducts()` · `enablePromotions?` `extraProductParams?`) — `/pos` และ `/pc` ใช้ร่วม | copy หน้า `/pos` |
| Loading 1 — ยังไม่รู้ผู้ใช้/บริษัท | `FullPageLoading` (`Loading.tsx`) | spinner เอง · `PageLoading`/`Spinner` (ลบแล้ว) |
| Loading 2 — เปลี่ยนหน้า | `loading.tsx` ของ segment → `AppSegmentLoading` — **segment ใหม่ต้องมีเสมอ** | ปล่อยตกไป `app/loading.tsx` (splash กระพริบทับ sidebar) |
| Loading 3 — อ่านข้อมูลในบล็อก | `LoadingCard` (`StateCard.tsx`) — ไม่ส่ง `title` = skeleton · ส่ง `title` เฉพาะงานประมวลผลที่ควรบอก ("กำลังตรวจสอบข้อมูล...") | spinner+ข้อความเอง · `Loader2` ใหญ่กลางบล็อก · `title="กำลังโหลด..."` |
| Loading 4 — เขียนข้อมูลเป็นชุด | `LoadingOverlay` (บังจอ + progress `(7/20)`) | ปล่อยกดซ้ำได้ระหว่างทำงาน |
| spinner ในปุ่ม/แถว | `Loader2` (Button มี `loading`) | — |
| skeleton อื่น | `PageSkeleton variant="list\|form\|dashboard\|detail"` / `SkeletonTable/List/Form/Stats/Card/Text/Chat` (`Skeleton.tsx` · `SkeletonChat` = ตอนเปิดห้องแชท) | spinner ทั้งที่รู้ layout |
| Empty / ไม่มีสิทธิ์ / ผลลัพธ์ | `EmptyCard` · `NoPermissionCard` · `DoneCard` (`StateCard.tsx`) | สร้างเอง |
| KPI · bar · sparkline · progress | `Stat` · `BarChart` · `Sparkline` · `ProgressBar` (`Chart.tsx`) | สร้างเอง · ติดตั้ง chart lib |

**Button variants**: `primary` CTA ส้ม · `secondary` ยกเลิก · `ghost` toolbar · `danger` ลบ/void · `success` ยืนยัน (หายาก) · `indigo`/`amber` ปุ่มหลักในแถว list page (รับออเดอร์เครดิต/ลูกค้าชำระแล้ว · จัดส่ง — ใช้แทน `.btn-focus-action` ที่ยุบแล้ว · การ์ดมือถือใช้ `fullWidth`)
**ความสูง control**: sm 32px (`h-8`) · **md 42px** (default Button/FormSelect = `<input>` · `.btn-md`/`.form-control-md`) · lg 44px (`h-11`) — วางคู่กันใช้ size เดียวกัน

### Global CSS (`app/globals.css`) — แก้หน้าตาที่นี่ที่เดียว ไม่ใช่ className ของ component
| Group | Classes |
|---|---|
| Typography | `.heading-1` (3xl bold · list title) · `.heading-2` (2xl · PageHeader) · `.heading-3` (lg semibold · card) · `.heading-4` · `.body-text` · `.subtitle-text` · `.helper-text` · `.page-subtitle` · `.section-desc` · `.field-label` (16px medium) — ใช้แทน `text-Nxl font-bold …` · ย่อเองบนมือถือ |
| Button / Card / Badge | `.btn` `.btn-{sm/md/lg}` `.btn-{variant}` · `.card` `.card-flat` `.card-p-{sm/md/lg}` · `.badge` `.badge-{sm/md}` `.badge-{pill/square}` `.badge-{tone}` |
| Modal | `.modal-root` `.modal-backdrop` `.modal-panel` `.modal-header` `.modal-body` `.modal-footer` `.modal-title` `.modal-close-btn` |
| Table / filter | `.data-table-wrap` `.data-thead` `.data-th` `.data-tbody` `.data-tr` `.data-td` `.data-pagination` · `.data-filter-card` |

### DataTable — ทุกหน้า list ต้องใช้ (`components/ui/DataTable.tsx`)
desktop table + mobile cards (auto / `mobileCardRender`) + pagination (20/50/100/200 · `DEFAULT_RECORDS_PER_PAGE` = 20) + column toggle + selection (`selectedIds`/`onSelectionChange`) + loading/empty + row click · `storageKey` แยกต่อหน้า
```tsx
<DataTable storageKey="orders" data={rows} getRowId={(r) => r.id}
  columns={[{ key: 'order_no', label: 'เลขที่', sortable: true, resizable: true, reorderable: true, defaultWidth: 130,
    render: (r) => r.order_no,
    edit: { type: 'number' /* |'text'|'select' */, getValue: (r) => r.value, onSave: async (r, v) => {}, options: [], validate: (v) => null } }]}
  // คอลัมน์: alwaysVisible (ห้ามซ่อน) · stopPropagation (ช่อง ActionMenu)
  currentPage={page} totalPages={n} totalRecords={total} recordsPerPage={per} onPageChange={setPage} onRecordsPerPageChange={setPer}
  sortBy={sortBy} sortDir={sortDir} onSort={(key, dir) => {}} />
```
- localStorage `dt-widths:` · `dt-order:` · `col-toggle:{storageKey}` · ปุ่ม ↻ รีเซ็ตทั้ง 3
- คอลัมน์สุดท้าย auto-flex (resize ไม่ได้ — reorder ออกก่อน) · ความกว้างเริ่มเป็น % แล้วเป็น px หลัง resize ครั้งแรก · min 80px · header `min-width: max-content`

### Form Inputs
| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| Dropdown | `FormSelect` | native `<select>` |
| ช่องตัวเลข (ราคา/จำนวน/น้ำหนัก/สต็อก) | `NumberInput` (state number) · `FormInput type="number"` / `PostfixInput` / `DiscountInput` / `PriceDiscountCombo` (state string) — ทั้งหมดวาด `type="text" inputMode="decimal"` + กรองผ่าน [lib/numeric-input.ts](../../lib/numeric-input.ts) · `<input>` ดิบใส่ `{...NUMERIC_TEXT_INPUT_PROPS}` + `onNumericChange(...)` | **`<input type="number">`** — ล้อเมาส์/แทร็กแพดเปลี่ยนค่าเงียบ ๆ ขณะ focus (ค่าส่ง 100→99.96 ลูกค้าจ่ายผิดแล้ว) CSS กันไม่ได้ |
| Multi-select + ค้นหา | `MultiSelectSearch` | chip list ยาว · multi-select เอง |
| ค้นลูกค้า/entity | `EntitySearchInput` — รายการใหญ่ส่ง **`onSearchChange`** (โหมด API · debounce 300ms) + `loading`/`minSearchLength` · parent ต่อ `useServerSearch` | dropdown ค้นหาเอง · โหลดทั้งตารางให้กรอง · seq/debounce/cache เอง |
| ค้นสินค้า (ราคา/รูป/variation) | `ProductSearchInput` — โหมด API เหมือนกัน (ผ่าน `ItemsTable` = `onProductSearchChange` · ผ่าน `CustomerSelectionCard` = `onCustomerSearchChange`) + `useServerSearch` + `/api/products/search` · ผลค้นหาเป็น portal (`fixed z-[9999]`) วางใน `overflow:hidden`/การ์ด/โมดัลได้ | picker เอง · **ส่งสินค้าทั้งร้านไปกรองใน client** (เพดาน 1,000 แถวของ Supabase → หาไม่เจอเงียบ ๆ) |
| ตารางสินค้าในฟอร์ม · ที่อยู่ไทย · ข้อมูลภาษี (บุคคล/นิติบุคคล) | `ItemsTable` · `ThaiAddressInput` · `TaxInfoForm` | สร้างเอง |
| input ต่อท้ายหน่วย (฿ kg %) | `PostfixInput` — override ด้วย **`classNames={{frame,text}}`** (แทนที่ ไม่ต่อท้าย: `frame` = กรอบ/focus/พื้น/มุม · `text` = ขนาด/ชิด/สี) · div 2 ชั้น: `className` = ชั้นนอก (ใส่ `flex-1`) · `width` = ชั้นใน | หนีไปเขียน `<input>` เพราะ `inputClassName` ทับสี base ไม่ได้ |
| ส่วนลด % / บาท · ราคา+ส่วนลด | `DiscountInput` · `PriceDiscountCombo` | สร้างเอง |
| ค้นหา · ช่วงวันที่ · เดือน/ปี · เวลา | `SearchInput` · `DateRangePicker` · `MonthYearPicker` · `TimePicker` | สร้างเอง |
| Radio · Checkbox · แท็ก | `Radio` · `Checkbox` · `TagInput` | สร้างเอง |
| ข้อความหลายบรรทัด | **`FormTextarea`** (ป้าย · คำอธิบาย · ตัวนับเมื่อส่ง `maxLength` · error · สีชุดเดียวกับ `FormInput`) | `<textarea>` ดิบ + ตัวนับเอง (ยังค้างใน CustomerSelectionCard · ItemsTable · TaxInfoForm — เจอให้ย้าย) |
| หลายค่าสั้น ๆ (ปุ่มตอบเร็ว · คำค้น · อีเมล) | **`ChipsInput`** (Enter/`,` เป็นเม็ด · Backspace ถอดตัวท้าย · `max`/`maxLength` · เม็ด = `Badge onRemove`) | ช่อง + ปุ่ม "เพิ่ม" แยก · ช่องละอัน · `TagInput` (ผูกตารางแท็กบริษัท) |
| กล่องพิมพ์ 1 ข้อความ (ข้อความ · ข้อความ+รูป · รูปอย่างเดียวเมื่อไม่ส่ง `value/onChange`) | **`MessageComposer`** (textarea + รูปจิ๋ว + แถบล่าง: แนบรูป · `toolbar` slot · ตัวนับ · ลาก/วาง/paste · รูปผ่าน `ImageDropzone` ref `accept()/open()`) · **1 กล่อง = 1 ข้อความที่ลูกค้าได้รับ** — ของที่ส่งหลายชิ้นวางหลายกล่องตามลำดับส่ง | รวมชิ้นที่ส่งแยกไว้กล่องเดียว · textarea + dropzone แยก · drop/paste/ย่อรูปเอง |
| การ์ดตัวเลือกกดได้ทั้งใบ (Radio/Checkbox ที่มี `children` · OptionCards) | คลาส **`.choice-card`** + **`.choice-card-active`** + padding เอง | `border-[#F4511E] bg-orange-50/50 …` เอง |
| กล่องซ้อนบนการ์ดขาว (บล็อก/แถวที่กางแก้ได้) | **`.inner-panel`** + **`.inner-panel-head`** + **`.inner-panel-body`** · ⚠️ ห้ามใส่ `overflow:hidden` ให้ `.inner-panel` (ตัด dropdown) | `bg-gray-50 dark:bg-slate-900/40` เอง · ขาวบนขาว |
| ชิปที่เลือกแล้วถอดได้ | `Badge` + **`onRemove`** (+ `removeLabel`) · คลาส `.badge-remove` | `<li rounded-full><button><X/>` เอง |
| ชิปกรอง (pill + ไอคอน + จำนวน) | **`FilterChips`** (`chips` `value` `onChange` · `activeClass` สีแพลตฟอร์ม หรือ `FILTER_CHIP_PRIMARY_ACTIVE` · `tooltip` ต่อชิป · `disabled` ต่อชิปคู่ `tooltip` เหตุผล) · **`variant="segmented"`** ตัวเลือกย่อยในช่องกรอก (เช่น ActionPicker) · **`size="md"`** (42px) เมื่ออยู่แถวเดียวกับช่องกรอก — หรือ sm ครอบด้วย `form-control-md flex items-center` (ชิปเล็กกลางบรรทัด · ActionPicker ทำแบบนี้) · ป้ายไม่พับบรรทัด — ที่แคบใช้ป้ายสั้น (ActionPicker: ลิงก์/สินค้า/ข้อความ) | `rounded-full border px-3 py-1.5` เอง · `CHIP_ACTIVE` ประจำไฟล์ · pill สองชุดติดกัน · สับสนกับ `StatusTabs` |
| อัปรูปหลายใบ (ลาก · เรียง · บีบ) | `ImageUploader` | uploader เอง |
| เลือกรูป 1 ใบ (ลากวาง · paste · ถ่าย · ย่อ) | **`ImageDropzone`** — คืน `File` ให้อัปเอง (ไม่รู้จัก storage) · ref `accept(file)`/`open()` · **`aspect="1:1"\|"3:4"`** (กรอบตามสัดส่วนจริง · `square` = 1:1) · `changeOnClick` · `classNames` (หน้าร้านส่ง `sf-*`) · `maxWidthOrHeight`/`maxSizeMB` | dropzone ตัวที่สอง · `<input type="file">` ดิบ · ลืมย่อรูป |
| เลือกสี | `ColorPicker` (Modal + presets `lib/color-presets.ts`) | `<input type="color">` ดิบ |
| ตัวเลือกที่อธิบายด้วยภาพดีกว่าคำ | `OptionCards` (`preview` วาดรูปทรงจริง · `layout="horizontal"` · **`previewSize="lg"`** มอคอัปทั้งใบ 128px) | `FormSelect` ให้เดาเอง · พรีวิวที่ดูไม่ออก |
| ตัวอย่าง "ลูกค้าเห็นอะไรในแชท" | **`LinePhonePreview`** ([LinePhonePreview.tsx](../../components/broadcast/LinePhonePreview.tsx)) — กรอบมือถือจอสูงคงที่ เลื่อนในจอ ติดท้ายห้อง · `messages=[{key, wide?, node}]` (1 ก้อน = 1 message object) · `wide` = การ์ด/รูปเต็มจอตกบรรทัดใต้รูปโปรไฟล์ · หัวห้อง = บัญชีแรกที่เลือก · `size="md"` · สไตล์ `.phone-mock*` · แถวเลื่อนแนวนอน `.phone-mock-hscroll` · เนื้อหาผ่าน `BroadcastPreview` | ห้องแชทจำลองเอง · การ์ดข้างรูปโปรไฟล์ · ชื่อร้านเหนือข้อความ (แชท 1:1 ไม่มี) |

### Display
| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| ข้อมูลลูกค้า (ชื่อ+badge+เบอร์) | `CustomerInfoCard` | สร้างเอง |
| เลือกลูกค้า+ที่อยู่+ภาษี | `CustomerSelectionCard` — `bare` (ที่แคบ/แผงแชท) · `onEditCustomer`/`editCustomerUrl` (แก้**ตัวลูกค้า** — ช่องในการ์ดเป็นของบิลใบนี้) · `shipToOther`+`onShipToOtherChange` = แท็บหัวบล็อกที่อยู่ (อย่าวาดหัวข้อที่อยู่ซ้ำ) | picker เอง · ตัวเลือกสั่งเอง/ส่งให้คนอื่นเป็นปุ่มลอยแยกจากช่องที่อยู่ |
| ใบกำกับ แสดง / แก้ · สรุปยอด · แท็ก | `TaxInvoiceInfo` · `TaxInvoiceEditModal` · `OrderSummaryBox` · `TagBadge` | สร้างเอง |
| รูปสินค้าจิ๋ว | `ProductImageThumb` (xs–lg · ย่อผ่าน `thumbUrl()` · กดดูรูปเต็ม) หรือ `<img src={thumbUrl(url, 96\|160\|320)}>` | `<img src={image_url}>` รูปเต็มในกรอบเล็ก |
| Tooltip | **`Tooltip`** (`text` `position?` `box?` · portal · delay 350ms · มือถือแตะค้าง) · ใส่ `aria-label` คู่เสมอ · ปุ่มที่ disabled ได้ใส่ `box="inline-flex"` (default `display:contents` ไม่มีกล่อง ปุ่ม disabled จึงไม่ยิง pointer event) | `title=""` (มือถือไม่ขึ้น) · tooltip เอง |
| เตือนเปิดในแอป LINE/FB/IG/TikTok (Google บล็อกล็อกอินใน webview `disallowed_useragent`) | `InAppBrowserNotice` ([components/auth/](../../components/auth/InAppBrowserNotice.tsx)) + `detectInAppBrowser()` · `IN_APP_LABELS` · `withExternalBrowserFlag()` ([lib/in-app-browser.ts](../../lib/in-app-browser.ts) · LINE เปิดเบราว์เซอร์จริงได้ด้วย `openExternalBrowser=1`) · อ่าน UA ผ่าน `useSyncExternalStore` | UA sniff เอง · `useEffect + setState` (lint + hydration mismatch) |

### Actions
| ต้องการ | ใช้ | ห้าม |
|---|---|---|
| เมนูแถว · ป๊อปอัปเลือกจากปุ่ม | `ActionMenu` (portal z-9999 · สไตล์ `.action-menu-item` · `primary: true` 1 ตัว · `danger: true` · `description` ต่อรายการ · ปุ่มเปิดเอง `trigger`+`triggerClassName` · **`placement="auto"`** วัดแล้วพลิกขึ้น/ลงตามที่ว่าง · **`align="start"`** ปุ่มชิดซ้าย เช่น "+ เพิ่มบล็อก" ของบรอดแคสต์) | dropdown เอง · ส่ง `className` สีเอง |
| จัดส่ง (3 วิธี) · ชำระ+สลิป · ยืนยัน · พิมพ์เอกสาร · เลือกโปรโมชัน | `ShipModal` · `PaymentModal` · `ConfirmDialog` · `OrderPrintButtons` · `PromotionSelectModal` | สร้างเอง · native `confirm()` |
| แถบลอยตอนติ๊กหลายแถว | `BulkActionBar` (`count` `onClear` · ปุ่ม children ต้องเป็น `<Button>` · ซ่อนเมื่อ 0 · `pb-safe`) | copy โครงเอง |
| แถบบันทึกล่างหน้า form/settings (1 หน้า = 1 ปุ่มบันทึก) | `StickyActionBar` (`onSave` `saving` `dirty?` `disabled?` `onCancel?` `saveLabel?` `extraActions?` `primary?` `inset?`) · ไม่ส่ง `dirty` = ไม่ขึ้นสถานะ · ส่ง = seed baseline จากค่าที่โหลด · `<form>` → `onSave={() => formRef.current?.requestSubmit()}` | save ต่อ section · ใช้ใน Modal footer / list-CRUD ที่มีผลทันที |

## 2. Order Forms (ห้ามสร้างเพิ่ม)
- `OrderForm` (`components/orders/OrderForm.tsx`) ลูกค้าปลีก r_retail · `DealerOrderForm` (`components/dealer/DealerOrderForm.tsx`) ตัวแทน/ห้างทุกโหมด — **`mode` prop แยก w_cash/w_credit/c_consign/d_consign ห้ามสร้างฟอร์มแยก** · `ReplenishmentForm` (`components/replenishments/ReplenishmentForm.tsx`) เติมของ
- `app/orders/components/`: `ActionMenu` · `PaymentModal` · `SplitParcelModal` (แบ่งกล่อง) · `HandoverPickerPanel` (ขนส่งมารับที่ไหน/เมื่อไหร่ ทุก marketplace — ห้ามทำ modal แยกต่อแพลตฟอร์ม) · `TaxInvoiceModal` · `PrintStatusDots` · `OrderCard` (mobile) · `ReadyToShipTab` · `ProcessingTab` · `PrintAfterActionModal`
- List page: copy จาก `/orders/page.tsx` หรือ `/replenishments/page.tsx` · `getFocusAction()` + `getMenuItems()`

## 3. Shared Hooks
Context (ห้ามสร้าง context ซ้ำ): `useAuth()` `lib/auth-context.tsx` · `useCompany()` `lib/company-context.tsx` · `useToast()` `lib/toast-context.tsx` · `useFeatures()` `lib/features-context.tsx` · `useTheme()` `lib/theme-context.tsx`

| Hook | ใช้สำหรับ |
|---|---|
| `useCustomerPrefill()` `lib/useCustomerPrefill.ts` | prefill ลูกค้า (ที่อยู่ ภาษี GP) — OrderForm/DealerOrderForm/ReplenishmentForm |
| `useConfirmDialog()` `lib/useConfirmDialog.tsx` | confirm แบบ promise แทน `confirm()` |
| `useFetchOnce()` `lib/use-fetch-once.ts` | รันครั้งเดียวเมื่อพร้อม (กันยิงซ้ำ) |
| `useColumnToggle()` `lib/useColumnToggle.ts` | ซ่อน/แสดงคอลัมน์ (DataTable) · เก็บ `{fp, visible}` fp = ชื่อคอลัมน์ตามลำดับ — เพิ่มคอลัมน์ = fp เปลี่ยน = รีเซ็ต (กันคอลัมน์ใหม่ซ่อนเงียบ) |
| `useStableCallback()` `lib/useStableCallback.ts` | callback identity คงที่แต่เรียกโค้ดล่าสุด — ส่งเข้า component ที่ `memo()` (`ChatOrderPanel` · `MessageBubble`) · arrow ตรง ๆ หรือ `useCallback` ที่ deps เปลี่ยนบ่อย = memo ไร้ผล · ห้ามเรียกระหว่าง render |
| `useServerSearch()` `lib/useServerSearch.ts` | ช่องค้นฝั่ง server → `{ query, results, loading, search }` ต่อ `onSearchChange` ได้ตรง · seq guard · cache 30 วิ · `narrow` เมื่อพิมพ์ต่อและชุด `complete` · `minLength` 2 — **ห้ามเขียน seq/debounce/cache เองในหน้า** |
| `useSuperAdminGuard()` (`app/superadmin/hooks/`) · `usePromotionForm()` (`app/promotions/components/`) | guard superadmin · state ฟอร์มโปรโมชัน |
