---
paths:
  - "lib/marketplace/**/*"
  - "lib/marketplace-platforms.ts"
  - "lib/shopee/**/*"
  - "lib/tiktok/**/*"
  - "lib/lazada/**/*"
  - "lib/maintenance/**/*"
  - "lib/chat/channel-health.ts"
  - "app/api/marketplace/**/*"
  - "app/api/shopee/**/*"
  - "app/api/tiktok/**/*"
  - "app/api/lazada/**/*"
  - "app/shopee/**/*"
  - "app/tiktok/**/*"
  - "app/lazada/**/*"
  - "app/settings/sales-channels/**/*"
  - "app/superadmin/**/*"
  - "components/marketplace/**/*"
  - "components/shopee/**/*"
  - "components/ui/SystemIssuesCard.tsx"
  - "scripts/*shopee*"
  - "scripts/*tiktok*"
  - "scripts/*lazada*"
---
# Marketplace — แกนกลาง: sync 3 ทาง · cron · env · watchdog · โควตา/rate limit · queue · API docs

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

### Architecture Overview
- **📊 สถานะรายแพลตฟอร์มว่าใครถึงไหนแล้ว (เช็คจาก DB จริง) อยู่ที่ [memo/platform-status.md](../../../memo/platform-status.md) — อ่าน/อัปเดตที่นั่นที่เดียว ห้ามทำตารางสถานะซ้ำในไฟล์นี้**
- **Multi-tenant SaaS** — หลายร้านค้าใช้ระบบเดียวกัน
- **Multi-platform** — Shopee ✅ | TikTok ✅ | Lazada ✅ (ออเดอร์+สินค้า+settlement ครบทั้ง 3 · LINE Shopping → planned)
- **Shared product helpers** — `lib/shopee/product-helpers.ts` (ใช้ร่วมระหว่าง order sync + product sync)

### Order Sync Mechanism (Shopee)

**3 ทางที่ orders เข้าระบบ:**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/shopee/webhook` | Shopee push → save `shopee_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/shopee/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/shopee/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs:** ตารางรวมของทุกแพลตฟอร์มอยู่ที่หัวข้อ TikTok ด้านล่าง (แหล่งเดียว — อย่าทำตารางซ้ำที่นี่)

**Auth:** ทุก cron route รองรับ `Authorization: Bearer {CRON_SECRET}` และ `x-cron-secret` header

### Env ของ marketplace/แชท — กติกาชื่อ `{PLATFORM}_{APP}_{FIELD}` (จัดใหม่ 2026-09-05)

app ทุกตัวของแพลตฟอร์มเดียวกัน**ต้องมีคำบอกบทบาท**ในชื่อ ไม่มี "ตัวหลัก" ที่ไม่มีคำนำหน้าอีก (ของเดิม `TIKTOK_APP_KEY` กับ `TIKTOK_CHAT_APP_KEY` / `SHOPEE_PARTNER_KEY` กับ `SHOPEE_SELLER_PARTNER_KEY` อ่านแล้วตีกัน)

| แพลตฟอร์ม | APP | ใช้ทำอะไร | ตัวแปร |
|---|---|---|---|
| Shopee | `PARTNER` | app กลางของ AOO (Third-party Partner Platform) ทุกร้าน · production | `SHOPEE_PARTNER_APP_ID` · `_KEY` · `_PUSH_KEY` (Live Push Partner Key) · `_ENV` |
| Shopee | `SELLER` | app ที่จดในนามร้านเอง (Seller In House) — **ของบริษัท ไม่ใช่ของระบบ** เก็บใน `marketplace_app_credentials` ต่อบริษัท (ABC the Baby: live partner_id `2043961`, test 1243244 · **Live API Partner Key หมดอายุ 4 มี.ค. 2027**) · env ด้านขวาเหลือเป็น **ทางถอย** ของบริษัทที่ยังไม่มีแถวในตาราง อ่านที่ [lib/shopee/app-credentials.ts](../../../lib/shopee/app-credentials.ts) ที่เดียว | `SHOPEE_SELLER_APP_ID` · `_KEY` · `_PUSH_KEY` (ถ้าต่าง) · `_ENV` *(legacy fallback)* |
| TikTok | `SHOP` | TikTok Shop app หลัก (ออเดอร์/สินค้า) | `TIKTOK_SHOP_APP_KEY` · `_SECRET` |
| TikTok | `CHAT` | app หมวด Customer Support | `TIKTOK_CHAT_APP_KEY` · `_SECRET` |
| TikTok | `LOGIN` | Login Kit (developers.tiktok.com) เอา avatar มาเป็นโลโก้ร้าน | `TIKTOK_LOGIN_APP_KEY` · `_SECRET` |
| Lazada | `SHOP` | Seller In-house APP (ออเดอร์/สินค้า) | `LAZADA_SHOP_APP_KEY` · `_SECRET` |
| Lazada | `CHAT` | In-house IM Chat (ไม่ตั้ง = ใช้คู่ SHOP) | `LAZADA_CHAT_APP_KEY` · `_SECRET` |

