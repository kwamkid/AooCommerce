---
paths:
  - "lib/*.ts"
  - "lib/**/*.ts"
  - "app/api/**/*"
  - "scripts/**/*"
---
# Shared Services, Utilities & API Routes — ห้ามเขียน logic ซ้ำ

> มีแล้วใช้ของเดิม ขาดให้เพิ่ม option ไม่ copy-paste · UI → [code-simplicity.md](code-simplicity.md) · **เขียนสั้น** ไม่ใส่วันที่/เล่าประวัติ

## Business Logic Services (`lib/`) — ห้ามเขียน inline
| Service | ใช้สำหรับ | ห้าม |
|---|---|---|
| `stock-service.ts` | addStock · deductStock · reserveStock · transferStock · returnStock · adjustStock · deferStockOp | stock upsert เอง |
| `invoice-service.ts` | insertTaxInvoice · insertReceipt · insertAbbreviatedInvoice · insertDeliveryNote · insertInvoice | auto-issue เอง |
| `statement-service.ts` | createStatementForReport (ใบวางบิลอัตโนมัติ) | สร้าง statement เอง |
| `gp-resolver.ts` | resolveGp (NET) · fetchCustomerOrderContext (1 RPC) | คำนวณ GP เอง |
| `cost-utils.ts` · `promotion-service.ts` · `credit-notes/auto-cn.ts` | fetchCostMap (WAC snapshot) · getPromotionComponents / allocateBundlePrice / calculateQtyDiscount · createCreditNote (void/refund/exchange + คืนสต็อก) | ทำเอง |
| `integration-logger.ts` | logIntegration (fire-and-forget) · `logIntegrationNow()` (await ได้) | log เอง |
| `order-totals.ts` | **สูตรเดียวของยอดเงิน** `computeOrderTotals()` (สินค้า − ส่วนลด + ค่าส่ง + ค่าการ์ด → ถอด VAT) · `splitVatInclusive()` · client-safe · ใช้ครบทุกจุด (OrderForm · OrderSummaryBox · `/api/orders` · POS · storefront · ReplenishmentForm · PDF ฝากขาย/ห้าง · department-orders · เครดิตเปลี่ยนสินค้า) | `/1.07` `0.07` ที่อื่น (grep ต้องเจอแค่ไฟล์นี้) · ให้ trigger คิด `total_amount` |
| `print-tracking.ts` · `print-actions.ts` | markPrinted / markPrintedOptimistic · getAvailablePrintActions | ทำเอง |
| `pdf-utils.ts` `loadImageDataUrl()` | รูปเป็น data URL ให้ pdfMake (ตรงก่อน โดน CORS ผ่าน `/api/image-proxy`) | `fetch` + `readAsDataURL` เองในไฟล์ PDF |

## Marketplace (`lib/marketplace/`)
| ไฟล์ | ใช้สำหรับ | ห้าม |
|---|---|---|
| `platforms.ts` | registry ทุก marketplace (client-safe): ป้าย · โควตาฟื้นยังไง · path→scope · `minGapMs` · ข้อความ banner ต่อ scope · **เพิ่ม platform = 1 entry** (Record บังคับกรอกครบ) + ครอบ request 2 บรรทัด | map ป้าย/โควตา/หน่วงเวลาซ้ำ |
| `quota.ts` | breaker แยก scope (`auth·order·fulfillment·product·inventory·promotion·chat`) — `beginMarketplaceCall(platform, apiPath)` ก่อนยิง · `reportMarketplaceError(platform, scope, msg, {httpStatus, code})` · cron/retry/sync เช็ค `isQuotaBlocked(platform, scope)` **ระบุ scope เสมอ** · UI `getBlockedPlatforms()` · flag `app_flags` `{platform}_quota_exhausted[:{scope}]` · banner `MarketplaceQuotaPausedAlert` | breaker เองต่อ platform · `isQuotaBlocked` ไม่ใส่ scope |
| `throttle.ts` | เว้นจังหวะต่อถังโควตา (ผ่าน `beginMarketplaceCall()` ไม่ต้อง import เอง) | ยิงรัวเป็นชุด (breaker เป็นแค่ตาข่ายรับ) |
| `webhook-retry.ts` | worker กลาง `runWebhookRetry(request, { platform, process })` — CRON_SECRET · breaker · หยิบ `failed` (รวม `next_retry_at` NULL) + ค้าง `processing` >10 นาที · backoff · dead letter · log สรุปรอบ | copy worker ไปไว้ `app/api/<platform>/webhook/retry` · กรองแค่ `lte(next_retry_at)` (NULL หลุดถาวร) |
| `fee-types.ts` · `settlement.ts` | ช่องกลาง 13 ช่อง + `parseAmount()` (**ห้าม `Number()` กับตัวเลข marketplace** — Lazada มีคอมมา) · `saveSettlement()` + `computeOrderCogs()` (platform ส่ง `NormalizedSettlement`) | bucket ตามชื่อที่ platform เรียก · insert settlement เองใน `lib/<platform>/` |
| `shop-info.ts` | ชื่อร้าน+โลโก้ `Record<QuotaPlatform, fetcher>` (**เพิ่ม platform = 1 entry**) · กันโลโก้เปิดไม่ได้ด้วย `isReachableImage` | if แยก platform ใน route · ทับโลโก้ด้วย URL ที่ยังไม่เช็ค |
| `product-helpers.ts` | `getOrCreateVariationTypeIds` · `upsertProductImage(s)` · `reactivateProduct` · `tryAutoMatchBySku` · `findMarketplaceLink` (`platform` default `'shopee'`) | copy ไป `lib/<platform>/` |

