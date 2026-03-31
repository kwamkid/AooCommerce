# CLAUDE.md — Project Instructions & Knowledge Base

## Project Overview

ระบบ E-Commerce สำหรับร้านขายของออนไลน์หลายช่องทาง (Shopee, LINE, Facebook, Instagram, เปิดบิลตรง, POS)
- **Stack**: Next.js 16 (App Router, Turbopack) + Supabase + Tailwind CSS + pdfMake
- **Multi-tenant**: ทุก query ต้อง filter `company_id`
- **Language**: UI ภาษาไทย, code/comments ภาษาอังกฤษได้
- **Files**: `todo.md` = งานที่ยังไม่ได้ทำ

## Rules (`.claude/rules/`) — อ่านก่อนเขียน code!

| Rule File | เนื้อหา |
|-----------|---------|
| `code-simplicity.md` | Shared components, hooks, services, API routes ทั้งหมด — ห้ามสร้างซ้ำ |
| `order-flows.md` | Customer type × sale type × status flow + auto-issue documents |
| `list-page-actions.md` | Focus action + ActionMenu ทุกหน้า list (per status) |
| `detail-page-actions.md` | Action buttons ทุกหน้า detail/edit (per status) |

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

### Weighted Average Cost (WAC)
- `product_variations.cost_price` = WAC
- สูตร: `new_wac = (existing_qty × old_wac + received_qty × new_cost) / total_qty`
- **ห้ามเรียก WAC** จากย้ายคลัง, ส่งตัวแทน, ส่งห้าง, return — เฉพาะ inventory receives เท่านั้น

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

## PDF (Bill Template Design)

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

---

## Marketplace

### Architecture Overview
- **Multi-tenant SaaS** — หลายร้านค้าใช้ระบบเดียวกัน
- **Multi-platform** — Shopee ✅ | TikTok, Lazada, LINE Shopping → planned
- **Shared product helpers** — `lib/shopee/product-helpers.ts` (ใช้ร่วมระหว่าง order sync + product sync)

### Order Sync Mechanism (Shopee)

**3 ทางที่ orders เข้าระบบ:**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/shopee/webhook` | Shopee push → save `shopee_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/shopee/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/shopee/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs (cron-job.org):**
| Job | URL | Schedule |
|-----|-----|----------|
| Shopee Webhook Retry | `GET /api/shopee/webhook/retry` | `*/5 * * * *` |
| Shopee Sync All | `GET /api/shopee/sync-all` | `*/15 * * * *` |

**Auth:** ทั้ง 2 routes รองรับ `Authorization: Bearer {CRON_SECRET}` และ `x-cron-secret` header

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
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

### Product Matching Priority (Order Sync)
1. `marketplace_product_links` (external_item_id + external_model_id)
2. SKU match
3. Product Code match
4. สร้างใหม่อัตโนมัติ (+ backfill ALL variations ถ้าเป็น variation product)

### Marketplace Label Printing
- ใช้ `printOrder(orderId, 'marketplace_label', { source })` จาก `OrderPrintButtons`
- Route map อยู่ใน `MARKETPLACE_LABEL_ROUTES` (`components/ui/OrderPrintButtons.tsx`)
- ปัจจุบัน: Shopee ✅ | TikTok, Lazada, LINE Shopping, Shippop → ยังไม่มี API

### Orders Page — Flow Type Filter
- หน้าคำสั่งซื้อ (`/orders`) exclude `w_cash,w_credit,c_consign,d_consign` อัตโนมัติ
- ใช้ `p_exclude_flow_types` parameter ใน RPC `get_orders_list`

### API Docs (Local — ดูก่อน web search!)
- **Shopee v2**: `api_doc_knowledge/Shopee/_INDEX.md`
- **TikTok**: `api_doc_knowledge/Tiktok/tiktok_shop_api_documentation.md`

### Scale & Queue Strategy
- **ปัจจุบัน**: Vercel serverless + Supabase — รองรับได้หลักพัน orders/วัน ไม่ต้อง queue
- **เมื่อ scale ขึ้น** (10+ ร้าน, หลาย marketplace): เพิ่ม **Upstash QStash** หรือ **BullMQ + Redis**
- **Architecture เป้าหมาย**: Webhook → save log → Queue → Worker (controlled concurrency, rate limit per platform, retry + dead letter)
- **จุดที่ต้องเปลี่ยน**: แค่ webhook route — เพิ่มยิง queue แทน `after()` async

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
- **.claude/rules/** — Modular rules (code simplicity, flows, actions)
