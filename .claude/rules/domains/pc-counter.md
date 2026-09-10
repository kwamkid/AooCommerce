---
paths:
  - "app/pc/**/*"
  - "app/counter-sales/**/*"
  - "app/api/counters/**/*"
  - "app/api/counter-sales/**/*"
  - "app/api/pc/**/*"
  - "lib/counter-access.ts"
  - "lib/consignment-warehouse.ts"
  - "components/customers/CustomerCounters.tsx"
  - "app/department-store/**/*"
  - "app/api/department-store/**/*"
  - "components/pos/**/*"
---
# PC Counter Sales — พนักงานประจำจุดขายในห้าง

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 🏬 PC Counter Sales (เพิ่ม 2026-07-26 — ครบทั้ง 3 Phase)

PC (พนักงานประจำจุดขายในห้าง) บันทึกยอดขายรายวันผ่านมือถือ — **overlay เท่านั้น ไม่ใช่ยอดขายจริงทางบัญชี**: ไม่สร้าง order ไม่ออกเอกสาร ไม่ตัดสต็อกจริง; DSR จาก report ห้างยังเป็นตัวจริง (ตัดสต็อก + INV/ST)

- **โครง**: `consignment_counters` (1 สาขา = 1 คลัง `warehouse_type:'consignment'`; สาขาแรก adopt คลังเดิมของลูกค้า) · `counter_assignments` (PC↔สาขา) · `counter_sales` (`report_id` null = ยังไม่เข้า DSR) · `counter_id` ใน replenishments/department_orders (ปลายทางเติมของ)
- **Role `pc`** + capabilities `counter.record` (pc+ADMIN) / `counter.manage` (ADMIN) · PC หนึ่งคน assign ได้หลายสาขา (many-to-many) · **หน่วยแทน** = `company_members.pc_all_counters` เข้าได้ทุกสาขาอัตโนมัติ — เช็คสิทธิ์ผ่าน [lib/counter-access.ts](../../../lib/counter-access.ts) เสมอ (ห้าม query `counter_assignments` ตรงๆ) · **หน่วยแทนมี "สาขาประจำ" ควบได้** (2026-08-28): assignment ไม่ถูกลบตอนเปิดหน่วยแทน — GET `/api/counters` ติด flag `is_assigned` ให้ผู้เรียกที่เป็น pc และหน้า `/pc` เลือกสาขาประจำเป็น default (ไม่ใช่สาขาแรกในลิสต์)
- **สต็อกคงเหลือฝั่ง PC** = คลังสาขา − counter_sales ที่ `report_id IS NULL` (`/api/pos/products?counter_id=` ก็หักให้)
- **ห้าม query คลัง consignment ด้วย `.single()`** — ลูกค้ามีได้หลายคลังแล้ว ใช้ [lib/consignment-warehouse.ts](../../../lib/consignment-warehouse.ts) (`getCustomerConsignmentWarehouse` = oldest, `getConsignmentDestinationWarehouse` = counter-aware) เสมอ
- **หน้า**: `/pc` (PC mobile — ห่อ `PosSaleScreen` ด้วย `enablePromotions=false`) · `/counter-sales` (admin dashboard realtime) · จัดการสาขา + assign PC + toggle หน่วยแทน อยู่ใน**หน้าลูกค้าฝากขายแต่ละราย** ([components/customers/CustomerCounters.tsx](../../../components/customers/CustomerCounters.tsx) การ์ดใน `/customers/[id]`) — หน้า `/settings/counters` เดิมถูกยุบแล้ว (2026-08-28)
- **สิ้นเดือน (DSR)**: DSR ผูก `counter_id` → confirm ตัดสต็อกคลังสาขา + stamp `report_id` ลง counter_sales (void ย้อนทั้งคู่) · ฟอร์ม DSR มีปุ่ม "ดึงยอดจาก PC" (prefill จำนวน — ราคา resolve ผ่าน GP เสมอ เพราะยอด PC เป็นเงินหน้าร้าน) + ตาราง diff PC vs report ห้าง
- **ใบวางบิลรวมทุกสาขา**: `createOrAttachStatementForDeptReport()` ใน statement-service — DSR ทุกสาขาของ customer+period เดียวกันแชร์ ST ใบเดียว; จ่าย/ย้อน/void จัดการทั้งชุดใน `/api/department-store/reports/[id]` — **ห้ามเรียก `createStatementForReport` ตรงๆ สำหรับ DSR อีก**

