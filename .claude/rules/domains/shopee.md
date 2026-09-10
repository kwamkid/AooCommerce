---
paths:
  - "lib/shopee/**/*"
  - "app/api/shopee/**/*"
  - "app/shopee/**/*"
  - "components/shopee/**/*"
  - "app/superadmin/marketplace-apps/**/*"
  - "app/settings/chat-channels/**/*"
  - "scripts/*shopee*"
---
# Shopee — dual-app (partner/seller) · status mapping · helpers · push · API fixes

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

### Shopee dual-app — app กลาง (partner) + app ของบริษัท (seller) (เพิ่ม 2026-09-04 · เป็น credentials ต่อบริษัท 2026-09-07)

Shopee ให้ **Chat API เฉพาะ app ประเภท "Seller In House"** (นโยบาย 18 พ.ย. 2024) และ app แบบนั้น
**ผูกกับบัญชี seller ที่จดมันขึ้นมา** ⇒ app กลางของ AOO ใช้แทนกันไม่ได้ **ทุกบริษัทที่อยากใช้แชท
Shopee ต้องจด app ของตัวเอง** — ออเดอร์/สินค้ายังเข้าทาง app กลางที่ร้านไหนก็ authorize ได้เหมือนเดิม

- **1 ร้าน = token ได้ 2 ชุด** — ชุดหลัก (`access_token`/`refresh_token`/`*_expires_at` เซ็นด้วย app กลาง) + ชุดแชท (`chat_*` เซ็นด้วย app ของบริษัท) โครงเดียวกับ TikTok/Lazada เป๊ะ
- **app ของบริษัทอยู่ในตาราง `marketplace_app_credentials`** (`company_id, platform, app_role` unique · RLS superadmin เท่านั้น — เข้าถึงผ่าน API route ที่ใช้ service role) · **key ต้องถูกปิดบัง (4 ตัวท้าย) ในทุก response** ผ่าน `maskSecret()`
- **ที่เดียวที่อ่าน env `SHOPEE_SELLER_APP_*` คือ [lib/shopee/app-credentials.ts](../../../lib/shopee/app-credentials.ts)** (`getCompanyShopeeApp` ตาราง→env cache 60 วิ · `listActiveSellerPushKeys`) — env เหลือเป็นทางถอยของบริษัทที่ยังไม่มีแถว · grep แล้วต้องเจอแค่ไฟล์นี้
- **ลำดับ resolve**: creds ชุดหลัก = `shopeeAppOf(account)` (จาก `metadata.shopee_app`) → `resolveAppKeys(app, company_id)` · creds ขาแชท = `ensureValidToken(account, { purpose: 'chat' })` → **มี `chat_access_token` ไหม** ถ้ามีใช้ app ของบริษัท + คอลัมน์ `chat_*` ถ้าไม่มี**ตกกลับไปใช้ชุดหลัก** (พฤติกรรมเดิมเป๊ะ)
- ⚠️ **ห้ามเขียนเงื่อนไขว่า "แชท = seller"** — ถ้าวันหนึ่ง Shopee เปิด Chat API ให้ partner app ด้วย ร้านที่อยู่บน partner app จะใช้แชทได้ทันทีโดยไม่ต้องแก้โค้ด
- ⚠️ **ห้ามเก็บ token 2 ชุดของ app เดียวกันในร้านเดียว** — `refresh_token` ของ Shopee ใช้ได้ครั้งเดียว ใบใหม่ฆ่าใบเก่า · callback ขา seller จึงเช็คก่อน: ร้านที่ชุดหลักเป็น app seller อยู่แล้วถือเป็น "ต่ออายุการเชื่อมต่อเดิม" (เขียนทับชุดหลัก) ไม่ใช่เขียน `chat_*` เพิ่ม
- **โครงของบริษัทเป็น "ค่าที่ตั้งเอง" ไม่ใช่การเดาจากสภาพร้าน** — `marketplace_app_credentials.usage`: **`full`** (ครบในตัว) = ร้าน authorize ผ่าน app ของบริษัทเอง (`metadata.shopee_app='seller'`) ออเดอร์ สินค้า ค่าคอม แชท ใช้ token ชุดหลักชุดเดียว — **ABC the Baby ทั้ง 7 ร้านอยู่แบบนี้ ไม่ต้องย้ายไป app กลาง** · **`chat`** (แชทอย่างเดียว) = ร้านอยู่บน app กลาง แล้วกด "เชื่อมต่อแชท" ด้วย app ของบริษัท → token ชุดแชทลง `chat_*`
  ตั้งได้ทั้งการ์ด "app แชท Shopee ของบริษัท" (`/settings/chat-channels#shopee`) และ `/superadmin/marketplace-apps` · เดาไม่ได้เพราะบริษัทตั้ง app ไว้ก่อนเชื่อมร้านสักร้านก็มี (ของเดิมเดาแล้วได้ chat_only ร้านที่เชื่อมทีหลังจึงไม่มี push ออเดอร์)
