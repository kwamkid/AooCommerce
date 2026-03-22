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

### Order Status Flow
```
ขายขาดเงินสด:  new → (ชำระ) → ready_to_ship → (คอนเฟิร์ม) → processing → (จัดส่ง) → completed
ขายขาดเครดิต:  ready_to_ship → (คอนเฟิร์ม) → processing → (จัดส่ง) → completed → (บันทึกชำระ)
ลูกค้าปลีก:    new → (ชำระ) → ready_to_ship → (กดรับ) → processing → (จัดส่ง) → shipping → completed
```

### เอกสาร (8 prefixes)
| Prefix | ชื่อ | Table | ออกตอน |
|---|---|---|---|
| `ABB-` | ใบกำกับอย่างย่อ/ใบเสร็จ | `abbreviated_invoices` | ปลีก ชำระแล้ว (auto) |
| `TAX-` | ใบกำกับภาษี | `tax_invoices` | คอนเฟิร์มออเดอร์ (auto) |
| `INV-` | ใบแจ้งหนี้ | `invoices` | เครดิต (manual) |
| `REC-` | ใบเสร็จรับเงิน | `receipts` | บันทึกชำระ (auto) |
| `DN-` | ใบส่งสินค้า | `delivery_notes` | จัดส่ง (auto) |
| `ST-` | ใบวางบิล | `statements` | รวม INV (manual) |
| `CN-` | ใบลดหนี้ | `credit_notes` | void/refund |

### TAX document_subtype
- `tax_only` → "ใบกำกับภาษี" (ห้างส่งของ)
- `tax_receipt` → "ใบกำกับภาษี/ใบเสร็จรับเงิน" (ขายปลีกจ่ายสด)
- `tax_invoice` → "ใบกำกับภาษี/ใบแจ้งหนี้" (ฝากขาย, ขายขาดเครดิต)

### GP Pricing
- `resolveGp()` returns **NET price** (หลังหัก GP แล้ว) — **ห้ามหัก GP ซ้ำ!**
- ใช้ `lib/gp-resolver.ts` + `fetchGpContext(customerId)`
- 4 levels: brand GP → customer GP → system default → no discount

### Address System
- **ที่อยู่จัดส่ง** = `shipping_*` fields (ThaiAddressInput, แยก field)
- **ที่อยู่ออกบิล** = `billing_address` (textarea เดียว, ในส่วนข้อมูลภาษี)
- ถ้า billing ว่าง → `buildCustomerPayload()` join shipping fields
- ลูกค้าที่มี order แล้ว → lock customer_type (ห้ามเปลี่ยน)

### Stock Service
ห้ามเขียน inline stock upsert → ใช้ `lib/stock-service.ts` เสมอ (12 functions)

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
| Stock | `lib/stock-service.ts` | 12 functions — ห้าม inline upsert |
| GP Resolver | `lib/gp-resolver.ts` | resolveGp() + fetchGpContext() |
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
