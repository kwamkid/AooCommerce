---
paths:
  - "app/marketing/**/*"
  - "app/api/broadcasts/**/*"
  - "app/api/audiences/**/*"
  - "lib/broadcast/**/*"
  - "lib/audiences/**/*"
  - "lib/line/broadcast.ts"
  - "lib/line/constants.ts"
  - "lib/tiktok/broadcast.ts"
  - "lib/tiktok/engagement.ts"
  - "components/broadcast/**/*"
  - "scripts/check-tiktok-engagement.mjs"
---
# บรอดแคสต์ — /marketing/broadcast (ช่องทาง · กลุ่มผู้รับ · เนื้อหา · ตั้งเวลา · รายงาน)

> โหลดเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้ก่อน · **เขียนสั้น** ไม่ใส่วันที่/เล่าประวัติ

## ทำไมส่งจากระบบเรา + ช่องทางไหนส่งได้
- LINE Messaging API **อ่านประวัติแชทไม่ได้** และ broadcast/การตอบจาก OA Manager **ไม่ผ่าน webhook** → ส่งจากที่นี่เท่านั้นที่ลงห้องแชทลูกค้า + รู้โควตา (push/multicast/broadcast กินโควตา · reply token ไม่กิน)
- เส้นแบ่งคือ **"ถึงคนที่ยังไม่เคยคุยกับเราได้ไหม"** ไม่ใช่ส่งทีเดียว vs ทีละคน · ทะเบียน [lib/broadcast/platforms.ts](../../../lib/broadcast/platforms.ts) ที่เดียว (`BROADCAST_PLATFORMS` · `canBroadcastVia()` · client-safe — หน้าจอกับ API ใช้ `reason` เดียวกัน)

| ช่องทาง | ถึงใคร | สถานะ | ที่มา |
|---|---|---|---|
| **LINE** | ผู้ติดตามทุกคน แม้ไม่เคยทัก | ✅ | `/message/multicast` (500/ใบ) + `/message/broadcast` |
| **TikTok Shop** | ลูกค้าที่สั่งใน 365 วัน | โค้ดพร้อม รอ scope | Customer Engagement: `POST /customer_engagement/202502/engagement_tasks/custom` (หัวข้อ ≤70 · เนื้อ ≤500 · สินค้า ≤4 · คูปอง 1 · วันหมดอายุ) → `POST /202412/messages` (`buyer_emails` อีเมลนิรนามจากออเดอร์) → `POST /202412/performances` |
| **Lazada** | ออเดอร์ ≤30 วัน / ห้องที่คุยอยู่ | ยังไม่ต่อ | `/im/session/open` บังคับ `order_id` (`-22 order out of day limit: 30`) ส่งทีละห้อง |
| **Shopee** | ห้องที่ลูกค้าทักมาแล้ว | ยังไม่ต่อ | sellerchat มีแค่ `send_message` · ไม่มี API บรอดแคสต์ (Chat Broadcast อยู่แค่ Seller Center) |
| **Facebook / IG** | ทักมาภายใน 24 ชม. | ยังไม่ต่อ | นอก 24 ชม. API ปฏิเสธ (message tag ห้ามโปรโมชัน) · ไม่มีส่งเป็นชุด ยิงทีละ PSID |

- ⛔ **ห้ามหาทางอ้อมกรอบข้างบน** (แพลตฟอร์มวัดสแปมจาก block/report ของผู้รับ ไม่ใช่วิธีกดส่ง) · เปลี่ยน `status` เป็น `'ready'` เมื่อต่อ API เสร็จและส่งได้จริงเท่านั้น

