---
paths:
  - "lib/**/*settlement*"
  - "lib/marketplace/fee-types.ts"
  - "app/api/marketplace/settlements/**/*"
  - "lib/beam/transactions.ts"
---
# Settlement — เงินเข้าจริงจาก marketplace (ค่าธรรมเนียม 13 ช่อง)

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

### 💰 Settlement — เงินเข้าจริงจาก marketplace (เพิ่ม 2026-08-29 · Shopee ใช้ได้แล้ว)

ตอบว่า "ขายได้เท่าไหร่ โดนหักอะไรบ้าง เหลือเข้ากระเป๋าจริงเท่าไหร่ กำไรเท่าไหร่" — **ผลสำรวจฟิลด์จริงทั้ง 3 เจ้าอยู่ที่ [memo/settlement-analysis.md](../../../memo/settlement-analysis.md) อ่านก่อนแตะเรื่องนี้เสมอ**

- **ช่องกลาง 13 ช่อง** ใน [lib/marketplace/fee-types.ts](../../../lib/marketplace/fee-types.ts): `gross_sales · seller_discount · platform_discount · commission · payment_fee · service_fee · shipping_cost · affiliate · ads · campaign_fee · tax_withheld · adjustment` (+ `net_payout`) — **ทุกช่องเก็บเป็นบวกเสมอ** ทิศอยู่ที่ความหมายของช่อง ไม่ใช่เครื่องหมาย (แต่ละ platform ใช้ทิศไม่ตรงกัน)
- **เจอค่าธรรมเนียมชนิดใหม่ → หา bucket ที่ตรงที่สุด ห้ามเพิ่ม bucket ตามชื่อที่ platform เรียก** (สามเจ้ารวมกันมีเป็นร้อยชนิด จะได้รายงานร้อยคอลัมน์ที่เทียบข้าม platform ไม่ได้) · ชื่อจริงไม่หาย อยู่ใน `marketplace_settlement_lines` ทุกบรรทัด
- **ตาราง**: `marketplace_settlements` (1 แถว = 1 ออเดอร์ · query รายงานจากตัวนี้) + `marketplace_settlement_lines` (บรรทัดดิบตามที่ platform ส่งมา — ตัวที่ทำให้ Lazada ที่เป็น ledger รายบรรทัดลงได้) + `marketplace_account_charges` (ค่าใช้จ่ายที่ไม่ผูกออเดอร์ เช่น Sponsored Affiliates, ค่าโฆษณาที่กรอกเอง)
- **`gross_profit` เป็น null เมื่อไม่รู้ต้นทุน — ห้าม `coalesce(...,0)` ในรายงาน** ไม่งั้นออเดอร์ที่ไม่มีต้นทุนจะโชว์ margin 100% · `cogs_basis` บอกความน่าเชื่อ (`snapshot` = unit_cost ตอนขายครบ · `mixed`/`wac` = ใช้ WAC ปัจจุบันแทนบางส่วน/ทั้งหมด) · ปัจจุบัน Shopee รู้ต้นทุน 1,156 จาก 2,361 ออเดอร์
- ⚠️ **Shopee มีฟิลด์ชื่อ `cost_of_goods_sold` แต่หมายถึงราคาที่ลูกค้าจ่าย ไม่ใช่ต้นทุนผู้ขาย** (ยืนยันจากข้อมูลจริง = `order_original_price` ทุกแถว) — ต้นทุนจริงมาจาก `order_items.unit_cost` เท่านั้น
- ⚠️ **Lazada ส่งตัวเลขเป็น string ที่มีคอมมาคั่นหลัก** (`"3,490.00"` → `Number()` = NaN, เจอ 10/180 แถว และเป็นแถวยอดใหญ่ทั้งหมด) — **ใช้ `parseAmount()` จาก fee-types.ts เสมอ ห้าม `Number()` ตรงๆ กับตัวเลขจาก marketplace**
- **ออเดอร์ Shopee ใหม่สร้าง settlement เองอัตโนมัติ** — `fetchAndSaveEscrowDetail()` ใน [lib/shopee/sync.ts](../../../lib/shopee/sync.ts) เรียก `normalizeShopeeEscrow()` + `saveSettlement()` ต่อท้าย (ล้มแยกจากกัน — escrow บันทึกแล้วถ้า mapping พังยัง backfill ทีหลังได้)
- **`buyer_paid`** = เงินที่ลูกค้าควักจ่ายจริง (nullable — Lazada/TikTok ไม่บอก **ห้ามเดาเป็น 0**) · ส่วนต่างจาก `gross_sales − seller_discount` คือเงินที่แพลตฟอร์มออกแทนลูกค้า → ตอบได้ว่า "สินค้าตัวนี้ขายได้เพราะของดี หรือเพราะแพลตฟอร์มแจกคูปอง"
- ⚠️ **ค่าคอมของ Shopee คิดจากราคาขายของเรา ไม่ใช่เงินที่ลูกค้าจ่าย** — ยืนยันจากข้อมูลจริง: คอม/ราคาขาย = 13.71% (sd 2.69 คงที่) · คอม/เงินลูกค้าจ่าย = 18.35% (sd 4.12 กระจาย) · แปลว่า Shopee แจกคูปองให้ลูกค้าแต่เก็บค่าคอมจากราคาเต็ม
- ⚠️ **ส่วนลดรายชิ้นของร้านไม่มีฟิลด์ของตัวเอง** — ซ่อนอยู่ในผลต่าง `order_original_price` (ราคาป้าย) กับ `original_cost_of_goods_sold` (ราคาขายจริง ซึ่งเป็นตัวตั้งต้นของสูตร escrow) · ใช้ราคาป้ายเป็นยอดขายเฉย ๆ = ยอดเกินจริง 8% และมีเงิน "หายไป" อธิบายไม่ได้ 1%
- **การแมป Shopee กระทบยอดลงศูนย์แล้ว** (2,363 ออเดอร์ ส่วนต่าง 0.00) — เทียบกับสูตร `escrow_amount` ที่เอกสาร Shopee เขียนไว้ · `final_product_protection` **ไม่อยู่ในสูตร** ห้ามนับเป็นค่าใช้จ่าย
- **2 เส้นทางเก็บข้อมูล**:
  - `POST /api/marketplace/settlements/backfill { platform:'shopee', limit, offset }` — **ไม่ยิง API เลย** แปลงจาก `orders.external_data.escrow_detail` ที่ดูดเก็บไว้แล้ว · **ต้องส่ง `offset` เลื่อนหน้าเอง** ไม่งั้นวนดึงชุดเดิม
  - `POST /api/marketplace/settlements/sync { platform:'shopee'|'lazada'|'tiktok'|'all', days }` · **`GET` = cron รายวัน** (เท่ากับ `all` + 30 วัน — job เดียวครอบทั้ง 3 เจ้า) — ยิง API จริง (เช็ค breaker scope `finance` ก่อนเสมอ) · **ควรตั้ง cron รายวัน** เพราะยอด settlement โผล่หลังออเดอร์จบหลายวัน ไม่ใช่ตอน sync ออเดอร์ · **shopee = ตามเก็บ escrow ของออเดอร์ที่จบแล้วแต่ยังไม่มียอด** (ทางกู้เมื่อพลาดรอบแรก — `/backfill` แปลงได้เฉพาะที่มี escrow อยู่แล้ว)
