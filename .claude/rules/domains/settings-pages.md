---
paths:
  - "app/settings/**/*"
  - "components/settings/**/*"
  - "app/api/companies/**/*"
  - "lib/tag-links.ts"
  - "lib/constants/**/*"
  - "components/customers/TagManager.tsx"
---
# Settings Pages Convention

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## ⚙️ Settings Pages Convention (อัพเดท 2026-05-29)

### Split tabs สำหรับ manual + integrations
หน้า settings ที่มีทั้ง user-managed entries และ API integrations → ใช้ **2 tabs**:
- **Tab 1 "ของฉัน" / "รับเงินตรง"** — user เพิ่ม/แก้/ลบเอง (manual + preset auto-fill)
- **Tab 2 "เชื่อมต่อ API"** — system integrations (Beam Gateway, Shippop, ฯลฯ) — ไม่มี "+ เพิ่ม"

ใช้กับ:
- [/settings/carriers](../../../app/settings/carriers/page.tsx) — manual carriers / Shippop integration (placeholder)
- [/settings/payment-channels](../../../app/settings/payment-channels/page.tsx) — Cash/PromptPay/Bank / Beam Gateway

### "ทั่วไป" — รวม CRM-style + business profile
[/settings/page.tsx](../../../app/settings/page.tsx) ใช้ Tabs:
- **Tab "ข้อมูลร้านค้า"** ([/settings/company](../../../app/settings/company/page.tsx)) — ชื่อ/โลโก้/ที่อยู่/ภาษี/business type (รองรับทั้ง individual + corporation)
  - **ที่อยู่บริษัท = textarea เดียวใน `companies.address`** (2026-08-28) — เอกสาร/PDF พิมพ์เฉพาะ `companies.address` (`buildCompanyStack`) · ค่าเก่าที่เคยแยก district/amphoe/province/postal_code ใน `companies.settings` ถูก merge เข้า textarea ตอนโหลด + เคลียร์ทิ้งตอนบันทึก — **ห้ามกลับไปเก็บที่อยู่บริษัทแบบแยก field ใน settings อีก**
  - **ข้อมูลภาษีแบ่งตามรูปแบบจดทะเบียน** (picker บุคคลธรรมดา/บจก./หจก. อยู่ในการ์ดข้อมูลภาษี) — บุคคล = เลขบัตรประชาชน, นิติบุคคล = เลขผู้เสียภาษี+สาขา+ชื่อจดทะเบียน · **ช่อง "สาขา" โชว์เฉพาะเมื่อเปิด VAT** (สาขาเป็นแนวคิด ภ.พ.20) ปิด VAT แล้วบันทึก = เคลียร์ค่า · เลข tax id ไม่ gate ด้วย VAT (ร้านไม่จด VAT ก็ต้องใช้บนใบเสร็จ/หัก ณ ที่จ่าย)
  - **บันทึกครั้งแรกแบบเปิด VAT → API PUT `/api/companies` seed สาขา VAT "สำนักงานใหญ่" code `00000` ให้อัตโนมัติ** (idempotent, address null = ใช้ที่อยู่บริษัท) — POS terminal picker จึงไม่มีทางว่าง
- **Tab "บิล และสินค้า"** — variation types + bill expiry settings
- **Tab "แท็กลูกค้า"** ([/settings/tags](../../../app/settings/tags/page.tsx) · [TagManager](../../../components/customers/TagManager.tsx)) — จัดการแท็กที่ใช้ร่วมกันทั้งหน้าลูกค้าและหน้าแชท (ย้ายมาจาก Modal ในหน้า /customers 2026-09-06) · แท็บของหมวดนี้อยู่ที่เดียวใน [components/settings/GeneralSettingsTabs.tsx](../../../components/settings/GeneralSettingsTabs.tsx) · สิทธิ์ `masterdata.tags` (ADMIN) สำหรับแก้/ลบ ส่วนสร้างเปิดให้ทุกคนผ่าน quick-add ใน `TagInput`
- **ติด/ปลดแท็กต้องส่ง diff ผ่าน [lib/tag-links.ts](../../../lib/tag-links.ts) (`PATCH {add, remove}`) ห้าม PUT ทั้งชุด** — replace-all จาก snapshot ฝั่ง client เคยลบแท็กของคนอื่นเงียบ ๆ (ดู [fix-bug.md](../../../fix-bug.md) 2026-09-06) · baseline ของ diff = ชุดที่เซิร์ฟเวอร์ยืนยันเท่านั้น

Sidebar entry "ทั่วไป" link ไป `/settings/company` (= tab แรก) — active state ครอบ `/settings` · `/settings/company` · `/settings/tags` (เพิ่มแท็บใหม่ต้องเพิ่มที่นี่ด้วย)

### Card density mất ทุก list row
- Card inner padding: `px-3 py-2.5` (ไม่ใช่ `p-4`)
- Icon container: `w-8 h-8` (ไม่ใช่ `w-10 h-10`) — `<Banknote className="w-4 h-4">`
- List gap: `space-y-2` (ระหว่างใบ — ไม่ใช่ `space-y-4`)
- ห้ามใช้ `text-gray-300` กับ icons ที่ต้องการ visibility — `text-gray-500` minimum
- ListRow ครอบ pattern นี้ให้แล้ว ใช้แทนการ inline เสมอ

### Preset auto-fill pattern (sharing constants)
สำหรับ entities ที่มี curated list (carriers/payment methods/ฯลฯ):
1. Constants ใน `lib/constants/<entity>.ts` — shared ระหว่าง onboarding + settings
2. Settings create modal: filter presets `!existingCodes.has(code)` → pill chips
3. Click pill → fill form fields (name + code + ทุก field ที่จำเป็น)
4. Manual entries (ไม่ใช่ preset) ก็ยัง create ได้
- ตัวอย่าง: [lib/constants/carriers.ts](../../../lib/constants/carriers.ts) `CARRIER_PRESETS`

### Modal padding gotcha
`.modal-body` + `.modal-footer` ใน [globals.css](../../../app/globals.css) **ไม่มี padding built-in** — caller ต้องใส่ `px-6 py-5` (body) + `px-6 py-4` (footer) เอง ดู [TaxInvoiceEditModal](../../../components/ui/TaxInvoiceEditModal.tsx) เป็น reference

---

### หน้าช่องทางการขาย `/settings/sales-channels` (ย้ายจาก memo/component.md 2026-09-10)
- แท็บต่อช่องทาง (ตั้งค่าเอง · FB/IG · LINE · Shopee · Lazada · TikTok) โครงเดียวกับหน้าแชท · `useMarketplaceAccounts` ยกขึ้น parent แล้วส่ง `accounts` ให้ `MarketplaceConnections` · `tabFromLocation()` รองรับลิงก์เก่า `?tab=marketplace#x` และ `#none` / `#instagram`
- หลัง OAuth ร้าน → หน้าคั่น [connected](../../../app/settings/sales-channels/connected/page.tsx) (`?platform=lazada|tiktok&shops=a|b`) ถามก่อนต่อขาแชท — pattern ของ OAuth 2 รอบ
