# Enforce Layout

ตรวจสอบว่าหน้าใหม่/หน้าที่แก้ไข ตรง standard layout pattern + font rules + reuse components ของโปรเจค

## Trigger
เมื่อสร้างหรือแก้ไขหน้า page (`app/**/page.tsx`) หรือ component ที่มี UI

---

## 1. Page Layout Structure (List Page)

ทุกหน้า list ต้องมี 5 ส่วนเรียงตามนี้:

```
┌─────────────────────────────────────────────┐
│ Header: icon + h1 + subtitle + ปุ่มสร้าง     │
├─────────────────────────────────────────────┤
│ Tab Filter: getTabColor() + rounded-xl       │
├─────────────────────────────────────────────┤
│ Filter Bar: data-filter-card                 │
│   SearchInput + FormSelect (ห้าม native)      │
├─────────────────────────────────────────────┤
│ DataTable                                    │
│   Desktop: table (data-table-wrap)           │
│   Mobile: cards (auto หรือ mobileCardRender)  │
│   Pagination + ColumnSettingsDropdown (built-in) │
└─────────────────────────────────────────────┘
```

### เช็ค Header
- [ ] มี icon (Lucide) + `<h1>` + subtitle
- [ ] ปุ่มสร้าง: `bg-[#F4511E] hover:bg-[#E64A19]` + text-white + rounded-lg
- [ ] ปุ่มสร้างอยู่ขวา (`flex items-center justify-between`)

### เช็ค Tab Filter
- [ ] ใช้ `getTabColor(status)` จาก `lib/status-tab-colors.ts` — ห้ามกำหนดสีเอง
- [ ] Tab style: `rounded-xl px-4 py-2 min-w-[80px] text-center`
- [ ] Container: `flex gap-2 overflow-x-auto`
- [ ] มี count badge (ถ้า API ให้มา)

### เช็ค Filter Bar
- [ ] Container: `data-filter-card` class
- [ ] Search: ใช้ `SearchInput` component — ห้ามสร้าง search input เอง
- [ ] Dropdown: ใช้ `FormSelect` — **ห้าม native `<select>`**
- [ ] Date: ใช้ `DateRangePicker` — ห้ามสร้าง date picker เอง

### เช็ค Table
- [ ] ใช้ `DataTable` component — ห้ามสร้าง manual table + mobile cards + pagination
- [ ] Focus action column: `stopPropagation: true`
- [ ] ActionMenu column: `stopPropagation: true`
- [ ] Row click: `onRowClick` → navigate to detail page

---

## 2. Page Layout Structure (Detail/Edit Page)

```
┌─────────────────────────────────────────────┐
│ Header: Back button + title + action buttons │
├──────────────────┬──────────────────────────┤
│ Left Column      │ Right Column (sidebar)    │
│ - Form fields    │ - Status card             │
│ - Items table    │ - Payment info            │
│ - Notes          │ - Shipping info           │
│                  │ - Documents               │
├──────────────────┴──────────────────────────┤
│ Footer: Cancel + Save buttons                │
└─────────────────────────────────────────────┘
```

### เช็ค Header
- [ ] Back button (ArrowLeft หรือ ChevronLeft) → navigate back
- [ ] Title: order number / document name
- [ ] Action buttons: Print menu, จัดการ menu (ดู `detail-page-actions.md`)

### เช็ค Form Components
- [ ] Customer: `CustomerSelectionCard` หรือ `CustomerInfoCard`
- [ ] Items: `ItemsTable`
- [ ] Address: `ThaiAddressInput`
- [ ] Tax: `TaxInfoForm` / `TaxInvoiceInfo`
- [ ] Summary: `OrderSummaryBox`
- [ ] Shipping: `ShipModal`
- [ ] Payment: `PaymentModal`

### เช็ค Footer
- [ ] Cancel: gray border button (ซ้าย)
- [ ] Save: `bg-[#F4511E]` button (ขวา)
- [ ] Sticky bottom หรือ fixed bottom (ถ้า form ยาว)

---

## 3. Font Size Rules (บังคับ)

### ห้ามใช้ text-xs / text-sm สำหรับ body content

| ขนาด | ใช้ได้กับ | ห้ามใช้กับ |
|------|----------|-----------|
| `text-xs` (12px) | badge, count, timestamp, helper text | body text, table cell content, form label, button |
| `text-sm` (14px) | subtitle, table header, secondary label, mobile card label | main content, primary text, form input, button |
| `text-base` (16px) | **body content default** — table cells, form labels, inputs, buttons, paragraphs | — |
| `text-lg` (18px) | card title, section header | — |
| `text-xl+` (20px+) | page title (h1), doc title (PDF) | — |

