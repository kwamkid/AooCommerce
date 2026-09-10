---
paths:
  - "lib/api-client.ts"
  - "lib/header-summary-context.tsx"
  - "lib/features-context.tsx"
  - "lib/supabase-admin.ts"
  - "lib/useServerSearch.ts"
  - "lib/supabase-paging.ts"
  - "app/api/header/**/*"
  - "app/api/orders/new/**/*"
  - "app/api/products/search/**/*"
  - "components/orders/OrderForm.tsx"
  - "components/layout/**/*"
---
# Performance Architecture — consolidated endpoints · apiFetch cache · auth cache · realtime

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## ⚡ Performance Architecture (เพิ่มเมื่อ 2026-05-29)

ระบบ caching + consolidation layer หลายชั้น — เปลี่ยน /orders/new cold load จาก 12 calls → 3 calls (cumulative ~10s → ~1.2s)

### Consolidated read endpoints (1 ปลายทางแทนหลาย call)
| Endpoint | รวมอะไร | ใช้กับ |
|---|---|---|
| `/api/header/summary` | warehouses+stockConfig+low_stock_count+chat_unread+orders_ready_count+marketplace_health | `HeaderSummaryProvider` ใน [lib/header-summary-context.tsx](../../../lib/header-summary-context.tsx) → Sidebar + Header. Realtime subs: orders, line_contacts, fb_contacts (debounced 500ms refresh) + 5-min interval สำหรับ marketplace health |
| `/api/orders/new/init` | **ลูกค้าล่าสุด 30 คน** + warehouses + sales_channels + stockConfig + default-warehouse inventory (แบ่งหน้าด้วย `fetchAllRows`) — **ไม่มี products แล้ว** | OrderForm `fetchInitBundle()` (non-marketplace path) → 1 call; fallback เป็น individual fetches ถ้า /init error · **สินค้า/ลูกค้าค้นฝั่ง server** ตอนผู้ใช้พิมพ์ (**`/api/products/search`** = RPC `search_order_products` รอบเดียว ~30KB · `/api/customers?search=`) ผ่านโหมด API ของ `ProductSearchInput`/`EntitySearchInput` |

- **ช่องค้นหาที่ค้นฝั่ง server ทุกตัวใช้ `useServerSearch`** ([lib/useServerSearch.ts](../../../lib/useServerSearch.ts)) — seq guard · แคช 30 วิ · กรองต่อในเครื่องเมื่อพิมพ์ต่อจากคำเดิม (ชุดที่ `complete`) · พิมพ์ ≥2 ตัวอักษรค่อยยิง — **ห้ามเขียน seq/debounce/cache เองในหน้า**

⛔ **ห้ามส่งรายการทั้งตารางให้ client กรองเอง** — ร้านที่มีสินค้า/ลูกค้าหลักพันจะโดน **เพดาน 1,000 แถวของ Supabase** (ตัดเงียบ ไม่มี error) และ **4.5MB ของ Vercel** · ของที่ต้องได้ครบจริง ๆ ใช้ `fetchAllRows()` จาก [lib/supabase-paging.ts](../../../lib/supabase-paging.ts) · ที่เหลือค้นฝั่ง server (ดู [fix-bug.md](../../../fix-bug.md) 2026-09-07 — ร้าน 5.8k สินค้า ค้น "yoyo" ไม่เจอ)

### apiFetch cache layer ([lib/api-client.ts](../../../lib/api-client.ts))
- **In-memory response cache** key by `(URL, companyId)` พร้อม TTL ต่อ path:
  - `/api/warehouses`, `/api/sales-channels`, `/api/settings/features`, `/api/carriers` → 60s
  - `/api/orders/new/init` → 30s
- **Auto-invalidate** เมื่อ POST/PUT/PATCH/DELETE ปลายทางเดียวกัน
- **`CACHE_DEPENDENCIES` map** — write `/api/orders|customers|products|warehouses|sales-channels|inventory` → invalidate `/api/orders/new/init` ด้วย (composite cache)
- **Export `invalidateApiCache(prefix)`** สำหรับ manual invalidation

### Server-side auth cache ([lib/supabase-admin.ts](../../../lib/supabase-admin.ts))
- `checkAuthWithCompany` ทำ 2 round-trips ทุก call (JWT verify + company_members query) → cache result 30s, key by `${token}|${companyId}`
- Cache เฉพาะ `isAuth=true` (invalid token re-check ได้ราคาถูก)
- Auto-cleanup ที่ size > 256 (bounded memory)
- Stale role/forced-logout propagate ใน ≤30s — acceptable

### Realtime patterns ที่ใช้
- **Sidebar badges** (orders, chat) — Supabase Realtime postgres_changes ใน `HeaderSummaryProvider` → debounced 500ms refresh
- **OrderForm inventory** — subscribe `inventory` table filter `warehouse_id=eq.${selectedWarehouseId}` → patch `inventoryMap` per variation (insert/update/delete). Channel name `inv-${companyId}-${warehouseId}` กัน cross-tenant ชน
- **Marketplace health** — polling 5 นาที (ไม่มี webhook event สำหรับ token expiry) — ใน `HeaderSummaryProvider`

### Defer non-critical fetches
- `/api/promotions?status=active&limit=200` + `/api/products/top-sellers` ใน OrderForm — defer 300ms หลัง mount เพื่อให้ critical burst (init endpoint) settle ก่อน

### Prefetch on hover
- ปุ่ม "+ สร้างคำสั่งซื้อ" ใน `/orders` — `onMouseEnter` ยิง `router.prefetch('/orders/new')` + `apiFetch('/api/orders/new/init')` พร้อมกัน → click หลัง hover ~1s = เปิดทันที

### Feature flags hydration ([lib/features-context.tsx](../../../lib/features-context.tsx))
- `DEFAULT_FEATURES` = all-off baseline (ไม่ใช่ delivery preset) — ป้องกัน feature-gated UI flash visible→hidden ตอน config โหลด
- localStorage cache per company id → returning user เห็น feature state ถูกต้องทันทีตอน first render
- Network error → ใช้ค่า cache ล่าสุด (ไม่ใช่ defaults)

### กฎทั่วไป
- **เพิ่ม endpoint cacheable** → เพิ่มเข้า `CACHED_GET_PATHS` ใน [lib/api-client.ts](../../../lib/api-client.ts) (อย่ายุ่ง CACHE_DEPENDENCIES ถ้าไม่ใช่ composite)
- **เพิ่ม composite endpoint** → ใส่ `CACHE_DEPENDENCIES` ให้ครอบ underlying resources
- **ห้าม polling** ถ้ามี realtime ทำหน้าที่ได้ — ยกเว้น external system ที่ไม่มี webhook (Shopee marketplace token expiry)

---