- **ทุกอย่างเดินตาม `usage` ตัวเดียว** — `POST /api/shopee/apps/[id]/push-config`: `full` = เปิดครบ `SHOPEE_PUSH_CODES_FULL` + `blockShopsOnPartnerApp` ร้านของบริษัทที่ app กลาง (`blocked_shop_id_list` เป็นการแทนที่ ต้องรวมของเดิมก่อน) · `chat` = `setChatOnlyPushConfig` (code 10 อย่างเดียว ปิด code ที่ค้าง) · ปุ่มเมนูเชื่อมร้านใน `/settings/sales-channels` ชู "ผ่าน app ของร้าน" ขึ้นบนสุดเมื่อ `full` · callback ขา seller ที่ได้ร้านใหม่ตอน `full` ตั้ง push ให้เองใน `after()`
  ⚠️ **ลดเป็น `chat` ขณะที่ยังมีร้าน `shopee_app='seller'` = ปฏิเสธ 409 ทุกทาง** (บริษัท/superadmin/ปุ่มตั้ง push) — ปิด code ออเดอร์ของ app ที่ร้านใช้รับออเดอร์อยู่ = ออเดอร์หายเงียบ ต้องย้ายร้านไป app กลางก่อน
- **webhook ตรวจลายเซ็นด้วย key ของ app กลาง + push key ของ app ทุกบริษัท** (`listActiveSellerPushKeys()`) — ตกใบใดใบหนึ่ง = push ของบริษัทนั้นถูกตีตกเงียบ ๆ ทั้งหมด
- **ขั้นตอนเปิดใช้ของบริษัทใหม่**: (1) เพิ่ม app ของบริษัทในการ์ด "app แชท Shopee ของบริษัท" ที่ `/settings/chat-channels#shopee` — ระบบยิง `get_app_push_config` ตรวจ key ให้ก่อนบันทึก (2) โหมด `full`: ตั้งโหมดในการ์ดนั้นเป็น "ทุกอย่าง" แล้วเชื่อมร้านด้วย "เชื่อมผ่าน app ของร้าน" ที่ `/settings/sales-channels` แล้วกด **"ตั้งค่า push (webchat)"** (ได้ครบทุก code) · โหมด `chat`: ร้านอยู่บน app กลางแล้ว → กด "ตั้งค่า push (webchat)" (ได้ code 10) → กด **"เชื่อมต่อแชท"** ทีละร้าน → `/api/shopee/oauth/auth-url?app=seller` → callback เขียน `chat_*` + `metadata.shopee_chat_app='seller'` แล้วกลับมาที่ `?shopee_chat=connected#shopee`
- **หน้า superadmin `/superadmin/marketplace-apps`** ดูว่าบริษัทไหนมี app ของตัวเองแล้ว · เปิด push แชทหรือยัง · **เปลี่ยนโหมด `usage` แทนบริษัทได้** · ปิดใบที่มีปัญหาได้ (key ปิดบังเสมอ)
- **สอง app อยู่คนละ environment ได้พร้อมกัน (เพิ่ม 2026-09-05 · seller app ผ่าน Go Live แล้ว 6 ก.ย. 2026 → ทั้งสอง app อยู่ production)** — ช่วง 4–5 ก.ย. partner app อยู่ production ส่วน seller app ยังเป็น Developing บน **Sandbox v2** → โฮสต์เลือก**ต่อ app** ด้วย `getBaseUrl(app)` / `resolveBaseUrl(creds)` (creds มี `app`) · env `SHOPEE_SELLER_APP_ENV=sandbox` (ไม่ตั้ง = ตาม `SHOPEE_PARTNER_APP_ENV`) · **ต้องตั้ง `SHOPEE_SELLER_APP_ID/KEY` + `SHOPEE_SELLER_APP_ENV` บน Vercel ด้วย** ไม่งั้น webhook ตีตกลายเซ็นของ app seller และ OAuth ขา seller ใช้ไม่ได้
- ⚠️ **Sandbox v2 ใช้โฮสต์ `https://openplatform.sandbox.test-stable.shopee.sg`** — `partner.test-stable.shopeemobile.com` เป็น sandbox รุ่นเก่า ตอบ `error_sign / Wrong sign` กับ partner ที่จดใน v2 (เสียเวลาไล่ key ไปรอบหนึ่ง 5 ก.ย. 2026) · sandbox ทดสอบได้กับ **test shop จากเมนู Test Account-Sandbox v2 เท่านั้น** ร้านจริง (gbthailandofficial) ต้องรอ app ผ่าน Go Live
- ✅ **ยืนยันแล้ว 5 ก.ย. 2026: app หมวด Seller In House เปิด push code 10 (webchat) ได้** (`set_app_push_config` → success บน sandbox, callback ชี้ `https://aoocommerce.vercel.app/api/shopee/webhook`) — นโยบายที่บล็อกแชทใช้กับ Third-party Partner app เท่านั้น · สคริปต์ `scripts/enable-shopee-webchat-push.mjs --app seller [--apply --callback URL]`
- **ตั้งแต่ 6 ก.ย. 2026 ร้านของ ABC the Baby ทั้ง 7 ร้านอยู่บน app seller ทั้งออเดอร์+แชท** — push config: app seller เปิด code `1,2,3,4,8,10,12,15,16,22` ชี้ `…/api/shopee/webhook` · app partner ยังเปิด `3,4,12,15` แต่ **block 7 ร้านนี้** (`blocked_shop_id_list`) กัน push ซ้ำสองทาง · app partner เก็บไว้สำหรับบริษัทอื่นในอนาคต · สคริปต์เดียวกันคุมทั้งคู่: `enable-shopee-webchat-push.mjs --app seller|partner --apply --codes 3,4,10,12,15 --block <shop_ids>` (ใส่ `--block` อย่างเดียว = ไม่แตะ code ที่เปิดอยู่) · ร้านใหม่ที่เชื่อมผ่าน app seller ในอนาคตต้องเพิ่มเข้า block list ของ partner ด้วย ไม่งั้นได้ออเดอร์ซ้ำ 2 ใบ (sync idempotent แต่เปลืองงาน)
- **Live Push Partner Key ≠ API key** — Shopee เซ็น push ด้วย "Live Push Partner Key" ที่ต้องกด Generate ในหน้า Push Mechanism → Set Push (ตอนสร้าง app ช่องนี้ว่าง) แล้วเก็บเป็น `SHOPEE_*_APP_PUSH_KEY` · webhook ลอง key ทั้งของ partner และ seller · **"Push Test Data" ในคอนโซลเซ็นด้วย key ทดสอบ ใช้ยืนยันลายเซ็นไม่ได้** (ตกทุกใบแม้ key ถูก) — พิสูจน์ด้วย push จริงเท่านั้น · วิธีเช็คว่าเป็น push ของ app ไหน: ระหว่างที่สอง app ยังไม่ block กัน push เดียวกันจะมา 2 ใบ msg_id เดียวกันแต่ signature ต่างกัน (6 ก.ย. 2026)
- **Push ระดับร้าน/สินค้า (code 1, 2, 8, 16, 22, 28) มีตัวรับแล้ว** ที่ [lib/shopee/push-handlers.ts](../../../lib/shopee/push-handlers.ts) (`handleShopeeShopEvent` ใช้ทั้ง webhook และ retry worker): 2 = ปิดร้าน `is_active=false` + แจ้งเตือน · 1 = ปลุกร้านที่ปิด · 28 คะแนนโทษ / 16 สินค้าโดนแจ้งละเมิด = แจ้งเตือน + integration log · 22 ราคาเปลี่ยน → `marketplace_product_links.platform_price` (`original_price`) หรือ `platform_data.{field}` · 8 reserved stock → `platform_data.reserved_stock` · **ห้ามแตะ `product_variations`/inventory จาก push พวกนี้** · ร้าน/สินค้าที่ไม่รู้จัก = `skipped` ไม่ใช่ `failed` (ไม่งั้น retry worker วนจน dead letter) · ⚠️ **Shopee ส่ง `code`/`shop_id` เป็นสตริงในบาง push** (code 28 ทั้งใบ) — route coerce ด้วย `toShopeeNumber()` ก่อนเทียบเสมอ ของเดิม `payload.code ?? -1` กับ `"28"` ตกเป็น unhandled เงียบ ๆ · เปิด code ใหม่ที่ Shopee โดยไม่มีตัวรับ = ได้แค่ log skipped
- **ทุกที่ที่มี `creds` ต้องเซ็นด้วย `signForCreds(creds, …)` และใช้โฮสต์จาก `resolveBaseUrl(creds)`** (creds พก `env` ของ app ที่ออก token มาด้วย) — **`generateSign()` ถูกถอดออกแล้ว** เพราะมันอ่าน key จาก env ซึ่งเป็น key ผิดใบทันทีที่ app แบบ seller กลายเป็นของบริษัท · call ระดับ partner (OAuth / push config) ต้อง `resolveAppKeys(app, companyId)` แล้วส่ง keys เข้าไปเอง
- **เช็คว่า token ของทุกร้านเรียก Chat API ได้จริง**: `node scripts/check-shopee-chat-shops.mjs` (อ่านอย่างเดียว — ยิง `sellerchat/get_conversation_list` ด้วย key ของ app ที่ร้านผูก + token ใน DB · ผ่านครบ 7/7 หลัง Go Live 6 ก.ย. 2026) · ใช้ทุกครั้งหลัง re-authorize หรือเมื่อสงสัยว่าแชทร้านไหนเงียบผิดปกติ
- **ทดสอบสายแชทโดยไม่ต้องรอผู้ซื้อ**: `node scripts/simulate-shopee-webchat-push.mjs --shop <shop_id> --app seller` ยิง push code 10 ปลอม (เซ็นถูกต้อง) เข้า webhook production (ยิงหลายร้านให้ใส่ `--conversation 900000000000000000N --buyer 90000000N` แยกกัน — unique คือ (company_id, conversation_id) ใช้เลขเดิมจะไปทับผู้ติดต่อปลอมของร้านแรก) → ผู้ติดต่อ/ข้อความ/แจ้งเตือนต้องครบ (ผ่านแล้ว 5 ก.ย. 2026 กับ test shop 227886408) · **sandbox ของ Shopee ไม่มีฝั่งผู้ซื้อ** (Seller Center มีแค่ออเดอร์/สินค้า) push จริงพิสูจน์ได้หลัง Go Live เท่านั้น · ทดสอบเสร็จลบ `shopee_contacts`/`shopee_messages` ของ conversation ปลอมทิ้ง
- **ขั้นตอนตอนย้าย seller app จาก sandbox → live (6 ก.ย. 2026 — ทำครบแล้ว · ข้อ (3) ใช้บัญชีหลัก Shopee กดครั้งเดียวได้ทั้ง 7 ร้าน แม้ app จดด้วยบัญชีร้านเดียว)**: (1) เปลี่ยน env 3 ตัว `SHOPEE_SELLER_APP_ID/KEY/ENV` ทั้ง `.env.local` และ Vercel แล้ว redeploy — **ต้องทำก่อนเปิด push** ไม่งั้น webhook ตีตกลายเซ็นของ app ใหม่ทุกใบ (Shopee นับ callback ล้มเหลวแล้วปิด push ให้เอง) (2) ร้าน sandbox `OpenSANDBOX…` (shop 227886408) ใน `marketplace_accounts` + chat_account ของมัน set `is_active=false` แล้ว (token เป็นของ sandbox ต่ออายุบน production ไม่ได้) (3) re-authorize ร้านจริง (gb Thailand 1337059772) ผ่าน "เชื่อมผ่าน app ของร้าน" (4) `node scripts/enable-shopee-webchat-push.mjs --app seller --apply --callback https://aoocommerce.vercel.app/api/shopee/webhook` (5) ยิง `simulate-shopee-webchat-push.mjs --shop 1337059772 --app seller` เช็คสายแชท · **Live Push Partner Key ของ app seller ต้องกด Generate ในหน้า Push Mechanism → Set Push เอง (ตอนแรกว่าง)** แล้วตั้ง `SHOPEE_SELLER_APP_PUSH_KEY` ทั้ง `.env.local` และ Vercel (ทำแล้ว 6 ก.ย. 2026) — Shopee เซ็น push จริงด้วย key นี้ ไม่ใช่ API key · หน้าเดียวกันต้องเลือก "Deployment Service Area" = Singapore ถึงจะกด Save ได้
- UI: `GET /api/shopee/oauth/auth-url?app=seller&check=1` ตอบ `{ available, env, source: 'company'|'env'|null }` **ตามบริษัทที่ผู้ใช้อยู่** — ปุ่ม "เชื่อมผ่าน app ของร้าน" ในแท็บ Marketplace ของ `/settings/sales-channels` โชว์เสมอแต่กดไม่ได้พร้อมบอกเหตุผลเมื่อ `available: false` · การ์ดร้านที่ผูก app seller มี badge "app ของร้าน" · `chat_connected` ของ Shopee ใน `/api/marketplace/accounts` = มี `chat_access_token` ที่ refresh ยังไม่หมดอายุ **หรือ** ร้านนั้น `metadata.shopee_app='seller'` อยู่แล้ว (ร้านยุคก่อนแยกสอง token)

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
| TO_CONFIRM_RECEIVE | shipping | paid |
| TO_RETURN (ลูกค้าขอคืนของหลังได้รับ) | shipping | paid |
| COMPLETED | completed | paid |
| CANCELLED | cancelled | cancelled |