## โครง + ตัวส่ง
- ตาราง **`broadcasts`** (เดิม `line_broadcasts` · RLS มาตรฐาน · `platform` · ต้นทาง `chat_account_id` (LINE/FB/IG) **หรือ** `marketplace_account_id` บังคับด้วย `broadcasts_one_account_check` · `batches` jsonb ล็อตละ ≤500 + `retry_key` · `platform_request_ids` · `platform_data` (TikTok `task_id` + `idempotency_key`) · `content` jsonb = เนื้อหาชนิดกลาง คู่ `messages` ของแพลตฟอร์ม)
- API `/api/broadcasts` + `/preview` + `/[id]/resume` + `/[id]/cancel` — ปฏิเสธช่องทางที่ยังไม่ ready ด้วย `reason` จากทะเบียน · ต้นทางแปลงที่ [lib/broadcast/accounts.ts](../../../lib/broadcast/accounts.ts) `resolveBroadcastTarget()` (**ห้าม query ตารางบัญชีเองใน route**)
- ตัวส่งเลือกที่ [lib/broadcast/run.ts](../../../lib/broadcast/run.ts) `runBroadcast(id, platform)` — route เรียกผ่านนี่เท่านั้น · **เพิ่มช่องทาง = case ที่นี่ + สาขาใน POST ตามคอมเมนต์ + status ในทะเบียน**
- **LINE** [lib/line/broadcast.ts](../../../lib/line/broadcast.ts) `runLineBroadcast()` กดซ้ำได้เสมอ: จดแผนล็อต + `X-Line-Retry-Key` ลง DB **ก่อน**ยิงใบแรก (งบ 240 วิ · กด "ส่งต่อ" แล้ว LINE ไม่ส่งซ้ำ) · `sent_count/failed_count` นับจากสถานะล็อต ห้ามบวกสะสม · ค่าคงที่ client-safe ใน [lib/line/constants.ts](../../../lib/line/constants.ts) (broadcast.ts แตะ supabaseAdmin ห้าม import ฝั่ง client)
- **โควตา LINE**: `GET /message/quota` + `/quota/consumption` → preview บอกใช้ไป/เพดาน/เหลือ · ไม่พอ = ปฏิเสธตั้งแต่สร้าง (`quotaBlocks`) · ถามไม่ได้ = `unknown` ไม่ขวาง · **นับต่อการส่ง 1 ครั้ง ไม่ใช่ต่อ object — ≤3 bubble = 1 ข้อความ** (การ์ดรูป+ปุ่มไม่แพงกว่าข้อความเปล่า) · `LINE_MAX_BUBBLES = 3` ใน `buildLineMessagesFromContent()` — เกิน = 2 credit/คนเงียบ ๆ
- **ผู้รับโหมด `all` = `targetedReaches` ห้ามใช้ `followers`** (`followers` ของ `/insight/followers` = ยอดสะสมการแอด ไม่ลดเมื่อบล็อก · aDay Fresh 41,490 vs จริง 15,751) · `getLineFollowerStats()` คืน `reachable/totalAdds/blocks` หน้าจอโชว์ส่วนต่าง
- **สำเนาในห้องแชท**: หลังล็อตสำเร็จ insert `line_messages` ขาออก (chunk 200) `raw_message.broadcast_id` (ป้าย "📣 บรอดแคสต์") · 1 แถวต่อ message object (`threadRows()` — แถว flex พก `raw_message.flexContents` ให้ `LineFlexRenderer` วาดเหมือนที่ลูกค้าเห็น · `content` ต้องอ่านรู้เรื่องเพราะรายชื่อแชท/แจ้งเตือนใช้) · **ห้ามแตะ `last_message_at`/`unread_count`** (รายชื่อแชททั้งร้านจะสลับลำดับ) · `sent_by` ต้องมีใน `user_profiles` (FK) ไม่งั้น chunk ล้มทั้งชุด
- **หลายบัญชีในใบเดียว**: 1 บัญชี = 1 ใบ (สถานะ/ส่งต่อแยก ใบไหนล้มไม่ลากใบอื่น) · รูปอัปครั้งเดียวใช้ร่วม · ลิมิต = ค่าแคบสุดของทุกเจ้าที่เลือก (`intersectCompose()` เช่น LINE+TikTok ⇒ 500 ตัว ไม่มีรูป หัวข้อบังคับ) · กลุ่มผู้รับเหลือเฉพาะที่ทุกเจ้ามี

