# TBC Continue — โหลด state จาก session ก่อน + เริ่มทำต่อ

## Trigger
เมื่อ user พิมพ์ `/tbc-continue` (มักรันเป็น message แรกของวัน)

## เป้าหมาย
ทำให้ Claude เริ่มทำต่อจากที่ค้างไว้ได้ **ทันที** โดยไม่ต้องให้ user re-explain สถานะทั้งหมด

## Steps

### 1. อ่าน tbc.md
- เปิดไฟล์ `tbc.md` (root)
- ถ้าไม่มีไฟล์ → แจ้ง user ว่า "ไม่มี TBC จาก session ก่อน — เริ่มงานใหม่ได้เลย" แล้วหยุด
- ถ้ามี → อ่าน **section บนสุด** (session ล่าสุด) เป็นหลัก, scan section อื่น briefly เผื่อมี context ที่ต่อเนื่อง

### 2. Verify state จริงในระบบ
อย่าเชื่อ tbc.md อย่างเดียว — verify quickly ว่า state ยังเหมือนเดิม:

| ต้องเช็คอะไร | วิธี |
|---|---|
| Branch ที่ทำงาน | `git status` + `git log --oneline -5` |
| ไฟล์ที่ระบุใน "Files touched" ยังอยู่มั้ย | spot-check 1-2 ไฟล์สำคัญ |
| Migration ที่บอกว่า apply แล้ว — ยังอยู่ใน DB? | ถ้า critical → query Supabase MCP เช็ค (อ่านอย่างเดียว ใช้ `execute_sql` SELECT) |
| Commit ที่ระบุ hash — ยังอยู่บน branch? | `git log <hash>` |

**เป้า**: catch case ที่ user ลบ branch, revert commit, drop column ฯลฯ หลัง session ก่อนปิด → จะได้ไม่ทำ destructive operation ผิด

### 3. Summarize ให้ user (สั้นๆ ไม่เกิน 10 บรรทัด)

Format:
```
📌 **TBC: <หัวข้อ session ก่อน>** (วันที่)

✅ ทำไปแล้ว: <สรุป 1-2 บรรทัด>
⚠️ ค้างที่: <จุดสุดท้ายที่หยุด — 1 บรรทัด>

🎯 **แนะนำเริ่มที่:**
1. <next step priority 1>
2. <next step priority 2>

State check: <ถ้าเจอ drift จาก tbc — เตือนตรงนี้>

จะเริ่มข้อไหนครับ? (หรือบอกอย่างอื่นได้)
```

### 4. รอ user confirm
- ห้าม jump into action ทันที — user อาจ:
  - เปลี่ยนใจ priority
  - มีข้อมูลใหม่ที่ tbc ไม่รู้
  - อยากทำงานอื่นก่อน
- ถ้า user บอก "ทำต่อเลย" / "ข้อ 1" → เริ่มได้

### 5. (Optional) Cleanup tbc.md ถ้าเสร็จงานแล้ว
ระหว่าง session ใหม่ ถ้างานที่ค้างใน TBC ทำเสร็จ:
- ไม่ต้องลบ section นั้นใน tbc.md ตอนนี้
- รอตอน user เรียก `/tbc-memo` ปลาย session — ตอนนั้นค่อย mark ว่าเสร็จในรายงานใหม่

## ข้อห้าม
- ❌ ห้ามถือ tbc.md เป็น source of truth — ของจริงคือ codebase + git
- ❌ ห้าม start action ก่อน user confirm
- ❌ ห้าม assume "user รู้ตัวเองว่าทำอะไร" — สรุปให้ฟังก่อนเสมอ ถ้า user เห็นแล้วบอก "ใช่" → ค่อยทำ
- ❌ ห้ามแสดง tbc.md ทั้งไฟล์ใน chat — สรุปให้พอ user เข้าใจ

## เมื่อ tbc.md เก่ามาก (> 7 วัน)
แจ้ง user:
> "TBC session ล่าสุดเป็นของวันที่ XXXX-XX-XX (X วันก่อน) — สถานะอาจไม่ตรงแล้ว แนะนำ verify ก่อนทำต่อ หรือเริ่มงานใหม่ไปเลย"
