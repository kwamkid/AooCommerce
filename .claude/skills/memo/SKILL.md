# Memo — บันทึกงานที่ทำไปแล้ว + แผนงานต่อไป

## Trigger
เมื่อ user พิมพ์ `/memo`

> เดิมชื่อ `/log` — เปลี่ยนเป็น `/memo` 2026-05-29

## Steps

### 1. สรุปสิ่งที่ทำไปใน conversation นี้
อ่าน conversation context ทั้งหมด แล้วสรุปว่า:
- แก้ไขอะไรบ้าง (files, features, bugs)
- commit อะไรไปแล้ว

### 2. บันทึกลง CLAUDE.md
เปิดไฟล์ `CLAUDE.md` (root) → เพิ่ม/อัพเดทหัวข้อที่เกี่ยวข้อง:
- ถ้าเป็น feature ใหม่ → เพิ่มใน section ที่เหมาะสม (เช่น File References, API Routes)
- ถ้าเป็น bug fix → อัพเดท section ที่เกี่ยวข้อง
- ถ้าเป็น rule ใหม่ → เพิ่มใน rules section
- **ห้ามลบ content เดิม** — เพิ่มเติมเท่านั้น
- เขียนสั้นกระชับ ไม่เกิน 2-3 บรรทัดต่อรายการ

### 3. บันทึกแผนงานลง todo.md
เปิดไฟล์ `todo.md` (root) → เพิ่มงานที่ยังค้างอยู่:
- งานที่ตกลงกันแล้วแต่ยังไม่ได้ทำ
- งานที่ต้องรอ (เช่น รอ log, รอ deploy)
- **ห้ามลบ todo เดิมที่ยังไม่เสร็จ**
- ถ้างานเสร็จแล้ว → ลบหรือ mark เป็น done

### 4. แจ้ง user
แสดงสรุปสั้นๆ ว่าบันทึกอะไรไปบ้าง (ไม่เกิน 5 บรรทัด)

## Format ใน CLAUDE.md

เพิ่มใต้ section ที่เหมาะสม เช่น:

```markdown
### Product Import/Export (เพิ่มเมื่อ 2026-04-12)
- Export CSV: ปุ่ม Export ในหน้าสินค้า พร้อม product_id/variation_id
- Import CSV: `/products/import` — สร้างใหม่ + อัพเดท + auto sync Shopee
- API: `/api/products/bulk-import` — batch upsert + marketplace price sync
```

## Format ใน todo.md

```markdown
## รอดำเนินการ
- [ ] update_stock 44.2% fail — รอ log 24 ชม. หลัง deploy แล้วแก้ตรงจุด
- [ ] ทดสอบ mass_ship_order หลัง deploy — กดรับออเดอร์ bulk ดูว่ายังหายไหม
```
