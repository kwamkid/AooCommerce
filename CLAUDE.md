# CLAUDE.md — Project Instructions & Knowledge Base

## Project Overview

ระบบ E-Commerce สำหรับร้านขายของออนไลน์หลายช่องทาง (Shopee, LINE, Facebook, Instagram, เปิดบิลตรง, POS)
- **Stack**: Next.js 16 (App Router, Turbopack) + Supabase + Tailwind CSS + pdfMake
- **Multi-tenant**: ทุก query ต้อง filter `company_id`
- **Language**: UI ภาษาไทย, code/comments ภาษาอังกฤษได้
- **Files**: `knowledge.md` ถูกรวมเข้ามาแล้ว, `todo.md` = งานที่ยังไม่ได้ทำ

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

// Tab: { active, inactive, labelColor, countColor }
// Badge: { color, bg }

// ทุกหน้าใช้สีเดียวกันตาม status key:
// all=indigo, new/draft=blue, ready_to_ship/pending_confirm=orange,
// processing/pending=indigo, shipping/shipped=amber,
// completed/paid/confirmed=emerald, overdue=red, cancelled=gray
```

### Action Menu
ใช้ `ActionMenu` component (portal-based) ทุกหน้า — **ห้าม**สร้าง inline dropdown menu
```typescript
import ActionMenu, { type ActionItem } from '@/app/orders/components/ActionMenu';
<ActionMenu items={[
  { key: 'print', label: 'พิมพ์', icon: <Printer />, onClick: () => {} },
  { key: 'cancel', label: 'ยกเลิก', icon: <XCircle />, danger: true, dividerBefore: true, onClick: () => {} },
]} />
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

## Shared Components

### Form Components
| Component | Path | ใช้สำหรับ |
|---|---|---|
| `FormSelect` | `components/ui/FormSelect.tsx` | dropdown (ห้าม native select) |
| `EntitySearchInput` | `components/ui/EntitySearchInput.tsx` | ค้นหาลูกค้า/สินค้า (มี badge prop) |
| `ItemsTable` | `components/ui/ItemsTable.tsx` | ตารางสินค้าในฟอร์ม |
| `ThaiAddressInput` | `components/ui/ThaiAddressInput.tsx` | ที่อยู่ auto-complete |
| `TaxInfoForm` | `components/ui/TaxInfoForm.tsx` | toggle บุคคล/นิติบุคคล |
| `CustomerInfoCard` | `components/ui/CustomerInfoCard.tsx` | แสดงชื่อ+badge+เบอร์ |
| `TaxInvoiceInfo` | `components/ui/TaxInvoiceInfo.tsx` | แสดง+แก้ไขข้อมูลใบกำกับ |
| `TaxInvoiceEditModal` | `components/ui/TaxInvoiceEditModal.tsx` | modal แก้ไข tax snapshot |
| `ShipModal` | `components/ui/ShipModal.tsx` | modal จัดส่ง (3 วิธี) |
| `PaymentModal` | `app/orders/components/PaymentModal.tsx` | modal ชำระเงิน+แนบ slip |
| `ActionMenu` | `app/orders/components/ActionMenu.tsx` | dropdown menu (portal) |
| `OrderSummaryBox` | `components/ui/OrderSummaryBox.tsx` | สรุปยอด |
| `OrderPrintButtons` | `components/ui/OrderPrintButtons.tsx` | ปุ่มพิมพ์ + marketplace label dispatch |
| `CustomerSelectionCard` | `components/ui/CustomerSelectionCard.tsx` | เลือกลูกค้า + address dropdown + delivery fields + tax info (shared ทุก form) |

### Customer Prefill Hook
- **`useCustomerPrefill`** (`lib/useCustomerPrefill.ts`) — **ต้องใช้ทุก form** ที่มี `CustomerSelectionCard`
- จัดการ: delivery fields (8), tax fields (4), shipping addresses, address select handlers
- เรียก `fetchCustomerOrderContext()` (1 RPC call) สำหรับ prefill ทั้ง create + edit mode
- ทุก form ใช้ hook นี้: `OrderForm`, `DealerOrderForm`, `ReplenishmentForm`
- **ห้ามสร้าง inline delivery/tax state ใหม่** → ใช้ hook เสมอ

