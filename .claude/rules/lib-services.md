---
paths:
  - "lib/*.ts"
  - "lib/**/*.ts"
  - "app/api/**/*"
  - "scripts/**/*"
---
# Shared Services, Utilities & API Routes — ห้ามเขียน logic ซ้ำ

> แยกจาก code-simplicity.md (2026-09-10) · หลักเดียวกัน: มีแล้วใช้ของเดิม ขาดให้เพิ่ม option ไม่ copy-paste · UI components → [code-simplicity.md](code-simplicity.md)

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
| `marketplace/platforms.ts` | `lib/marketplace/platforms.ts` | **registry ของทุก marketplace** (client-safe) — ป้ายชื่อ · โควตาฟื้นยังไง · map API path→scope · ระยะห่างขั้นต่ำ · ข้อความ banner ต่อ scope · **เพิ่ม platform ใหม่ = เพิ่ม 1 entry ที่นี่** (Record บังคับให้กรอกครบ) แล้วครอบ request function ด้วย 2 บรรทัดตามหัวไฟล์ | ประกาศ map ป้ายชื่อ platform / ตารางโควตา / เวลาหน่วง ซ้ำที่อื่น |
| `marketplace/quota.ts` | `lib/marketplace/quota.ts` | Circuit breaker quota/rate-limit **แยกตาม scope** (`auth·order·fulfillment·product·inventory·promotion·chat`) — client ใช้ `beginMarketplaceCall(platform, apiPath)` ก่อนยิง + `reportMarketplaceError(platform, scope, msg, {httpStatus, code})` ตอน error · cron/retry/manual sync เช็ค `isQuotaBlocked(platform, scope)` **ต้องระบุ scope ให้ตรงงานตัวเอง** · `getBlockedPlatforms()` (UI) · flag ใน `app_flags` key `{platform}_quota_exhausted[:{scope}]` · banner ใช้ `MarketplaceQuotaPausedAlert` | เขียน breaker/flag quota เองต่อ platform · เรียก `isQuotaBlocked` เปล่าๆ ทั้งที่รู้ว่างานตัวเองอยู่ scope ไหน (จะพลาดเคสที่ scope นั้นถูกบล็อก) |
| `marketplace/fee-types.ts` | `lib/marketplace/fee-types.ts` | ช่องกลาง 13 ช่องของค่าธรรมเนียม marketplace + `parseAmount()` (**ห้าม `Number()` ตรงๆ กับตัวเลขจาก marketplace** — Lazada ส่งคอมมาคั่นหลัก) · เจอค่าธรรมเนียมใหม่ให้หา bucket ที่ตรงที่สุด | เพิ่ม bucket ตามชื่อที่ platform เรียก (จะได้รายงานร้อยคอลัมน์ที่เทียบข้าม platform ไม่ได้) |
| `marketplace/settlement.ts` | `lib/marketplace/settlement.ts` | เขียน settlement ลง DB ใช้ร่วมทุก platform — `saveSettlement()` + `computeOrderCogs()` · ตัว platform แค่แปลงเป็น `NormalizedSettlement` แล้วส่งมา | เขียน logic insert settlement/ต้นทุนซ้ำใน `lib/<platform>/` |
| `marketplace/throttle.ts` | `lib/marketplace/throttle.ts` | เว้นจังหวะระหว่าง call ของถังโควตาเดียวกัน — ค่าอยู่ที่ `minGapMs` ใน registry · เรียกผ่าน `beginMarketplaceCall()` ไม่ต้อง import เอง | ยิง API ภายนอกรัวเป็นชุดโดยไม่เว้นจังหวะ (breaker เป็นตาข่ายรับ ไม่ได้กันไม่ให้โดนแบน) |
| `marketplace/webhook-retry.ts` | `lib/marketplace/webhook-retry.ts` | **worker กลางของ retry webhook ทุก marketplace** — `runWebhookRetry(request, { platform, process })` จัดการ CRON_SECRET · circuit breaker · หยิบใบ `failed` (รวม `next_retry_at` NULL) **และใบค้าง `processing` เกิน 10 นาที** · backoff · dead letter · log สรุปรอบ ให้ครบ · route ของแต่ละเจ้าเหลือแค่ "งานหนึ่งใบทำยังไง" | copy worker ทั้งก้อนไปไว้ที่ `app/api/<platform>/webhook/retry` (เคยซ้ำ 2 ชุด แล้ว Lazada ไม่มีเลย = webhook ที่ fail ไม่มีใครหยิบ) · กรอง `failed` ด้วย `lte(next_retry_at)` เฉย ๆ (NULL จะหลุดตะแกรงถาวร) |
| `marketplace/shop-info.ts` | `lib/marketplace/shop-info.ts` | ดึง **ชื่อร้าน + โลโก้** จากแพลตฟอร์ม — `Record<QuotaPlatform, fetcher>` ที่ TypeScript บังคับให้กรอกครบ · **เพิ่มแพลตฟอร์มใหม่ = เพิ่ม 1 entry ที่นี่ ไม่ต้องแตะ route** · การ์ด `isReachableImage` อยู่ในตัวกลางแล้ว (โลโก้ที่เปิดไม่ได้ถูกตัดเป็น null เพื่อคงของเดิม) | เขียน if แยกแพลตฟอร์มใน route · ทับโลโก้ที่มีอยู่ด้วย URL ที่ยังไม่ได้เช็คว่าโหลดได้ |
| `marketplace/product-helpers.ts` | `lib/marketplace/product-helpers.ts` | helper import สินค้าที่ทุก marketplace ใช้ร่วม — `getOrCreateVariationTypeIds`, `upsertProductImage(s)`, `reactivateProduct`, `tryAutoMatchBySku`, `findMarketplaceLink` (มี `platform` param, default `'shopee'`) | copy helper พวกนี้ไปไว้ใน `lib/<platform>/` ของตัวเอง |
| `meta/conversions.ts` | `lib/meta/conversions.ts` | **Meta Conversions API (business messaging)** — `sendPurchaseEventForOrder(orderId)` ยิง `Purchase` ให้ dataset ของเพจ Messenger ที่ลูกค้าเคยคุย · เรียกจาก**ทุกจุดที่ออเดอร์กลายเป็น paid** ผ่าน `after()` (orders PUT/POST · POS · Beam settle) · ยิงครั้งเดียว/ออเดอร์ (`orders.meta_purchase_sent_at` จองก่อนยิง) · ไม่ throw · ต้อง token ที่มี scope `page_events` — เพจที่เชื่อมก่อน 9 ก.ย. 2026 ต้องออก token ใหม่ผ่านเมนู **"เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)"** บนการ์ดเพจ หรือเลือกเพจเดิมในตัวเลือกหลัง FB.login (= `PUT /api/chat-accounts` ทับ token · **ห้ามลบเพจแล้วเพิ่มใหม่** ห้องแชทเก่าจะหลุดจากเพจ) · `probeCapiReadiness(accountId, companyId)` = ถาม Meta ใหม่ (`force`) แล้วจดผลลง `credentials.meta_capi_error / meta_capi_checked_at` — ปุ่มทดสอบเชื่อมต่อเรียกให้ การ์ดเพจขึ้นป้าย CAPI พร้อม/ยังไม่พร้อม/ยังไม่ตรวจ · เช็คทุกเพจจากเครื่อง: `node scripts/check-meta-capi.mjs` (scope + call จริง ไม่พิมพ์ token) · **ตัวกวาด `sweepUnsentPurchaseEvents()`** เกาะไปกับ cron ตัวเฝ้า (`/api/marketplace/watchdog` ทุก 15 นาที · งบ 20 วิ) — ออเดอร์ที่ paid แล้วแต่ไม่เคยยิง (เพจไม่มีสิทธิ์ตอนนั้น / Meta ล่ม / token ตาย) ส่งย้อนหลังด้วยเวลาชำระจริงจาก `payment_records` **ไม่เกิน 7 วัน** (เพดานของ Meta · เกินนั้นข้าม ห้ามปลอมเวลา) · เริ่มจากลูกค้าที่ผูกห้อง Messenger ไม่ใช่ออเดอร์ทั้งหมด · ข้ามเพจที่ยังมี `meta_capi_error` (ไม่รบกวน Meta ทุก 15 นาที) · กวาดเอง/ทดสอบ: `POST /api/meta/capi/sweep` (CRON_SECRET = ทุกบริษัท · แอดมิน = บริษัทตัวเอง) คืน `{scanned, sent, skipped, failed}` · `sendPurchaseEventForOrder()` คืน `'sent'\|'skipped'\|'failed'` และรับ `eventTime` · IG ยังไม่ทำ | เพิ่มจุดที่ทำให้ paid แล้วลืมเรียก · ยิง Graph API `/events` เองที่อื่น · เขียน `credentials` ทั้งก้อนทับ (ต้อง merge จากค่าล่าสุดใน DB) |
| `ads/dispatch.ts` | `lib/ads/dispatch.ts` | **ทางเข้าเดียวของ "เกิดเรื่องที่โฆษณาควรรู้"** — `dispatchConversion({event:'Purchase'\|'InitiateCheckout'\|'QualifiedLead', …})` ยิงสองสายพร้อมกัน: dataset ของเพจ (PSID · `sendMessagingEventForContact` ใน conversions.ts) + dataset ของทุกบัญชีโฆษณาใน `ad_accounts` (เบอร์/อีเมล hash · `adapters/meta.ts`) · กันซ้ำที่สมุด `ad_events` (unique platform+destination+dataset+event+event_id · insert ก่อนยิง · ใบ failed ยึดคืนได้) · ทุกจุดที่ทำให้บิล paid (orders PUT/POST · POS · Beam) เรียกตัวนี้ใน `after()` · ตัวกวาด `lib/ads/sweep.ts` + probe บัญชี + sync กลุ่ม อยู่ใน cron `/api/ads/run-jobs` ทุก 15 นาที · QualifiedLead = `lib/ads/qualified-lead.ts` (ข้อความจริง ≥3 ใบ นับด้วย `countGenuineInbound` — postback/quick reply/ซ้ำไม่นับ · หรือติดแท็กที่ตั้ง `customer_tags.triggers_qualified_lead` บริษัทละ 1 ใบ · ล้มครบ 5 ครั้งเลิกลอง) · **Meta รับชื่อ `QualifiedLead` บน business_messaging แล้ว** (พิสูจน์ 10 ก.ย. 2026 events_received:1) ชื่อสลับได้ที่ `QUALIFIED_LEAD_EVENT_NAME` ที่เดียว | เรียก `sendPurchaseEventForOrder` ตรง ๆ จาก route · ยิง `/{dataset}/events` เองที่อื่น · เพิ่ม event ใหม่โดยไม่ผ่านสมุด `ad_events` (จะยิงซ้ำเมื่อ cron ซ้อน) · เขียน hook แล้วไม่ครอบ `after()` |
| `meta/graph.ts` · `meta/ads.ts` · `meta/hashing.ts` · `meta/capi.ts` | `lib/meta/` | **Graph API client ตัวเดียว** (`graphGet/Post/Delete/GetAll` ไม่ throw คืน `{ok,status,body,error}` + `isTokenError/isPermissionError/isRateLimitError/isTosRequiredError`) · Marketing API wrappers (`listAdAccounts` · `listDatasets` · `sendCapiEvents` · Custom Audiences create/add/remove ≤5,000/ครั้ง · `debugToken`) · hash ตัวตน (`buildHashedUserData` SHA-256 · เบอร์ E.164 ไม่มี `+` ผ่าน `toE164Digits`) · ประกอบ event (`buildCapiEvent/buildCapiRequest` · `actionSourceForOrder` pos→physical_store · storefront→website · แชท→chat · `isEventTimeAcceptable` 7 วัน/physical_store 62 วัน) | `fetch('https://graph.facebook.com…')` เองในไฟล์อื่น · เขียน sha256/normalize เบอร์เองซ้ำ · ปลอม `event_time` ให้ใหม่ขึ้นเพื่อให้ Meta รับ |
| `audiences/resolve.ts` · `audiences/sync.ts` · `broadcast/recipients.ts` | `lib/audiences/` · `lib/broadcast/` | **กลุ่มเป้าหมายที่บันทึกไว้** (`audiences` · นิยาม `{audience_type, audience_filter, sources[]}` แหล่ง = ห้องแชท LINE/FB + ลูกค้าในระบบ) — หาสมาชิกผ่าน `resolveChatRecipients()` **ตัวเดียวกับบรอดแคสต์** (`resolveBroadcastRecipients` ของ LINE เหลือ wrapper) · `resolveAudienceMembers` คืนสมาชิก + สถิติจับคู่ (เบอร์/อีเมล/PSID · `not_syncable` · cap 50,000) · `runAudienceSync` diff กับ `audience_sync_members` แล้ว add/remove ที่ Meta Custom Audience (PAGEUID แยกล็อตต่อเพจ · ToS = `tos_required` · resume ได้เมื่อหมดเวลา) · UI `/marketing/audiences` ใช้ `AudienceStep` ของบรอดแคสต์ผ่าน prop `disabledOptions` (โชว์ตัวที่ใช้ไม่ได้พร้อมเหตุผล ห้ามซ่อน) | เขียนตัวหาสมาชิกกลุ่มซ้ำในหน้า/route · import `lib/audiences/resolve.ts` ใน client (แตะ service role) — ใช้ type สำเนาใน `app/marketing/audiences/components/types.ts` · อัปรายชื่อขึ้น Meta โดยไม่จดใน `audience_sync_members` (รอบหน้าจะอัปซ้ำทั้งก้อน) |
| `print-tracking.ts` | `lib/print-tracking.ts` | markPrinted, markPrintedOptimistic | track print status เอง |
| `order-totals.ts` | `lib/order-totals.ts` | **สูตรเดียวของยอดเงินทั้งระบบ** — `computeOrderTotals()` (สินค้า − ส่วนลด + ค่าส่ง + ค่าการ์ด แล้วถอด VAT) · `splitVatInclusive()` (ถอด VAT จากยอดที่รู้แล้ว) · client-safe · **ยุบมาครบทุกจุดแล้ว 2026-08-30**: OrderForm · OrderSummaryBox · `/api/orders` · POS (จอ+util+API) · storefront checkout · ReplenishmentForm · PDF ฝากขาย/ห้าง · department-orders · เครดิตเปลี่ยนสินค้า | เขียน `/1.07` หรือ `0.07` เองที่ไหนอีก (grep แล้วต้องเจอแค่ไฟล์นี้) · ให้ DB trigger คิด `total_amount` ทับ (เคยกินค่าส่งหายทุกบิล ดู fix-bug.md 2026-08-30) |
| `pdf-utils.ts` → `loadImageDataUrl()` | `lib/pdf-utils.ts` | โหลดรูปเป็น data URL ให้ pdfMake — ยิงตรงก่อน โดน CORS ค่อยวิ่งผ่าน `/api/image-proxy` | `fetch(url)` + `readAsDataURL` เองในไฟล์ PDF (รูปสินค้าที่ host อยู่เว็บอื่นจะขึ้น "-" ทั้งที่หน้าจอเห็นรูป) |
| `print-actions.ts` | `lib/print-actions.ts` | getAvailablePrintActions (by status/payment) | เช็ค print availability เอง |