## Meta / Ads / Audiences
| ไฟล์ | ใช้สำหรับ | ห้าม |
|---|---|---|
| `ads/dispatch.ts` | **ทางเข้าเดียวของ conversion** `dispatchConversion({event:'Purchase'\|'InitiateCheckout'\|'QualifiedLead', …})` → dataset เพจ (PSID · `sendMessagingEventForContact`) + dataset บัญชีโฆษณาใน `ad_accounts` (เบอร์/อีเมล hash · `adapters/meta.ts`) · กันซ้ำที่สมุด `ad_events` (unique platform+destination+dataset+event+event_id · insert ก่อนยิง · ใบ failed ยึดคืนได้) · ทุกจุดที่บิล paid (orders PUT/POST · POS · Beam) เรียกใน `after()` · cron `/api/ads/run-jobs` ทุก 15 นาที (กวาด `lib/ads/sweep.ts` + probe บัญชี + sync กลุ่ม) · QualifiedLead (`lib/ads/qualified-lead.ts`): ข้อความจริง ≥3 (`countGenuineInbound` ไม่นับ postback/quick reply/ซ้ำ) หรือแท็ก `customer_tags.triggers_qualified_lead` (บริษัทละ 1) · ล้ม 5 ครั้งเลิก · Meta รับ `QualifiedLead` บน business_messaging แล้ว · ชื่อ event สลับที่ `QUALIFIED_LEAD_EVENT_NAME` | เรียก `sendPurchaseEventForOrder` ตรงจาก route · ยิง `/{dataset}/events` เอง · event ใหม่ไม่ผ่าน `ad_events` · hook ไม่ครอบ `after()` |
| `meta/conversions.ts` | `sendPurchaseEventForOrder(orderId, eventTime?)` → `'sent'\|'skipped'\|'failed'` ยิงครั้งเดียว (`orders.meta_purchase_sent_at`) · ไม่ throw · ต้อง scope `page_events` — เพจเก่าออก token ใหม่ผ่าน "เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)" (`PUT /api/chat-accounts` · **ห้ามลบเพจแล้วเพิ่มใหม่** ห้องแชทเก่าหลุด) · `probeCapiReadiness(accountId, companyId)` (ถาม Meta ใหม่ `force`) จด `credentials.meta_capi_error` / `meta_capi_checked_at` (ป้าย CAPI บนการ์ดเพจ) · `node scripts/check-meta-capi.mjs` · `sweepUnsentPurchaseEvents()` ใน cron `/api/marketplace/watchdog` (งบ 20 วิ · ย้อน ≤7 วันด้วยเวลาชำระจริงจาก `payment_records` · ข้ามเพจที่มี `meta_capi_error`) · `POST /api/meta/capi/sweep` (CRON_SECRET = ทุกบริษัท · แอดมิน = บริษัทตัวเอง) → `{scanned, sent, skipped, failed}` · IG ยังไม่ทำ | เพิ่มจุด paid แล้วลืมเรียก · เขียน `credentials` ทับทั้งก้อน (merge จาก DB) |
| `meta/graph.ts` · `ads.ts` · `hashing.ts` · `capi.ts` | Graph client ตัวเดียว (`graphGet/Post/Delete/GetAll` ไม่ throw → `{ok,status,body,error}` · `isTokenError/isPermissionError/isRateLimitError/isTosRequiredError`) · Marketing API (`listAdAccounts` · `listDatasets` · `sendCapiEvents` · Custom Audiences ≤5,000/ครั้ง · `debugToken`) · `buildHashedUserData` (SHA-256 · เบอร์ `toE164Digits`) · `buildCapiEvent/buildCapiRequest` · `actionSourceForOrder` (pos→physical_store · storefront→website · แชท→chat) · `isEventTimeAcceptable` (7 วัน / physical_store 62) | `fetch('https://graph.facebook.com…')` เอง · sha256/เบอร์เอง · ปลอม `event_time` |
| `audiences/resolve.ts` · `sync.ts` · `broadcast/recipients.ts` | กลุ่มเป้าหมายที่บันทึก (`audiences` `{audience_type, audience_filter, sources[]}`) หาสมาชิกด้วย `resolveChatRecipients()` **ตัวเดียวกับบรอดแคสต์** · นับหลายกลุ่มพร้อมกันใช้ `countChatAudiences()` (โหลดรายชื่อ+ประวัติการซื้อครั้งเดียว · กติกา `selectRecipients` ตัวเดียวกัน — ห้ามวน resolve ทีละกลุ่ม) · `resolveAudienceMembers` (สถิติจับคู่ · `not_syncable` · cap 50,000) · `runAudienceSync` diff กับ `audience_sync_members` → add/remove Custom Audience (PAGEUID ต่อเพจ · `tos_required` · resume ได้) · UI `/marketing/audiences` **เลือกพฤติกรรมก่อน แหล่งทีหลัง** (บรอดแคสต์ยังช่องทางก่อน): `AudienceStep` + `disabledOptions` (จาก `audienceBehaviorOptions()`) → `defaultSourcesFor()` ติ๊กแหล่งให้ (ไม่ติ๊ก LINE) · แหล่งที่ตอบไม่ได้จางพร้อม `audienceSourceUnsupportedReason()` · กฎเข้ม: ทุกแหล่งที่เลือกต้องตอบพฤติกรรมได้ (`audienceSourceSupports()` ตัวเดียวกับ `validateAudienceDefinition`) · ชื่อกลุ่มอยู่บนสุด · สร้างกลุ่ม = ผูก+sync ทุกบัญชีโฆษณาที่พร้อมทันที ไม่มีตัวเลือกปิด · แผงขนาดกลุ่ม: ตัวเลขใหญ่ = ส่งขึ้น Meta ได้ (ไม่ใช่ยอดรวม) · เตือนเมื่อต่ำกว่า `META_AUDIENCE_MIN_MATCHED` · คนที่ส่งไม่ได้ซึ่งซื้อผ่าน marketplace อย่างเดียวนับด้วย `countMarketplaceOnlyAmongUnsyncable()` (RPC `count_marketplace_only_customers`) · หน้ารายการ: คอลัมน์ ส่งขึ้น Meta ได้ = total − not_syncable ของ sync ล่าสุด (`latestCounts()` · ป้าย `syncStatusLook()` · poll เมื่อ `isSyncRunning()` ใน `app/marketing/audiences/components/sync-view.ts` · **`last_counts.uploaded` = ยอดที่เพิ่มในรอบนั้น ห้ามใช้เป็นขนาด**) · สร้าง/แก้เสร็จกลับหน้ารายการ · แก้เงื่อนไข = sync ใหม่ทันที (PUT คืน `definition_changed` แล้วฟอร์มยิง `/sync`) · **ไม่มีเมนูส่งบรอดแคสต์จากกลุ่ม** จนกว่าหน้าบรอดแคสต์จะรับ `?audience=` ได้จริง | หาสมาชิกเองในหน้า/route · เขียนเงื่อนไข "แหล่งไหนตอบกลุ่มไหน" นอก `lib/broadcast/audience.ts` · import `resolve.ts` ฝั่ง client (ใช้ type ใน `app/marketing/audiences/components/types.ts`) · อัปขึ้น Meta ไม่จด `audience_sync_members` |