## กลุ่มผู้รับ (`audience_type`) — ทะเบียน [lib/broadcast/audience.ts](../../../lib/broadcast/audience.ts)
เส้นแบ่งที่ผู้ใช้ต้องเข้าใจ: **"เคยทักมา" (เรารู้รายชื่อผ่าน webhook) vs "แอดเพื่อนแต่ไม่เคยทัก" (LINE รู้ เราไม่รู้)**
- `contacts` เคยทักมา (บุคคล `line_user_id` ขึ้น U — group/room multicast ไม่ได้) · `customers` เคยทัก + ผูกลูกค้าแล้ว · `tags` แท็กลูกค้า (`customer_tag_links`) **และ** แท็กห้องแชท (`contact_tag_links` platform line) · `all` ผู้ติดตามทั้งหมด (`/message/broadcast` — ลงห้องแชทได้เฉพาะคนที่เคยทัก) · `contacts_pick` เลือกรายคน (ทางเดียวที่ทดสอบส่งหาตัวเองได้ · กลุ่มเล็กไม่ต้องติดแท็ก)
- ตามการซื้อ: `not_bought` · `bought` · `bought_within` N วัน · `bought_before` เกิน N วัน · `bought_once` — ใช้ `get_chat_customer_order_stats` (RPC เดียวกับหน้าแชท) · `audience_filter.days`
- ⚠️ "ยังไม่เคยซื้อ" = **ไม่มีหลักฐานว่าซื้อ** — LINE ไม่ให้เบอร์/อีเมล รู้ได้ทางเดียวคือห้องผูกกับ `customers` (ตอนเปิดบิลจากแชท) → **ต้องโชว์เสมอว่ารู้ประวัติกี่คน** (`contact_total`/`contact_linked` จาก preview)
- ตัวกรองซ้อน (หั่นให้แคบ ไม่ใช่กลุ่มใหม่): `audience_filter.min_messages` · `last_chat_days` — ใช้ได้ทุกกลุ่มยกเว้น `all` และ `contacts_pick` · **นับเฉพาะ `direction='incoming'`** (RPC `get_line_contact_message_counts` คืน `incoming_count` + `last_incoming_at` รอบเดียวต่อ OA) — นับขาออกด้วย สำเนาบรอดแคสต์จะดันตัวเลข · ⛔ **ห้ามใช้ `line_contacts.last_message_at` เป็น "คุยล่าสุด"** (ขยับตอนแอดมินตอบด้วย — `sendMessage` ใน [lib/services/chat/line.ts](../../../lib/services/chat/line.ts))
- รายชื่อดึงผ่าน `fetchAllRows()` (เกิน 1,000 ได้) · `line_user_id` ซ้ำส่งครั้งเดียว
- ป้าย/คำอธิบายของทุกกลุ่มต้องอ่านเทียบกันได้ (โชว์ทุกตัว ไม่ใช่เฉพาะที่เลือก) · หน้าสร้าง/รายการ/รายงานใช้ `AUDIENCE_OPTIONS` · `AUDIENCE_GROUPS` · `audienceLabel()` · `describeAudienceRefine()` · `buildAudienceFilter()` · `BROADCAST_ATTRIBUTION_DAYS` — **เพิ่มกลุ่ม = ที่นี่ + `AUDIENCE_BY_PLATFORM` ใน `/api/broadcasts` + CHECK ของตาราง** · ห้ามทำ map ป้ายกลุ่มซ้ำในหน้า
- ⛔ **ห้ามใช้ตัวเลขใน DB ตอนนี้สรุปพฤติกรรมลูกค้า/ตั้งค่าเริ่มต้น/ตัดสินว่าฟีเจอร์คุ้มไหม** — ร้านเพิ่งเริ่มเปิดบิลในระบบ (aDay Fresh เริ่ม 28 ส.ค. 2026) สัดส่วน "ยังไม่ซื้อ" วัดอายุการใช้ระบบ ไม่ใช่พฤติกรรม · ใช้ยืนยันได้แค่ว่าตัวกรองทำงาน/เร็วพอ
- (ยังไม่ทำ) ผู้ติดต่อ 236 คนเคยพิมพ์เบอร์ในแชท — ใช้*สร้าง*ลูกค้าได้ · การ*จับคู่*กับลูกค้าเดิมต้องวัดใหม่เมื่อข้อมูลลูกค้าสะสมพอ