### Utility Libraries
| Utility | Path | ใช้สำหรับ |
|---------|------|----------|
| `api-client.ts` | `lib/api-client.ts` | `apiFetch()` — authenticated API client (auto token, company_id, dedup GET) |
| `supabase.ts` | `lib/supabase.ts` | `supabase` client (public) + `handleSupabaseError()` |
| `supabase-admin.ts` | `lib/supabase-admin.ts` | `supabaseAdmin` (service role — server only); re-exports `can` from `permissions.ts` |
| `supabase-paging.ts` | `lib/supabase-paging.ts` | `fetchAllRows((from,to) => q.range(from,to))` — ดึงข้ามเพดาน **1,000 แถว** ที่ Supabase Cloud ตัดเงียบ ๆ (`.range()` กว้างแค่ไหนก็ได้ไม่เกินนี้) · ใส่ `{count:'exact'}` ใน query แล้วหน้าที่เหลือยิงขนาน — **query ที่ "ต้องได้ครบ" ต้องผ่านตัวนี้** ส่วนรายการใหญ่ที่ไม่จำเป็นต้องได้ทั้งตารางให้ค้นฝั่ง server แทน |
| `storage-key.ts` | `lib/storage-key.ts` | `storageSafeName(name)` / `storageKeyFor(name, ext?)` — **ทุกที่ที่ประกอบ path ของ Supabase Storage จากชื่อไฟล์ของผู้ใช้ต้องผ่านตัวนี้** · Storage ตีตก key ที่มีอักขระนอก ASCII ด้วย **400 `InvalidKey`** ⇒ ชื่อไฟล์ไทย/อีโมจิ/`#`/`%` อัปไม่ขึ้น และพลาดตั้งแต่ก่อนถึง API จึง**ไม่มี log ที่เซิร์ฟเวอร์ให้ไล่** (ส่งรูปในแชท "ไม่ไปเลย" แบบสุ่มตามชื่อไฟล์ — ดู memo/bugs.md 2026-09-08) · เคย inline กันเอง 3 ที่แล้วหน้าแชททั้ง 3 หน้าไม่มีเลย |
| `image-thumb.ts` | `lib/image-thumb.ts` | `thumbUrl(url, 96\|160\|320)` — URL รูปย่อตามโฮสต์: Supabase storage → `render/image` · Shopee `_tn` · Lazada `_{s}x{s}q80.jpg` · โฮสต์อื่นคืนเดิม · idempotent · **ห้ามใช้กับอวาตาร์/โลโก้/สลิป/QR/lightbox/ImageUploader** (ต้องเห็นของจริง) |
| `permissions.ts` | `lib/permissions.ts` | **Single source of truth** สำหรับ role-based permissions — `can(roles, 'capability')` + 30 capabilities (`inventory.manage`, `customer.edit`, `settings.access`, ฯลฯ) |
| `useAuthGuard.ts` | `lib/useAuthGuard.ts` | Client hook ป้องกันหน้า: `useAuthGuard('cap')` (redirect ไป `/dashboard`) หรือ `useAuthGuard('cap', { noRedirect: true })` (render fallback เอง) |
| `flow-types.ts` | `lib/flow-types.ts` | `isCreditFlow()`, `isCashFlow()`, `isConsignmentFlow()`, `isDepartmentFlow()`, `getFlowLabel()` |
| `status-tab-colors.ts` | `lib/status-tab-colors.ts` | `getTabColor()`, `getBadgeColor()` — ห้ามกำหนดสี status เอง |
| `address-parser.ts` | `lib/address-parser.ts` | `parseThaiAddress()` — parse ที่อยู่ไทย/อังกฤษ |
| `product-display.ts` | `lib/product-display.ts` | `productDisplayName()`, `productSubtitle()`, `cleanVariationLabel()` |
| `parallel.ts` | `lib/parallel.ts` | `parallelLimit()` — async concurrency control |
| `stock-utils.ts` | `lib/stock-utils.ts` | `getStockConfig()` — stock feature by subscription tier |
| `pos-utils.ts` | `lib/pos-utils.ts` | `calculatePosOrderTotals()` — POS VAT calculation |
| `utils/format.ts` | `lib/utils/format.ts` | `formatPrice()`, `formatNumber()`, `formatThaiDate()`, `formatThaiDateTime()` — **ห้ามเขียน `toLocaleDateString('th-TH')` / `toLocaleString` เงินเอง inline** (เคย copy กัน 96/31 จุด สูตร drift 16 แบบ) |
| `utils/download.ts` | `lib/utils/download.ts` | `downloadBlob(blob, filename)` — **ห้ามเขียน `createElement('a')` + `createObjectURL` เอง** (เคยลืม revokeObjectURL = memory leak) |
| `useDebounce.ts` | `lib/useDebounce.ts` | `useDebouncedCallback(fn, delayMs=400)` — debounce search ทุกหน้า list, clear timer ตอน unmount ให้เอง — **ห้ามเขียน setTimeout/clearTimeout debounce เอง** |
| `order-draft.ts` | `lib/order-draft.ts` | ร่างบิลที่กรอกค้างไว้ใน localStorage — `readOrderDraft` / `writeOrderDraft` / `clearOrderDraft` / `isDraftEmpty` + type `OrderDraftSnapshot` · key `chat-order-draft:<company>:<contact>` อายุ 24 ชม. · เปิดใช้โดยส่ง `draftKey` ให้ `OrderForm` (ไม่ส่ง = ไม่มีเรื่องร่าง) — **ห้ามให้ component แตะ localStorage เอง** (Safari โหมดส่วนตัว throw ทุกการเขียน · ห่อ try/catch ไว้ที่นี่แล้ว) · เก็บเฉพาะสิ่งที่ผู้ใช้กรอก **ห้ามใส่สต็อก/ผลค้นหา/รายการอ้างอิง** |
| `thai-address-data.ts` | `lib/thai-address-data.ts` | `searchAddress()`, `PROVINCES` — Thai address DB |

