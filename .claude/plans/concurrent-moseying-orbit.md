# Plan: Comprehensive Shopee Logging (pull/webhook/push)

## Context

ปัจจุบันระบบ log ของ Shopee มี 3 ตาราง:
1. **`shopee_webhook_log`** — raw webhook ที่รับเข้า (super admin only)
2. **`integration_logs`** — per-request action log (company-side "Shopee Logs" page)
3. **`marketplace_sync_log`** — high-level sync summary (orders fetched/created/updated)

**ปัญหา**: มีหลาย operation ที่ไม่ได้ log:
- `POST /api/shopee/deals` — Push deal ไป Shopee (**ไม่ log เลย**)
- `POST /api/shopee/orders/ship` — รับออเดอร์ Shopee (**ไม่ log เลย**)
- `lib/shopee/product-export.ts` — Export สินค้าไป Shopee (**ไม่ log เลย**)

**เป้าหมาย**: เพิ่ม `logIntegration()` ให้ครบทุก operation → เห็นทุก action ใน:
- หน้า **Shopee Logs** (company side) — สำหรับ admin ของร้าน
- หน้า **Super Admin Webhooks** — สำหรับ super admin (เพิ่ม tab/filter สำหรับ outgoing logs)

---

## Part 1: Add logging to unlogged API routes

ใช้ `logIntegration()` จาก `lib/integration-logger.ts` ที่มีอยู่แล้ว (fire-and-forget, sanitize sensitive data, truncate large bodies)

### 1A. `app/api/shopee/deals/route.ts` — Push Deal

เพิ่ม `logIntegration()` ที่ปลาย SSE stream (success/error):

```typescript
import { logIntegration } from '@/lib/integration-logger';

// At end of SSE stream (after complete or after rollback):
logIntegration({
  company_id: companyId,
  integration: 'shopee',
  account_id: account.id,
  account_name: account.shop_name,
  direction: 'outgoing',
  action: 'push_deal',
  method: 'POST',
  api_path: '/api/v2/bundle_deal/add_bundle_deal', // or add_on_deal
  request_body: { promotion_id, deal_type, items_count, start_time, end_time },
  response_body: { external_deal_id, completed_steps },
  status: success ? 'success' : 'error',
  error_message: errorMsg,
  reference_type: 'promotion',
  reference_id: promotion_id,
  reference_label: `Deal ${promotion.name} → ${account.shop_name}`,
  duration_ms,
});
```

### 1B. `app/api/shopee/orders/ship/route.ts` — Accept/Ship Order

เพิ่ม `logIntegration()` ทั้ง success และ error:

```typescript
logIntegration({
  company_id: companyId,
  integration: 'shopee',
  account_id: account.id,
  account_name: account.shop_name,
  direction: 'outgoing',
  action: 'accept_order',
  method: 'POST',
  api_path: '/api/v2/logistics/ship_order',
  request_body: { order_sn, is_split, pickup_or_dropoff },
  response_body: shipResult,
  status: 'success' / 'error',
  reference_type: 'order',
  reference_id: order.external_order_sn,
  reference_label: `Accept ${order.external_order_sn}`,
  duration_ms,
});
```

### 1C. `lib/shopee/product-export.ts` — Export Product (optional, lower priority)

เพิ่ม log สำหรับ `addItem()` call — อันนี้ทำทีหลังได้ เพราะ export ผ่าน API route `app/api/shopee/products/export/route.ts` ซึ่งน่าจะ log ที่ route level ได้

---

## Part 2: Enhance Super Admin page to show ALL logs (not just webhooks)

ปัจจุบัน Super Admin Webhooks page ดูได้แค่ `shopee_webhook_log` (incoming webhooks เท่านั้น)

**เพิ่ม**: Tab/Section ให้ดู `integration_logs` ด้วย — ครอบคลุมทุก company, ทุก direction

### 2A. New API: `app/api/superadmin/integration-logs/route.ts`

Query `integration_logs` ไม่ filter company — สำหรับ super admin ดูทุก company:

```
GET /api/superadmin/integration-logs?
  status=all|success|error
  direction=all|incoming|outgoing
  action=push_deal|accept_order|...
  search=ordersn,shop_name
  date_from=...&date_to=...
  page=1&limit=50
```

Response: same structure as company-side logs API แต่เพิ่ม company_name

### 2B. Update Super Admin Webhooks page

เพิ่ม 2 tabs ที่ top level:
- **Webhooks** (existing) — `shopee_webhook_log` table
- **API Logs** (new) — `integration_logs` table across all companies

API Logs tab columns:
- เวลา | Company | ทิศทาง | Action | ร้านค้า | อ้างอิง | ผลลัพธ์ | เวลาใช้
- Expandable row: request_body + response_body (same as company-side)

---

## Part 3: Enhance Company-side Shopee Logs

### 3A. เพิ่ม action filter

ปัจจุบัน filter ได้แค่ direction + status + search
เพิ่ม **Action filter** (dropdown):
- ทั้งหมด
- Webhook อัปเดตสถานะ (`webhook_order_status`)
- Webhook tracking (`webhook_order_tracking`)
- Sync ออเดอร์ (`sync_orders_manual`, `sync_orders_poll`)
- รับออเดอร์ (`accept_order`) — **NEW**
- Push Deal (`push_deal`) — **NEW**
- Push สต๊อก (`push_stock`, `auto_push_stock`)
- Push ราคา (`push_price`, `auto_push_price`)
- Shipping Label (`shipping_document`)
- Sync สินค้า (`sync_products`)

### 3B. Update API `app/api/logs/route.ts`

เพิ่ม `action` query param filter

---

## Critical Files

| File | Action | Notes |
|---|---|---|
| `app/api/shopee/deals/route.ts` | MODIFY | Add logIntegration() |
| `app/api/shopee/orders/ship/route.ts` | MODIFY | Add logIntegration() |
| `app/api/superadmin/integration-logs/route.ts` | CREATE | Super admin API for all integration_logs |
| `app/superadmin/webhooks/page.tsx` | MODIFY | Add "API Logs" tab |
| `app/api/logs/route.ts` | MODIFY | Add action filter |
| `app/logs/shopee/page.tsx` | MODIFY | Add action dropdown filter |

**ไม่ต้องแก้ DB schema** — `integration_logs` table มีทุก column ที่ต้องการแล้ว (request_body, response_body, http_status, method, api_path, duration_ms)

---

## Verification

1. Push deal → ดู Shopee Logs (company) → เห็น action "push_deal" + request/response
2. รับออเดอร์ → เห็น action "accept_order" + shipping params + result
3. Super Admin → API Logs tab → เห็นทุก company + ทุก action
4. Company Logs → filter by Action → เลือก "push_deal" → เห็นเฉพาะ deal pushes
5. Build passes