## หน้าจอ
- **สร้าง** `/marketing/broadcast/new` = 2 ขั้นด้วย `Stepper` (`allowJumpAhead` · validate ตอนกดส่ง): ขั้น 1 "ส่งถึงใคร" (ช่องทาง + กลุ่มเป้าหมาย) · ขั้น 2 "ส่งอะไร เมื่อไหร่" (เนื้อหา + เวลา) · **ทุกอย่างกางหมด ไม่ยุบเป็นบรรทัดสรุปให้กด "แก้ไข"** · แผงขวา sticky: จำนวนผู้รับ (+`ProgressBar` เทียบผู้ติดต่อทั้งหมด) · โควตา · สรุป 5 บรรทัด (ช่องทาง/กลุ่ม/ตัวกรอง/เนื้อหา/ส่งเมื่อ) · ปุ่มตามขั้น · การ์ดแยกใน `app/marketing/broadcast/new/components/` หน้าเป็นเจ้าของ state
  - ช่องทาง: ≤8 บัญชี = การ์ดติ๊ก (`Checkbox` + `.choice-card`) · มากกว่า = `AccountPicker` · ช่องทางที่ยังส่งไม่ได้ขึ้นบรรทัดจางพร้อม "ดูเหตุผล" — **ห้ามซ่อน**
  - กลุ่มเป้าหมายกางในหน้า (ไม่ใช่โมดัล): ซ้าย = ตัวเลือกแบ่งตาม `AUDIENCE_GROUPS` + จำนวนคนทุกกลุ่มจาก `GET /api/broadcasts/audience-counts` (บัญชีเดียว · cache 60 วิ · ตอบไม่ได้ = "—" ห้ามเดา 0) · ขวา = ช่องกรอกของกลุ่ม + ตัวกรองซ้อนเป็น `FilterChips` · หัวการ์ด "รู้ประวัติการซื้อของ X จาก Y คนที่เคยทักมา"
  - ตัวอย่าง: [BroadcastPreview](../../../components/broadcast/BroadcastPreview.tsx) (ตัวเดียวกับหน้ารายงาน) ใน [LinePhonePreview](../../../components/broadcast/LinePhonePreview.tsx) (การ์ด/รูปเต็มจอตกบรรทัดใต้รูปโปรไฟล์ · รูปเต็มจอไม่มีข้อความบนตัว · หัวห้อง = บัญชีแรก) · **Flex รับรูป ≤1024×1024** (1040 ใน OA Manager เป็นของ Rich message/imagemap คนละชนิด)
