---
paths:
  - "lib/delivery.ts"
  - "lib/delivery-server.ts"
  - "lib/features.ts"
  - "app/settings/delivery/**/*"
  - "app/settings/features/**/*"
  - "app/api/delivery-zones/**/*"
  - "app/api/delivery-slots/**/*"
  - "components/orders/OrderForm.tsx"
  - "app/api/storefront/**/*"
---
# พื้นที่จัดส่ง + ช่วงเวลาส่ง (Delivery Zones + Slots)

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 🚚 Delivery Zones + Slots (เพิ่ม 2026-08-17 — ฐานของ storefront checkout)

พื้นที่จัดส่ง (โซนค่าส่ง) + ช่วงเวลาส่ง สำหรับธุรกิจ delivery (aDay Fresh) — feature flags `delivery_zone` (**อิสระ** — ร้าน e-commerce ที่เปิดบิลเองก็ใช้คิดค่าส่งตามพื้นที่ได้ · ไม่แตะออเดอร์ marketplace ที่มีค่าส่งมาแล้ว) + `delivery_slot` (**ต้องเปิด `delivery_date` ก่อน** — UI ล็อก + API clamp)
- ⛔ **คำเรียกโซนค่าส่งในหน้าจอคือ "พื้นที่จัดส่ง" — ห้ามใช้ "จุดส่ง"** (เปลี่ยน 2026-09-09) เพราะ "จุดส่ง" ในรายงานส่งของแปลว่า *1 บิล/1 ที่อยู่* (5 จุดส่ง = 5 บิล) คนละความหมาย เจ้าของเองยังจำไม่ได้ว่าการ์ด "จุดส่ง / โซนค่าส่ง" คืออะไร
- **`delivery_date` และ `delivery_slot` เป็น `{ enabled, required }` ทั้งคู่** (2026-09-09 — `delivery_slot` เคยเป็น boolean · `parseFeatures()` อ่านค่าเก่าเป็น `{enabled, required:false}` ไม่ต้อง migrate) · หน้า Feature เสริมยุบเป็นการ์ดเดียว "การจัดส่งของร้าน" 3 แถว (วันที่ส่งของ · ช่วงเวลาส่ง · พื้นที่จัดส่ง+ค่าส่ง) แต่ละแถวเลือก **ไม่แสดง / แสดง / บังคับกรอก** ด้วย `FilterChips` (พื้นที่จัดส่งไม่มี "บังคับ" — ระบบจับคู่จากที่อยู่ให้เอง) · กติกาอยู่ที่ `clampDeliveryFlags()` ใน [lib/features.ts](../../../lib/features.ts) ใช้ทั้งหน้าตั้งค่าและ API PUT: ปิดวันส่ง ⇒ ช่วงเวลาปิดตาม · ช่วงเวลาบังคับ ⇒ วันส่งบังคับ · "บังคับกรอก" ของช่วงเวลามีผลทั้ง OrderForm (ไม่มี "ทั้งวัน" + บล็อกบันทึก) และ checkout หน้าร้าน (client + API 400)

- **Tables**: `delivery_zones` (พื้นที่ provinces/districts/postcodes + `fee_type: fixed|lalamove` + `fee`/`free_over`/`lead_minutes` + `sort_order` = ลำดับจับคู่) · `delivery_slots` (`start_time`-`end_time` เป็น**ช่วง 2-3 ชม. ห้ามเวลาเป๊ะ** + `days_of_week` + `capacity` + `cutoff_minutes`) · `delivery_zone_slots` (โซนไหนใช้รอบไหน — **ไม่มี row ของ zone = ใช้ได้ทุกรอบ**)
- **Logic กลาง** [lib/delivery.ts](../../../lib/delivery.ts) (client-safe, pure): `resolveZone()` — ไล่ตาม sort_order ตัวแรกที่ match ชนะ เช็ค postcode → district → province; ไม่ match = **ไม่รับส่ง ต้องบอกชัด ห้ามเงียบ** · `resolveDeliveryFee()` — fixed คืน fee (0 เมื่อยอด ≥ free_over), lalamove คืน `needsQuote: true` (กรอกยอด quote เอง — API integration ยังไม่ทำ) · `getSlotAvailability()` — **เวลาคุมที่ `delivery_zones.lead_minutes` ที่เดียว** (= เวลาเตรียม+จัดส่งถึงโซนนั้น นับจากตอนกดสั่ง) · เกณฑ์คือ **"ส่งทันภายในรอบไหม" ไม่ใช่ "ทันก่อนรอบเริ่มไหม"**: `now + lead < slot END` — เช่น กทม. lead 2 ชม. สั่ง 08:00 รอบ 09:00-12:00 → ของถึง 10:00 ยังอยู่ในรอบ = เลือกได้ · lead หน่วยนาทีจึงคุมข้ามวันได้ในค่าเดียว (ต่างจังหวัด 1440 → รอบวันนี้ตกหมดเอง) · **`slots.cutoff_minutes` เลิกใช้แล้ว** (default 0, ไม่มีใน UI) — ห้ามเอากลับมาเป็นเกณฑ์เวลาที่สอง / day / capacity / zone×slot;
- **`getSlotWindow()` — แสดง/บันทึกช่วงที่ส่งได้จริง ไม่ใช่ช่วงเต็มของรอบ**: สั่ง 08:00 lead 2 ชม. รอบ 09:00-12:00 → แสดง **10:00-12:00** (ปัดขึ้นครึ่งชั่วโมงเสมอ ไม่สัญญาเร็วกว่าที่ทำได้) · `orders.delivery_slot_label/start` snapshot ค่านี้ = คำสัญญาที่ลูกค้าเห็นตอนกดสั่ง **ช่วงที่เลือกไม่ได้แสดงจาง + บอกเหตุผล ห้ามซ่อน**
- **Snapshot ลง orders เสมอ** (pattern เดียวกับ tax invoice): `delivery_zone_id/label` + `delivery_slot_id/label/start/end` ผ่าน `resolveDeliverySnapshot()` ใน [lib/delivery-server.ts](../../../lib/delivery-server.ts) (validate company ownership) — ค่าส่งลง `orders.shipping_fee` **เดิม** ไม่มี column ใหม่
- **API**: `/api/delivery-zones` + `/api/delivery-slots` (CRUD, capability `masterdata.delivery`) — slots รองรับ `?date=YYYY-MM-DD` คืน `booked_count` ต่อ slot (เช็ค capacity) · DELETE = hard delete ถ้าไม่มี order อ้าง, มี → soft-disable
- **UI**: [/settings/delivery](../../../app/settings/delivery/page.tsx) (2 tabs, ListRow + reorder = ลำดับจับคู่โซน) · OrderForm auto-resolve โซนจากที่อยู่ → auto-fill ค่าส่ง (**ไม่ทับค่าที่ staff แก้เอง** — เช็คผ่าน `lastAppliedZoneFeeRef`) + slot chips ใต้วันที่ส่ง · order detail แสดง badge โซน+รอบจาก snapshot

