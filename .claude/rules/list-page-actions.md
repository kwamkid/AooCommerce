# List Page Actions — Focus Action + ActionMenu per Status

ทุกหน้า list ใช้ pattern เดียวกัน:
- **Focus Action** = ปุ่มหลัก 1 ปุ่ม (สีตาม action) แสดงใน table row / mobile card
- **ActionMenu** = dropdown menu (three-dot) สำหรับ action รอง
- ใช้ `getFocusAction()` + `getMenuItems()` pattern

---

## 1. คำสั่งซื้อ `/orders` (r_retail)

### Tab: new
| Type | Label | Color | Condition | Action |
|------|-------|-------|-----------|--------|
| Focus | บันทึกชำระ | green | `payment_status === 'pending'` + ไม่ใช่ credit + ไม่ใช่ marketplace | เปิด PaymentModal |
| Focus | รับออเดอร์ | indigo | credit flow (w_credit, c_consign) + ไม่ใช่ marketplace | new → processing |

### Tab: ready_to_ship
**Subtabs**: รอตรวจสลิป / รอกดรับ / พักไว้

| Type | Label | Color | Condition | Action |
|------|-------|-------|-----------|--------|
| Focus | ดูสลิป | purple border | subtab verifying + `payment_status === 'verifying'` | แสดงรูป slip |
| Focus | ยืนยัน | green | subtab verifying + `payment_status === 'verifying'` | approve slip → paid |
| Focus | รับออเดอร์ | orange | subtab ปกติ (ไม่ใช่ verifying/on_hold) | Shopee: sync ship / Manual: → processing |
| Focus | แบ่งกล่อง | gray border | Shopee หรือ can_split + ยังไม่ split + ไม่ on_hold | เปิด SplitParcelModal |
| Focus | กลับมา | green | `fulfillment_status === 'on_hold'` | re-activate order |
| Menu | ปฏิเสธสลิป | — | subtab verifying | reject slip → pending |
| Menu | ยกเลิกแบ่งกล่อง | — | `is_split === true` | revert split |

### Tab: processing
**Subtabs**: แยกตาม carrier + พักไว้

| Type | Label | Color | Condition | Action |
|------|-------|-------|-----------|--------|
| Focus | บันทึกชำระ | green | `payment_status === 'pending'` + ไม่ใช่ marketplace + ไม่ on_hold | เปิด PaymentModal |
| Focus | จัดส่งแล้ว | amber | ไม่ on_hold + ไม่ใช่ marketplace | เปิด ShipModal |
| Focus | กลับมา | green | `fulfillment_status === 'on_hold'` | re-activate |

### Tab: shipping
| Type | Label | Color | Condition | Action |
|------|-------|-------|-----------|--------|
| Focus | สำเร็จ | green | ไม่ใช่ marketplace | shipping → completed |

### ActionMenu (ทุก tab)

**Shipping Documents** (processing/shipping/completed):
| Label | Condition |
|-------|-----------|
| ใบจัดของ | status in [processing, shipping, completed] |
| ใบปะหน้า | status in [processing, shipping] + ไม่ใช่ marketplace |
| ใบปะหน้า {Platform} | status in [processing, shipping] + marketplace |

**Financial Documents**:
| Label | Condition |
|-------|-----------|
| ใบแจ้งหนี้ | `payment_status !== 'paid'` |
| ใบกำกับอย่างย่อ | paid + VAT registered + ยังไม่ออก tax |
| ออก ใบกำกับแบบเต็ม (orange) | paid + VAT registered + ยังไม่ออก tax |
| ใบกำกับแบบเต็ม | paid + VAT registered + ออก tax แล้ว |
| ใบเสร็จรับเงิน | paid + ไม่ VAT registered |

**Other Actions** (manual orders only):
| Label | Condition |
|-------|-----------|
| คัดลอกลิงก์ | ไม่ใช่ marketplace |
| แก้ไข | `order_status !== 'cancelled'` |
| สั่งซ้ำ | ไม่ใช่ tab ready_to_ship/processing/shipping + ไม่ใช่ marketplace |
| พักไว้ | `fulfillment_status !== 'on_hold'` |
| ยกเลิก | status ไม่ใช่ cancelled/completed + ไม่ใช่ marketplace |
| ลบ | `order_status === 'cancelled'` + owner/admin |

---

## 2. คำสั่งซื้อตัวแทน `/dealer-orders` (w_cash, w_credit)