- **รายการ** `/marketing/broadcast`: KPI 30 วัน (`Stat` ส่งไป/ตอบกลับ/สั่งซื้อ จาก `summary` ของ GET · ไม่มี KPI โควตา) · คอลัมน์ ส่งถึง/สำเร็จ/ตอบกลับ (`ProgressBar`) · `stats: null` = "—" ห้าม 0 · เมนูแถว: ดูรายงาน (primary) · ส่งต่อ · ยกเลิกการตั้งเวลา · กดแถว = รายงาน · poll 4 วิเฉพาะตอนมีใบกำลังส่ง
- **รายงาน** `/marketing/broadcast/[id]`: 4 `Stat` (ผู้รับ/สำเร็จ/ตอบกลับ/สั่งซื้อใน 7 วัน) · รายชื่อผู้รับ (`DataTable storageKey="broadcast-recipients"` + `FilterChips` ทั้งหมด/ตอบกลับ/รอเราตอบ/สั่งซื้อ/ส่งไม่ได้ · แบ่งหน้าฝั่ง server · กดแถวเปิด `/chat?platform=line&account=…&contact_id=…`) · ขวา = `BroadcastPreview` + "ทำอะไรต่อ" (ตอบคนที่ค้าง · ส่งซ้ำ `?from=<id>` · ห้องแชทของ OA) · poll 4 วิตอน pending/sending
- สิทธิ์ `chat.broadcast` = ADMIN_TIER (กินโควตา) · เมนูกลุ่ม "การตลาด" ใน Sidebar · `/chat/broadcast` redirect ใน [next.config.ts](../../../next.config.ts) · รูปอัปไป `chat-media/broadcast-images/`

## ตั้งเวลา + รายงานผล
- POST รับ `scheduled_at` (ล่วงหน้า ≥2 นาที ≤90 วัน · หน้าจอกับ API เกณฑ์เดียวกัน) → `status='scheduled'` ไม่เข้า `after()` · cron `/api/broadcasts/run-scheduled` ทุก 5 นาที ([lib/broadcast/scheduler.ts](../../../lib/broadcast/scheduler.ts) `runScheduledBroadcasts()` งบ 240 วิ) จองด้วย `UPDATE … WHERE status='scheduled'` แล้ว `runBroadcast()` · **รายชื่อวางแผนตอนถึงเวลา** (ล็อตวางเมื่อ `batches` ว่าง — จำนวน/โควตาตอนสร้างเป็นแค่ภาพตอนนั้น) · ยกเลิกได้เฉพาะ `scheduled` (`/[id]/cancel` UPDATE มีเงื่อนไข status) → `cancelled` · ตัวส่งทั้ง LINE/TikTok ข้าม `scheduled`/`cancelled` เสมอ
- `resolveBroadcastContentKind()` เดาชนิดย้อนจาก `messages` ให้ใบเก่า · RPC `get_broadcast_reply_stats(company, ids[])` + `get_broadcast_recipients(company, id, filter, limit, offset)` บน `broadcast_recipients_of(id)` (= `contact_ids` ในล็อตที่ส่งแล้ว ∪ สำเนา `raw_message.broadcast_id` — โหมด `all` อาศัยสำเนา) · partial index `line_messages_broadcast_copy_idx` — **query ต้องมี `raw_message ? 'broadcast_id'`** ไม่งั้นกวาดทั้งตาราง
- หน้าต่างวัดผล **7 วันหลัง `started_at`**: `replied` ลูกค้าพิมพ์กลับ ≥1 · `awaiting` ข้อความล่าสุดยังเป็นของลูกค้า · `ordered` ผูกลูกค้าแล้วมีออเดอร์ไม่ยกเลิก · **ตัวหาร % = `tracked_count` ไม่ใช่ `sent_count`** ("วัดผลได้ X จาก Y คน") · วัดได้เฉพาะช่องทางที่มีห้องแชทของเรา (LINE) · TikTok `stats: null` · ไม่มีสถิติบล็อก/อ่านรายใบ (LINE ไม่ให้ ห้ามใส่)

