---
paths:
  - "lib/leads/**/*"
  - "app/api/leads/**/*"
  - "components/chat/LeadSheet.tsx"
  - "app/chat/**/*"
---
# ติดตามลูกค้าในแชท — สถานะกรวยขาย (lead stage) + นัดทักอีกครั้ง

> โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` · **เขียนสั้น** ไม่ใส่วันที่/เล่าประวัติ

## นัดผูกกับ "คน" ไม่ใช่ห้องแชท
`leads` (สถานะ + นัด + ผู้รับผิดชอบ) **1 : N** `lead_contacts` (ห้องแชทของคนนั้น ทุกแพลตฟอร์ม)
ห้องที่ยังไม่ผูกลูกค้ามี lead ของตัวเองได้ (`customer_id` ว่าง) · วันที่ห้องถูกผูกลูกค้า
`resolveLeadForContact()` **รวมร่างให้เอง**: นัดที่ใกล้กว่าชนะ · ขั้นที่ลึกกว่า (sort_order) ชนะ ·
`lead_events` + `lead_contacts` ย้ายตาม แล้วลบใบที่เหลือ
⇒ ทักที่ LINE แล้วนัดฝั่ง FB ของคนเดียวกันหายด้วย (ถูกแล้ว — เราทักคนนั้นไปจริง)

## ของกลาง (ห้ามเขียนซ้ำ)
| ต้องการ | ใช้ |
|---|---|
| ขั้น/สี/ป้ายสถานะ | [lib/leads/stages.ts](../../../lib/leads/stages.ts) — `DEFAULT_LEAD_STAGES` · `STAGE_CHIP_CLASS` · `STAGE_ACTIVE_CLASS` · `STAGE_RING_CLASS` · `CLOSED_STAGE_KEYS` (client-safe) |
| วันนัด + ป้ายบอกนัด + วันรอโอน | [lib/leads/followup-presets.ts](../../../lib/leads/followup-presets.ts) — `followUpPresets()` · `followUpLabel()` · `formatShortThaiDate()` · `waitingDays()` (client-safe) |
| อ่าน/เขียน lead ฝั่ง server | [lib/leads/service.ts](../../../lib/leads/service.ts) — `getCompanyStages` · `getLeadForContact` · `resolveLeadForContact` · `updateLead` · `markContactedByStaff` · `logLeadEvent` |
| จอติดตาม | `components/chat/LeadSheet.tsx` — แผ่นเดียวใช้ทุกทางเข้า (หัวห้องแชท · รายชื่อ) |
| API | `GET/PATCH /api/leads` (`contact_id` + `platform`) |

- **ค่าจริงของขั้นอยู่ในตาราง `lead_stages` ต่อบริษัท** (ร้านแก้ชื่อ/สี/ลำดับได้) — ค่าใน `stages.ts` เป็นชุดตั้งต้น + ค่าสำรองตอนยังโหลดไม่เสร็จ · บริษัทที่ยังไม่มีแถว `getCompanyStages()` seed ให้เอง
- **สิทธิ์ใช้ของเดิม**: ดู = `chat.view` · แก้/มอบหมาย = `chat.reply` — ห้ามเพิ่ม capability ใหม่
- `follow_up_at` ปักเวลา **10:00 น.** เสมอ (`FOLLOW_UP_HOUR`) — นัดตอนเที่ยงคืนไม่มีใครเห็น

## กติกาที่บังคับในชั้น service (ไม่ใช่ที่หน้าจอ)
- เข้าขั้นที่ "จบแล้ว" (`won`/`resolved`/`lost`) → **ล้างนัดเสมอ** + จด `closed_reason`
- ออกจากขั้น `quoted` → หยุดตัวนับรอโอน (`quote_sent_at`/`quote_order_id`/`reminded_count`)
- **พนักงานพิมพ์ตอบในห้อง = ทักแล้ว → ล้างนัด** (`markContactedByStaff()` ใน `after()` ของ `POST /api/chat/messages`)
  ⛔ **บรอดแคสต์ห้ามเรียก** — ยิง 500 คนทีเดียวไม่ใช่การติดตามรายคน นัดทั้งเดือนจะหายในคลิกเดียว
- ทุกการเปลี่ยนลง `lead_events` พร้อม `source` (`manual` = คนกด · `system` = ระบบติดให้) — รายงานต้องแยกสองอย่างนี้ออกจากกัน

## หน้าแชท
- lead ของห้องที่เปิดอยู่โหลดใน effect ที่ผูกกับ `selectedContact?.id` เท่านั้น — **ห้ามผูกกับ messages/realtime** (หน้าจะ render ใหม่ทุกข้อความ)
- แผ่นเปิดจาก **รูปโปรไฟล์ในหัวห้อง** (วงแหวนรอบรูป = สีของขั้น) · แตะชิปใต้ชื่อก็เปิดได้
- ทุกปุ่มในแผ่น **บันทึกทันทีที่แตะ ไม่มีปุ่มบันทึก** · เลือกวันนัดแล้วปิดแผ่นเอง

## ยังไม่ได้ทำ (ตามแผน `memo/plan-chat-funnel-2026-09-18.md`)
ตัวกรอง/วงแหวนในรายชื่อแชท · หน้าคิวติดตาม · ปัดแถวตั้งนัด · แถบ "ทักอีกที?" หลังส่งข้อความ ·
ติดสถานะเองตอนส่งลิงก์บิล/จ่ายเงิน/ส่งของ · กระดิ่ง+แจ้งเตือนเช้า · audience `lead_stage`/`follow_up_due`