### Focus Action
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| ยืนยันชำระ | green | `order_status === 'new'` + `payment_status === 'pending'` | เปิด PaymentModal |
| คอนเฟิร์มออเดอร์ | indigo | `order_status === 'ready_to_ship'` | → processing |
| จัดส่ง | amber | `order_status === 'processing'` | เปิด ShipModal → completed |
| บันทึกชำระ | green | `order_status === 'completed'` + `flow_type === 'w_credit'` + `payment_status === 'pending'` | เปิด PaymentModal |

### ActionMenu
**เมื่อ status in [processing, shipping, completed]:**
| Label | Action |
|-------|--------|
| ใบกำกับภาษี/ใบแจ้งหนี้ | print TAX |
| ใบส่งสินค้า | print DN |
| พิมพ์ทั้งหมด (orange, bold) | print TAX + DN merged |
| ใบจัดของ | print packing (divider) |
| ใบปะหน้า | print label |

**เมื่อ status in [new, ready_to_ship, processing]:**
| Label | Action |
|-------|--------|
| ยกเลิกออเดอร์ (red) | cancel order (divider) |

---

## 3. ออเดอร์ห้าง `/department-orders` (d_consign)

**ไม่มี focus action / ActionMenu** — เป็น list-only view, click เข้า detail page

---

## 4. เติมของตัวแทน `/replenishments` (c_consign, d_consign)

### Focus Action
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| จัดส่ง | amber | `status === 'pending'` | เปิด ShipModal → shipped + auto DN |
| ยืนยัน | blue | `status === 'pending_confirm'` | navigate to edit page |

### Secondary Button
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| ลิงก์รับของ | amber border | `status === 'shipped'` + `receive_token` exists | copy receive link |

### ActionMenu
**เมื่อ status === 'pending':**
| Label | Action |
|-------|--------|
| ใบจัดของ (dot indicator) | print packing |
| ใบปะหน้า (dot indicator) | print label |
| พิมพ์ทั้งหมด (orange, bold) | print all (skipDn) |
| ยกเลิก (red, divider) | cancel |

**เมื่อ status in [shipped, received, partial_received]:**
| Label | Action |
|-------|--------|
| ใบส่งของ (DN) (dot indicator) | print DN |
| ใบปะหน้า (dot indicator) | print label |

**เมื่อ status === 'shipped' (เพิ่ม):**
| Label | Action |
|-------|--------|
| แก้ไขขนส่ง (divider) | edit shipping info |

> **Dot indicator** = จุดเขียวถ้าเคยพิมพ์แล้ว (tracked by `printed_*_at` columns)

---

## 5. รายงานฝากขาย `/consignment/reports` (c_consign)

### Focus Action
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| ยืนยัน | green | `status === 'received'` | confirm → invoiced + auto TAX + ST |
| ลูกค้าชำระแล้ว | indigo | `status === 'overdue'` + `statement_id` exists | record payment → paid + auto REC |
| ✓ (disabled) | green | `status === 'paid'` | — (แสดงว่าเสร็จแล้ว) |

### ActionMenu

**draft:**
| Label | Action |
|-------|--------|
| คัดลอกลิงก์ตัวแทน | copy portal link (if report_token) |
| ยกเลิกรายงาน (red) | cancel |

**invoiced:**
| Label | Action |
|-------|--------|
| ใบกำกับภาษี/ใบแจ้งหนี้ | print invoice |
| ยกเลิก (Void) (red) | void doc + report |

**billed / overdue:**
| Label | Action |
|-------|--------|
| ใบกำกับภาษี/ใบแจ้งหนี้ | print invoice |
| ใบวางบิล | print statement (if statement_id) |
| พิมพ์ทั้งหมด | merge invoice + statement (if statement_id) |
| ลูกค้าชำระแล้ว (divider) | record payment |
| ยกเลิก (Void) (red) | void |

**paid:**
| Label | Action |
|-------|--------|
| ใบกำกับภาษี/ใบแจ้งหนี้ | print invoice |
| ใบวางบิล | print statement (if statement_id) |
| พิมพ์ทั้งหมด | merge PDF (if statement_id) |
| ใบเสร็จรับเงิน | print receipt (if statement_id) |
| ยกเลิกการชำระ (red) | reverse payment |

---

## 6. รายงานห้าง `/department-store/reports` (d_consign)

