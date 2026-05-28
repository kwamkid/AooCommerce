# Fix Bug Log — บันทึก bug ที่แก้ไปแล้ว

**วัตถุประสงค์**: บันทึก bug ทุกตัวที่เคยแก้ พร้อม root cause + วิธีแก้ — เพื่อไม่ให้แก้ผิดซ้ำหรือทำ regression
**Rule**: ทุกครั้งที่แก้ bug เสร็จ ต้องเพิ่ม entry ใหม่ที่ "ด้านบนสุด" (เรียงจากใหม่ → เก่า)

**รูปแบบ entry:**
```
## YYYY-MM-DD — <ชื่อ bug สั้นๆ>

**ที่เกิด**: <path:line> หรือหน้าไหน
**อาการ**: <ลูกค้าเจออะไร>
**Root cause**: <สาเหตุจริง>
**วิธีแก้**: <ที่ทำไป> — link ไฟล์:บรรทัด
**ป้องกัน regression**: <ข้อควรระวังในอนาคต>
```

---

## 2026-05-28 — variation_types create error: "ชื่อประเภทนี้มีอยู่แล้ว" (ทั้งที่บริษัทยังไม่เคยสร้าง)

**ที่เกิด**: [app/api/variation-types/route.ts](app/api/variation-types/route.ts) POST → DB `public.variation_types`
**อาการ**: บริษัทใหม่ที่ยังไม่มี row ใน `variation_types` เลย → กดเพิ่ม "สี" (หรือชื่ออะไรก็ได้ที่บริษัทอื่นเคยสร้าง) → 400 `ชื่อประเภทนี้มีอยู่แล้ว` (`23505`)
**Root cause**: Migration เดิม `_archive/20260211_variation_types.sql` ประกาศ `name TEXT NOT NULL UNIQUE` แบบ global + seed 4 รายการให้บริษัท default; ตอน multi-tenant migration `_archive/20260215_multi_tenant.sql` เพิ่ม `company_id` แต่**ไม่ได้แก้ unique constraint** → constraint `variation_types_name_key` ยังเป็น `UNIQUE (name)` ระดับทั้งระบบ บล็อกบริษัทอื่นที่ใช้ชื่อซ้ำกัน
**วิธีแก้**: Migration `fix_variation_types_unique_per_company` (apply ผ่าน Supabase MCP) — DROP `variation_types_name_key` + ADD `variation_types_company_id_name_key UNIQUE (company_id, name)`
**ป้องกัน regression**: pattern เดียวกับ [`sellable_products_code_key` bug ด้านล่าง](#2026-05-28--เพิ่มสินค้าแบบชุด-bulk_create_products-error-duplicate-key-sellable_products_code_key) — ทุก unique constraint บน multi-tenant table ต้องรวม `company_id`. ถ้าเจอ `xxx_name_key` / `xxx_code_key` / `xxx_sku_key` แบบ single-column = มรดกยุค single-tenant ตกค้าง → ต้อง audit ทั้งระบบ (เป็น bug pattern ซ้ำซากเป็นครั้งที่ 2 แล้ว — ครั้งหน้าเจอตารางที่ migrate มาจาก single-tenant ให้ list pg_constraint ก่อนเลย)

---

## 2026-05-28 — เพิ่มสินค้าแบบชุด (bulk_create_products) error: duplicate key "sellable_products_code_key"

**ที่เกิด**: `/products/bulk/create` → `POST /api/products/bulk/create/apply` → RPC `bulk_create_products`
**อาการ**: สร้างสินค้าใหม่ในบริษัทตัวเองด้วย code เช่น "P001" → error `duplicate key value violates unique constraint "sellable_products_code_key"` ทั้งที่ในบริษัทตัวเองไม่มี P001
**Root cause**: ตาราง `products` มี unique constraint ตกค้างจากยุค single-tenant ชื่อ `sellable_products_code_key` ที่ `UNIQUE (code)` แบบ **global** (ข้ามทุก company) — ถ้าบริษัทอื่นเคยสร้าง code นั้นแล้ว บริษัทใหม่จะสร้างไม่ได้เลย RPC เช็คเฉพาะ `company_id = X AND code = Y` จึงจับ duplicate ข้ามบริษัทไม่ได้ → DB ตี constraint violation
**วิธีแก้**: Migration [supabase/migrations/20260528_products_code_unique_per_company.sql](supabase/migrations/20260528_products_code_unique_per_company.sql) — drop `sellable_products_code_key` (global) + add `products_company_code_key UNIQUE (company_id, code)` (per-company) + drop redundant `idx_sellable_products_code`
**ป้องกัน regression**: ทุก unique constraint ใน multi-tenant table **ต้อง** รวม `company_id` เป็น compound key เสมอ — ห้ามมี `UNIQUE (code)` / `UNIQUE (sku)` / `UNIQUE (name)` แบบ global. ถ้าเจอ constraint ชื่อขึ้นต้น `sellable_*` = ของเก่ายุค single-tenant ตกค้าง ต้องเช็คทุกตัว

---

## 2026-05-27 — Export/Import icon สลับซ้ำๆ + dropdown popup ตัด text

**อาการ 1 (icon สลับ)**: ทุกครั้งที่สร้างปุ่ม Export/Import แบบใหม่ มี chance สูงที่จะใส่ icon ผิด (Download ↔ Upload)
**Root cause**: ใช้ raw `<Button icon={<Upload />}>Export</Button>` — เลือก icon ตอนเขียน → จำผิดได้ทุกครั้ง
**วิธีแก้**: สร้าง [`ExportButton` / `ImportButton`](components/ui/ExportImportButton.tsx) ที่ bake icon ไว้แล้ว — ใช้แค่ `<ExportButton />` ไม่ต้องเลือก icon
**Convention**: Export = `Upload` (ลูกศรขึ้น) ส่งออก | Import = `Download` (ลูกศรลง) นำเข้า
**ป้องกัน regression**: code-simplicity.md บังคับใช้ ExportButton/ImportButton — ห้ามใช้ raw Button + Upload/Download icon

---

## 2026-05-27 — FormSelect dropdown popup ตัดข้อความตามความกว้าง trigger

**ที่เกิด**: [components/ui/FormSelect.tsx](components/ui/FormSelect.tsx) (portal mode)
**อาการ**: Trigger แคบ (เช่น auto-width "7 วันล่าสุด") → dropdown popup กว้างเท่า trigger → "7 วันล่าสุด" กลายเป็น "7 วันล่า..."
**Root cause (2 ชั้น)**:
  1. ใช้ `width: portalPos.width` (เท่า trigger) — ตัด option ที่ยาวกว่า
  2. แม้ขยายแล้ว — option label มี `min-w-0 truncate` → flex child ยอมหด + ตัด text เอง dropdown ไม่ขยายตาม
**วิธีแก้**:
  - Dropdown root: `minWidth: portalPos.width` + `maxWidth: min(420px, calc(100vw - 16px))` (FormSelect.tsx:228)
  - Option label: ลบ `min-w-0 truncate` → ใช้ `whitespace-nowrap` (FormSelect.tsx:269)
**ป้องกัน regression**: ทุก dropdown portal ใช้ minWidth + ห้าม truncate option label (มี maxWidth cap อยู่แล้ว)

---

## 2026-05-27 — DataTable resize column cascade (column อื่นขยับตาม)

**ที่เกิด**: [components/ui/DataTable.tsx](components/ui/DataTable.tsx) — column resize handler
**อาการ**: ลาก resize handle ของ column X → column ข้างเคียงเด้ง/ขยับตาม → resize ใช้ไม่ได้
**Root causes (พบเป็นชั้นๆ ทีละจุด)**:
  1. `table-layout: fixed` + `w-full` + cells width รวมน้อยกว่า container → browser auto-distribute extra space → resize 1 column = redistribute ใหม่หมด
  2. `minWidth: '100%'` บน table → บังคับให้ table = container width → ถ้า column widths sum < container → browser stretch
  3. Snapshot useEffect ตอน mount จับ `offsetWidth` ที่ stretched แล้ว save ลง localStorage → resize ครั้งต่อไป startWidth ผิด
  4. ตอน user resize column ทำให้ sum > container แต่ table ยัง `width: 100%` → browser compress columns กลับ
**วิธีแก้ (final)**:
  - Table strategy: **% widths default + px snapshot on first resize**
  - Last column: ไม่มี declared width → auto-flex รับพื้นที่เหลือ + pin ขวา
  - ตาราง `width: 100%` เสมอ — last column flexes ตามที่เหลือ
  - Min width 80px กัน header text หาย
  - `min-width: max-content` บน `.data-th` → cell ไม่หดต่ำกว่า content
**ป้องกัน regression**: DataTable spec ใหม่ — ดู [code-simplicity.md](.claude/rules/code-simplicity.md) "DataTable" section

---

## 2026-05-27 — @dnd-kit hydration mismatch (DndDescribedBy IDs)

**ที่เกิด**: DndContext ใน DataTable
**อาการ**: Server render `aria-describedby="DndDescribedBy-2"`, client render `"DndDescribedBy-0"` → React hydration warning + dnd-kit state เพี้ยน → resize/sort/reorder ไม่ทำงาน
**Root cause**: @dnd-kit generates accessibility IDs ผ่าน global counter — counter ที่ SSR ≠ counter ที่ client
**วิธีแก้**: Render DndContext **หลัง mount** เท่านั้น (gating ด้วย `mounted` state)
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
return mounted ? <DndContext>...</DndContext> : <fallback />;
```
**ป้องกัน regression**: ทุก component ที่ใช้ @dnd-kit ต้อง gate ด้วย mounted state

---

## 2026-05-27 — Tailwind @layer components purge ลบ btn-sm / btn-lg ทิ้ง

**ที่เกิด**: `Button.tsx` ใช้ template literal `` `btn-${size}` `` + globals.css ใช้ `@layer components` สำหรับ btn classes
**อาการ**: Button "Small" และ "Large" ไม่มี height/padding ที่ถูกต้อง — ดูเหมือนตัวเดียวกันหมด
**Root cause**: Tailwind purge เห็นแค่ `btn-md` (default) ใน static scan ของ Button.tsx — ตรวจ `btn-${size}` (computed at runtime) ไม่ได้ → ลบ `btn-sm` + `btn-lg` ทิ้งจาก compiled CSS
**วิธีแก้**: **ย้าย global classes ออกจาก `@layer components`** + เขียน raw CSS values (ไม่ใช้ `@apply h-8`)
**ป้องกัน regression**: ทุก global class ที่ใช้ผ่าน template literal (Button, Card, Badge, Modal, Typography) ต้องอยู่ **นอก** `@layer components` ใน globals.css

---

## 2026-05-27 — Mobile typography: h2 ใหญ่กว่า h1 (hierarchy ผิด)

**ที่เกิด**: [app/globals.css:397-411](app/globals.css#L397) (mobile @media)
**อาการ**: บนมือถือ `<h2 className="text-2xl">` ขึ้นใหญ่กว่า `<h1 className="text-3xl">` → typography hierarchy พัง
**Root cause**: CSS override บีบ h1.text-3xl → 20px และ h1.text-2xl → 18px แต่ **ไม่ override h2** → h2.text-2xl ยังเป็น 24px (ใหญ่กว่า h1 20px)
**วิธีแก้**: ขยาย selector ให้ครอบ h1 + h2 ทุก text-3xl / text-2xl / text-xl + ปรับสเกลให้ hierarchy ถูก:
  - text-3xl → 22px (h1/h2)
  - text-2xl → 18px
  - text-xl  → 16px
**ป้องกัน regression**: ทุก responsive typography override ต้องครอบทั้ง h1 + h2

---

## 2026-05-27 — Records-per-page dropdown แสดง "-- เลือก --" แทนตัวเลข

**อาการ**: หน้าใหม่ตั้ง `perPage = 10` (หรือค่าอื่นนอก enum) → dropdown ไม่ match option → แสดง placeholder
**Root cause**: Pagination FormSelect มี options fix = `[20, 50, 100, 200]` แต่ caller ผ่านค่าอื่นได้
**วิธีแก้**: Export `RECORDS_PER_PAGE_OPTIONS` enum + `DEFAULT_RECORDS_PER_PAGE` จาก [Pagination.tsx](app/components/Pagination.tsx) — ห้ามใช้ค่าอื่น
**ป้องกัน regression**: ทุกหน้าที่ใช้ DataTable → `useState(DEFAULT_RECORDS_PER_PAGE)` จาก Pagination

---

## 2026-05-27 — Button + FormSelect ความสูงไม่ตรง (toolbar ขัดตา)

**อาการ**: วาง FormSelect (42px) ข้าง Button md (~36px) → สูงไม่ตรง toolbar เบี้ยว
**Root cause**: Button md ใช้ `py-2 text-sm` (auto-height ~36px), FormSelect ใช้ `h-[42px]` hardcoded → 2 ระบบความสูง
**วิธีแก้**: Standard global control heights:
  - sm = `h-8` (32px)
  - md = `h-10` (40px) — default ทั้ง Button + FormSelect
  - lg = `h-11` (44px)
  - เพิ่ม `size` prop ใน FormSelect (default 'md') + Button ใช้ `h-*` คงที่ตาม size
**ป้องกัน regression**: ทุก form control trigger (Button, FormSelect, future Datepicker etc.) ต้องใช้ scale นี้

---

## 2026-05-27 — ลืม feature "เพิ่มสินค้าใหม่" ตอน split mega template

**ที่เกิด**: `/products/bulk` hub (เริ่มต้นมีแค่ basic-info + price)
**อาการ**: ตอน delete `/products/import` (mega template) ไป — ลืม cover use case "bulk create สินค้าใหม่" → user ไม่มีทาง bulk import สินค้าใหม่
**Root cause**: ตอน split per action เน้นแค่ "edit existing" ลืมว่า mega template เคยทำหน้าที่ "create new" ด้วย
**วิธีแก้**: เพิ่ม Module `/products/bulk/create` + RPC `bulk_create_products` — สร้างได้อย่างเดียว (error ถ้า code มีอยู่แล้ว → user ต้องใช้ basic-info module)
**ป้องกัน regression**: ตอน split mega/legacy feature ใดๆ → list use cases ของของเก่าทั้งหมดก่อน (ห้ามนึกแค่ feature เด่น)

---

## 2026-05-27 — Mega Template Import Parser ใช้ positional column (อ่านผิด)

**ที่เกิด**: `app/products/import/page.tsx` (ถูกลบไปแล้ว — เปลี่ยนเป็น `/products/bulk/<action>`)
**อาการ**: User Export → แก้ราคา → Import กลับ → variation_label กลายเป็น "สินค้าปกติ", SKU กลายเป็น variation_label, ราคา parse Barcode เป็นเลข
**Root cause**: Parser ใช้ `cols[4]`, `cols[5]` ตามตำแหน่ง — แต่ Export มี column "ประเภท" แทรกที่ index 4 ทำให้ทุก column เลื่อน
**วิธีแก้**:
  - **แทนที่ระบบใหม่หมด** — แยกเป็น `/products/bulk/basic-info`, `/products/bulk/price` ตาม action (เหมือน Shopee mass_update_*)
  - Parser ใหม่ใน [lib/bulk/parse-template.ts](lib/bulk/parse-template.ts) อ่าน column ตาม **header name** (ทนต่อ column reorder)
  - ลบ `/products/import` + `/api/products/bulk-import` ทั้งหมด
**ป้องกัน regression**: ทุก bulk template ใหม่ ต้องใช้ `lib/bulk/parse-template.ts` (header-based) ห้ามอ่าน column ตามตำแหน่ง

---

## 2026-05-27 — Export/Import icon สลับกัน (หน้าสินค้า)

**ที่เกิด**: [app/products/page.tsx:661,668](app/products/page.tsx#L661)
**อาการ**: ปุ่ม Export ใช้ icon `Download` (ลูกศรลง), Import ใช้ `Upload` (ลูกศรขึ้น) ผู้ใช้สับสน
**Root cause**: ใช้ icon ตามมุมมอง browser (download = save to disk) แต่ผู้ใช้คิดในมุม "ข้อมูลเข้า/ออกระบบ"
**วิธีแก้**: สลับ icon — Export → `Upload` (ส่งออกจากระบบ), Import → `Download` (นำเข้าระบบ)
**ป้องกัน regression**: ทุกหน้าที่มี Export/Import ใช้ convention นี้

---

## 2026-05-27 — โลโก้บริษัทไม่อัพเดทหลังกด Save

**ที่เกิด**: [app/settings/company/page.tsx](app/settings/company/page.tsx) + [app/api/companies/logo/route.ts](app/api/companies/logo/route.ts)
**อาการ**: เลือกรูปใหม่ + กด save → upload สำเร็จ แต่หน้าจอแสดงรูปเก่า
**Root cause**: 2 ปัญหาซ้อนกัน
  1. Supabase Storage ใช้ filename เดิม (`{companyId}/logo.{ext}`) + `upsert: true` → URL เหมือนเดิมทุกครั้ง browser cache รูปเก่า
  2. `handleSubmit` เรียก `refreshCompanies()` **ก่อน** `handleUploadLogo()` → context ได้ URL เก่า
**วิธีแก้**:
  - API: เติม `?v=${Date.now()}` cache buster ที่ URL ที่บันทึกใน DB ([app/api/companies/logo/route.ts:52-55](app/api/companies/logo/route.ts#L52))
  - Client: ย้าย `handleUploadLogo()` มาก่อน `refreshCompanies()` ([app/settings/company/page.tsx:227](app/settings/company/page.tsx#L227))
**ป้องกัน regression**: ทุกที่ที่ upload ไฟล์ทับ filename เดิม (`upsert: true`) ต้องเติม cache buster ที่ public URL

---

## 2026-05-27 — ปุ่ม "อัพโหลด" โลโก้แยกจากปุ่ม Save (UX สับสน)

**ที่เกิด**: [app/settings/company/page.tsx:297-302](app/settings/company/page.tsx#L297) (ถูกลบไปแล้ว)
**อาการ**: เลือกรูป → มีปุ่ม "อัพโหลด" โผล่ขึ้นมา + ปุ่ม "บันทึก" ข้างล่าง ผู้ใช้งงว่าต้องกดอันไหน
**Root cause**: มีปุ่ม upload แยกที่ไม่จำเป็น เพราะ `handleSubmit` เรียก `handleUploadLogo()` ให้อยู่แล้ว
**วิธีแก้**: ลบปุ่ม "อัพโหลด" + ลบ state `isUploadingLogo` ที่ไม่ใช้แล้ว
**ป้องกัน regression**: หน้า edit form ใดๆ ที่มีรูป upload — ใช้ปุ่ม save หลักปุ่มเดียว ห้ามมีปุ่ม upload แยก

---
