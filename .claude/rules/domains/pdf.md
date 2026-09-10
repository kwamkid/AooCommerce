---
paths:
  - "lib/*pdf*.ts"
  - "lib/pdf-utils.ts"
  - "lib/print-*.ts"
  - "components/ui/OrderPrintButtons.tsx"
---
# PDF — Bill Template Design (pdfMake)

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## PDF (Bill Template Design)

**Library**: pdfMake, **Font**: IBMPlexSansThai, **Page**: A4, **Margins**: `[40,40,40,110]`

- **ไอคอนในเอกสารใช้ SVG เท่านั้น** (`{ svg: '<svg …>' }` ของ pdfMake — ฝังสีในตัว path เพราะ svg-to-pdfkit ไม่รู้จัก `currentColor`) · ตัวอย่าง: ชิป "แนบการ์ดอวยพร / ห้ามแนบใบเสร็จ / ขอใบกำกับภาษี" ในใบจัดของ
- ⛔ **ห้ามใส่ emoji/สัญลักษณ์แปลก ๆ ในเอกสาร PDF** — ฟอนต์ที่ฝังมีแค่ IBMPlexSansThai และ pdfMake ไม่มี font fallback → พิมพ์ออกมาเป็นกล่องเปล่า (เคยหลุด `🎁` กับ `※` ดู [fix-bug.md](../../../fix-bug.md) 2026-08-30) · ที่ใช้ได้: `• · » → ✓ — –` · เช็คก่อนใช้ตัวใหม่ด้วย fontkit (`f.layout('X').glyphs[0].id === 0` = ไม่มี)
- **"กำหนดส่ง" (วันที่ + รอบเวลา) ใช้ `formatDeliverySchedule()` จาก [lib/pdf-utils.ts](../../../lib/pdf-utils.ts) ที่เดียว** — มีแล้วใน ใบจัดของ · ใบปะหน้า · ใบเสร็จ/ใบกำกับ(ย่อ+เต็ม) · บิลออนไลน์ · เอกสารใหม่ให้เรียกตัวนี้ ห้ามประกอบข้อความเอง
- **ใบจัดของ ([lib/orders-packing-pdf.ts](../../../lib/orders-packing-pdf.ts)) = 2 ออเดอร์/หน้า แต่ไม่ใช่กฎตายตัว** — ครึ่งบนเป็นตารางความสูงคงที่ 381pt + เส้นประ absolute ที่ y=421 (ตัดกระดาษตำแหน่งเดียวกันทุกใบ) · ออเดอร์ที่เนื้อหาไม่ลงครึ่งหน้า (การ์ดอวยพร + ที่อยู่ + หลายรายการ) **กินเต็มหน้าของตัวเอง** ไม่งั้นล้นไปทับออเดอร์ครึ่งล่าง · ตัวเลือกพิเศษของบิล (การ์ดอวยพร/ห้ามแนบราคา/ขอใบกำกับ) เป็น**ชิปแถวเดียว + ไอคอน** ไม่ใช่กล่องละ option (กินที่) · ขนาดรูปสินค้า 25–75pt คิดจากที่ว่างที่เหลือจริง — **เพิ่มบล็อกใหม่ในใบนี้ต้องบวกความสูงเข้า `compactPackingParts()` ด้วย**

**5 Sections**:
1. **Header** — Logo+company (left) + doc title 24pt + info box (right, 230pt)
2. **Sub-header** — Customer/warehouse info
3. **Item Table** — No vertical lines, 1px #333 header/footer, 0.5px #e5e7eb row dividers
4. **Summary** — Notes/QR (left) + totals table (right, 260pt), grand total bold 12pt
5. **Signature Footer** — 2 sides: ผู้ออกเอกสาร + ผู้รับ (absolute bottom)

**Corner triangle**: 50pt filled polyline, top-right, theme color
**ต้นฉบับ/สำเนา**: page 1 green "(ต้นฉบับ)", page 2 gray "(สำเนา)"

**PDF Color Palette**:
| Color | Hex | Usage |
|---|---|---|
| Green | `#15803d` | paid, receive, ต้นฉบับ |
| Dark Slate | `#1e293b` | unpaid, issue |
| Amber | `#b45309` | transfer, consignment |
| Red | `#dc2626` | credit note, void |
| Indigo | `#4f46e5` | statement |
| Orange | `#F4511E` | consignment report, brand accent |

---

