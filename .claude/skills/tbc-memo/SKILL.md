# TBC Memo — บันทึก session ไว้ใน tbc.md เพื่อทำต่อพรุ่งนี้

## Trigger
เมื่อ user พิมพ์ `/tbc-memo`

## เป้าหมาย
ปิด session ปัจจุบันโดยเขียน **section ใหม่** ไว้ด้านบนสุดของ [tbc.md](../../../tbc.md) เพื่อให้ Claude ใน session ถัดไป (เรียก `/tbc-continue`) ทำต่อจากตรงนี้ได้ทันทีโดยไม่ต้องเดา

> ต่างจาก `/memo` ตรงที่ `/memo` เขียนลง `CLAUDE.md` + `todo.md` (project knowledge persist ยาว) ส่วน `/tbc-memo` เขียนลง `tbc.md` (working-state per-session, throwaway)

## Steps

### 1. อ่าน conversation นี้แล้วสรุปสถานะจริง
อ่านทั้ง conversation context — **ไม่ใช่แค่ message สุดท้าย** — แล้วระบุ:
- ทำอะไรไปบ้าง (files แก้/สร้าง, migrations apply, schema เปลี่ยน, decisions ที่ตกลง)
- หยุดอยู่ตรงไหน — ขั้นที่ user กำลังตอบหรือยังตัดสินใจ
- สิ่งที่ยังไม่ได้ทำ (verify, manual test, follow-up tasks)

### 2. อ่าน tbc.md ปัจจุบัน
- ถ้ายังไม่มีไฟล์ → สร้างใหม่จาก template ด้านล่าง
- ถ้ามีอยู่แล้ว → **ห้ามลบ section เก่า** — append session ใหม่ที่ **ด้านบน** (เก่าสุดอยู่ล่าง)
- เก็บ section เก่าไว้ 5 session — ถ้าเกิน ลบเก่าสุดออก (FIFO)

### 3. Append section ใหม่ตาม format นี้

```markdown
## 📌 Session YYYY-MM-DD — <หัวข้อสรุปสั้นๆ>

### ✅ Done
<- จัดหมวดตาม theme ของงาน เช่น "Feature X refactor", "Bug Y fix">
- ใช้ checkmark กับงานที่ทำเสร็จจริง — ไม่ใช่ "ตั้งใจจะทำ"
- ลิงก์ไฟล์ที่แก้: `[path](relative-path)` — ผู้อ่านคลิกเปิดได้
- ระบุ migration ที่ apply ไปแล้ว (กับ project_id ถ้าเป็น Supabase)

### ⚠️ Where we left off
- จุดที่ user response ค้าง / ตัดสินใจค้าง / กำลัง wait อะไร
- ถ้ามี code ที่ commit แล้ว — บอก hash; ถ้ายัง — บอกว่ายัง

### 📝 Pending / Next steps
ลำดับความสำคัญ:
1. **<critical>** — สิ่งที่ block อย่างอื่น
2. **<important>** — งานที่ commit ไว้กับ user แล้ว
3. **<optional>** — nice-to-have / follow-up

### 🧠 Architecture notes (ถ้ามีการเปลี่ยน design)
- เก็บ knowledge ที่ session ถัดไปต้องรู้ — เช่น format ของเลข, key tables, RPC signatures
- **ไม่ใช่ commit log** — เก็บเฉพาะที่ "ถ้า Claude พรุ่งนี้ไม่รู้ จะทำพลาด"

### 🗂 Files touched this session
<- bullet list ของไฟล์ที่ create/edit/delete พร้อม path>
```

### 4. แจ้ง user สั้นๆ
2-3 บรรทัด:
- "บันทึกแล้ว — session XX ของวันที่ ..."
- จุดที่จะทำต่อพรุ่งนี้ (1 บรรทัด)
- คำสั่งให้ user รัน: `/tbc-continue` เมื่อกลับมา

## ข้อห้าม
- ❌ ห้ามเขียนรายละเอียดทุก commit/wording change — สรุปเป็น theme
- ❌ ห้าม assume — ถ้าไม่แน่ใจว่า "done จริง vs ตั้งใจ" → อ่าน tool results ก่อน
- ❌ ห้ามลบ session เก่าโดยไม่จำเป็น — เก็บ FIFO 5 session
- ❌ ห้าม commit/push tbc.md — มันอยู่ใน .gitignore แล้ว

## Format reference
ดู [tbc.md](../../../tbc.md) ตัวอย่างที่มีอยู่ (session 2026-05-31)