## Utilities
`api-client.ts` `apiFetch()` (token · company_id · dedup GET) · `supabase.ts` (`supabase` + `handleSupabaseError()`) · `supabase-admin.ts` (`supabaseAdmin` server only · re-export `can`) · `permissions.ts` (`can()` — ดู permissions.md) · `useAuthGuard.ts` · `flow-types.ts` (`isCreditFlow` `isCashFlow` `isConsignmentFlow` `isDepartmentFlow` `getFlowLabel`) · `status-tab-colors.ts` (`getTabColor` `getBadgeColor` — ห้ามกำหนดสีสถานะเอง) · `address-parser.ts` (`parseThaiAddress`) · `product-display.ts` (`productDisplayName` `productSubtitle` `cleanVariationLabel`) · `parallel.ts` (`parallelLimit`) · `stock-utils.ts` (`getStockConfig`) · `pos-utils.ts` (`calculatePosOrderTotals`) · `thai-address-data.ts` (`searchAddress` `PROVINCES`)

| Utility | กติกา |
|---|---|
| `supabase-paging.ts` `fetchAllRows((from,to) => q.range(from,to))` | เพดาน **1,000 แถว** ตัดเงียบ — query ที่ต้องได้ครบต้องผ่านตัวนี้ (`{count:'exact'}` แล้วยิงหน้าที่เหลือขนาน) · รายการใหญ่ที่ไม่ต้องครบให้ค้นฝั่ง server |
| `storage-key.ts` `storageSafeName(name)` / `storageKeyFor(name, ext?)` | ทุก path Storage จากชื่อไฟล์ผู้ใช้ — อักขระนอก ASCII = 400 `InvalidKey` ก่อนถึง API (ไม่มี log ให้ไล่) |
| `image-thumb.ts` `thumbUrl(url, 96\|160\|320)` | รูปย่อตามโฮสต์ (Supabase `render/image` · Shopee `_tn` · Lazada `_{s}x{s}q80.jpg` · อื่นคืนเดิม) · ห้ามใช้กับอวาตาร์/โลโก้/สลิป/QR/lightbox/ImageUploader |
| `utils/format.ts` | `formatPrice()` `formatNumber()` `formatThaiDate()` `formatThaiDateTime()` · `formatDateParts()` (แยก weekday `MON` · วัน · เดือน/ปี · เวลา ให้วางเป็นช่อง) — ห้าม `toLocaleDateString('th-TH')` / `toLocaleString` เงินเอง |
| `utils/download.ts` `downloadBlob(blob, filename)` | ห้าม `createElement('a')` + `createObjectURL` เอง |
| `useDebounce.ts` `useDebouncedCallback(fn, delayMs=400)` — เรียกตรง = รอ delay · `.now()` ยิงทันทีและทิ้งรอบที่รอ (ค่าที่ไม่ได้เปลี่ยนรัว ๆ เช่นเลือกบัญชี/กลุ่ม) · `.cancel()` | ห้าม debounce ด้วย setTimeout เอง |
| `order-draft.ts` | `readOrderDraft` `writeOrderDraft` `clearOrderDraft` `isDraftEmpty` `OrderDraftSnapshot` · key `chat-order-draft:<company>:<contact>` 24 ชม. · เปิดด้วย `draftKey` ของ `OrderForm` · component ห้ามแตะ localStorage เอง · ห้ามเก็บสต็อก/ผลค้นหา/รายการอ้างอิง |