### Order Forms (3 forms)
| Form | Path | ใช้สำหรับ |
|---|---|---|
| `DealerOrderForm` | `components/dealer/` | ตัวแทน/ห้าง ทุก mode (wholesale/consignment/dept) |
| `ReplenishmentForm` | `components/replenishments/` | เติมของตัวแทน |
| `OrderForm` | `components/orders/` | คำสั่งซื้อปกติ (ปลีก/marketplace) |

---

## Business Domain

### ประเภทลูกค้า (7 types, 4 flows)
| DB customer_type | sale_type | Flow | คำอธิบาย |
|---|---|---|---|
| `retail` | — | R (Retail) | ลูกค้าปลีก |
| `consignment_dealer` | consignment | C (Consignment) | ตัวแทนฝากขาย ม.78(3) |
| `wholesale_dealer` | wholesale_cash/credit | W (Wholesale) | ตัวแทนขายขาด |
| `department_store` | consignment | D (Department) | ห้างฝากขาย |
| `wholesale_department` | wholesale_cash/credit | W | ห้างขายขาด |
| `corporate` | wholesale_cash/credit | W | องค์กร/B2B |

### Flow ทั้งหมด (5 flows)
| flow_type | ชื่อ | ใช้กับ |
|---|---|---|
| `r_retail` | ลูกค้าปลีก | retail, dropship |
| `w_cash` | ขายขาดเงินสด | wholesale_dealer, wholesale_department, corporate |
| `w_credit` | ขายขาดเครดิต | wholesale_dealer, wholesale_department, corporate |
| `c_consign` | ตัวแทนฝากขาย | consignment_dealer |
| `d_consign` | ห้างฝากขาย | department_store |

### Order Status Flow
```
r_retail:    new → (ชำระ) → ready_to_ship → (กดรับ) → processing → (จัดส่ง) → shipping → completed
w_cash:      new → (ชำระ) → ready_to_ship → (คอนเฟิร์ม) → processing → (จัดส่ง) → completed
w_credit:    ready_to_ship → (คอนเฟิร์ม) → processing → (จัดส่ง) → completed → (บันทึกชำระ)
c_consign:   เติมของ(replenishment) → แจ้งยอด(CSR report) → ชำระ
d_consign:   เติมของห้าง(dept order) → ห้างแจ้งยอด(DSR report) → ห้างโอน
```

### Auto Issue Document Flow (ใช้ /check-flow เพื่อเช็คจาก code จริง)

**r_retail (ปลีก):**
| จุด | เอกสาร | subtype |
|---|---|---|
| กดรับ + ชำระแล้ว | ABB/REC | — |

**w_cash (ขายขาดเงินสด):**
| จุด | เอกสาร | subtype |
|---|---|---|
| คอนเฟิร์ม + ชำระแล้ว | TAX | `tax_receipt` (ใบกำกับภาษี/ใบเสร็จ) |
| จัดส่ง | DN | — |

**w_credit (ขายขาดเครดิต):**
| จุด | เอกสาร | subtype |
|---|---|---|
| คอนเฟิร์ม | TAX | `tax_invoice` (ใบกำกับภาษี/ใบแจ้งหนี้) |
| จัดส่ง | DN + ST | — |
| บันทึกชำระ | REC | — |

**c_consign (ตัวแทนฝากขาย):**
| จุด | เอกสาร | subtype |
|---|---|---|
| เติมของ (replenishment ship) | DN (ไม่มีราคา) | — |
| แจ้งยอด (CSR report) | TAX + ST | `tax_invoice` (ใบกำกับภาษี/ใบแจ้งหนี้) |
| ชำระ | REC | — |

**d_consign (ห้างฝากขาย):**
| จุด | เอกสาร | subtype |
|---|---|---|
| เติมของห้าง (dept order) | TAX + DN (มีราคา) | `tax_only` (ใบกำกับภาษี) |
| ห้างแจ้งยอด (DSR report) | INV + ST | — |
| ห้างโอน | REC | — |

### เอกสาร (8 prefixes)
| Prefix | ชื่อ | Table |
|---|---|---|
| `ABB-` | ใบกำกับอย่างย่อ/ใบเสร็จ | `abbreviated_invoices` |
| `TAX-` | ใบกำกับภาษี | `tax_invoices` |
| `INV-` | ใบแจ้งหนี้ | `invoices` |
| `REC-` | ใบเสร็จรับเงิน | `receipts` |
| `DN-` | ใบส่งสินค้า | `delivery_notes` |
| `ST-` | ใบวางบิล | `statements` |
| `CN-` | ใบลดหนี้ | `credit_notes` |