### Bulk Excel Templates — Per-action import/export (อัพเดท 2026-05-27)
| Utility | Path | ใช้สำหรับ |
|---------|------|----------|
| `parse-template.ts` | `lib/bulk/parse-template.ts` | `readFileToRows()`, `rowsToSheet()`, `getCell()`, `validateHeaders()`, `isInstructionRow()` — **header-based** parser (xlsx + csv) |
| `BulkUploadCard` | `components/bulk/BulkUploadCard.tsx` | Upload area (file input + template download + help slot) |
| `BulkPreviewBar` | `components/bulk/BulkPreviewBar.tsx` | Sticky bar เหนือ preview table (badges + cancel/confirm) |
| `BulkErrorModal` | `components/bulk/BulkErrorModal.tsx` | Modal 3 section (Header / Row / Other issues) |
| Hub page | `/products/bulk` | Tiles เลือก action — เพิ่ม action ใหม่ตรงนี้ |
| Module pattern | `/products/bulk/<action>/page.tsx` + `/api/products/bulk/<action>/{export,apply}/route.ts` | Filter → Export → Upload → dry-run preview → Apply |

**ทุก bulk action ใหม่ต้องใช้**:
- `lib/bulk/parse-template.ts` — **ห้ามอ่าน column ตามตำแหน่ง** (เคยมี bug, ดู [fix-bug.md](../../fix-bug.md))
- `BulkUploadCard` + `BulkPreviewBar` + `BulkErrorModal` (no inline copies)
- ExcelJS + lock ID columns (gray + protection) + sheet protection (no password)
- Dedicated RPC ที่ return `{ results, summary: {updated, unchanged, errors}, dry_run }`
- ห้าม double-confirm (ปุ่ม "ยืนยัน" ใน `BulkPreviewBar` เป็น confirmation step เดียว)
- ห้ามรวมหลาย action ใน 1 mega template (parser bug + UX สับสน)

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
| PDF building blocks | `lib/pdf-utils.ts` | `buildCompanyStack()`, `buildCornerTriangle()`, `buildSignatureFooter()`, `buildProductNameStack()`, `withOriginalAndCopy()`, `formatPdfPrice()` (รับสตริงจาก API ได้), `formatPdfDate()`, **`formatDeliverySchedule()`** (วันที่+รอบส่ง — ห้ามประกอบเอง), **`buildOrderSpecialFlagsCard()`** + `countOrderSpecialFlagLines()` (การ์ดแดงคำสั่งพิเศษของบิล: ห้ามแนบใบเสร็จ · ส่งเอกสารทางไปรษณีย์ · การ์ดอวยพร · ขอใบกำกับ — ใบจัดของกับใบคำสั่งซื้อใช้ตัวเดียวกัน เพิ่มบรรทัดในการ์ดต้องบวกที่ตัวนับด้วย ไม่งั้นใบจัดของล้นครึ่งหน้า), **`preparePdfText()`** (ข้อความอิสระของลูกค้า — หมายเหตุ/ข้อความการ์ด/ที่อยู่ — ตัดบรรทัดไทยด้วย ZWSP + ล้างอีโมจิ + ตัด `\n` หัวท้าย · **กล่องที่ใส่ข้อความพวกนี้ต้องความกว้างคงที่** ตาราง `*` จะขยายเท่าคำไทยยาว ๆ จนล้นกระดาษ ดู fix-bug.md 2026-09-09) · ⛔ ห้ามใส่ emoji ในเอกสาร (ฟอนต์ไม่มี glyph → กล่องเปล่า) |

