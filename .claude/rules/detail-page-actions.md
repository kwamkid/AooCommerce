# Detail/Edit Page Actions — Action Buttons per Status

---

## 1. คำสั่งซื้อ (ปลีก) `/orders/[id]` (r_retail)

### Header Buttons (top right, ทุก status)
| Button | Icon | Condition | Action |
|--------|------|-----------|--------|
| Bill Online Link | Link2 | เสมอ | copy bill URL |
| Shopee Sync | RefreshCw | Shopee order | sync from Shopee API |
| Shopee รับออเดอร์ | PackageCheck | Shopee + `externalStatus === 'READY_TO_SHIP'` | เปิด ShopeeShipModal |

### จัดการ Menu (Pencil + ChevronDown)
| Label | Condition | Action |
|-------|-----------|--------|
| เปลี่ยน/คืนสินค้า | `payment_status === 'paid'` | เปิด exchange/refund modal |
| ยกเลิกบิล (red) | ไม่ใช่ marketplace + `order_status !== 'cancelled'` | สร้าง CN (ถ้า paid) / cancel (ถ้า unpaid) |

### พิมพ์ Menu (Printer + ChevronDown)
| Label | Condition | Action |
|-------|-----------|--------|
| ใบกำกับภาษี/ใบเสร็จ | status in [processing, shipping, completed] | generateOrderInvoicePdf |
| ใบออเดอร์ | เสมอ | print order slip |
| ใบจัดของ | status in [processing, shipping, completed] | generatePackingPdf |
| ใบปะหน้า | ไม่ใช่ marketplace + status in [processing, shipping] | generateShippingLabelPdf |
| ใบปะหน้า Shopee | Shopee + `externalStatus === 'PROCESSED'` | Shopee shipping document API |

### Status Management Card (left sidebar)

**Order Status Action:**
| Label | Condition | Action |
|-------|-----------|--------|
| เปลี่ยนเป็น {next} | `getNextOrderStatus()` exists + status ไม่ใช่ new/ready_to_ship/processing | advance to next status |

**Payment Actions:**
| Label | Color | Condition | Action |
|-------|-------|-----------|--------|
| บันทึกชำระเงิน | green | `payment_status === 'pending'` + `order_status !== 'new'` | เปิด PaymentModal |
| ยืนยันการชำระเงิน | green | `payment_status === 'verifying'` + มี payment record | approve slip → paid |
| ปฏิเสธ | red border | `payment_status === 'verifying'` + มี payment record | reject slip → pending |

### Inline Edit Buttons
| Button | Condition | Action |
|--------|-----------|--------|
| แก้ไขที่อยู่ (pencil) | status in [new, ready_to_ship] | toggle delivery editing mode |
| แก้ไขขนส่ง (pencil) | มี shipping carrier/tracking | เปิด ShipModal (pre-filled) |

---

## 2. คำสั่งซื้อ (ปลีก) — Edit Mode `/orders/[id]/edit` (OrderForm)

