# Bill Template Design Specification

## Shared Design System

| Element | Spec |
|---|---|
| Library | pdfMake |
| Font | IBMPlexSansThai (Regular + Bold), loaded from `/fonts/` via base64 |
| Page | A4 (595.28 x 841.89 pt) |
| Margins | `[40, 40, 40, 110]` (left, top, right, bottom) — 110pt bottom สำหรับ signature footer |
| Ink-saving | ไม่มี background fill, สีเฉพาะ corner triangle + title + label |

---

## Layout Structure (5 Sections)

### Section 1 — Header

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo 40x40]  Company Name (bold, 11pt)           ชื่อเอกสาร  │
│                Address line (gray, 10pt)            (24pt, bold) │
│                Tax ID: xxx  Tel: xxx               ┌───────────┐ │
│                                                    │ เลขที่  xxx│ │
│                                                    │ วันที่  xxx│ │
│                                                    │ สถานะ  xxx│ │
│                                                    │ ผู้xxx  xxx│ │
│                                                    └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- 2 columns, columnGap: 16
- Left (`*`): Logo + company info stack
- Right (230pt): Title right-aligned + Info box table
- Info box: widths `[45, '*']`, hLine top+bottom only (0.5px #ccc), no vLine, padding 6pt first/last row
- Title fontSize: 24pt (ปกติ), 18pt (ชื่อยาว), 16pt (ชื่อยาวมาก)

### Section 2 — Sub-header (varies by doc type)

Customer info / Warehouse info / Supplier info — 2 columns or single line

### Section 3 — Item Table

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 1px #333
  #   รายละเอียด          [Barcode]  จำนวน  ราคา  รวม
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 1px #333
  1   Product Name                    2     100   200
      SKU: xxx (gray 9pt)
──────────────────────────────────────────────────  ← 0.5px #e5e7eb
  2   Product Name                    1     150   150
──────────────────────────────────────────────────  ← 0.5px #e5e7eb
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 1px #333
```

- No vertical lines
- Product name: 10-11pt regular, subtitle gray 9pt
- Barcode: JsBarcode CODE128, image 90x30 + value text 7pt (auto-hide column if no data)
- Padding: 5pt all sides

### Section 4 — Summary + Notes

```
┌──────────────────────┬────────────────────────┐
│  หมายเหตุ:           │    จำนวนรายการ    X    │
│  (10pt gray)         │    ยอดรวมสินค้า   ฿xxx │
│                      │    ส่วนลด         ฿xxx │
│  [QR Code 50x50]     │    ────────────────     │
│  (if applicable)     │    VAT 7%         ฿xxx │
│                      │    ยอดรวมสุทธิ   ฿xxx  │ ← bold 12pt, theme color
└──────────────────────┴────────────────────────┘
```

- 2 columns: left = notes/QR, right = summary table (260pt)
- Summary widths: `['*', 60-100]`, no table lines
- Grand total: bold 12pt, theme primary color

### Section 5 — Signature Footer (absolute bottom)

```

  ในนาม [Company Name]          ในนาม [Company Name]


  ________________________    ________________________
  [Left Label]     วันที่    [Right Label]     วันที่
```

- 2 sides, 30pt gap between
- Each: company label → 18pt spacer → signature line 140pt + date line 80pt
- Lines: 0.5px #ccc, fontSize 10

---

## Corner Triangle (Background)

```
         ┌──────────────────────────────────┐
         │                            ◣     │ ← 50pt filled triangle
         │                         (8pt     │    at top-right corner
         │                         offset)  │
```

- Canvas polyline, 3 points, 8pt inset from page edges
- Size: 50pt, color: theme primary, closePath filled

---

## ต้นฉบับ / สำเนา (Original / Copy)

- Page 1: "(ต้นฉบับ)" label — green #15803d, 9pt bold, absolutePosition {x:40, y:30}
- Page 2: "(สำเนา)" label — gray #6b7280, 9pt bold, same position
- Separated by pageBreak

---

## Color Palette

| Color | Hex | Usage |
|---|---|---|
| Green | `#15803d` | paid, receive, ต้นฉบับ |
| Dark Slate | `#1e293b` | unpaid, issue |
| Amber | `#b45309` | transfer, consignment supplier |
| Red | `#dc2626` | credit note, void watermark |
| Indigo | `#4f46e5` | statement |
| Blue | `#2563eb` | PO, supplier report |
| Orange | `#F4511E` | consignment report, replenishment, brand accent |
| Gray | `#6b7280` | สำเนา label |
| Table header line | `#333333` | 1px |
| Table row line | `#e5e7eb` | 0.5px |
| Info box border | `#cccccc` | 0.5px |

---

## Document Types & Themes

| Document | Thai Name | Theme Color | Signature Left | Signature Right | Orig/Copy |
|---|---|---|---|---|---|
| Order Invoice | ใบแจ้งหนี้ | `#1e293b` | ผู้ออกเอกสาร | ผู้รับสินค้า | Yes |
| Tax Invoice/Receipt | ใบกำกับภาษี/ใบเสร็จ | `#15803d` | ผู้ออกเอกสาร | ผู้รับสินค้า | Yes |
| Abbreviated Invoice | ใบกำกับอย่างย่อ | `#15803d` | - | - | No (2/page) |
| Full Tax Invoice | ใบกำกับภาษีเต็ม | `#15803d` | ผู้ออกเอกสาร | ผู้รับสินค้า | Yes |
| Pick List | ใบหยิบของ | `#6366f1` | - | - | No |
| Packing Slip | ใบจัดของ | `#6366f1` | - | - | No (2/page) |
| Shipping Label | ใบปะหน้า | black/gray | - | - | No |
| Inventory Receive | ใบรับสินค้า | `#15803d` | ผู้ส่งสินค้า | ผู้รับสินค้า | Yes |
| Inventory Issue | ใบเบิกออกสินค้า | `#1e293b` | ผู้เบิกสินค้า | ผู้อนุมัติ | Yes |
| Inventory Transfer | ใบโอนย้ายสินค้า | `#b45309` | ผู้ส่ง | ผู้รับ | Yes |
| Credit Note | ใบลดหนี้ | `#dc2626` | ผู้ออกเอกสาร | ผู้รับเอกสาร | Yes |
| Statement | ใบวางบิล | `#4f46e5` | ผู้วางบิล | ผู้รับวางบิล | Yes |
| Consignment Invoice | ใบแจ้งหนี้ฝากขาย | `#F4511E` | ผู้ขาย | ตัวแทนจำหน่าย | Yes |
| Purchase Order | ใบสั่งซื้อ | `#2563eb` | ผู้สั่งซื้อ | ซัพพลายเออร์ | No |
| Supplier Report | รายงานยอดขาย | `#2563eb`/`#b45309` | ผู้จัดทำ | ซัพพลายเออร์ | No |
| Delivery Note | ใบส่งสินค้า | `#F4511E` | ผู้ส่งสินค้า | ผู้รับสินค้า | Yes |

---

## Special Layouts

### Abbreviated Invoice (2 per page)
- A4 split at y=421pt (vertical midpoint)
- Top half: 381pt height, compact content
- Dashed divider: 0.5px #ccc, dash {length:4, space:3}
- Bottom half: flows after divider
- Page break every 2 orders
- Compact: logo 30x30, fontSize 8-9pt, no signature

### Shipping Label
- Page size: A6 (297.64 x 419.53 pt = 105x148mm) or A4
- Margins: 12pt (A6) / 30pt (A4)
- Black/gray only, no color theme
- Tracking barcode CODE128 at top
- FROM/TO 2-column layout with vertical divider
- Items table with compact 7pt text

### Packing Slip (2 per page)
- Same half-page mechanism as abbreviated invoice
- Includes product images (35x35), barcodes, checkboxes
- Pick list (full page) aggregates items across multiple orders