### ตรวจจับ pattern ที่ผิด
```
❌ <td className="text-sm">ชื่อสินค้า</td>          → ต้องเป็น text-base หรือไม่ระบุ (default)
❌ <span className="text-xs">฿1,500.00</span>       → ราคาต้อง text-base
❌ <button className="text-sm">บันทึก</button>       → ปุ่มต้อง text-base หรือ text-sm font-medium
❌ <label className="text-xs">ชื่อลูกค้า</label>      → label ต้อง text-sm ขึ้นไป

✅ <span className="text-xs text-gray-500">12:30</span>         → timestamp OK
✅ <span className="text-xs bg-green-100 rounded">สำเร็จ</span>  → badge OK
✅ <p className="text-sm text-gray-500">รายละเอียดเพิ่มเติม</p>   → subtitle/secondary OK
✅ <th className="data-th">ชื่อ</th>                              → data-th มี text-sm built-in OK
```

### Data Table Specific
- `data-th` class มี `text-sm font-normal` built-in — OK ไม่ต้องแก้
- `data-td` / table cell content — ต้อง text-base (default) ห้าม text-xs/text-sm
- Mobile card: label ใช้ `text-xs text-gray-500` ได้ แต่ value ต้อง text-sm ขึ้นไป

---

## 4. Color Consistency

### Brand Colors
- [ ] Primary button: `bg-[#F4511E]` — ห้ามใช้สี orange อื่น
- [ ] Primary hover: `hover:bg-[#E64A19]`
- [ ] Success: `emerald-600` — ห้ามใช้ green-500/green-600
- [ ] Danger: `red-500` or `red-600`
- [ ] Warning: `amber-500`

### Status Colors
- [ ] ใช้ `getTabColor()` / `getBadgeColor()` จาก `lib/status-tab-colors.ts`
- [ ] ห้าม hardcode สี status เอง

### Focus Action Button Colors
- [ ] Default (รับออเดอร์): `btn-focus-action` (orange)
- [ ] Green (ยืนยัน/สำเร็จ): `btn-focus-action green`
- [ ] Indigo (ชำระแล้ว): `btn-focus-action indigo`
- [ ] Amber (จัดส่ง): `btn-focus-action amber`

---

## 5. Component Reuse Check

### ห้ามสร้างเองถ้ามี shared component

| เจอ pattern นี้ | ต้องใช้ |
|----------------|--------|
| `<select` / `<select>` | `FormSelect` |
| `<input type="search"` หรือ custom search | `SearchInput` |
| `<table` + manual thead/tbody (list page) | `DataTable` |
| `window.confirm(` | `useConfirmDialog()` |
| Manual dropdown menu / popover | `ActionMenu` (portal, z-9999) |
| Manual tooltip | `Tooltip` (portal, z-999) |
| Custom modal with backdrop | ใช้ existing modal pattern |
| Manual price format (`toFixed`, `toLocaleString`) | `formatPrice()` จาก `lib/utils/format.ts` |
| Manual date format | `formatPdfDate()` หรือ standard date utils |
| Inline stock update/upsert | `lib/stock-service.ts` |

---

## 6. Responsive & Accessibility

### Mobile
- [ ] `DataTable` handles responsive automatically
- [ ] Custom layouts: ใช้ `hidden md:block` + `md:hidden`
- [ ] Touch targets: buttons ≥ 44px height on mobile
- [ ] No horizontal scroll (ยกเว้น tab filter ที่ overflow-x-auto)

### z-index
- [ ] Dropdown/Popover: `z-[999]` ขึ้นไป
- [ ] ActionMenu: z-9999 (built-in)
- [ ] Modal: `z-50` ขึ้นไป
- [ ] Tooltip: `z-[999]` (built-in)

### Dark Mode
- [ ] ใช้ `dark:` prefix สำหรับ bg, text, border
- [ ] ห้าม hardcode สีขาว/ดำ โดยไม่มี dark variant

---

## Output Format

```
📐 Layout Check Results:

✅ Header: ถูกต้อง (icon + h1 + create button)
✅ Tab Filter: ใช้ getTabColor()
⚠️ Filter Bar: ใช้ native <select> ที่ line 45 → ควรใช้ FormSelect
❌ Font: text-sm ใน table cell ที่ line 120 → body content ต้อง text-base
✅ Table: ใช้ DataTable
✅ Colors: ถูกต้อง
⚠️ z-index: dropdown ที่ line 89 ไม่มี z-[999]

Summary: 1 error, 2 warnings — ต้องแก้ font size + FormSelect + z-index
```