## เนื้อหา — ชนิดกลาง ไม่ผูกแพลตฟอร์ม ([lib/broadcast/content.ts](../../../lib/broadcast/content.ts))
- แบ่งตาม "ลูกค้าเห็นอะไร" · ทุกชนิดมีกล่อง "1. ข้อความ (ไม่บังคับ)" นำหน้า:
  - `announce` รูปธรรมดาในแชท (`image_style`: หน้าจอส่ง `bubble` เสมอ · `rich` เหลือให้ใบเก่า)
  - `poster` รูปเต็มความกว้าง + `tap_action` บังคับ (ใบเก่า `link_url` อ่านผ่าน `posterAction()`)
  - `gallery` รูปหลายใบเลื่อนดู (`images[]` ≤ `compose.imagesMax` = 10 · `action` ต่อใบ · LINE = carousel ของ bubble รูปล้วน mega)
  - `products` สินค้าจากคลัง (1 ใบ = การ์ด giga เต็มจอ · หลายใบ = carousel mega · `card_style`: `image` รูปจัตุรัส+ป้าย "ลด N%"+ราคาบนรูป กดทั้งใบ / `detail` รูป+ชื่อ+ราคา+ปุ่มสั่ง — ไม่ส่ง = `detail`)
  - `promo` การ์ดหัวข้อ+ปุ่ม **ถอดจากตัวเลือกแล้ว** (เก็บให้ใบเก่าเปิด/ส่งซ้ำ · `BroadcastButton.action` · ใบเก่า `url` ผ่าน `buttonAction()`)
- **"กดแล้วเกิดอะไร" = ทะเบียน `BroadcastAction`** (`url` ลิงก์ · `product` หน้าสินค้าหน้าร้าน — ต้องเปิด storefront + สินค้าแสดงบนหน้าร้าน ไม่งั้น API 400 ชิปปิดพร้อมเหตุผล · `message` ส่งข้อความเข้าห้อง) · หน้าจอใช้ `ActionPicker` ([ActionPicker.tsx](../../../app/marketing/broadcast/new/components/ActionPicker.tsx)) ตัวเดียว · LINE แปลงที่ `lineActionFor()` ที่เดียว · **เพิ่มชนิด** (คัดลอกคูปอง / `tel:`) = ทะเบียน + case ใน `lineActionFor` + ช่องใน ActionPicker · ห้ามเขียนชิป "กดแล้วไปไหน" ซ้ำในหน้า
- **LINE**: announce = text (+image) · poster = text (ถ้ามี) + Flex **giga** hero ตาม `tap_action` · promo = Flex giga (hero `aspectRatio` จาก `image_width/height` ที่วัดตอนอัป · สูง ≤3 เท่าความกว้าง · ปุ่มแรกเป็น action ของรูป) · products = Flex carousel `mega` · รูปย่อ ≤1024×1024 ก่อนอัป · quick reply แนบ object สุดท้าย (ไม่นับเป็น bubble)
- **TikTok**: `title` + `body` + `product_ids` (uuid → `marketplace_product_links.external_item_id` · ตัวที่ไม่ผูกตกไปเงียบ ๆ ไม่ล้มทั้งใบ)
- **ลิงก์การ์ดสินค้าเติมเองจาก storefront** ([lib/broadcast/product-links.ts](../../../lib/broadcast/product-links.ts) `fillStorefrontProductLinks()` ใน POST หลัง validate): สินค้ามี `slug` + `storefront_visible` + ร้านเปิด storefront ⇒ ปุ่ม "สั่งเลย" ไปหน้าสินค้า (`storefrontUrl(cfg, slug, '/p/<product-slug>')`) · ไม่งั้น "สนใจสินค้านี้" (message action — LINE บังคับทุกคอลัมน์ ≥1 ปุ่ม · ได้บทสนทนาให้ปิดการขาย) · ห้ามทับลิงก์ที่ผู้ใช้พิมพ์ · ลิงก์เปลี่ยนเองเมื่อร้านเปิด storefront (ยังไม่เปิดสักร้านจริง)
- `validateBroadcastContent(platform, content)` ตัวเดียว หน้าจอ + API ใช้ร่วม · ลิมิตอยู่ `compose` ในทะเบียน (`titleMax` TikTok 70 · `bodyMax` LINE 5,000/TikTok 500 · `image` · `kinds` · `buttonsMax` LINE 4/TikTok 0 · `productsMax` LINE 10/TikTok 4 · `quickReplyMax` LINE 13 · `imagesMax`) ห้าม hardcode ซ้ำ
- ⛔ **ห้ามให้ผู้ใช้เลือกเป็นศัพท์ของ LINE** (flex/carousel) — แปลไปเจ้าอื่นไม่ได้

