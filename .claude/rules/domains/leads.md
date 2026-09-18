---
paths:
  - "lib/leads/**/*"
  - "app/api/leads/**/*"
  - "components/chat/LeadSheet.tsx"
  - "app/chat/**/*"
  - "app/marketing/broadcast/**/*"
  - "app/marketing/audiences/**/*"
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
| API | `GET/PATCH /api/leads` (`contact_id` + `platform`) · `GET /api/leads/queue` (คิวติดตาม) · `GET /api/leads/stats` (สรุปกรวยขาย) |
| งานรายวัน | [lib/leads/sweep.ts](../../../lib/leads/sweep.ts) `sweepLeadAutomations()` — **เกาะ cron ตัวเฝ้าเดิม ห้ามตั้ง cron ใบใหม่** |

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

## ระบบติดสถานะให้เอง (`source='system'`)
| เหตุการณ์ | ผล | จุดเรียก |
|---|---|---|
| ส่งลิงก์บิลในแชท | → `quoted` + เริ่มนับวันรอโอน + นัดทวง +2 วัน | `POST /api/chat/messages` ที่ส่ง `bill_order_id` → `markBillSentToChat()` |
| จ่ายเงินแล้ว (ทุกทาง) | → `won` + ล้างนัด + หยุดตัวนับ | `markOrderPaid()` ข้าง `dispatchConversion('Purchase')` ทั้ง 5 จุด (orders POST/PUT ×3 · POS · Beam) |
| ซื้อแล้วครบ 30 วัน | ตั้งนัดชวนคุยหลังการขาย | `sweepLeadAutomations()` |
| รอโอนเกิน 7 วัน | ดันเข้าคิววันนี้ให้คนตัดสินใจ (ไม่เปลี่ยนสถานะเอง) | `sweepLeadAutomations()` |

- **บิลไม่ล้างนัด** — ข้อความบิลไปทาง `markBillSentToChat()` ไม่ใช่ `markContactedByStaff()`
- เพิ่มจุดที่ทำให้บิล "จ่ายแล้ว" ต้องเรียก `markOrderPaid()` ด้วยเสมอ (ใน `after()`)

## กลุ่มผู้รับสำหรับบรอดแคสต์/โฆษณา
`lead_stage` (เลือกขั้น) · `follow_up_due` (ถึงกำหนดใน N วัน) — ใช้ได้ทั้งบรอดแคสต์และกลุ่มที่ sync ขึ้น Meta
แก้ครบ 4 จุดแล้ว: `lib/broadcast/audience.ts` → `AUDIENCE_BY_PLATFORM` ใน `/api/broadcasts` →
CHECK `broadcasts_audience_type_check` → `lib/broadcast/recipients.ts` + `lib/audiences/resolve.ts`
· นับสองทางเสมอ (ห้องที่ผูก lead ตรง + ทุกห้องของ `leads.customer_id`)

## ยังไม่ได้ทำ
ปัดแถวในรายชื่อเพื่อตั้งนัดเร็ว · แจ้งเตือน push ตอนเช้า (ตอนนี้มีแค่ตัวเลขบนเมนูจาก `/api/header/summary`) ·
หน้าแก้ชื่อ/สี/ลำดับขั้นใน settings (แก้ตรงตาราง `lead_stages` ได้อยู่)
