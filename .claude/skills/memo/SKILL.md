# Memo — บันทึกงานที่ทำไปแล้ว + แผนงานต่อไป

## Trigger
เมื่อ user พิมพ์ `/memo`

> เดิมชื่อ `/log` — เปลี่ยนเป็น `/memo` 2026-05-29

## Steps

### 1. สรุปสิ่งที่ทำไปใน conversation นี้
อ่าน conversation context ทั้งหมด แล้วสรุปว่า:
- แก้ไขอะไรบ้าง (files, features, bugs)
- commit อะไรไปแล้ว

### 2. บันทึกความรู้ลงไฟล์ rule ที่ตรงเรื่อง (ไม่ใช่ CLAUDE.md)
> CLAUDE.md โหลดเข้า**ทุก** session + ทุก subagent — ต่อท้ายไปเรื่อย ๆ = token บวม (เคยโตถึง 274KB) · เปิดสารบัญ **📚 Rules** ใน CLAUDE.md เพื่อเลือกไฟล์
- ความรู้เฉพาะเรื่อง (feature · integration · กติกาของโดเมน) → `.claude/rules/domains/<เรื่อง>.md` (ไม่มีไฟล์ที่ตรง = สร้างใหม่พร้อม `paths:` + เพิ่มแถวในสารบัญ)
- component / hook ใหม่ → `.claude/rules/code-simplicity.md` · service / utility / API route ใหม่ → `.claude/rules/lib-services.md`
- แก้ CLAUDE.md **เฉพาะ** กติกาแกนกลางที่ใช้ทุกงาน (git · business rule ข้ามโดเมน) — ห้ามเอารายละเอียดโดเมนกลับไปใส่
- ข้อมูลเดิมผิด/ล้าสมัย → **แก้ทับที่เดิม** ไม่ต่อท้ายซ้ำ · ห้ามลบของที่ยังถูกต้อง
- เขียนสั้นกระชับ ไม่เกิน 2-3 บรรทัดต่อรายการ · ประวัติการแก้ยาว ๆ ไปอยู่ `fix-bug.md` / commit message ไม่ใช่ไฟล์ rule

### 3. บันทึกแผนงานลง todo.md
เปิดไฟล์ `todo.md` (root) → เพิ่มงานที่ยังค้างอยู่:
- งานที่ตกลงกันแล้วแต่ยังไม่ได้ทำ
- งานที่ต้องรอ (เช่น รอ log, รอ deploy)
- **ห้ามลบ todo เดิมที่ยังไม่เสร็จ**
- ถ้างานเสร็จแล้ว → ลบหรือ mark เป็น done

### 4. แจ้ง user
แสดงสรุปสั้นๆ ว่าบันทึกอะไรไปบ้าง (ไม่เกิน 5 บรรทัด)

## Format ในไฟล์ rule (เช่น `.claude/rules/domains/products.md`)

เพิ่มใต้หัวข้อที่เหมาะสม เช่น:

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