### TAX document_subtype → หัวเอกสาร
- `tax_only` → "ใบกำกับภาษี" (ห้างส่งของ)
- `tax_receipt` → "ใบกำกับภาษี/ใบเสร็จรับเงิน" (ขายปลีกจ่ายสด, ขายขาดเงินสด)
- `tax_invoice` → "ใบกำกับภาษี/ใบแจ้งหนี้" (ฝากขาย, ขายขาดเครดิต)

### GP Pricing
- `resolveGp()` returns **NET price** (หลังหัก GP แล้ว) — **ห้ามหัก GP ซ้ำ!**
- ใช้ `lib/gp-resolver.ts`
- **4 levels** (ลำดับความสำคัญ สูง→ต่ำ):
  1. **Customer Brand Override** — `customer_brand_commissions` table (per customer per brand)
  2. **Customer Default GP** — `customers.consignment_gp_rate` + `consignment_gp_base_price`
  3. **Global Brand GP** — `companies.settings.brand_gp_overrides` JSON array
  4. **Global Default GP** — `companies.settings.consignment.default_gp_rate`
- แต่ละ level มี `gp_rate` + `gp_base_price` (from retail price / discounted price)

### Customer Order Context (RPC)
- **`fetchCustomerOrderContext(customerId)`** — 1 RPC call แทน 4-6 API calls
- RPC: `get_customer_order_context(p_company_id, p_customer_id)`
- Return: `{ customer, shipping_addresses, brand_commissions, brand_gp_overrides, consignment_settings }`
- API: `GET /api/customers/order-context?customer_id=xxx`
- ใช้ใน DealerOrderForm เมื่อเลือกลูกค้า (ดึงทุกอย่างใน 1 call)
- `fetchGpContext()` = legacy wrapper ที่ใช้ RPC เดียวกัน (สำหรับ consignment/dept report pages)

### Address System
- **ที่อยู่จัดส่ง** = `shipping_*` fields (ThaiAddressInput, แยก field)
- **ที่อยู่ออกบิล** = `billing_address` (textarea เดียว, ในส่วนข้อมูลภาษี)
- ถ้า billing ว่าง → `buildCustomerPayload()` join shipping fields
- ลูกค้าที่มี order แล้ว → lock customer_type (ห้ามเปลี่ยน)

### Weighted Average Cost (WAC)
- `product_variations.cost_price` = ต้นทุนเฉลี่ยถ่วงน้ำหนัก (WAC)
- `updateWeightedAverageCost()` ใน `lib/stock-service.ts` — เรียก RPC `update_weighted_average_cost()` (atomic, SELECT FOR UPDATE)
- สูตร: `new_wac = (existing_qty × old_wac + received_qty × new_cost) / total_qty`
- `order_items.unit_cost` = snapshot ต้นทุน ณ ตอนสร้าง order
- `fetchCostMap()` ใน `lib/cost-utils.ts` — batch ดึง WAC สำหรับ snapshot
- **ห้ามเรียก WAC** จากย้ายคลัง, ส่งตัวแทน, ส่งห้าง, return — เฉพาะ inventory receives เท่านั้น

### Stock Service
ห้ามเขียน inline stock upsert → ใช้ `lib/stock-service.ts` เสมอ (13 functions)

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

## PDF Generators (all return `Promise<Blob>`)

| File | เอกสาร | ใช้สำหรับ |
|---|---|---|
| `lib/order-invoice-full-pdf.ts` | ใบกำกับภาษีแบบเต็ม / ใบส่งสินค้า | `generateFullInvoicePdf()` |
| `lib/order-invoice-pdf.ts` | ใบกำกับอย่างย่อ / ใบเสร็จ | `generateOrderInvoicePdf()` |
| `lib/orders-packing-pdf.ts` | ใบจัดของ | `generatePackingPdf()` |
| `lib/order-shipping-label-pdf.ts` | ใบปะหน้า | `generateShippingLabelPdf()` |
| `lib/replenishment-pdf.ts` | ใบเติมสินค้า | `generateReplenishmentPdf()` |
| `lib/consignment-report-pdf.ts` | ใบแจ้งหนี้ฝากขาย | |
| `lib/department-store-report-pdf.ts` | ใบแจ้งหนี้ห้าง | |
| `lib/statement-pdf.ts` | ใบวางบิล | |
| `lib/credit-note-pdf.ts` | ใบลดหนี้ | |