### Form Buttons (bottom)
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| ยกเลิก | gray border | ไม่ใช่ read-only + มีสินค้า | handleCancel |
| บันทึกคำสั่งซื้อ / บันทึกการแก้ไข | orange (#F4511E) | ไม่ใช่ read-only + มีสินค้า | doSave |

### Address Conflict Dialog (popup เมื่อที่อยู่ไม่ตรง)
| Button | Action |
|--------|--------|
| อัพเดท... | doSave('update') |
| บันทึกเป็นที่อยู่ใหม่ | doSave('new') |
| ยกเลิก | close dialog |

---

## 3. คำสั่งซื้อตัวแทน `/dealer-orders/[id]` (w_cash, w_credit)

### OrderStatusBar (top)
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| จัดส่งแล้ว / เสร็จสิ้น | green | `order_status === 'new'` หรือ `'processing'` | → completed (with ship) |
| ยกเลิกออเดอร์ | red border | status ไม่ใช่ completed/cancelled | confirm → cancelled |

### OrderPrintButtons
แสดงปุ่มพิมพ์ตาม flow:
| Document | Condition |
|----------|-----------|
| TAX (ใบกำกับภาษี) | status in [processing, shipping, completed] |
| DN (ใบส่งสินค้า) | status in [shipping, completed] |
| Packing (ใบจัดของ) | status in [processing, shipping, completed] |
| Label (ใบปะหน้า) | status in [processing, shipping] |

### Form Buttons (create/edit mode)
| Button | Color | Action |
|--------|-------|--------|
| ยกเลิก | gray | cancel |
| บันทึก | orange | save |

---

## 4. ออเดอร์ห้าง `/department-orders/[id]` (d_consign)

### Status-based Action Buttons

**draft:**
| Button | Color | Action |
|--------|-------|--------|
| ยกเลิก | ghost (gray) | → cancelled |
| ยืนยัน | blue | → confirmed |

**confirmed:**
| Button | Color | Action |
|--------|-------|--------|
| ยกเลิก | ghost | → cancelled |
| จัดส่งแล้ว | primary | เปิด ShipModal → shipped + auto TAX + DN |

**shipped:**
| Button | Color | Action |
|--------|-------|--------|
| ออก Tax Invoice | primary | เปิด invoice modal (กรอก invoice number + date) |

**invoiced:**
| Button | Color | Action |
|--------|-------|--------|
| บันทึกรับเงิน | primary | → paid |

**paid:**
| Display | Color |
|---------|-------|
| ✓ สำเร็จ (read-only) | green |

---

## 5. เติมของตัวแทน `/replenishments/new?id=xxx` (c_consign, d_consign)

### Action Buttons (view mode)
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| จัดส่งแล้ว | orange | `status === 'pending'` หรือ `'partial_received'` | เปิด ShipModal → shipped + auto DN |
| พิมพ์ใบเติมของ | gray border | view mode | generateReplenishmentPdf |
| Copy Token | — | portal enabled | copy receive link |

### Ship Modal Fields
| Field | Type | Condition |
|-------|------|-----------|
| วิธีจัดส่ง | dropdown | เสมอ (own_vehicle / courier / lalamove) |
| ขนส่ง | dropdown | วิธี = courier |
| เลข tracking | text | วิธี = courier |
| หมายเหตุ | textarea | เสมอ |

---

## 6. รายงานฝากขาย `/consignment/reports/[id]` (c_consign)

### Header Buttons
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| พิมพ์ใบแจ้งหนี้ | gray border | status ไม่ใช่ draft/received/cancelled | generateConsignmentReportPdf |
| พิมพ์ใบวางบิล | gray border | `statement_id` exists | generateStatementPdf |
| ดูใบวางบิล | indigo link | `statement_id` exists | navigate to `/statements/{id}` |
| ยกเลิกออเดอร์ | red border | `status === 'draft'` | cancel |

### Focus Action (prominent)
| Button | Class | Condition | Action |
|--------|-------|-----------|--------|
| พร้อมวางบิล | `btn-focus-action green` | status in [draft, received] + มีสินค้า | deduct stock + auto TAX + ST + auto print |
| บันทึกแก้ไข | `btn-primary` | isEditable (draft/received) + มีสินค้า | save changes |

### Editable States
- **draft, received** → สามารถแก้ไขรายการสินค้า, หมายเหตุ, วันที่ได้
- **invoiced, billed, paid** → read-only

---

## 7. รายงานห้าง `/department-store/reports/[id]` (d_consign)

### Header Buttons
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| พิมพ์ใบแจ้งหนี้ | gray border | status ไม่ใช่ cancelled | generateDeptStorePdf |
| พิมพ์ใบวางบิล | gray border | `statement_id` exists | generateStatementPdf |
| ดูใบวางบิล | indigo link | `statement_id` exists | navigate to `/statements/{id}` |

### Action Buttons
| Button | Color | Condition | Action |
|--------|-------|-----------|--------|
| บันทึก | primary | `status === 'invoiced'` (editable) | save changes |
| ยกเลิก | red border | `status === 'invoiced'` | cancel report |

### Editable States
- **invoiced** → สามารถแก้ไขรายการ, หมายเหตุได้
- **billed, paid** → read-only

---

## Common Patterns (ทุกหน้า)

### Read-only Guard
เมื่อ order/report อยู่ใน status สุดท้าย (completed, cancelled, paid) → ซ่อนปุ่ม action ทั้งหมด ยกเว้นปุ่มพิมพ์

### Marketplace Guard
Shopee/TikTok/LINE Shopping orders → ซ่อน: edit, cancel, duplicate, copy-link, manual ship

### Loading States
ทุกปุ่มแสดง Loader2 (spinning) เมื่อ `*Loading` หรือ `*Submitting` = true

### Confirmation Dialogs
ใช้ `ConfirmDialog` สำหรับ: cancel, void, reject, delete — ห้ามใช้ native `confirm()`
