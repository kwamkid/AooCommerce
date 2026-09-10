---
paths:
  - "lib/beam/**/*"
  - "app/api/beam/**/*"
  - "app/bills/**/*"
  - "app/api/bills/**/*"
  - "app/settings/payment-channels/**/*"
---
# Beam Checkout — webhook + reconcile + ค่าธรรมเนียม

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 💳 Beam Checkout (บิลออนไลน์จ่ายบัตร/QR) — webhook + reconcile (แก้ 2026-09-06)

- **ทางเข้าเงินมี 2 ทางเสมอ**: webhook `/api/beam/webhook` (Beam push ทันที) **และ** reconcile ถาม Beam เอง ([lib/beam/settle.ts](../../../lib/beam/settle.ts)) — หน้าบิลเรียก `POST /api/beam/reconcile {order_id}` ทันทีที่ลูกค้ากลับมาจาก Beam (`?payment=success`) · cron ตัวเฝ้าเรียก `reconcilePendingBeamPayments()` ทุก 15 นาที (แถว pending ≤3 วัน) · **ห้ามพึ่ง webhook อย่างเดียว** — มันขึ้นกับการตั้งค่าใน Beam Lighthouse ซึ่งเงียบมาทั้งเดือนโดยไม่มีใครรู้
- **"เงินเข้า → ออเดอร์ชำระแล้ว" ทำที่ `settleGatewayPayment()` ที่เดียว** (webhook + reconcile ใช้ร่วม) — idempotent · ออเดอร์ที่ร้านบันทึกชำระมือไปแล้ว → ปิดแถว gateway เป็น cancelled + จดว่า Beam ตัดเงินจริง ไม่สร้างยอดซ้ำ
- **merchant เดียวใช้ได้หลายบริษัท** — webhook ตรวจลายเซ็นด้วย HMAC key ของบริษัทไหนก็ได้ที่ตั้ง merchant นั้น (webhook ต่อ merchant มีตัวเดียว key จึงตัวเดียวกัน ตั้งไว้ที่บริษัทเดียวพอ) แล้ว**หาบริษัทจากออเดอร์** (referenceId/ลิงก์) ในขอบเขตบริษัทที่ใช้ merchant นี้ — ห้ามผูกบริษัทกับ config ที่ key ตรง (7 ก.ย. 2026)
- **webhook เลือก config จาก `merchantId` ใน body** · ตรวจลายเซ็นด้วย `payment_channels.config.webhook_secret` = **HMAC key ที่ Lighthouse ให้ตอนสร้าง webhook (คนละตัวกับ API key)** · header `X-Beam-Signature` (base64 HMAC-SHA256 ของ body ดิบ) + `X-Beam-Event` · event ที่ใช้ `payment_link.paid` (`{paymentLinkId, merchantId, status, order.referenceId}`) และ `charge.succeeded` (`source/sourceId`)
- **ทุกทางที่ webhook ปฏิเสธต้องลง `integration_logs` (integration `beam`) พร้อมบอกวิธีแก้** — เคยตอบ 401 เงียบ ๆ 3 รอบจนไล่ไม่เจอ (ดู [fix-bug.md](../../../fix-bug.md) 2026-09-06) · watchdog issue `beam_webhook_silent` เตือนเมื่อระบบต้อง settle ผ่าน reconcile
- **event ที่รองรับ** (ติ๊กใน Lighthouse ตามรูปในหน้าตั้งค่า): `payment_link.paid` / `charge.succeeded` = จ่ายสำเร็จ → settle · `charge.failed` (+ `card_authorization.failed|canceled`) = จ่ายไม่ผ่าน → แถว gateway ติดป้าย FAILED (คง pending ลูกค้าลองใหม่ได้) + push ร้าน · `refund.succeeded|failed` = Beam คืนเงิน → ป้าย REFUNDED + push ร้าน **ไม่เปลี่ยนสถานะออเดอร์เอง** (ใบลดหนี้/คืนสต็อกเป็นเรื่องที่ร้านตัดสินใจ) · ทุกอย่างขึ้นบนหน้าออเดอร์ผ่าน `summarizeBeamRaw()` ([lib/beam/labels.ts](../../../lib/beam/labels.ts)) ที่อ่านจาก `gateway_raw_response` (เก็บ `last_failure` / `refund` ซ้อนไว้ในก้อนเดิม) · event อื่น (bolt_intent · transaction.created · purchase V0 = API รุ่นเก่า) แค่ log
- **ค่าธรรมเนียม → `marketplace_settlements` platform `beam`** ([lib/beam/transactions.ts](../../../lib/beam/transactions.ts)) — 1 แถว/ออเดอร์ (account null): `gross_sales` = ยอดตัดเงิน · `payment_fee` = ค่าธรรมเนียม + VAT ของค่าธรรมเนียม (จริง: RATE 2.5% + VAT 7% ของ fee ทั้งบัตรและ QR) · คืนเงิน → `adjustment` และหัก `net_payout` · บรรทัดย่อย `BEAM_FEE`/`BEAM_REFUND` เก็บ vat แยก · มาได้ 2 ทาง: webhook `transaction.created` **และ** `GET /api/v1/transactions?referenceId=<order.id>` (ตัวกรองนี้ใช้ได้จริง · `transactionType` กรองไม่ได้) ตอน settle/คืนเงิน + `backfillBeamSettlements()` ใน cron sweep · **referenceId ที่ไม่ใช่ UUID = ระบบอื่นที่ใช้ merchant เดียวกัน (aDay Fresh มี 1,400+ ใบแบบ ONL…) ข้ามเงียบ ๆ ห้าม log**
- **วงจรชีวิตลิงก์** — ลิงก์ Beam **ไม่หมดอายุเอง** จึงตั้ง `expiresAt` 30 วันตอนสร้าง และ `closeBeamLinksForOrder()` ปิด**ที่ Beam** (`PATCH …/disable`) ทุกครั้งที่ลิงก์ไม่ควรจ่ายได้แล้ว: สร้างลิงก์ใหม่ · จ่ายผ่านลิงก์อื่นสำเร็จ · ออเดอร์ชำระทางอื่น (`/api/orders` PUT payment_status paid) · ออเดอร์ยกเลิก — ปิดแค่ใน DB ไม่พอ ลูกค้าที่ค้างหน้าจอเก่าจ่ายซ้ำได้
- **เทียบยอดที่ตัดจริงกับยอดบิลเสมอ** (`paidAmount` ใน settle) — ไม่ครบ = แถวชำระบันทึกยอดจริง ออเดอร์**ไม่** paid + push `settled_partial` · เกิน = paid + push · ป้ายแดงบนหน้าออเดอร์ · เบอร์ที่ลูกค้ากรอกที่ Beam (`customer.primaryPhone`) เติมให้ออเดอร์/ลูกค้าที่ยังไม่มีเบอร์ ไม่ทับของเดิม
- เรียก Beam API ผ่าน [lib/beam/client.ts](../../../lib/beam/client.ts) เท่านั้น (`loadBeamGateways` · `getBeamPaymentLink` · `getBeamPaymentLinkCharges`) — ห้ามประกอบ Basic auth เองใน route
- เอกสาร: https://docs.beamcheckout.com (Payment Links API · Webhook Notifications)