## Chat
| ของกลาง | ที่อยู่ | กติกา |
|---|---|---|
| `getChatService()` / **`getChatServiceLazy(platform)`** · `LineChatService` · `FacebookChatService` | `lib/services/chat/index.ts` / `registry.ts` · `line.ts` · `facebook.ts` | route ที่ผู้ใช้รอ (อ่าน/ส่งข้อความ) ใช้ Lazy (dynamic import เฉพาะแพลตฟอร์ม — index import ครบ 5 เจ้า + `sharp` cold start หนัก) · webhook/cron import service ตรงได้ |
| `buildMessagePreview()` / `htmlToPlainText()` | `lib/chat/message-preview.ts` | preview บรรทัดเดียว (รายชื่อแชท · push) — ห้ามส่ง `content` ดิบ |
| `lineStickerUrl()` / `lineSticonUrl()` | `lib/chat/line-sticker.ts` | ผ่าน `/api/chat/line-sticker` เสมอ · ⛔ ห้าม `https://stickershop.line-scdn.net/...` ใน `<img src>` ตรง (บางคนเห็นบางคนไม่เห็น ไม่มี log) |
| `findLinkedProduct()` / `findProductByRetailerId()` / `findSyncedOrder()` | `lib/marketplace/chat-enrich.ts` | item_id · `retailer_id` FB Shop · เลขออเดอร์ → ของในระบบ (`buildProductInfo` ที่เดียว) · ห้าม query `marketplace_product_links`/`products`/`orders` เองใน service ของแพลตฟอร์ม |
| `normalizeLazadaMessage()` · `normalizeShopeeMessage()` | `lib/lazada/chat-enrich.ts` · `lib/services/chat/shopee.ts` | แปลงทุก template + การ์ด `raw_message.item/order` โครงเดียว (renderer `app/chat/components/renderers/ShopeeRenderers.tsx` รับ `platform`) |
| `QuotedMessage` · `renderLineEmojis` | `app/chat/components/renderers/SharedRenderers.tsx` | บล็อกตอบกลับจาก `raw_message.quoted` · อีโมจิ LINE จาก `raw_message.emojis` — ห้ามวาดซ้ำ |
| `AdMediaThumb` · `referralSourceLabel()` · `referralPostUrl()` | `app/chat/components/AdMediaThumb.tsx` · `app/chat/lib/chatHelpers.tsx` | referral "ทักมาจากโฆษณา" ทุกจุด · `video_url` ของ Meta = .jpg ปก (สื่อจริงที่ `post_id`) · URL fbcdn หมด ~4 วัน → `AdMediaThumb` ซ่อนเอง (ไม่คัดลอกรูปเก็บ) · ประวัติ `fb_contact_referrals` (`saveReferralData` กันซ้ำ 30 นาที) อ่านผ่าน `GET /api/chat/contacts/[id]/referrals` · ค่าล่าสุด `fb_contacts.referral_*` · ห้าม `<img>` fbcdn เอง / map source→label ซ้ำ / history เป็น jsonb บน contact |