- **สถานะใหม่ที่ mapping ไม่รู้จักห้ามปล่อยตก default** (default = new/pending จะลาก order ถอยหลัง — เคยเกิดกับ TO_RETURN, ดู fix-bug.md 2026-08-28) — เพิ่มสถานะต้องเพิ่มทั้ง `mapShopeeStatus()` และ rank ใน `SHOPEE_STATUS_ORDER`

### Shopee Description Sync + Central Product Upsert (เพิ่มเมื่อ 2026-05-21)
- **Description**: ดึง description จริงจาก Shopee เก็บใน `products.description` + per-platform ใน `marketplace_product_links.platform_description` (column ใหม่) — ลบ stub `"Shopee Item #..."`
- **Extended description** (whitelist sellers): flatten text → description, image URLs → `marketplace_product_links.platform_description_images` JSONB (ไม่ปนกับ product_images หลัก)
- **Central function** `upsertShopeeProduct()` ใน [lib/shopee/product-helpers.ts](../../../lib/shopee/product-helpers.ts) — ใช้ร่วม 3 entry points (UI import / bulk sync / order sync) ผ่าน `backfillSiblingVariations` เสมอ → variations ครบทุกตัว
- **Export priority**: `platform_description` (account ปลายทาง) → `products.description` → `product.name`
- **UI**: textarea per-platform ใน Shopee tab ของ product edit page + thumbnail สำหรับ description images

## Shopee API Success Rate Fixes (เพิ่มเมื่อ 2026-04-12)

### Auto-deactivate expired shops
- `sync-all`, `refresh-tokens`, `ensureValidToken` — ถ้า refresh_token หมดอายุ → set `is_active=false` อัตโนมัติ
- ป้องกัน cron ยิง API เปล่าที่ทำให้ success rate ตก

### mass_ship_order fix (ออเดอร์หาย)
- **ปัญหา**: กดรับ 5 ออเดอร์ เหลือ 3 — เพราะ code assume success สำหรับ unsplit orders
- **แก้**: ส่ง package_number เสมอ + ไม่ assume success ถ้าไม่อยู่ใน success_list + เพิ่ม detailed logging

### update_item category fix
- coerce `category_id` เป็น Number (Postgres bigint → string → Shopee reject)
- skip push ถ้า mandatory attribute auto-fill ไม่ได้

### get_buyer_invoice_info fix
- skip API call ถ้า order list ว่าง

### Header Notification
- `/api/marketplace/health` — คืน expired/disconnected shop count
- Header bell badge แสดง counter จำนวนร้านที่มีปัญหา (poll ทุก 5 นาที)

---

