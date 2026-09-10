---
paths:
  - "lib/tiktok/**/*"
  - "app/api/tiktok/**/*"
  - "app/tiktok/**/*"
  - "scripts/*tiktok*"
---
# TikTok Shop — status · sign · product import · settlement API · โลโก้ร้าน

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

### TikTok Status Mapping (`lib/tiktok/sync.ts` → `mapTikTokStatus()`)
| TikTok | → order_status | → payment_status |
|---|---|---|
| UNPAID | new | pending |
| ON_HOLD | ready_to_ship | paid |
| AWAITING_SHIPMENT | ready_to_ship | paid |
| PARTIALLY_SHIPPING | processing | paid |
| AWAITING_COLLECTION | processing | paid |
| IN_TRANSIT | shipping | paid |
| DELIVERED | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

### TikTok Integration Files (`lib/tiktok/`)
| File | ใช้สำหรับ |
|------|----------|
| `api.ts` | API client (signing, OAuth, token management, endpoints) |
| `sync.ts` | Order sync (manual + polling) + `mapTikTokStatus()` |
| `webhook-processor.ts` | Webhook order sync (shared with retry) |
| `product-sync.ts` | **Product import** — `syncProductsFromTikTok()` (ทั้งร้าน) + `upsertTikTokProduct()` (ทีละตัว) |
| `errors.ts` | Error translation (TikTok → Thai messages) |

### TikTok API Routes (`app/api/tiktok/`)
| Route | ใช้สำหรับ |
|-------|----------|
| `/api/tiktok/oauth/auth-url` | Generate OAuth URL |
| `/api/tiktok/oauth/callback` | OAuth callback (token exchange + shop setup) |
| `/api/tiktok/webhook` | Webhook endpoint + background processing |
| `/api/tiktok/webhook/retry` | Retry failed TikTok webhooks |
| `/api/tiktok/sync` | Manual sync by account |
| `/api/tiktok/sync-all` | Cron: sync all active TikTok accounts |
| `/api/tiktok/sync-order` | Sync single order by ID |
| `/api/tiktok/products/import` | GET พรีวิวสินค้าในร้าน · POST ดูดเข้าทั้งร้าน (SSE progress) |

### โลโก้ร้าน TikTok — **ไม่มีใน API ฝั่งขาย** (ยืนยัน 2026-08-30 อย่าไล่ scope ซ้ำ)
- `/authorization/202309/shops` → cipher/code/id/name/region/seller_type · `/seller/202309/shops` → **id กับ region เท่านั้น** (เปิด scope ได้ก็ไม่มีโลโก้)
- ค้นทั้ง OAS แล้ว avatar ของ**ร้าน**มีที่เดียวคือ `customer_service/*/conversations` — ที่เหลือเป็น avatar ของ creator/affiliate
- ทางที่ได้โลโก้จริงมี 2 ทาง: **chat sync** ([lib/services/chat/tiktok.ts](../../../lib/services/chat/tiktok.ts) เก็บ avatar ของ participant `role='SHOP'`) หรือ **ผู้ใช้ใส่ URL เอง**
- **กดที่รูปโลโก้ในการ์ดร้าน = อัปเดตข้อมูลร้าน** (ชื่อ+โลโก้) ทุกแพลตฟอร์มผ่าน `/api/marketplace/accounts/resync` · แพลตฟอร์มไม่ส่งโลโก้มา → เด้งช่องใส่ URL ต่อทันที
- ⚠️ OAuth callback **ต้อง merge `metadata` ห้ามเขียนทับทั้งก้อน** — โลโก้ที่ตั้งเองจะหายทุกครั้งที่ re-authorize (เคยเกิดแล้ว)

### ยอดโอนจริง TikTok (settlement) — ใช้ `/finance/**202501**/orders/{id}/statement_transactions`
- **202309 คนละโครงและไม่มีสนามยอดเงินเลย** — เรียกผิดเวอร์ชันจะได้ ฿0 ทุกออเดอร์โดย API ตอบ `code 0` ไม่มี error ให้จับ
- ออเดอร์ที่ยังไม่ถึงรอบโอนก็ตอบ `code 0` + ค่า 0 ล้วนเหมือนกัน → **ห้ามบันทึกเป็นแถวยอด 0** (รายงานกำไรจะอ่านว่าขายแล้วไม่ได้เงิน) ให้นับเป็น pending รอบหน้าค่อยเก็บ
- ตรวจกับเงินจริงแล้ว: ขาย 720 → คอม 106.49 + ค่าส่ง 38 + อื่น ๆ 19.36 → **โอนจริง 477.15** ตรงกับที่ TikTok แจ้งในรอบจ่าย

### TikTok Sign Algorithm
```
1. Extract all query params EXCEPT 'sign', 'access_token'
2. Sort alphabetically by key
3. Concat {key}{value} pairs (no separator)
4. Prepend request PATH
5. If not GET and not multipart, append request BODY
6. Wrap: APP_SECRET + string + APP_SECRET
7. HMAC-SHA256(APP_SECRET, wrapped_string) → hex lowercase
```

### TikTok Product Import (เพิ่ม 2026-08-26)
- **ต้อง import ก่อนเปิดรับออเดอร์จริง** — ไม่มีสินค้าในระบบ ออเดอร์ที่เข้ามาจะสร้างสินค้าใหม่ตาม SKU ที่ได้รับจนคลังเละ
- หน้า [/tiktok/import](../../../app/tiktok/import/page.tsx) (ปุ่มอยู่การ์ดร้านใน `/settings/sales-channels` แท็บ Marketplace) — **นำเข้าทั้งร้านรอบเดียว** ไม่ได้เลือกทีละตัว/แม็ป variation เองเหมือน Shopee (ตั้งใจ — ตัวที่ SKU ตรงจะผูกอัตโนมัติอยู่แล้ว)
- **ไม่มี batch detail** ต่างจาก Shopee — `GetProduct` ยิงทีละตัว คุม concurrency ด้วย `parallelLimit(..., 3)` · แบ่งหน้าด้วย **`page_token` ไม่ใช่ offset** (ข้ามไปหน้า N ตรงๆ ไม่ได้)
- endpoint ที่ใช้: `POST /product/202502/products/search` (เวอร์ชันล่าสุดของ search) + `GET /product/202309/products/{id}`
- ลำดับจับคู่เหมือน Shopee เป๊ะ: link เดิม → `products.code` (= seller_sku หรือ `TT-{product_id}`) → ปลุกของที่ soft-delete → สร้างใหม่ · **ของที่ user แก้เองไม่ถูกเขียนทับ** (`source` = `tiktok_edited`/`manual`)
- **ไม่ต้อง migration** — `products.source` ไม่มี CHECK และคอลัมน์ `platform_*`/`platform_data` ของ `marketplace_product_links` เป็น generic อยู่แล้ว
- **ยังไม่ทำ**: product-export (ส่งสินค้าขึ้น TikTok), push price/stock, deals — Shopee มีครบแล้ว TikTok ยังมีแค่ import