**บรอดแคสต์** (กติกาเต็มใน `domains/broadcast.md`): `BROADCAST_PLATFORMS` · `canBroadcastVia()` (`lib/broadcast/platforms.ts`) · `AUDIENCE_OPTIONS` ฯลฯ (`lib/broadcast/audience.ts`) · `runBroadcast(id, platform)` (`lib/broadcast/run.ts` — **route ห้ามเรียก `runLineBroadcast()`/`runTikTokBroadcast()` ตรง**) · `runScheduledBroadcasts()` (`scheduler.ts`) · `validateBroadcastContent()` · `BroadcastContent` (`content.ts`) · `resolveBroadcastTarget()` (`accounts.ts`) · `runLineBroadcast()` · `resolveBroadcastRecipients()` · `getLineQuota()` · `getLineFollowerStats()` (`lib/line/broadcast.ts` — ห้ามยิง `/message/multicast|broadcast` ที่อื่น · ผู้ติดตามใช้ `reachable` (= `targetedReaches`) ห้าม `followers`) · `runTikTokBroadcast()` · `resolveTikTokRecipients()` (`lib/tiktok/broadcast.ts` + `lib/tiktok/engagement.ts` · creds `getEngagementCreds()` ที่เดียว)

**Shopee / TikTok (`lib/shopee/` · `lib/tiktok/`)**: `api.ts` client (sign · OAuth · token) · `sync.ts` + `mapShopeeStatus()` / `mapTikTokStatus()` · `webhook-processor.ts` · `errors.ts` (แปลไทย) · Shopee: `product-sync.ts` · `product-export.ts` · `auto-sync.ts` · `deals.ts` — รายละเอียดใน `domains/shopee.md` · `domains/tiktok.md`

## Bulk Excel (`lib/bulk/`)
- parser `parse-template.ts` (`readFileToRows` `rowsToSheet` `getCell` `validateHeaders` `isInstructionRow` · xlsx + csv) — **อ่านตามชื่อ header ห้ามอ่านตามตำแหน่ง** (เคยพัง)
- UI `components/bulk/`: `BulkUploadCard` · `BulkPreviewBar` (ยืนยันขั้นเดียว ห้าม double-confirm) · `BulkErrorModal` — ห้าม copy inline
- โครง: hub `/products/bulk` (เพิ่ม action ที่นี่) · `/products/bulk/<action>/page.tsx` + `/api/products/bulk/<action>/{export,apply}/route.ts` · Filter → Export → Upload → dry-run preview → Apply · ExcelJS + lock ID columns (เทา + protection) + sheet protection ไม่มีรหัส · RPC คืน `{ results, summary: {updated, unchanged, errors}, dry_run }` · 1 action ต่อ 1 template (ห้าม mega template)