- **ไม่มี fallback ชื่อเก่า** — เปลี่ยนชื่อในโค้ดต้องเปลี่ยนบน Vercel พร้อมกัน (ตั้งชื่อใหม่ก่อน deploy แล้วค่อยลบชื่อเก่า)
- Supabase ใช้คีย์รูปแบบใหม่เท่านั้น: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` — `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` ถอดออกจากโค้ดแล้ว
- `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` **ถอดออกจากโค้ดแล้ว 2026-09-07** (เคยเป็น fallback ยุคก่อน multi-tenant · `lib/line-config.ts` ลบทั้งไฟล์) — token ของ LINE OA อยู่ใน `chat_accounts` ต่อบริษัทเท่านั้น · webhook ของทุก OA ต้องชี้ `…/api/line/webhook?account=<uuid>` (ตัวเฝ้ายืนยันให้ทุก 6 ชม. — ทั้ง 3 OA ผ่าน) ไม่มี `?account=` = ลายเซ็นตก 401 · ค้างอยู่บน Vercel ไม่มีผล แต่ลบให้สะอาด
- เพิ่ม app ใหม่ = ตั้งชื่อตามตารางนี้ + จดในตารางนี้ · `.env.local` จัดหมวดตามลำดับเดียวกัน

### Product Matching Priority (Order Sync — ใช้ร่วม Shopee + TikTok)
1. `marketplace_product_links` (external_item_id + external_model_id)
2. SKU match
3. Product Code match
4. สร้างใหม่อัตโนมัติ (+ backfill ALL variations ถ้าเป็น variation product)

### Order Sync Mechanism (TikTok)

**3 ทางที่ orders เข้าระบบ (เหมือน Shopee):**
| ทาง | Route | กลไก |
|-----|-------|------|
| Webhook (real-time) | `/api/tiktok/webhook` | TikTok push → save `marketplace_webhook_log` → async `syncSingleOrder()` |
| Cron Polling (safety net) | `/api/tiktok/sync-all` | ทุก 15 นาที ดูด order ตาม `last_sync_at` |
| Webhook Retry | `/api/tiktok/webhook/retry` | ทุก 5 นาที retry webhook ที่ fail (max 3 ครั้ง → dead letter) |

**Cron Jobs (cron-job.org) — ครบทุกแพลตฟอร์มแล้ว 6 ตัว (ยืนยันหน้าจอ 2026-08-30):**
| Job | URL | Schedule |
|-----|-----|----------|
| Shopee Sync All | `GET /api/shopee/sync-all` | `*/15 * * * *` |
| Shopee Webhook Retry | `GET /api/shopee/webhook/retry` | `*/5 * * * *` |
| TikTok Sync All | `GET /api/tiktok/sync-all` | `*/15 * * * *` |
| TikTok Webhook Retry | `GET /api/tiktok/webhook/retry` | `*/5 * * * *` |
| Lazada Sync All | `GET /api/lazada/sync-all` | `*/15 * * * *` |
| Lazada Webhook Retry | `GET /api/lazada/webhook/retry` | `*/5 * * * *` |
| **Watchdog (เฝ้าสุขภาพทุกเจ้า)** | `GET /api/marketplace/watchdog` | `*/15 * * * *` |
| **บรอดแคสต์ตามเวลา** (2026-09-09) | `GET /api/broadcasts/run-scheduled` — หยิบใบ `status='scheduled'` ที่ถึงเวลาไปส่ง (จองใบด้วย UPDATE แบบมีเงื่อนไขก่อนยิง กัน cron ซ้อนส่งซ้ำ) · **ตอบ 200 ทันทีแล้วส่งใน `after()`** เพราะ cron-job.org รอได้แค่ 30 วิ แต่ตัวส่งใช้ได้ถึง 240 วิ (ส่งในสายที่ cron รอ = โดนนับว่าล้มแล้ว job ถูกปิด) · **เปิด Notify on failure** · ตัวเฝ้าจับใบที่ค้างเกิน 20 นาทีให้อีกชั้น (`broadcast_scheduled_overdue`) | `*/5 * * * *` |
| **Settlement รายวัน** | `GET /api/marketplace/settlements/sync` (ไม่ใส่อะไร = ทั้ง 3 เจ้าเรียงคิวในงบ 300 วิเดียว) · **แนะนำแยก job ต่อเจ้า** `?platform=shopee` / `lazada` / `tiktok` (2026-09-08 — เจ้าแรกกินเวลาหมด เจ้าท้ายไม่โดนข้าม) | `0 4 * * *` |

**เพิ่ม marketplace ใหม่ = ต้องตั้ง cron 2 ตัวเสมอ** (sync-all + webhook/retry)
ทุกตัวยิงด้วย header `x-cron-secret: {CRON_SECRET}`
- ⚠️ **cron-job.org รอ response ได้สูงสุด 30 วิ** (เพดานที่ตั้งได้จริง — เจ้าของยืนยัน 2026-09-09) ⇒ **ทุก cron route ต้องตอบ 200 ทันทีแล้วทำงานจริงใน `after()`** ตั้ง `maxDuration` ตามงาน · ทำในสายที่ cron รอ = โดนนับว่าล้มทั้งที่งานสำเร็จ แล้ว job ถูกปิดเองเมื่อล้มติดกัน (เคยเกิด ก.ค. 2026) · ผลจริงดูจาก `integration_logs` / heartbeat / สถานะแถว ไม่ใช่จาก response ของ cron · ครบแล้วทุกตัว 2026-09-09 (sync-all ×3 · webhook/retry ×3 · watchdog · settlement สาย cron · broadcasts/run-scheduled) — สายที่ผู้ใช้กดเองจากหน้า (เช่น settlement) ยังรอผลได้ตามเดิม

### 🔔 Watchdog — ตัวเฝ้าที่ทำให้ "พังเงียบ" เป็นไปไม่ได้ (เพิ่ม 2026-09-02)

[lib/marketplace/watchdog.ts](../../../lib/marketplace/watchdog.ts) — **แหล่งความจริงเดียว** ของ "ตอนนี้มีอะไรพังอยู่":
หน้า superadmin API Monitor · การ์ดบน dashboard ของร้าน ([SystemIssuesCard](../../../components/ui/SystemIssuesCard.tsx)) ·
กระดิ่งบน Header · push แจ้งเตือน — **อ่านจาก `collectWatchdogIssues()` ตัวเดียวกันหมด** จึงไม่มีทางพูดคนละเรื่อง

- **ทุก issue ต้องมี `fix` (วิธีแก้ที่ลงมือได้จริง) + `actionLabel` + `url`** — บอกว่าพังเฉย ๆ แล้วให้ผู้ใช้ไปหาทางเอง ไม่นับว่าแจ้งเตือน
- **ใครได้รับ**: `scope: 'system'` → superadmin · ทุก issue ที่มี `companyId` → เจ้าของ/แอดมินของบริษัทนั้น (เรื่อง cron ตายก็บอกร้านด้วย เพราะกระทบตัวเลขที่ร้านเห็น)
- **กันสแปม**: เรื่องเดิมเตือนซ้ำได้ทุก 6 ชม. · เรื่องที่มี `groupKey` เดียวกันรวมเป็นใบเดียว (cron เจ้าหนึ่งตาย = 1 ใบ ไม่ใช่ 6 ใบ) · หายแล้วบอก "กลับมาปกติ" ครั้งเดียว · state เก็บใน `app_flags.watchdog_state`
- **push ส่งถึงคนไม่ใช่ถึงบริษัท** — `sendPushToUsers()` ยิงตาม `user_id` จึงถึง superadmin ได้ไม่ว่าตอนเปิดแจ้งเตือนจะอยู่บริษัทไหน (สวิตช์เปิดได้ทั้งกระดิ่งในแอปหลักและกระดิ่งบน header ของ shell superadmin)
- ⚠️ **ตัวเฝ้าเองก็ตายเงียบได้** — ชั้นนอกสุดต้องเป็นของนอกระบบเรา: **เปิด "Notify on failure" ของ job นี้ใน cron-job.org เสมอ** · หน้า superadmin แสดง "ตัวเฝ้าตรวจล่าสุดเมื่อ ..." จาก `app_flags.watchdog_last_run` — ค่านี้ค้าง = ตัวเฝ้าตาย
- **ช่องทางแชท LINE/Facebook — ตรวจของจริง ไม่ใช่เดาจากความเงียบ** (เปลี่ยน 2026-09-07) — [lib/chat/channel-health.ts](../../../lib/chat/channel-health.ts) ถามแพลตฟอร์มตรง ๆ **ทุก 6 ชม./ช่องทาง** (รอบละไม่เกิน 10 ช่องทาง · concurrency 3 · งบเวลา 15 วิ เพราะ `collectWatchdogIssues()` วิ่งอยู่ในสายที่ผู้ใช้รอ — ตัวที่ไม่ทันรอรอบหน้า): **LINE** = `/v2/bot/info` (token ใช้ได้ไหม) → `/v2/bot/channel/webhook/endpoint` (URL ที่ LINE จดไว้ตรงกับ webhook ของบัญชีนี้ไหม + `active`) → `/v2/bot/channel/webhook/test` (LINE ยิงมาแล้วถึงจริงไหม — route เราตอบ 200 ให้ `events` ว่างอยู่แล้ว **ห้ามแก้ให้ตอบอย่างอื่น**) · **Facebook** = `/{page_id}?fields=id,name` (token, error code 190) → `/{page_id}/subscribed_apps` (เพจยัง subscribe `NEXT_PUBLIC_FACEBOOK_APP_ID` พร้อมฟิลด์ `messages` ไหม · ไม่ตั้ง env นี้ = ข้ามชั้นนี้ ห้ามฟันว่าพัง) · ผลเก็บที่ `chat_accounts.health_status/health_detail/health_checked_at` — ตัวเฝ้าอ่านค่านี้ไปแจ้ง (`token_invalid` = critical · อีกสองตัว = warning) และหน้า `/settings/chat-channels` โชว์ป้ายเตือนพร้อม tooltip · **`check_failed` ไม่แจ้งเตือน** (เน็ตสะดุด ≠ ช่องทางพัง)
- ⛔ **ห้ามกลับไปเตือนจาก "ความเงียบ" อีก** — เคยใช้ค่าเฉลี่ย แล้วเปลี่ยนเป็น `1.5 × ช่องว่างที่เคยเงียบนานสุดใน 30 วัน` ก็ยัง**เตือนผิดทุกสุดสัปดาห์** เพราะ "ไม่มีใครทัก" กับ "ช่องทางพัง" มองจากฝั่งเราแล้วเหมือนกันเป๊ะ ไม่ว่าจะปรับสูตร/เพดานยังไง (3–7 ก.ย. 2026 ดู [fix-bug.md](../../../fix-bug.md)) · RPC `get_chat_channel_activity()` **ยังอยู่ใน DB** ไว้ทำหน้ารายงานสถิติในอนาคต แต่ไม่ใช่เกณฑ์แจ้งเตือนแล้ว
- **LINE/Facebook มี integration log แล้ว** (เพิ่ม 2026-09-02) — ส่งข้อความ · ลายเซ็น webhook ไม่ตรง · webhook error · ทั้งหมด `await logIntegrationNow()` เพราะอยู่ใน request handler · **ไม่ log ข้อความขาเข้าที่สำเร็จ** (วันละ ~350 ใบ จะท่วม) — ความเงียบจับด้วย watchdog แทน
- **`stock_not_initialized` — เปิดซิงค์สต็อกอัตโนมัติทั้งที่ยังไม่เคยตั้งยอดตั้งต้น** (เพิ่ม 2026-09-16) — เงื่อนไข: ร้าน `is_active` · `auto_sync_stock !== false` · มี `marketplace_product_links` ที่ `sync_enabled=true` อย่างน้อย 1 แถว · `stockInitializedAt(account) === null` (**อ่านผ่าน helper ใน [lib/marketplace/onboarding.ts](../../../lib/marketplace/onboarding.ts) เท่านั้น ห้ามแกะ `metadata.stock_initialized_at` เอง**) · บริษัทเปิดระบบคลัง (`getStockConfig().stockEnabled`) · severity `warning` + `renotifyHours: 24` · ปุ่มพาไป `/marketplace/sync?job=pull_stock&account=<id>` — เตือน**ก่อน**สต็อกขยับ เพราะพอขยับแล้วชั้นกลางจะส่งยอดคลังที่ยังเป็น 0 ขึ้นไปทับของจริงบนร้าน (อาการเดียวกับ warning ของขั้น `auto_sync` ในหน้าต้อนรับ — กติกาเดียวกัน ที่เดียวกัน)
- **เพิ่มเรื่องที่ต้องเฝ้า = เพิ่ม check ในไฟล์เดียว** ห้ามไปเขียน logic ตรวจสุขภาพซ้ำในหน้าใดหน้าหนึ่ง
- **cron ตัวเฝ้ายังลาก "งานดูแลรายวัน" ไปด้วย** (เพิ่ม 2026-09-08) — [lib/maintenance/log-retention.ts](../../../lib/maintenance/log-retention.ts) `pruneOldLogs()` ลบ log เกินอายุ (`integration_logs` 60 วัน · `marketplace_sync_log`/`marketplace_webhook_log` 30 วัน) · เรียกทุกรอบได้เพราะตัวมันเองคุมให้ทำจริงวันละครั้ง (`app_flags.log_retention_last_run`) จึงไม่ต้องตั้ง cron ใบใหม่ · **ที่ต้องมีเพราะ log ที่ไม่เคยลบโตจนกินแคชของฐานข้อมูล แล้วทำให้ทุกหน้าช้า** — ล้างครั้งแรก 8 ก.ย. 2026 ฐานข้อมูล 257MB → 160MB หน้าออเดอร์ 257ms → 52ms (ดู [fix-bug.md](../../../fix-bug.md)) · เพิ่มตาราง log ใหม่ต้องมาเพิ่มใน `RETENTION` ด้วยเสมอ
- **เฝ้าบริษัทที่เลิกใช้ด้วย** (เพิ่ม 2026-09-08) — 2 เรื่อง ทำเฉพาะตอนเรียกแบบทั้งระบบ (ไม่มี `opts.companyId`) และเป็น `scope: 'system'` + **`companyId: null`** เสมอ (ห้ามเด้งไปบอกเจ้าของร้านว่า "ร้านคุณเงียบ" — ไม่ใช่เรื่องที่เขาแก้): `company_quiet` = บริษัทที่ยังเปิดแต่ `last_activity` เกิน 30 วัน · `company_purgeable` = บริษัทที่ปิดแล้วครบ 30 วันจน `purge_company` ได้ · ทั้งคู่ตั้ง **`renotifyHours: 24 * 7`** (ฟิลด์ใหม่ของ `WatchdogIssue` — ไม่ใส่ = 6 ชม.ตามเดิม) เพราะเรื่องพวกนี้ไม่มีอะไรเปลี่ยนใน 6 ชม. · RPC `get_company_overview()` ล้มต้องไม่ทำให้ check อื่นหาย (ครอบ try/catch แล้ว)
- **หน้า superadmin Companies = ศูนย์รวมรายธุรกิจ** ([/superadmin/companies](../../../app/superadmin/companies/page.tsx)) — ความเคลื่อนไหวล่าสุด + ป้าย "เงียบ N วัน" · รายชื่อสมาชิก (กดที่จำนวนเพื่อกาง) · จำนวนร้าน/ช่องทางแชท/ออเดอร์ · **ลบถาวร** ผ่าน RPC `purge_company(p_company_id)` (ลบทุกตารางที่มี `company_id` + ไฟล์ในสตอเรจ) โดยต้องพิมพ์ชื่อบริษัทให้ตรง และผ่านเงื่อนไข **ปิดครบ 30 วัน หรือ `is_empty`** ซึ่ง **API คำนวณใหม่เองเสมอ ห้ามเชื่อธงจากหน้าจอ** · ข้อมูลทั้งหน้ามาจาก RPC `get_company_overview()` (service role เท่านั้น) · ปิดบริษัท = stamp `companies.deactivated_at` (จุดเริ่มนับ 30 วัน) · **หน้า Users ถูกลบทิ้งแล้ว 2026-09-08** (บอกได้แค่ "มีคนชื่อนี้" ซึ่งไม่พาไปสู่การตัดสินใจอะไร)
- **สายที่ผู้ใช้รอ (กระดิ่ง `/api/header/summary`) อ่านผ่าน `collectWatchdogIssuesCached()` (cache 5 นาที/บริษัท, single-flight)** — ผลจริงเปลี่ยนตาม cron ทุก 15 นาทีอยู่แล้ว ไม่ต้องคำนวณใหม่ทุกหน้าโหลด · cron ล้าง cache หลังคำนวณรอบใหม่ · ตัวตรวจจริง LINE/Facebook รันใน `runWatchdog()` (cron) เท่านั้น ห้ามใส่ใน `collectWatchdogIssues` (เพิ่ม 2026-09-07)

**⚠️ worker ของ retry ทั้ง 3 เจ้าเป็นตัวเดียวกันแล้ว** — [lib/marketplace/webhook-retry.ts](../../../lib/marketplace/webhook-retry.ts)
(`runWebhookRetry()`) route ของแต่ละแพลตฟอร์มเหลือแค่บอกว่า "งานหนึ่งใบทำยังไง"
เพิ่ม marketplace ใหม่ = สร้าง route 3 บรรทัด **ห้าม copy worker ไปทั้งก้อนอีก** ·
worker หยิบทั้งใบที่ `failed` (รวม `next_retry_at` เป็น NULL) **และใบที่ค้าง
`processing` เกิน 10 นาที** (ฟังก์ชันตายกลางทาง) — ของเดิมมองแค่ `failed` ที่ถึงรอบ
จึงมีใบค้างถาวรทั้งสองแบบ (ดู [fix-bug.md](../../../fix-bug.md) 2026-08-30)

### helper กลางของทุก marketplace — [lib/marketplace/product-helpers.ts](../../../lib/marketplace/product-helpers.ts) (เพิ่ม 2026-08-26)
`getOrCreateVariationTypeIds` · `upsertProductImage(s)` · `reactivateProduct` · `tryAutoMatchBySku` · `findMarketplaceLink` — เดิมอยู่ใน `lib/shopee/product-helpers.ts` ยกออกมาตอน TikTok ต้องใช้เหมือนกัน · **`platform` param default = `'shopee'`** ของเดิมจึงไม่เปลี่ยนพฤติกรรม และ shopee/product-helpers.ts re-export ต่อให้ call site เดิมใช้ได้เหมือนเดิม · **เพิ่ม marketplace ใหม่ → ใช้ตัวพวกนี้ ห้าม copy ไปไว้ใน `lib/<platform>/` ของตัวเอง**

### Stock push/pull — ชั้นกลาง [lib/marketplace/stock-push.ts](../../../lib/marketplace/stock-push.ts) + adapter ต่อ platform

- **➕ เพิ่ม platform ใหม่ (เช่น LINE My Shop) = สร้าง [lib/`<platform>`/stock-adapter.ts](../../../lib/) + ลงทะเบียน 1 บรรทัดใน `STOCK_ADAPTERS` — ห้าม `switch` ตาม platform ในชั้นกลาง / route / UI**
- [lib/marketplace/stock-adapter.ts](../../../lib/marketplace/stock-adapter.ts) = สัญญาเดียวที่ platform ต้องทำตาม: `interface StockAdapter { pushApiPath; pullApiPath; pushStock(account, productId, quantities, links); fetchPlatformStock(account, links) }` · `STOCK_ADAPTERS` registry · `getStockAdapter(platform)` — adapter รู้แค่ "แปลง link+ยอด → API ของตัวเอง" ไม่รู้จัก inventory/quota/log
- ชั้นกลางทำส่วนที่เหมือนกันทั้งหมด: `syncStockNow(variationIds, changedWarehouseIds?, { excludeAccountId? })` (เรียกใน `after()` ทุกจุดที่สต็อกขยับ · ไม่กรอง platform · ข้ามร้านที่ปิด `auto_sync_stock` · คลังไม่ตรงกับที่ขยับ · `isQuotaBlocked(platform, 'inventory')`) · `pushStockForAccount(account, productId)` · `pullStockForAccount(account, {mode, dryRun})` · `collectPushQuantities` (คลังของร้าน `resolveAccountWarehouseId` · `quantity − reserved` ไม่มีแถว → `product_variations.stock` · `max(0)`) · `applyPulledStock` เขียนผ่าน `adjustStock` **`referenceType = `${platform}_sync``** (ป้ายไทยเพิ่มที่ `REFERENCE_TYPE_LABELS` ใน `app/inventory/components/types.ts`)
- Route กลาง: `POST /api/marketplace/products/push-stock` `{marketplace_account_id, product_id?, cursor?, run_id?, variation_ids?, trigger?}` (ทั้งร้านเดินด้วย cursor · ต่อรอบเดิมเมื่อเรียกซ้ำ) · `POST /api/marketplace/products/pull-stock` `{marketplace_account_id, mode?, dry_run?, run_id?, variation_ids?}` · `POST /api/marketplace/products/stock-preview` `{marketplace_account_id, direction:'pull'|'push', mode?}` — **ทุก platform ใช้ route ชุดนี้** (`/api/shopee/products/{push,pull}-stock` ลบแล้ว)
- **รอบการทำงาน (sync run) — เพิ่ม 2026-09-16** ([lib/marketplace/sync-runs.ts](../../../lib/marketplace/sync-runs.ts) · ตาราง `marketplace_sync_runs` + `marketplace_sync_run_items` · RLS อ่านอย่างเดียว เขียนผ่าน service role): **ทุกการเขียนสต็อกจากงานซิงค์ต้องมีรอบ** (route สร้างให้เองถ้าไม่ได้มาจากพรีวิว) · `inventory_transactions.reference_id` ของ `*_sync` = **run.id** (เดิม account.id — แถวก่อน 16 ก.ย. ยังเป็น account.id หน้า `?run=` ต้องรับเคส "ไม่พบรอบนี้") · พรีวิวใช้ได้ **15 นาที** (เก่ากว่านั้น 409 `preview_expired` — auto sync/cron/webhook เดินอยู่ สแนปช็อตเชื่อไม่ได้) · กันรอบซ้อน 10 นาทีต่อร้าน+งาน (409 `run_in_progress`) · `variation_ids: []` = ไม่ทำอะไร **ไม่ใช่ทั้งร้าน** · ค่าเริ่มต้นการติ๊ก = แถวที่ทำได้ ยกเว้นขา push ที่จะส่ง 0 ทับร้านทั้งที่ระบบไม่เคยมีแถวคลัง (`risky`) · adapter ต้องคืน `apiCalls` จริง (ลง `quota_used` — ห้ามประมาณจาก batch size)
- **ปุ่มย้อน** ([lib/marketplace/sync-revert.ts](../../../lib/marketplace/sync-revert.ts)) — ย้อนได้เมื่อ: งานสต็อก · done/partial · ยังไม่เคยย้อน · เป็นรอบล่าสุด**ที่ลงมือจริง**ของร้าน (ข้าม previewed) · ≤ 7 วัน · **ไม่มีเพดาน "5 นาที"** — ความปลอดภัยวัดจาก "มีอะไรแทรกหลังรอบนี้ไหม" ต่อแถว (`inventory_transactions` หลัง `started_at` ที่ไม่ใช่ของรอบ) · pull = คืน**ส่วนต่าง**ผ่าน `offsetStock` (ห้าม `adjustStock` ตั้งเลขเดิม — กลืนออเดอร์ที่แทรก) · ติดลบ = หยุดที่ 0 + รายงาน `oversold` พร้อมเลขออเดอร์ (ปุ่มย้อน**ไม่ได้**ยกเลิกออเดอร์ที่รับไปแล้ว — ตัวกันจริงคือพรีวิว + เตือนแดงเมื่อจะ "เพิ่ม" ยอด) · หลังย้อน `after(syncStockNow)` ให้ทุกร้านได้เลขที่แก้ · push = อ่านร้านใหม่ก่อน ส่ง `shop_before` กลับเฉพาะตัวที่บนร้านยังเป็นเลขที่เราส่ง (`changed_on_shop` = ข้าม) · เตือน `auto_sync_on` ก่อนย้อน · import/export ยังไม่มีปุ่มย้อน (บันทึกรอบไว้ก่อน — export ย้อน = ซ่อนประกาศ+ตัด link ไม่ลบ · import ย้อนเฉพาะรายการที่ยังไม่มีออเดอร์)
- **order sync ของ marketplace ต้องกระจายยอดไปร้านอื่นด้วย** — หลัง deduct/reserve/return/cancel ใน `lib/<platform>/sync.ts` + webhook processor เรียก `syncStockNow(varIds, [warehouseId], { excludeAccountId: account.id })` (ร้านต้นทางตัดยอดเองแล้ว) ไม่งั้นขายบน Lazada แล้วร้านอื่นไม่ลด
- **UI ก็ห้ามแยกตาม platform** — งานที่แตะข้อมูลจริง (นำเข้า/ส่งสินค้า · ดึง/ส่งสต็อก) อยู่หน้าเดียว [app/marketplace/sync](../../../app/marketplace/sync/page.tsx) (`?job=&account=&run=` · เลือกงาน → เลือกร้าน → **ดูตารางเทียบก่อน** → ยืนยันเป็นประโยคที่มีตัวเลข → ผลลัพธ์+ปุ่มย้อน+ประวัติ) เข้าจากปุ่มบนหัวหน้าช่องทางการขาย (ขึ้นเมื่อเชื่อมร้าน >1) · การ์ดร้านใน `MarketplaceConnections.tsx` เหลือแค่สถานะ+ตั้งค่า (Sync Now ออเดอร์ · สวิตช์ auto sync บนหัวการ์ด · ⋮) **ห้ามเอาปุ่มงานกลับไปวางบนการ์ด** · โมดัลต้อนรับ 3 ขั้น (`MarketplaceOnboardingModal` · ลำดับใน [lib/marketplace/onboarding.ts](../../../lib/marketplace/onboarding.ts)) พาไปหน้านี้ตอนตั้งยอดตั้งต้น · ป้ายชื่อจาก `MARKETPLACE_PLATFORMS[platform].label` เสมอ
- ⛔ **ห้ามเขียนโค้ดสต็อกเฉพาะ platform นอก adapter ของมัน** · ⛔ **ห้ามเรียก adapter ตรงจาก route/หน้า** — ผ่าน `pushStockForAccount`/`pullStockForAccount` เสมอ
- ⚠️ **ร้านที่เพิ่งเชื่อม/ยังไม่เคยตั้งยอดในระบบ ต้องปิด `auto_sync_stock` จนกว่าจะตั้งยอดตั้งต้น** (ดึงจากร้าน หรือส่งทั้งร้านขึ้นไป — route ประทับ `metadata.stock_initialized_at` ให้ · อ่านผ่าน `stockInitializedAt()`) — ไม่งั้นส่ง 0 ไปทับร้าน · ตัวเฝ้า `stock_not_initialized` + แถบบนการ์ดร้านเตือนเคสนี้ · backfill ร้าน Shopee เก่า 5 ร้านแล้ว 16 ก.ย. 2569 (GB TH ตั้งใจเว้น)

### Product import — ชั้นกลาง [lib/marketplace/product-import.ts](../../../lib/marketplace/product-import.ts) + adapter ต่อ platform

- **➕ เพิ่ม platform ใหม่ = สร้าง `lib/<platform>/product-import-adapter.ts` + ลงทะเบียน 1 บรรทัดใน `PRODUCT_IMPORT_ADAPTERS` — ห้าม `switch` ตาม platform ในชั้นกลาง / route / หน้า**
- [lib/marketplace/product-import-adapter.ts](../../../lib/marketplace/product-import-adapter.ts) = สัญญาเดียวที่ platform ต้องทำตาม: `interface ProductImportAdapter { listApiPath; codePrefix ('SP-'/'LZ-'/'TT-'); listProducts(account, cursor?, pageSize?) → {items, nextCursor?, total?}; fetchDetails?(account, ids); linkPayload(item, model) }` + `MarketplaceImportItem` (รูป normalize: `external_item_id · name · sku · images · models[{external_model_id, name, sku, price, original_price, stock, image, attributes}] · variation_type_names · description · category/brand/weight · raw`) — **`cursor` เป็น opaque string เสมอ** (Shopee/Lazada = offset · TikTok = page_token)
- ชั้นกลางทำส่วนที่เหมือนกันทั้งหมด: `previewImport(account, {cursor, pageSize, search})` (เติม `linked_product` + `auto_match` = "จะผูกกับ X อัตโนมัติ" จาก SKU — **อ่านอย่างเดียว ห้ามปลุกของที่ลบไว้ตอนแค่ดูรายการ**) · `importItems(account, requests[{external_item_id, action:'create'|'link', target_product_id?}], opts, onProgress)` · `importAllProducts(account, {cursor, timeBudgetMs}, onProgress)` (ทั้งร้าน · งบ 210 วิ คืน `next_cursor`) — ข้างในคือ ลำดับจับคู่ (link เดิม → `products.code` → ปลุกของที่ soft-delete → **สินค้าเดี่ยว**จับ SKU → สร้างใหม่) · รูป · ประเภทตัวเลือก · เคารพ `source = <platform>_edited`/`manual` · upsert link
- ⛔ **สต็อก**: ห้ามเขียน `product_variations.stock` หรือ `inventory` — ยอดจากร้านเข้าคลังผ่าน `adjustStock` **fill_blank** (เติมเฉพาะช่องที่คลังเราเป็น 0 · กติกาเดียวกับ `applyPulledStock`) `referenceType = `${platform}_sync`` คลังเดียวกับขา push (`resolveAccountWarehouseId`) · action `link` เสร็จแล้วเรียก `syncStockNow(variationIds)` ให้ยอดของเราขึ้นร้าน (ข้ามร้านที่ปิด `auto_sync_stock` ตามกติกาเดิม)
- Route กลาง: `GET /api/marketplace/products/import?account_id=&cursor=&page_size=&q=` (พรีวิว) · `POST` เดียวกัน `{account_id, items?, all?, cursor?, copy_sku_to_barcode?}` (SSE `started` → `progress {done,total?,item_name,success,error?}` → `done {created,updated,linked,skipped,errors[],next_cursor?}`) · สิทธิ์ `marketplace.sync` · เช็ค `isQuotaBlocked(platform,'product')` → 429 · log `import_products` — **ทุก platform ใช้ route นี้** (`/api/{shopee,lazada,tiktok}/products/import` ลบแล้ว ห้ามสร้างใหม่)
- หน้าเดียวทุกแพลตฟอร์ม [app/marketplace/import](../../../app/marketplace/import/page.tsx) `?account=<id>` (เลือกทีละตัว/ทั้งหน้า · create/link ด้วย `components/marketplace/ProductPicker` · ชิปกรอง ทั้งหมด/ยังไม่ผูก/ผูกแล้ว · คัดลอก SKU เป็นบาร์โค้ด · "นำเข้าทั้งร้าน" วน `next_cursor`) — ป้าย/ไอคอนมาจาก `MARKETPLACE_PLATFORMS[platform].label` + `PlatformIcon` **ห้ามเขียนเงื่อนไขแยก platform ในหน้า**
- ค้นหา (`q`) = กรอง**หน้าที่ดึงมา**เท่านั้น — ไม่มี platform ไหนให้ค้นทั้งร้านด้วยคำเดียวกันได้
- ตัดทิ้งแล้ว: `link_to_variation_mappings` (API เดิมรับแต่ UI ไม่เคยส่ง) — จะทำจริงต้องมี UI แม็ป model→variation ก่อน

### Product export — ชั้นกลาง [lib/marketplace/product-export.ts](../../../lib/marketplace/product-export.ts) + adapter ต่อ platform

- **➕ เพิ่ม platform ใหม่ = สร้าง `lib/<platform>/product-export-adapter.ts` + ลงทะเบียน 1 บรรทัดใน `PRODUCT_EXPORT_ADAPTERS` — ห้าม `switch` ตาม platform ในชั้นกลาง / route / หน้า**
- [lib/marketplace/product-export-adapter.ts](../../../lib/marketplace/product-export-adapter.ts) = สัญญาเดียวที่ platform ต้องทำตาม: `interface ProductExportAdapter { createApiPath; getCategories(account) → MarketplaceCategory[] (ต้นไม้แบนแล้ว `id`·`parent_id`·`is_leaf`); getCategoryAttributes(account, categoryId) → MarketplaceAttribute[] (`id`·`name`·`required`·`input_type: text|select|multi`·`options`); searchBrands?(account, q, {categoryId?}) + `brandsNeedCategory?` (Shopee: ต้องมีหมวดก่อน); uploadImage(account, url) → id/URL บนร้าน; createProduct(account, payload, {draft}) → {external_item_id, models[{variation_id, external_model_id}], warnings[]}; deactivate?(account, itemId); linkPayload?() }` + `ExportPayload` กลาง (ชื่อ · คำอธิบาย · รูป (URL ของเรา) + `uploaded_images` (id บนร้าน) · หมวด · แบรนด์ · น้ำหนัก kg / ขนาด cm · `models[{variation_id, sku, price, stock, attributes[{type_name,value}]}]` · `attributes` เพิ่มของแพลตฟอร์ม)
- ชั้นกลางทำส่วนที่เหมือนกันทั้งหมด: `fetchProductForExport(productId, companyId, platform?, accountId?)` · `buildExportPayload(product, config, stockMap)` · `exportProduct(account, productId, config, {draft, dryRun})` · `exportBulk(account, items, {draft, cursor, timeBudgetMs}, onProgress)` → `next_cursor` — ข้างในคือ **กันส่งซ้ำ** (ผูกกับร้านนี้แล้ว = ไม่สร้างประกาศใหม่) · **กันสินค้าชุด** (`products.is_composite` ส่งไม่ได้ ไม่มีสต็อกของตัวเอง) · อัปรูปผ่าน adapter (`parallelLimit` 3 คงลำดับ) · upsert `marketplace_product_links` ทุกตัวเลือก (คอลัมน์ชุดเดียวกับขา import) · `logIntegration` action **`export_product`** · แล้ว **`syncStockNow(variationIds)`** ให้ยอดของเราขึ้นประกาศใหม่ทันที
- ⛔ **สต็อก**: ยอดที่ตั้งให้ประกาศใหม่มาจาก `collectPushQuantities` (คลังของร้านนั้น ตัวเดียวกับขา push) — **ห้าม adapter อ่าน/เขียน `inventory` เอง**
- **โหมดแบบร่าง (`draft`)** = "สร้างแล้วยังไม่เปิดขาย" · TikTok มีในตัว (`save_mode: AS_DRAFT`) · Lazada ไม่มี → สร้างแล้วยิง `/product/deactivate` ต่อทันที · Shopee ใช้ `item_status: UNLIST` · หน้า wizard เปิดสวิตช์นี้ไว้ให้ทุกเจ้า **ยกเว้น Shopee** (ของเดิมลงขายเลยมาตลอด)
- Route กลาง: `POST /api/marketplace/products/export` — `{account_id, product_id, config, draft?, dry_run?}` = JSON ทีละตัว · `{account_id, items[{product_id, config}], draft?, cursor?}` = SSE (`started` → `progress {done,total,product_name,success,error?}` → `done {results[], next_cursor?}`) · `GET .../export/categories?account_id=` · `GET .../export/attributes?account_id=&category_id=` · `GET .../export/brands?account_id=&q=` (คืน `supported:false` เมื่อ adapter ไม่มี `searchBrands`) — สิทธิ์ **`marketplace.push`** · เช็ค `isQuotaBlocked(platform,'product')` → 429 (ด่านเดียวที่ `helpers.ts`)
- หน้าเดียวทุกแพลตฟอร์ม [app/marketplace/export](../../../app/marketplace/export/page.tsx) `?account=<id>&product=<id>` — 3 ขั้น (เลือกสินค้า · ตั้งค่า · ส่ง) · ตัวเลือกหมวดใช้ **`components/marketplace/CategoryPicker`** (ตัวเดียวทุกแพลตฟอร์ม · แคชต้นไม้ต่อร้านในหน่วยความจำ ไม่ยิงซ้ำต่อแถว) · ฟอร์มคุณสมบัติ **สร้างจาก schema ที่ route attributes คืนมา** (`FormSelect`/`MultiSelectSearch`/`FormInput`) · "ใช้กับทุกรายการ" · ป้าย/ไอคอนจาก `MARKETPLACE_PLATFORMS[platform].label` + `PlatformIcon` **ห้ามเขียนเงื่อนไขแยก platform ในหน้า** (หน้า `/shopee/export` + `ShopeeExportModal`/`ShopeeBulkExportModal`/`ShopeeCategoryPicker` ลบแล้ว)
- `lib/shopee/product-export.ts` เหลือเป็น **ชั้นบางสำหรับ call site เดิม** (`sync-one-product.ts` ใช้ `uploadProductImages` · `/api/shopee/deals` ใช้ `exportProductToShopee`) — โค้ดใหม่เรียกชั้นกลางตรง ๆ

### ข้อมูลผู้ซื้อ (ชื่อ · ที่อยู่ · ข้อความ) — adapter ต่อ platform + ตัวเขียนที่อยู่ตัวกลาง

- **➕ เพิ่ม platform ใหม่ = สร้าง `lib/<platform>/buyer-adapter.ts` + 1 บรรทัดใน `BUYER_ADAPTERS`** — ห้าม `switch` ตาม platform / ห้ามไล่เดาชื่อคีย์ใน route หรือหน้า
- [lib/marketplace/buyer-adapter.ts](../../../lib/marketplace/buyer-adapter.ts) = สัญญาเดียว: `interface BuyerAdapter { extract(externalData) → MarketplaceBuyer }` (`name · phone · address_line · district · amphoe · province · postal_code · note`) · **กติกาเหล็ก: ค่าที่แพลตฟอร์มปิดบัง (มี `*`) = null** ห้ามส่ง `****` / `43***` / `(+66)095*****86` ต่อไปที่ DB หรือหน้าจอ (helper `unmasked()` ในไฟล์นั้น)
- ของจริงที่แต่ละเจ้าให้: **Shopee ปิดทุกช่อง** (ไม่มีอะไรใช้ได้เลย) · **Lazada** `address_shipping.city` = อำเภอ (รูปแบบ "ไทย/ อังกฤษ") + `post_code` ไม่ปิดบัง → จังหวัดเดาจากรหัสไปรษณีย์ผ่าน `thai-address-data` · **TikTok** `recipient_address.district_info[]` L1 = จังหวัด L2 = อำเภอ (รหัสไปรษณีย์ปิดบางส่วน ใช้ไม่ได้)
- **เขียนลง `shipping_addresses` ผ่าน [lib/marketplace/buyer-address.ts](../../../lib/marketplace/buyer-address.ts) `ensureBuyerShippingAddress()` ที่เดียว** — ⛔ ห้าม insert ตารางนี้เองใน `lib/<platform>/sync.ts` (คอลัมน์จริง: `address_name · contact_person · phone · address_line1 · address_line2 · district · amphoe · province · postal_code` โดย `address_name`/`address_line1`/`province` เป็น NOT NULL) · เคยเขียนชื่อคอลัมน์ผิดแล้ว**ไม่เช็ค `error`** จนออเดอร์ Lazada/TikTok ไม่มีที่อยู่ 100% เป็นเดือน (fix-bug.md 2026-09-14)
- `GET /api/orders/[id]/settlement` คืน `buyer` มาด้วย — การ์ด `MarketplaceOrderCard` ส่งต่อให้หน้าแม่ทาง `onLoaded` **หน้าห้ามยิง endpoint นี้ซ้ำ**

### โควตา / rate limit ทุก marketplace — registry เดียวที่ [lib/marketplace/platforms.ts](../../../lib/marketplace/platforms.ts) (แยก scope 2026-08-29)

- **circuit breaker แยกตาม scope** ไม่ใช่ต่อ platform ทั้งก้อน — scope = **กลุ่ม API ที่ใช้โควตาถังเดียวกัน**: `auth · order · fulfillment · product · inventory · promotion · chat` · flag ใน `app_flags` key `{platform}_quota_exhausted[:{scope}]` (key ไม่มี `:scope` = ทั้ง app, ของเดิมที่ live อยู่ยังใช้ได้)
- **เกณฑ์แบ่ง scope = platform ลงโทษเป็นก้อนไหน ไม่ใช่หน้าจอเราแบ่งยังไง** — (1) คนละ app_key = คนละถังเสมอ (แชท TikTok/Lazada เป็นคนละ app) (2) หลายเจ้าจำกัดราย API (`update_stock` เต็ม ไม่ได้แปลว่า `get_order_list` เต็ม)
- **client ทุก platform เขียนเหมือนกัน 2 บรรทัด** — `const scope = await beginMarketplaceCall('<platform>', apiPath)` ก่อน fetch (หน่วงจังหวะ + คืน scope) และ `reportMarketplaceError('<platform>', scope, errMsg, { httpStatus, code })` ตอนเจอ error · **ห้ามเรียก `markQuotaExhausted` ตรงๆ ในตัว client** และห้าม map path→scope เองนอก registry
- **cron/retry/manual sync ต้องเช็ค `isQuotaBlocked(platform, scope)` ก่อนยิงเสมอ พร้อมระบุ scope ให้ตรงงานตัวเอง** — เรียกเปล่าๆ จะเช็คแค่ระดับทั้ง app แล้วพลาดเคสที่ scope นั้นถูกบล็อก
- **มี breaker แล้วยังต้องมี throttle** ([lib/marketplace/throttle.ts](../../../lib/marketplace/throttle.ts)) — breaker คือตาข่ายรับหลังโดนแบน ไม่ได้กันไม่ให้โดน · ค่าระยะห่างต่อ scope อยู่ใน registry (`minGapMs`) ปัจจุบันตั้งเฉพาะ Lazada (chat 1000ms / อื่น 150ms) ที่เคยชนจริง · **จองจังหวะที่ DB ข้าม instance แล้ว** (2026-09-07 — RPC `claim_marketplace_call_slot` บนตาราง `marketplace_call_slots`; in-memory เหลือเป็นชั้นแรก+ทางถอย) เพราะ push หลายใบวิ่งคนละ instance เคยรวมกันยิงเกินจนโดน "ban 1 seconds" ซ้ำ ๆ
- **แบนสั้น ≠ โควตาหมด** — `reportMarketplaceError` อ่านวินาทีที่ platform บอก (`parseBanSeconds`) แล้วพักเท่านั้น · พักสั้นกว่า 2 นาที (`isShortPause`) ไม่ขึ้น banner/กระดิ่ง/ตัวเฝ้า · Lazada client รอแล้วยิงซ้ำเองเมื่อแบน ≤5 วิ และลง `integration_logs` action `rate_limited` ทุกครั้งที่โดน (นับความถี่ได้ — ดู fix-bug.md 2026-09-07)
- **ข้อความที่ผู้ใช้เห็นต้องตรงกับ scope ที่พักจริง** — `QUOTA_SCOPE_IMPACT` ที่เดียว (banner + กระดิ่ง อ่านจากนี่) · แชทพักแล้วขึ้นว่า "ออเดอร์เข้าช้า" = ส่งคนไปไล่หาปัญหาผิดที่ · **สถานะ breaker อ่านผ่าน `getBlockedPlatforms()` ที่เดียว** ทั้ง banner/กระดิ่ง/หน้า superadmin API Monitor — ห้ามให้ SQL หรือหน้าไหน parse `app_flags` เอง (RPC เคยจับเฉพาะ key ที่ไม่มี scope จึงบอก "ปิดทุก platform" ทั้งที่เปิดอยู่ ดู fix-bug.md 2026-09-08)
- **➕ เพิ่ม marketplace ใหม่**: เพิ่มชื่อใน `QUOTA_PLATFORMS` → TypeScript บังคับให้กรอก entry ใน `MARKETPLACE_PLATFORMS` → ครอบ request function 2 บรรทัด · จบ ไม่ต้องแตะ breaker/throttle/banner/กระดิ่ง/ปุ่มปลดใน superadmin เลย
- **ยังไม่ทำ**: breaker เป็นต่อ platform **ไม่ใช่ต่อร้าน** — ร้านเดียวชนลิมิต ร้านอื่นของ platform เดียวกันหยุดตาม (ต้องใส่ `shop_id` เข้า key + ส่ง shop ลงไปถึง request function)

### TikTok vs Shopee Key Differences
| | Shopee | TikTok |
|---|---|---|
| Shop identifier | `shop_id` (number) | `shop_cipher` (encrypted string) |
| Auth header | Query param `access_token` | Header `x-tts-access-token` |
| API versioning | `/api/v2/...` | `/{resource}/{YYYYMM}/...` |
| Order ID | `order_sn` (string) | `id` (string, 18 digits) |
| Webhook auth | HMAC(url + body, partner_key) | HMAC(app_key + body, app_secret) in `Authorization` header |
| Token exchange | Partner-level → shop tokens | Seller auth → get shops via `/authorization/202309/shops` |

### Marketplace Label Printing
- ใช้ `printOrder(orderId, 'marketplace_label', { source })` จาก `OrderPrintButtons`
- Route map อยู่ใน `MARKETPLACE_LABEL_ROUTES` (`components/ui/OrderPrintButtons.tsx`)
- ปัจจุบัน: Shopee ✅ | TikTok, Lazada, LINE Shopping, Shippop → ยังไม่มี API

### API Docs (Local — ดูก่อน web search!)
- **Shopee v2**: `api_doc_knowledge/Shopee/_INDEX.md` — refresh ได้ทุกเมื่อด้วย `node scripts/scrape-shopee-docs.mjs` (ดึงจาก JSON endpoint สาธารณะของ open.shopee.com — **ไม่ต้อง login/headless browser**; re-scrape ล่าสุด 2026-08-28: 444 APIs 29 หมวด รวมหมวดใหม่ BrandPortal)
- **Lazada**: `api_doc_knowledge/Lazada/_INDEX.md` — scrape ครบ 365 APIs จาก open.lazada.com (2026-08-28, headless Chrome — หน้า docs เป็น SPA ไม่ต้อง login) ยกเว้น 3 หมวดที่กางไม่ได้: LazCredit Risk / Content / Store Flash Sale · script อยู่ scratchpad session นั้น (เขียนใหม่ได้ง่าย: expand sidebar → เก็บ `a[href*=path=]` → เปิดทีละหน้า slice ตั้งแต่ "Latest update" ถึง "Please rate this article")
- **TikTok**: ใช้ skill **`tts-openapi-guide`** (จาก `npm i -g @tts-open-toolkit/cli` → `tts_open_toolkit skill add --agent cc`) — มี **OAS ฉบับเต็มเป็น JSON** ที่ `~/.claude/skills/tts-openapi-guide/references/oas/paths/*.json` อัปเดตได้ด้วย `tts_open_toolkit update` · สำเนา markdown เก่าใน api_doc_knowledge **ลบทิ้งแล้ว** (2026-08-28 — stale, เลข push code ผิด) · เรื่อง push code ยึดหน้า Partner Center เสมอ

### Scale & Queue Strategy

**ปัจจุบันยังไม่ใช้ queue — ใช้ "หยุดเองก่อนหมดเวลา แล้วบอกว่าค้างตรงไหน" แทน**

⚠️ **cron ที่ไล่งานจาก `last_sync_at` ต้องบันทึกความคืบหน้าเป็นช่วง ๆ ห้าม stamp ทีเดียวตอนจบ** — งานที่โตเกินเพดานเวลาจะโดนฆ่าก่อนถึงบรรทัด stamp แล้วรอบหน้าเริ่มที่เดิมแต่ช่วงยาวขึ้น = **วนตายตัวเอง** (Shopee ค้าง 21 ส.ค.–2 ก.ย. 2026 โดยไม่มีใครรู้เพราะ webhook ยังเข้า — ดู [fix-bug.md](../../../fix-bug.md)) · ทางที่ใช้ได้มี 2 แบบ: **หั่นช่วง + stamp ทุกช่วงที่จบ** (`syncOrdersByTimeRange` ของ Shopee — รับ `deadlineAt`/`sliceSeconds`) หรือ **จำกัดช่วงย้อนหลังสูงสุด** (Lazada/TikTok เพดาน 24 ชม.)

งานยาว (import สินค้า, backfill, bulk accept) ทำแบบนี้ทุกตัว:
```ts
export const maxDuration = 300;        // เพดาน route
const TIME_BUDGET_MS = 210_000;        // งบเวลาจริง — หยุดเองก่อนโดนตัด
if (Date.now() - startedAt > TIME_BUDGET_MS) { result.next_offset = i; break; }
```
ผู้เรียกเห็น `next_offset` / `remaining_order_ids` แล้วยิงรอบต่อไป — **cursor อยู่ที่ผู้เรียก แทนที่จะอยู่ใน Redis**
ตัวอย่าง: [lib/marketplace/product-import.ts](../../../lib/marketplace/product-import.ts) `importAllProducts` (คืน `next_cursor`) · [settlements/backfill](../../../app/api/marketplace/settlements/backfill/route.ts) (2,364 ออเดอร์ 8 รอบ) · [shopee/orders/bulk-ship](../../../app/api/shopee/orders/bulk-ship/route.ts)

**⚠️ queue แก้ "ทำไม่ครบ" แต่ไม่แก้ "ทำแล้วไม่รู้ว่าทำแล้ว"** — ต่อให้มี queue ถ้า worker ตายหลังยิง
API แพลตฟอร์มสำเร็จแต่ก่อนเขียน DB ก็ยังได้สถานะผิดเหมือนเดิม · งานที่มีผลข้างเคียงข้างนอก
(กดรับออเดอร์ แพ็คพัสดุ ตัดสต็อก) **ต้องทำ idempotency ก่อนเสมอ ไม่ว่าจะมี queue หรือไม่**:
- เช็คสถานะฝั่งแพลตฟอร์มก่อนยิง — ถ้าเขารับไปแล้วให้ **ซ่อมสถานะเรา ไม่ใช่ยิงซ้ำ**
- บันทึกร่องรอย **ทันทีที่ผลข้างเคียงเกิด** ก่อนทำขั้นถัดไป (Lazada บันทึก `package_id` ก่อน ReadyToShip)
- ผลลัพธ์: จอปิด เน็ตหลุด ฟังก์ชันตาย → **กดซ้ำได้เสมอโดยไม่เกิดของซ้ำ**

**เมื่อไหร่ถึงค่อยเอา queue จริง** (ยังไม่ถึงสักข้อ):
- งานเดียวใช้เวลาเกิน 300s แม้แบ่งรอบแล้ว
- ต้องคุม concurrency/rate limit **ข้าม request** (ตอนนี้ throttle เป็น in-memory ต่อ instance — best-effort)
- ต้องการ retry + dead letter อัตโนมัติโดยไม่มีคนกด
- 10+ ร้าน หลาย marketplace ยิงพร้อมกันจนชนกันเอง

**ถ้าถึงจุดนั้น**: Upstash QStash (ง่ายกว่า ไม่ต้องดูแล Redis) หรือ BullMQ + Redis ·
Architecture เป้าหมาย: Webhook → save log → Queue → Worker (concurrency + rate limit ต่อ platform, retry + dead letter) ·
**จุดที่ต้องเปลี่ยนน้อยมาก** — webhook route เปลี่ยนจาก `after()` เป็นยิงเข้า queue และงาน bulk เปลี่ยนจากคืน cursor เป็น enqueue