### Chat Services
| Service | Path | ใช้สำหรับ |
|---------|------|----------|
| `getChatService()` | `lib/services/chat/index.ts` | Dispatcher (LINE/Facebook) |
| `getChatServiceLazy(platform)` | `lib/services/chat/registry.ts` | dynamic import เฉพาะแพลตฟอร์ม (cache instance) — **ใช้ใน route ที่ผู้ใช้รอ** (อ่าน/ส่งข้อความ) แทน `getChatService()` ที่ import ครบ 5 เจ้า + `sharp` (cold start หนัก) · webhook/cron ที่รู้แพลตฟอร์มอยู่แล้ว import service ตรงได้ |
| `LineChatService` | `lib/services/chat/line.ts` | LINE messaging |
| `FacebookChatService` | `lib/services/chat/facebook.ts` | Facebook Messenger |
| `buildMessagePreview()` / `htmlToPlainText()` | `lib/chat/message-preview.ts` | ข้อความตัวอย่างบรรทัดเดียว (รายชื่อแชท · push) — ถอด HTML / JSON i18n ให้ · server+client · **ห้ามส่ง `content` ดิบขึ้นรายชื่อหรือแจ้งเตือน** |
| `lineStickerUrl()` / `lineSticonUrl()` | `lib/chat/line-sticker.ts` | ที่อยู่รูปสติกเกอร์/อีโมจิ LINE — วิ่งผ่าน `/api/chat/line-sticker` ของเราเสมอ (แคช edge ถาวร) · ⛔ **ห้ามใส่ `https://stickershop.line-scdn.net/...` ใน `<img src>` ตรง ๆ** โฮสต์ภายนอกแปลว่ารูปจะขึ้นหรือไม่ขึ้นกับเน็ตของคนเปิดหน้าจอ → "บางคนเห็น บางคนไม่เห็น" โดยฝั่งเราไม่มี log อะไรเลย (ดู fix-bug.md 2026-09-09) |
| `findLinkedProduct()` / `findProductByRetailerId()` / `findSyncedOrder()` | `lib/marketplace/chat-enrich.ts` | แปลง item_id ของ marketplace / `retailer_id` ของ Facebook Shop / เลขออเดอร์ เป็นสินค้า/ออเดอร์ในระบบเรา (DB อย่างเดียว · ชื่อ/รูป/ราคาประกอบที่ `buildProductInfo` ที่เดียว) — Shopee/Lazada/FB ใช้ร่วม · ห้าม query `marketplace_product_links`/`products`/`orders` เองใน service ของแพลตฟอร์ม |
| `BROADCAST_PLATFORMS` · `canBroadcastVia()` | `lib/broadcast/platforms.ts` | **ทะเบียนช่องทางส่งข้อความเป็นชุด** — ช่องทางไหนส่งได้ ถึงใครได้ และ **เหตุผลที่ยังส่งไม่ได้** (client-safe: หน้าจอกับ API อ่านตัวเดียวกัน ข้อความที่ผู้ใช้เห็นจึงตรงกับที่ API ตอบ) · เพิ่มช่องทางใหม่ = แก้ที่นี่ + เพิ่ม case ใน `lib/broadcast/run.ts` — **ห้ามเขียนเงื่อนไข "แพลตฟอร์มนี้ส่งได้ไหม" ซ้ำในหน้าหรือ route** |
| `AUDIENCE_OPTIONS` · `AUDIENCE_GROUPS` · `audienceLabel()` · `describeAudienceRefine()` · `buildAudienceFilter()` · `BROADCAST_ATTRIBUTION_DAYS` | `lib/broadcast/audience.ts` | **ทะเบียนกลุ่มผู้รับ** (client-safe) — หน้าสร้าง/รายการ/รายงาน แปล `audience_type` + `audience_filter` เป็นคำไทยจากที่นี่ที่เดียว · เพิ่มกลุ่มใหม่ = ที่นี่ + `AUDIENCE_BY_PLATFORM` ใน route + CHECK ของตาราง — **ห้ามทำ map ป้ายกลุ่มผู้รับซ้ำในหน้า** (เคยมีแล้วขาดกลุ่มใหม่จนขึ้นรหัสดิบ) |
| `runScheduledBroadcasts()` | `lib/broadcast/scheduler.ts` | ตัวส่งใบที่ตั้งเวลา (cron `/api/broadcasts/run-scheduled` ทุก 5 นาที) — จองใบด้วย UPDATE แบบมีเงื่อนไขก่อน `runBroadcast()` กัน cron ซ้อนส่งซ้ำ · งบเวลา 240 วิ |
| `runBroadcast(id, platform)` | `lib/broadcast/run.ts` | จุดเดียวที่แปลง "ใบนี้อยู่ช่องทางไหน" เป็น "เรียกตัวส่งของใคร" — route ทั้งสามตัวเรียกผ่านนี่ **ห้ามเรียก `runLineBroadcast()`/`runTikTokBroadcast()` ตรง ๆ จาก route** |
| `validateBroadcastContent()` · `BroadcastContent` | `lib/broadcast/content.ts` | **เนื้อหาบรอดแคสต์เป็นชนิดกลาง** (`announce`/`promo`/`products`) ไม่ผูกกับแพลตฟอร์ม — หน้าจอกับ API validate ด้วยฟังก์ชันนี้ตัวเดียวกัน · **ห้ามให้ผู้ใช้เลือกเป็นศัพท์ของ LINE** (flex/carousel) และห้าม hardcode ลิมิตซ้ำ (อยู่ใน `compose` ของทะเบียน) |
| `resolveBroadcastTarget()` | `lib/broadcast/accounts.ts` | แปลง "ช่องทาง + บัญชีไหน" เป็นต้นทางจริง — LINE/FB/IG อยู่ `chat_accounts` ส่วน marketplace อยู่ `marketplace_accounts` · **ห้าม query ตารางบัญชีเองใน route** (การเช็คสิทธิ์ข้ามบริษัทจะกระจายแล้วตกหล่น) |
| `runTikTokBroadcast()` · `resolveTikTokRecipients()` | `lib/tiktok/broadcast.ts` + `lib/tiktok/engagement.ts` | ตัวส่งฝั่ง TikTok (Customer Engagement API) — ผู้รับคือ `buyer_email` จากออเดอร์ ≤365 วัน · **ไม่มี idempotency key ระดับข้อความ** จึงใช้ล็อตเล็ก + บันทึกทันที · creds มาจาก `getEngagementCreds()` ที่เดียว |
| `runLineBroadcast()` · `resolveBroadcastRecipients()` · `getLineQuota()` · `getLineFollowerStats()` | `lib/line/broadcast.ts` | ตัวส่งฝั่ง LINE (multicast ล็อตละ 500 + retry key · โควตา · สำเนาลงห้องแชทโดยไม่ขยับ last_message_at) — ห้ามยิง `/message/multicast\|broadcast` เองที่อื่น · **จำนวนผู้ติดตามใช้ `reachable` (= `targetedReaches`) ห้ามใช้ `followers` ซึ่งเป็นยอดสะสมที่ไม่ลดเมื่อโดนบล็อก** · ค่าคงที่ client-safe อยู่ `lib/line/constants.ts` |
| `AdMediaThumb` · `referralSourceLabel()` · `referralPostUrl()` | `app/chat/components/AdMediaThumb.tsx` · `app/chat/lib/chatHelpers.tsx` | รูป/ที่มาของ referral "ลูกค้าทักมาจากโฆษณา" — ที่เดียวทั้งการ์ดหัวสายสนทนา หัวห้องแชท และบล็อก "ประวัติจากโฆษณา" ในแผงข้อมูลลูกค้า · `video_url` ของ Meta เป็น **.jpg thumbnail** (ตัวสื่อจริงอยู่ที่โพสต์ `post_id`) และ URL fbcdn หมดอายุ ~4 วัน → `AdMediaThumb` ซ่อนเองเมื่อโหลดไม่ได้ (เจ้าของเลือกไม่คัดลอกรูปมาเก็บ) · ประวัติต่อผู้ติดต่ออยู่ `fb_contact_referrals` (`saveReferralData` กันซ้ำ 30 นาที — Meta ส่ง 2 ใบต่อ 1 คลิก) อ่านผ่าน `GET /api/chat/contacts/[id]/referrals` · ค่าล่าสุดบน `fb_contacts.referral_*` (+`referral_media_url/_kind/referral_at`) | วาด `<img>` fbcdn เอง · ลิงก์ `video_url` ตรง ๆ (ได้แค่รูป) · map source→label ซ้ำในหน้า · ทำ history เป็น jsonb array บน contact |
| `QuotedMessage` · `renderLineEmojis` (ใน TextBubble) | `app/chat/components/renderers/SharedRenderers.tsx` | บล็อก "ตอบกลับ" จาก `raw_message.quoted` (ครอบทุกชนิดฟองใน MessageBubble) · อีโมจิ LINE จาก `raw_message.emojis` — ห้ามวาดซ้ำในหน้า |
| `normalizeLazadaMessage()` · `normalizeShopeeMessage()` | `lib/lazada/chat-enrich.ts` · `lib/services/chat/shopee.ts` | แปลงข้อความ IM ทุก template + เติมการ์ด (`raw_message.item/order` โครงเดียวกันทุก marketplace — renderer การ์ดใน `app/chat/components/renderers/ShopeeRenderers.tsx` รับ `platform`) |

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