## PDF Generators (คืน `Promise<Blob>`)
`generateFullInvoicePdf()` (`order-invoice-full-pdf.ts` ใบกำกับเต็ม/ใบส่ง) · `generateOrderInvoicePdf()` (`order-invoice-pdf.ts` ย่อ/ใบเสร็จ) · `generateAbbreviatedInvoicePdf()` (`order-invoice-abbreviated-pdf.ts`) · `generateDnPdf()` (`order-dn-pdf.ts`) · `generatePackingPdf()` (`orders-packing-pdf.ts`) · `generateShippingLabelPdf()` (`order-shipping-label-pdf.ts`) · `generateReplenishmentPdf()` (`replenishment-pdf.ts`) · `generateConsignmentReportPdf()` (`consignment-report-pdf.ts`) · `generateDeptStorePdf()` (`department-store-report-pdf.ts`) · `generateStatementPdf()` (`statement-pdf.ts`) · `generateCreditNotePdf()` (`credit-note-pdf.ts`) · `generatePaymentReceiptPdf()` (`payment-receipt-pdf.ts`) · `showPdfPreview()` / `mergePdfBlobs()` (`print-pdf.ts`)

`lib/pdf-utils.ts`: `buildCompanyStack()` `buildCornerTriangle()` `buildSignatureFooter()` `buildProductNameStack()` `withOriginalAndCopy()` `formatPdfPrice()` (รับสตริง) `formatPdfDate()` · **`formatDeliverySchedule()`** (วันที่+รอบส่ง ห้ามประกอบเอง) · **`buildOrderSpecialFlagsCard()`** + `countOrderSpecialFlagLines()` (ใบจัดของ/ใบคำสั่งซื้อใช้ร่วม · เพิ่มบรรทัดต้องบวกตัวนับ ไม่งั้นใบจัดของล้นครึ่งหน้า) · **`preparePdfText()`** (ข้อความอิสระของลูกค้า — ZWSP ตัดคำไทย · ล้างอีโมจิ · ตัด `\n` หัวท้าย · กล่องต้องกว้างคงที่ ห้ามตาราง `*`) · ⛔ ห้าม emoji ในเอกสาร (ฟอนต์ไม่มี glyph)

## งานเบื้องหลังใน route handler — `after()` เสมอ
- งานที่ไม่ให้ผู้ใช้รอแต่ต้องทำจริง (push marketplace · noti · ออกเอกสาร) → **`after(() => work())`** (`next/server`) และ `work` ต้อง return promise · ห้าม `work().catch(() => {})` ลอยก่อน `return NextResponse.json()` — Vercel freeze ทันทีที่ response ออก (push stock Shopee ตายเงียบ 3 เดือน เพราะ log ก็ลอยตายไปด้วย)
- log ที่หายไม่ได้ → `await logIntegrationNow()` · วาง log ชิดจุดยิง API ภายนอก (`shopeeApiRequest` log ให้แล้วผ่าน [lib/shopee/api-log.ts](../../lib/shopee/api-log.ts))
- `lib/shopee/auto-sync.ts`: ใน route ใช้ `syncStockNow/syncPriceNow/syncInfoNow/syncCategoryNow` (await ได้) · `triggerShopee*Sync` (void) เฉพาะที่ไม่มี request context
- field ที่ stamp เฉพาะตอนสำเร็จ (`last_stock_pushed_at`) = สัญญาณจับ "พังเงียบ"

## API Routes ที่มีแล้ว (ห้ามสร้างซ้ำ)
- CRUD: `/api/orders` · `/api/dealer-orders` · `/api/department-orders` · `/api/replenishments` (+ `[id]`) · `/api/products` · `/api/customers` · `/api/inventory`
- **`/api/products/search?q=&limit=`** → `{ items, complete }` (RPC `search_order_products` ~30KB · `/api/products?search=` ยิง DB 3 รอบ ~220KB) คู่ `useServerSearch`
- **`/api/customers/order-context?customer_id=`** — ลูกค้า + ที่อยู่ + brand commission + GP ใน call เดียว
- **`/api/marketplace/accounts`** (ทุกแพลตฟอร์ม) GET `?platform=shopee|tiktok|lazada|all` · PUT · PATCH `{id, shop_logo}` · DELETE · `/resync` · `/logo`
- เอกสาร: `/api/consignment/reports` · `/api/department-store/reports` · `/api/statements` · `/api/credit-notes` (PATCH) · `/api/payment-records` · `/api/payment-records/verify` (approve/reject slip)
- Shopee: `/api/shopee/sync` · `/sync-order` · `/orders/shipping-document` · `/products/export` · `/products/import` · `/webhook` · TikTok: `/api/tiktok/oauth/auth-url` · `/oauth/callback` · `/webhook` · `/webhook/retry` · `/sync` · `/sync-all` · `/sync-order`
