# Code Simplicity & Reuse Rules

## Core Principle
เขียน code ให้ simple ที่สุด โดยใช้ shared resources ที่มีอยู่ให้ได้มากที่สุด
ถ้าข้อมูลส่วนใหญ่เหมือนกัน ต้องใช้ component/hook/service เดียวกัน — **ห้ามสร้างใหม่ซ้ำซ้อน**

---

## 1. Shared UI Components (`components/ui/`)

### Form Inputs
| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| Dropdown | `FormSelect` | native `<select>` |
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
| `supabase-admin.ts` | `lib/supabase-admin.ts` | `supabaseAdmin` (service role — server only) |
| `flow-types.ts` | `lib/flow-types.ts` | `isCreditFlow()`, `isCashFlow()`, `isConsignmentFlow()`, `isDepartmentFlow()`, `getFlowLabel()` |
| `status-tab-colors.ts` | `lib/status-tab-colors.ts` | `getTabColor()`, `getBadgeColor()` — ห้ามกำหนดสี status เอง |
| `address-parser.ts` | `lib/address-parser.ts` | `parseThaiAddress()` — parse ที่อยู่ไทย/อังกฤษ |
| `product-display.ts` | `lib/product-display.ts` | `productDisplayName()`, `productSubtitle()`, `cleanVariationLabel()` |
| `parallel.ts` | `lib/parallel.ts` | `parallelLimit()` — async concurrency control |
| `stock-utils.ts` | `lib/stock-utils.ts` | `getStockConfig()` — stock feature by subscription tier |
| `pos-utils.ts` | `lib/pos-utils.ts` | `calculatePosOrderTotals()` — POS VAT calculation |
| `utils/format.ts` | `lib/utils/format.ts` | `formatPrice()`, `formatNumber()` |
| `thai-address-data.ts` | `lib/thai-address-data.ts` | `searchAddress()`, `PROVINCES` — Thai address DB |

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