### งานเบื้องหลังใน route handler — **ต้อง `after()` เสมอ** (เพิ่ม 2026-08-29)

| ต้องการ | ใช้ | ห้าม |
|---------|-----|------|
| งานที่ไม่อยากให้ผู้ใช้รอ แต่**ต้องได้ทำจริง** (push ขึ้น marketplace, ส่ง noti, ออกเอกสารอัตโนมัติ) | **`after(() => work())`** จาก `next/server` — เรียกใน request handler ตรงๆ และฟังก์ชันเบื้องหลังต้อง **return promise** | `work().catch(() => {})` ลอยๆ ก่อน `return NextResponse.json()` |
| log ที่หายไม่ได้ (error ของ API ภายนอก) | `await logIntegrationNow()` | `logIntegration()` แบบปล่อยลอยในงานที่กำลังจะจบ |

- **เหตุผล**: Vercel **freeze ฟังก์ชันทันทีที่ response ออก** — งานที่ยังไม่จบตายกลางทาง (request ออกไปถึงปลายทางแต่ไม่จบ = ปลายทางนับเป็น fail) · push stock ขึ้น Shopee ตายแบบนี้เงียบๆ **3 เดือน** เพราะ log ก็ปล่อยลอยเหมือนกัน **งานตาย + หลักฐานตาย พร้อมกัน** (ดู [fix-bug.md](../../fix-bug.md) 2026-08-29)
- **`after()` ต้องมีอะไรให้รอ** — ฟังก์ชัน `void` ใส่ใน `after()` ไม่ช่วยอะไร · `lib/shopee/auto-sync.ts` จึงมีคู่: `syncStockNow/syncPriceNow/syncInfoNow/syncCategoryNow` (await ได้ — **ใช้ตัวนี้ใน route**) กับ `triggerShopee*Sync` (void — เหลือไว้ให้ที่ที่ไม่มี request context เท่านั้น)
- **วาง log ให้ชิดจุดยิง API ภายนอกที่สุด** ไม่ใช่ที่ชั้นงาน — บั๊กข้างบนหาไม่เจอ 3 เดือนเพราะ log อยู่ชั้นบนสุดที่ตายพร้อมงาน · ตอนนี้ `shopeeApiRequest` log ทุก call ที่ fail ให้เองผ่าน [lib/shopee/api-log.ts](../../lib/shopee/api-log.ts)
- **field ที่ stamp เฉพาะตอนสำเร็จ** (เช่น `last_stock_pushed_at`) คือสัญญาณเดียวที่จับ "พังเงียบ" ได้ — ค้างนานผิดปกติ = ต้องไปดู

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
| **ค้นสินค้าให้ช่อง dropdown** | `/api/products/search` | GET `?q=&limit=` → `{ items, complete }` — RPC `search_order_products` รอบเดียว คืนแถวแบน ~30KB (`/api/products?search=` ยิง DB 3 รอบ ~220KB เพราะคืนสินค้าทั้งก้อนให้หน้า `/products`) · คู่กับ `useServerSearch` |
| Customers | `/api/customers` | GET, POST, PUT, DELETE |
| Inventory | `/api/inventory` | GET, POST |
| **ร้าน marketplace ที่เชื่อมต่อ (ทุกแพลตฟอร์ม)** | `/api/marketplace/accounts` | GET `?platform=shopee\|tiktok\|lazada\|all` · PUT (คลัง/auto-sync) · PATCH `{id, shop_logo}` ตั้งลิงก์รูปเอง · DELETE · **ย่อย**: `/resync` ดึงชื่อ+โลโก้ใหม่ · `/logo` อัปโหลดไฟล์ — *เดิมอยู่ที่ `/api/shopee/accounts` ย้ายมาชื่อกลาง 2026-08-30* |

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

