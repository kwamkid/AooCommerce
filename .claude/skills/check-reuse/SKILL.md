# Check Reuse

Auto-check ว่า code ที่เขียนใหม่ใช้ shared resources ของโปรเจคหรือยัง

## Trigger
After writing or editing code — especially new components, pages, or API routes.

## What to Check

### 1. UI Components
Scan for patterns that should use shared components:

| Pattern Found | Should Use |
|---------------|-----------|
| `<select` or `<select>` | `FormSelect` |
| Custom search input with dropdown | `EntitySearchInput` or `ProductSearchInput` |
| Manual `<table` + `<thead` + `<tbody` (list page) | `DataTable` |
| Manual items/product table in form | `ItemsTable` |
| Custom address fields with autocomplete | `ThaiAddressInput` |
| Custom tax info form | `TaxInfoForm` |
| Custom confirm modal / `window.confirm` | `ConfirmDialog` / `useConfirmDialog` |
| Custom dropdown menu | `ActionMenu` |
| Custom ship/delivery modal | `ShipModal` |
| Custom payment modal | `PaymentModal` |
| Custom image upload | `ImageUploader` |
| Custom tooltip | `Tooltip` |
| Custom loading overlay | `LoadingOverlay` |
| Custom order summary totals | `OrderSummaryBox` or `OrderSummaryCard` |
| Custom print buttons | `OrderPrintButtons` |

### 2. Hooks
| Pattern Found | Should Use |
|---------------|-----------|
| Manual customer prefill state (delivery fields, tax fields) | `useCustomerPrefill()` |
| `window.confirm()` or custom confirm state | `useConfirmDialog()` |
| Duplicate API call on mount | `useFetchOnce()` |
| Manual toast/notification state | `useToast()` |
| Manual auth check | `useAuth()` |
| Manual company_id state | `useCompany()` |

### 3. Services
| Pattern Found | Should Use |
|---------------|-----------|
| Direct `inventory` table upsert/update | `lib/stock-service.ts` |
| Manual tax_invoices/receipts/DN insert | `lib/invoice-service.ts` |
| Manual statement creation | `lib/statement-service.ts` |
| Manual GP calculation | `lib/gp-resolver.ts` |
| Manual cost_price query | `lib/cost-utils.ts` |
| Manual promotion calculation | `lib/promotion-service.ts` |
| External API call without logging | `lib/integration-logger.ts` |
| Manual print tracking update | `lib/print-tracking.ts` |

### 4. Utilities
| Pattern Found | Should Use |
|---------------|-----------|
| Manual price formatting | `formatPrice()` from `lib/utils/format.ts` |
| Manual status color | `getTabColor()` / `getBadgeColor()` from `lib/status-tab-colors.ts` |
| Manual flow type check | `isCreditFlow()` etc. from `lib/flow-types.ts` |
| Manual product display name | `productDisplayName()` from `lib/product-display.ts` |
| Manual Thai address parsing | `parseThaiAddress()` from `lib/address-parser.ts` |

### 5. Style Rules
| Pattern Found | Issue |
|---------------|-------|
| `text-xs` or `text-sm` on body content | ห้าม — เฉพาะ badge/label/subtitle |
| Dropdown/popover without z-[999]+ | ต้อง z-[999] ขึ้นไป |
| Missing `hidden md:block` + `md:hidden` | ต้อง mobile responsive |
| Query without `.eq('company_id', ...)` | ต้อง multi-tenant filter |

## Output Format
```
✅ ใช้ shared resources ถูกต้อง (ถ้าไม่พบปัญหา)

⚠️ พบ {N} จุดที่ควรใช้ shared resources:
1. [file:line] ใช้ <select> → ควรใช้ FormSelect
2. [file:line] เขียน inline stock upsert → ควรใช้ stock-service.ts
...
```