### PDF Utilities (`lib/pdf-utils.ts`)
`buildCompanyStack()`, `buildCornerTriangle()`, `buildSignatureFooter()`,
`buildProductNameStack()`, `withOriginalAndCopy()`, `formatPdfPrice()`, `formatPdfDate()`

### Bill Template Design (PDF Layout)
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

### Print Preview
```typescript
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
const blob = await generateFullInvoicePdf(data);
showPdfPreview(blob, 'ใบกำกับภาษี');
```

---

## Auto Issue Documents (`lib/invoice-service.ts`)

`autoIssueDocument()` — เรียกหลังทุก status/payment change

| Flow | Status | Payment | เอกสาร |
|---|---|---|---|
| r_retail | processing+ | paid | ABB/REC |
| w_cash | processing+ | paid | TAX (tax_receipt) |
| w_cash | shipping+ | — | DN |
| w_credit | processing+ | — | TAX (tax_invoice) |
| w_credit | shipping+ | — | DN |

---

## Services & Libraries

| Service | Path | หมายเหตุ |
|---|---|---|
| Stock | `lib/stock-service.ts` | 13 functions — ห้าม inline upsert |
| Cost | `lib/cost-utils.ts` | fetchCostMap() — WAC snapshot |
| GP Resolver | `lib/gp-resolver.ts` | resolveGp() + fetchCustomerOrderContext() (1 RPC) |
| Invoice | `lib/invoice-service.ts` | autoIssueDocument() |
| Statement | `lib/statement-service.ts` | createStatementForReport() |
| Promotion | `lib/promotion-service.ts` | getPromotionComponents() |
| Print | `lib/print-pdf.ts` | showPdfPreview() + mergePdfBlobs() |
| Print Tracking | `lib/print-tracking.ts` | markOrdersPrinted() |

---

## Marketplace

### Shopee Status Mapping (`lib/shopee/sync.ts` → `mapShopeeStatus()`)
| Shopee | → order_status | → payment_status |
|---|---|---|
| UNPAID | new | pending |
| READY_TO_SHIP | ready_to_ship | paid |
| PROCESSED | **processing** | paid |
| SHIPPED | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

### Product Matching Priority (Order Sync)
1. `marketplace_product_links` (external_item_id + external_model_id)
2. SKU match
3. Product Code match
4. สร้างใหม่อัตโนมัติ

### Marketplace Label Printing
- ใช้ `printOrder(orderId, 'marketplace_label', { source })` จาก `OrderPrintButtons`
- Route map อยู่ใน `MARKETPLACE_LABEL_ROUTES` (`components/ui/OrderPrintButtons.tsx`)
- เพิ่ม platform ใหม่: แค่เพิ่ม route ใน map + สร้าง API endpoint
- ปัจจุบัน: Shopee ✅ | TikTok, Lazada, LINE Shopping, Shippop → ยังไม่มี API

### Orders Page — Flow Type Filter
- หน้าคำสั่งซื้อ (`/orders`) exclude `w_cash,w_credit,c_consign,d_consign` อัตโนมัติ
- ใช้ `p_exclude_flow_types` parameter ใน RPC `get_orders_list`
- รองรับ flow ใหม่ (dropship, affiliate) โดยไม่ต้องแก้ — เพราะ exclude เฉพาะ 4 flow

### API Docs (Local — ดูก่อน web search!)
- **Shopee v2**: `api_doc_knowledge/Shopee/_INDEX.md`
- **TikTok**: `api_doc_knowledge/Tiktok/tiktok_shop_api_documentation.md`

---

## Promotion Module

### Types
`bundle_set`, `buy_get_free`, `buy_get_discount`, `qty_discount`

### Shopee Push
- `PushDealModal` → SSE progress → auto-export product if no link
- Action matrix: create/edit/push/sync/unsync/resync/delete × status

---

## File References
- **todo.md** — งานที่ยังไม่ได้ทำ (ไม่ sync git)
- **memory/** — Claude memory files (auto-loaded)