### Focus Action
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| ลูกค้าชำระแล้ว | indigo | `status === 'overdue'` + `statement_id` exists | record payment → paid + auto TAX + REC |
| ✓ (disabled) | green | `status === 'paid'` | — |

### ActionMenu

**invoiced:**
| Label | Action |
|-------|--------|
| ใบแจ้งหนี้ | print invoice |
| ยกเลิก (red) | cancel |

**billed / overdue:**
| Label | Action |
|-------|--------|
| ใบแจ้งหนี้ | print invoice |
| ใบวางบิล | print statement (if statement_id) |
| พิมพ์ทั้งหมด | merge PDF (if statement_id) |
| ลูกค้าชำระแล้ว (divider) | record payment |
| ยกเลิกการชำระ (red) | reverse payment (if statement_id) |

**paid:**
| Label | Action |
|-------|--------|
| ใบกำกับภาษี/ใบเสร็จ | print invoice |
| ใบวางบิล | print statement (if statement_id) |
| พิมพ์ทั้งหมด | merge PDF (if statement_id) |
| ยกเลิกการชำระ (red) | reverse payment (if statement_id) |

---

## ActionMenu — สไตล์กลาง + เมนูไหนได้ highlight

หน้าตาเมนูทั้งหมดอยู่ที่ **`.action-menu-item`** ใน [globals.css](../../app/globals.css) ที่เดียว
— หน้าเรียก**ห้ามส่ง `className` สีอะไรมาอีก** (ของเดิมส่งคลาสปุ่มไอคอน `p-1.5 text-gray-400 …`
ติดมาจากตอนยังเป็นปุ่มในแถว ทำให้ทุกเมนูตัวหนังสือจางเหมือนกดไม่ได้ · ดู fix-bug.md 2026-08-30)

| ระดับ | ใส่ยังไง | ใช้กับ |
|---|---|---|
| **สำคัญสุด** (สีแบรนด์ + ตัวหนา) | `primary: true` — ปกติ 1 รายการ (ได้มากสุด 2 ถ้าเป็นชุดที่ทำคู่กัน) | **งานของสถานะนั้น**: แท็บที่ต้องจัดส่ง = `ใบจัดของ` + `ใบปะหน้า` (คนแพ็คเปิดเมนูมาเพื่อสองใบนี้) · แท็บอื่น = `พิมพ์ทั้งหมด` / `ออกใบกำกับแบบเต็ม` |
| ปกติ | ไม่ต้องใส่อะไร | เปิดดู/พิมพ์ซ้ำของที่มีอยู่ + งานทั่วไป: ใบจัดของ · ใบปะหน้า · ใบกำกับอย่างย่อ · แก้ไข · สั่งซ้ำ · คัดลอกลิงก์ · พักไว้ |
| อันตราย (แดง) | `danger: true` | ยกเลิก · ลบ · void · ยกเลิกการชำระ |
| กดไม่ได้ (จาง) | `disabled: true` | ระหว่างกำลังสร้างไฟล์ ฯลฯ — **สีจางสงวนไว้ให้กรณีนี้เท่านั้น** |

- ไอคอนไม่ต้องใส่สี — รับสีจากระดับของเมนูเอง (ยกเว้นโลโก้แพลตฟอร์มที่เป็นสีแบรนด์ของมัน)
- เมนูที่มีแต่ "เปิดดู/พิมพ์" ล้วน ๆ **ไม่ต้องมี primary** ก็ได้ — อย่าเน้นเพื่อให้มีเน้น
- **เน้นตามสถานะ ไม่ใช่ตามชนิดเอกสาร** — ใบเดียวกันเป็น primary ในแท็บหนึ่งและเป็นปกติในอีกแท็บได้
  (ใบจัดของเด่นตอน "ที่ต้องจัดส่ง" แต่พอ "กำลังส่ง/สำเร็จ" ก็แค่พิมพ์ซ้ำ)

## Focus Action Button Colors (btn-focus-action)

| Class | สี | ใช้สำหรับ |
|-------|-----|----------|
| `btn-focus-action` (default) | orange | รับออเดอร์, default action |
| `btn-focus-action.green` | green | ยืนยันชำระ, สำเร็จ, ยืนยันสลิป, พร้อมวางบิล |
| `btn-focus-action.indigo` | indigo | รับออเดอร์ (credit), ลูกค้าชำระแล้ว |
| `btn-focus-action.amber` | amber | จัดส่ง |