- ⚠️ **การดึง escrow ต้อง `await` ห้ามปล่อยลอย** — อยู่ในสายที่วิ่งใน `after()` ปล่อยลอยแล้วโดน freeze ทิ้ง เคยทำให้ 19/482 ออเดอร์ที่จบแล้วไม่มียอดเงินเลย (ดู [fix-bug.md](../../../fix-bug.md) 2026-09-02)
- **Lazada**: ledger รายบรรทัดต่อ order item — `normalizeLazadaTransactions()` ประกอบเป็นออเดอร์เอง · แมปด้วย **`fee_type` (รหัสตัวเลข) ไม่ใช่ `fee_name`** · แถวที่ไม่มี `order_no` → `marketplace_account_charges`
- **TikTok**: ⚠️ **การแมปเขียนจากสเปค OAS ยังไม่เคยเจอข้อมูลจริง** — route คืน `unmapped_fields` มาให้ดูว่ามีค่าธรรมเนียมตัวไหนตกหล่น ต้องเช็คตอนดึงชุดแรก · **ยิงทีละใบเฉพาะใบที่ยังไม่มี settlement** (2026-09-08 — ของเดิมยิงทุกใบ 30 วันซ้ำทุกเช้า) · เจอ 429 รอ 5/10 วิ ลองซ้ำก่อน ยังโดนค่อยหยุดรอบ · 429 แบบ `dependent service` = ระบบข้างใน TikTok สะดุด ไม่ใช่โควตาเรา → พักแค่ 1 นาที ไม่ขึ้นป้าย/ไม่ push · มี bulk (`/finance/202309/statements` → `/finance/202501/statements/{id}/statement_transactions` 100 ใบ/หน้า แต่ไม่มี `sku_transactions`) ค่อยย้ายเมื่อยอดถึงหลักร้อยใบ/เดือน
- **ยังไม่ทำ**: รอบโอนเงิน/กระทบยอดธนาคาร · หน้ารายงาน UI · Shopee AMS (ค่าแอดที่ไม่ได้หักจาก escrow) · แยกทิศทาง `adjustment` (ตอนนี้เก็บค่าสัมบูรณ์ คืนเงินกับเงินชดเชยอยู่ถังเดียวกัน)