## TikTok Shop — โค้ดครบ ติดสิทธิ์
- [lib/tiktok/engagement.ts](../../../lib/tiktok/engagement.ts) (API 4 ตัว) + [lib/tiktok/broadcast.ts](../../../lib/tiktok/broadcast.ts) `runTikTokBroadcast` / `resolveTikTokRecipients` (โครงล็อตเหมือน LINE) · ผู้รับ = distinct `orders.external_data->>'buyer_email'` ≤365 วัน (คนเดียวหลายออเดอร์ส่งครั้งเดียว) · กลุ่ม: `buyers_365d` · `tags` (ต้องมีออเดอร์ในกรอบด้วย) · ไม่มีสำเนาลงห้องแชท
- ⛔ **ตัวบล็อก = ไม่มี scope ให้ขอ ไม่ใช่ยังไม่กดเปิด — อย่าไล่ซ้ำ** (สำรวจ Partner Center 8 ก.ย. 2026): scope กรองตามหมวด app · `AooCommerce` (Order Management/OMS-WMS, `6gec3d4s4o88v`) ค้น "customer" = 0 · `AooCommerce-Chat` (Customer Support, `6gtqs1d4tp7u0`) เจอแค่ `seller.customer_service` (Under review · Sensitive · app ยัง Draft) ค้น "engagement" = 0 · หมวด app มีแค่ 4 (Customer Support · Multi-Channel Management · Accounting · Order Management) ไม่มีการตลาด/CRM
- ทางเดียวที่เหลือ: `/customer_engagement/*` แฝงใน `seller.customer_service` → `getEngagementCreds()` (ที่เดียว) ใช้ token ของ app Chat ก่อนแล้วตกไป app ออเดอร์ · scope ผ่านแล้วไม่ต้องแก้โค้ด แค่ต่อ chat token แล้วรัน `node scripts/check-tiktok-engagement.mjs` (อ่านอย่างเดียว บอกติดด่านไหน + นับออเดอร์) · ยังไม่ผ่าน = ถาม partner manager ของ TikTok
- ด่านที่สอง: ร้านต้องได้ `FUNDAMENTAL` + `CUSTOM_MSG` (`GET /202502/permissions`) · ทั้ง 2 ร้านยังไม่มี `chat_access_token`
- **เปลี่ยน `status` เป็น `'ready'` เมื่อ check script ผ่านครบเท่านั้น** · ⚠️ `message_templates` ตอบ "Locale is a required field" ทั้งที่ยังไม่มี scope (validate ก่อนเช็คสิทธิ์ — ไม่ได้แปลว่าผ่าน)
- ⚠️ ไม่มี idempotency key ระดับข้อความ (มีแค่ระดับ task) → ล็อตเล็ก `TIKTOK_ENGAGEMENT_BATCH_SIZE = 50` (เพดานจริงยืนยันตอนส่งใบแรก) + บันทึกทันทีหลังยิง

## ยังไม่ทำ
ต่อ Lazada/Shopee/FB/IG · แก้เวลาใบที่ตั้งไว้ (ต้องยกเลิกแล้วสร้างใหม่) · ส่งซ้ำเฉพาะคนไม่ตอบ · บันทึกกลุ่มผู้รับไว้ใช้ซ้ำ · คูปอง (ตั้งใจทำระบบคูปองของเราเองข้ามช่องทาง — `coupon_ids` ของ TikTok จึงยังไม่ต่อ) · `GET /202412/performances`
