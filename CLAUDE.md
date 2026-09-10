# CLAUDE.md — Project Instructions & Knowledge Base

> ⚠️ **ไฟล์นี้โหลดเข้าทุก session และทุก subagent** — เก็บเฉพาะกติกาแกนกลางที่ใช้ทุกงาน (เป้า ≤ 300 บรรทัด)
> ความรู้เฉพาะเรื่องอยู่ใน `.claude/rules/` แบบมี `paths:` (โหลดเองเมื่อ Claude อ่านไฟล์ที่เกี่ยว) — สารบัญที่หัวข้อ **📚 Rules**
> ⛔ **ห้ามเพิ่มความรู้เฉพาะโดเมนกลับเข้าไฟล์นี้** — เขียนลงไฟล์ใน `.claude/rules/domains/` ที่ตรงเรื่อง (จัดใหม่ 2026-09-10 เพื่อลด token — เดิม 274KB โหลดทุก session)

## Project Overview

ระบบ E-Commerce สำหรับร้านขายของออนไลน์หลายช่องทาง (Shopee, LINE, Facebook, Instagram, เปิดบิลตรง, POS)
- **Stack**: Next.js 16 (App Router, Turbopack) + Supabase + Tailwind CSS + pdfMake
- **Multi-tenant**: ทุก query ต้อง filter `company_id` (ชั้น UX) + **RLS บังคับจริงที่ DB แล้ว** (2026-07-24 — policy มาตรฐาน `is_company_member(company_id) or is_super_admin()` ทั้ง 62 ตาราง ตาม `aoo-techstack/multi-tenant/MULTI-TENANT.md`; API routes ใช้ service role จึง bypass — ห้ามลืม filter ใน code)
- **เขียน RLS policy ใหม่ต้องครอบ `auth.uid()`/`auth.jwt()` ด้วย `(select …)` เสมอ** (2026-09-08) — ไม่ครอบ = ฐานข้อมูลแกะ JWT ใหม่ทุกแถว วัดจริงช้ากว่า **73 เท่า** (131.7ms → 1.8ms บนตาราง 5,939 แถว) · ทางที่ดีกว่าคือเรียกผ่าน `is_company_member(company_id)` ที่ครอบถูกให้แล้ว · แก้ policy เก่าครบ 35 ใบแล้ว (migration `20260908_rls_initplan_wrap_auth_calls`) — **ห้ามพิมพ์กฎใหม่ด้วยมือ** ให้สร้างคำสั่งจาก `pg_policies` แล้วตรวจย้อนกลับว่าเปลี่ยนเฉพาะการครอบ
- **Language**: UI ภาษาไทย, code/comments ภาษาอังกฤษได้
- **Files**: `todo.md` = งานที่ยังไม่ได้ทำ
- **Deploy**: Vercel function region = `sin1` ใน [vercel.json](vercel.json) ให้อยู่ที่เดียวกับ Supabase (`ap-southeast-1`) — **ห้ามลบ** · ไม่ตั้ง = function รันที่ iad1 (อเมริกา) ทุก query เสีย ~220ms (เจอ 2026-09-05 หน้าแชทช้า 1.5–2 วิทั้งที่ query 3–20ms — ดู `aoo-techstack/BUGS.md` §Deploy)

## 🏗 Techstack กลาง (ตระกูล aoo)

- คลัง pattern กลางอยู่ที่ **`/Users/ampstark/aoo-techstack/`** — **ก่อนออกแบบ/สร้าง
  ระบบใหม่ทุกครั้ง (auth, multi-tenant, billing, ฯลฯ) ให้เปิดค้นที่นั่นก่อนเสมอ**
  ถ้ามี pattern อยู่แล้ว → ทำตาม + copy จาก templates ห้ามออกแบบใหม่เอง
- ที่มีแล้ว: **auth** (server-auth + user-cache — `auth/AUTH.md`) ·
  **multi-tenant** (RLS-first — `multi-tenant/MULTI-TENANT.md`) — ดัชนีเต็มที่ `README.md`
- เจอบทเรียนใหม่/แก้ pattern → **อัปเดตที่คลังกลางด้วยเสมอ** แล้วค่อย sync กลับ
  โปรเจกต์อื่นที่ใช้ pattern เดียวกัน (คลังกลาง = source of truth ของ pattern)
- **bug ระดับสถาปัตยกรรม** (auth / RLS / middleware / พฤติกรรม Supabase — อะไรที่
  โปรเจกต์อื่นเจอได้ด้วย) → จดลง **`aoo-techstack/BUGS.md`** เพิ่มเติมจาก
  **`fix-bug.md`** (bug log ของโปรเจกต์นี้) เสมอ · bug เฉพาะโดเมนตัวเองจดแค่ในโปรเจกต์
- Auth ของโปรเจกต์นี้ = **hybrid variant** ตาม `aoo-techstack/auth/AUTH.md` §9
  (aoocommerce เป็นต้นทางของ variant นี้ — แก้ pattern ที่นี่ต้อง sync กลับคลังกลาง)

## 🚫 Git Workflow — **ห้าม `git push` จนกว่าจะได้รับคำสั่ง · push ได้เฉพาะ commit ของ session ตัวเอง**

- **Commit ได้** เมื่องานเสร็จ (ตามคำสั่งหรือสมเหตุสมผล)
- **ห้าม `git push`** จนกว่า user จะบอกเองชัดๆ ("push เลย", "push ขึ้นไป", "deploy")
- **ก่อน push ทุกครั้งต้องถามและได้รับคำยินยอมจาก user ของรอบนั้นก่อนเสมอ** (เพิ่ม 2026-09-08) — แสดงรายการ commit ที่จะขึ้น (`git log --oneline origin/main..HEAD`) แล้วรอคำตอบ "push ได้" · คำสั่ง push ครั้งก่อนไม่ครอบรอบถัดไป · "ทำต่อ / โอเค / ลุยเลย" ไม่ใช่การอนุมัติ push
- **push ได้เฉพาะ commit ของ session ตัวเอง** — user เปิดหลาย Claude session ใน repo เดียวกันพร้อมกัน จำ hash ของ commit ที่ตัวเองทำไว้ตลอด session · ก่อน push เช็ค `git log origin/main..HEAD` ถ้ามี commit ที่ session นี้ไม่ได้ทำ → **ห้าม push** บอก user ว่ามี commit ของ session อื่นค้างอยู่ (hash + ชื่อ) แล้วให้ user ตัดสินใจ · `git push` ขึ้นทั้ง branch แยกเฉพาะ commit ของเราไม่ได้ ถ้า commit ของคนอื่นอยู่ก่อนหน้าของเรา ต้องรอเขา push เอง หรือ user สั่งชัดว่า "เอาขึ้นทั้งหมด"
- **commit ด้วย pathspec ของไฟล์ที่แก้เสมอ** (`git commit -m "..." -- <files>`) ห้าม `git add -A` / `git commit -a` — ไม่งั้นไฟล์ที่ session อื่นแก้ค้างอยู่จะถูกกวาดเข้า commit ของเรา (เกิดแล้ว 7 ก.ย. 2026: งาน 10 ไฟล์ไปโผล่ใน commit ชื่อ "ช่องทาง Chat › LINE")
- ถ้าทำงานหลายรอบ → commit สะสมไว้ใน local จนกว่า user จะอนุมัติ push
- เหตุผล: user ต้องการ review/ทดสอบ local ก่อนขึ้น production
- เวลาแจ้งงานเสร็จ บอกแค่ "commit แล้ว" หรือระบุ hash — อย่าเสนอ push เอง
- **commit ต้องต่อท้าย typecheck ด้วย `&&` เท่านั้น** — `node node_modules/typescript/bin/tsc --noEmit && git commit …` · chain ด้วย `;` เคยปล่อยโค้ด type พังขึ้น main (`e3eb052`, 7 ก.ย. 2026)
- **บรรทัดแรกของ commit ≤ 72 ตัวอักษร** (ไทยได้) — รายละเอียดใส่ย่อหน้าถัดไป · บรรทัดแรกของ 5 commit ล่าสุดถูกโหลดเข้า**ทุก session** (เคยยาว 200–1,700 ตัวอักษร)

### กับดักของเครื่องนี้ (เจอซ้ำจนเสียเวลา — รายละเอียดใน `memo/bugs.md`)
- `npx tsc` / `npx eslint` พัง → `node node_modules/typescript/bin/tsc --noEmit` · `node node_modules/eslint/bin/eslint.js`
- `git commit` แบบ heredoc พัง → เขียนข้อความลงไฟล์แล้ว `git commit -F <file> -- <paths>`
- ห้าม `git stash` (กวาดงานของ session อื่นไปด้วย) · `supabase/migrations/` ถูก gitignore — ห้ามใส่ใน pathspec ของ commit (ล้มทั้งชุด)
- macOS ไม่มี `timeout` · cwd ของเชลล์ค้างข้าม Bash call → ใช้ path เต็มเสมอ
- `next build` ชนล็อกกับ `next dev` ของเจ้าของ — ห้ามฆ่า dev server (ท่าที่ใช้อยู่ `memo/learning.md` 2026-09-08)
- `tsc` ขึ้น TS6053 / `.next/types` อ้างหน้าที่ไม่มีแล้ว = session อื่นกำลังลบไฟล์ ไม่ใช่งานเราพัง
- Supabase MCP: `with x as (insert …) delete …` ไม่ลบ — แยกเป็นคนละ statement

## 🐛 Fix Bug Log — **บังคับค้นก่อนแก้ bug ทุกครั้ง!**

**ไฟล์**: [fix-bug.md](fix-bug.md) — log bug ที่แก้ไปแล้วทั้งหมด (root cause + วิธีแก้ + ป้องกัน regression)

**กฎ**:
1. ก่อนแก้ bug ใหม่ → **ค้น `fix-bug.md` ด้วย Grep** (ชื่อไฟล์ · อาการ · คำสำคัญ) แล้วอ่านเฉพาะ entry ที่เจอ — **ห้าม Read ทั้งไฟล์** (~500KB = หลายแสน token) · เพื่อเช็คว่าเคยเจอ/แก้คล้ายกันมั้ย จะได้ไม่ผิดซ้ำ
2. หลังแก้ bug เสร็จ → **เพิ่ม entry ใหม่ที่ด้านบนสุด** ของ `fix-bug.md` (รูปแบบตามที่กำหนดในไฟล์)
3. ถ้า bug ที่แก้เกี่ยวข้องกับ entry เก่า → update entry เดิม + เพิ่มหมายเหตุว่า regression
4. **จดบันทึกห้ามทิ้ง diff ค้างไว้ในไฟล์ที่ git track** (เพิ่ม 2026-09-08) — `fix-bug.md` · `CLAUDE.md` · `.claude/rules/*` เป็นไฟล์ที่ track อยู่ ถ้ารอบนั้น **ยังไม่ถึงจังหวะ commit** (เจ้าของยังไม่อนุมัติ / กำลังมี session อื่นทำงานอยู่) ให้พัก entry ไว้ที่ [memo/bugs.md](memo/bugs.md) (git ไม่แตะ) โดย**ติดป้าย `⏳ รอย้ายไป fix-bug.md`** ทั้งใน Index และหัวข้อ แล้ว**ครั้งหน้าที่มีเหตุต้องแตะ `fix-bug.md` อยู่แล้วให้ย้ายก้อนนั้นไปวางบนสุดแล้วลบออกจาก memo/** · เหตุผล: ไฟล์ที่ track แล้วค้างไว้เคยถูก session อื่น `git add` กวาดเข้า commit ของเขา 2 รอบใน 1 วัน (7 ก.ย. 2026)
5. **บันทึกอื่นของ session ลง `memo/` เสมอ** (git ไม่ sync) — bug/trap ของเครื่องหรือเวิร์กโฟลว์ → `memo/bugs.md` · เทคนิคใหม่ → `memo/learning.md` · ไอเดีย/ผลสำรวจที่ยังไม่ทำ → `memo/ideas.md` · งานค้าง → `todo.md` หรือ `memo/devplan.md` — **ห้ามแก้ `CLAUDE.md` เองเพื่อจดบันทึก** ถ้าไม่ได้ถูกสั่งตรง ๆ

## 📚 Rules — สารบัญความรู้ (`.claude/rules/`)

ทุกไฟล์มี `paths:` → **โหลดเข้า context เองเมื่อ Claude อ่านไฟล์ที่ตรง pattern** (ไม่โหลดตอนเริ่ม session)
⚠️ **งานอยู่ในหัวข้อไหนแต่ยังไม่ได้อ่านไฟล์โค้ดที่ตรง** (ตอบคำถาม · query DB · ไล่ log · สร้างไฟล์ใหม่) → **`Read` ไฟล์ rule นั้นเองก่อนลงมือ**
**ก่อนสร้าง component / hook / service / API ใหม่ทุกครั้ง** → เช็คของที่มีแล้วใน `code-simplicity.md` + `lib-services.md` ก่อน — มีแล้วให้เพิ่ม prop/option แทนสร้างซ้ำ

| ไฟล์ | เรื่อง | โหลดเมื่อแตะ |
|---|---|---|
| `code-simplicity.md` | shared components · CSS classes · hooks — **ห้ามสร้างซ้ำ** | `app/**/*.tsx` · `components/**` |
| `ui-design-system.md` | design system · page composition · สี · layout | `.tsx` · `globals.css` |
| `lib-services.md` | services/utilities ใน `lib/` · PDF generators · chat services · `after()` · API routes ที่มีแล้ว | `lib/**/*.ts` · `app/api/**` · `scripts/**` |
| `permissions.md` | role หลัก + กลุ่มงาน · `can()` · PermissionEditor | `lib/permissions.ts` · `app/api/**` · members |
| `order-flows.md` | flow type × status × เอกสารอัตโนมัติ | orders · dealer · consignment · statements · invoice/stock service |
| `list-page-actions.md` · `detail-page-actions.md` | focus action + ActionMenu ต่อสถานะ | หน้า list/detail ของเอกสาร |
| `domains/marketplace-core.md` | sync 3 ทาง · cron · env · watchdog · โควตา/rate limit · queue · API docs | `lib/{shopee,tiktok,lazada,marketplace}/**` · `app/api/{shopee,tiktok,lazada,marketplace}/**` · superadmin |
| `domains/shopee.md` | dual-app (partner/seller) · status mapping · helpers · push | `lib/shopee/**` · `app/api/shopee/**` |
| `domains/tiktok.md` | status · sign · product import · settlement API | `lib/tiktok/**` |
| `domains/lazada.md` | IM chat · order sync · product import | `lib/lazada/**` |
| `domains/settlement.md` | เงินเข้าจริง · ค่าธรรมเนียม 13 ช่อง | `*settlement*` · `fee-types.ts` |
| `domains/chat.md` | แชททุกแพลตฟอร์ม · performance หน้า `/chat` | `app/chat/**` · `lib/services/chat/**` · `lib/chat/**` · `lib/line/**` |
| `domains/broadcast.md` | บรอดแคสต์ · กลุ่มผู้รับ · เนื้อหา · ตั้งเวลา · รายงาน | `app/marketing/**` · `lib/broadcast/**` |
| `domains/beam.md` | Beam Checkout webhook + reconcile | `lib/beam/**` · `app/bills/**` |
| `domains/pc-counter.md` | PC ประจำห้าง | `app/pc/**` · `app/counter-sales/**` |
| `domains/delivery.md` | พื้นที่จัดส่ง + ช่วงเวลาส่ง | `lib/delivery*.ts` · `app/settings/delivery/**` |
| `domains/storefront.md` | หน้าร้านออนไลน์ · SEO/AEO · checkout | `app/store/**` · `lib/storefront*` |
| `domains/pwa-push.md` | PWA · push · แอป native (Capacitor) | `lib/push/**` · `public/sw.js` · `mobile/**` |
| `domains/auth.md` | auth cookie/JWT · หน้า public (SSR) | `lib/auth/**` · `proxy.ts` · `app/login/**` |
| `domains/performance.md` | consolidated endpoints · apiFetch cache · realtime | `lib/api-client.ts` · `app/api/header/**` |
| `domains/settings-pages.md` | convention หน้า settings | `app/settings/**` |
| `domains/pdf.md` | template เอกสาร PDF | `lib/*pdf*.ts` |
| `domains/products.md` | import/export · bulk edit · promotion | `app/products/**` · `lib/bulk/**` |

**เพิ่มความรู้ใหม่** → ลงไฟล์ domain ที่ตรงเรื่อง · ไม่มีไฟล์ที่ตรง = สร้างใหม่ใน `domains/` พร้อม `paths:` แล้วเพิ่มแถวในตารางนี้ · ข้อมูลอ้างอิงยาว ๆ ที่ไม่ใช่กติกา (ผลสำรวจ API · แผนงาน) → `memo/`

---

## UI Rules (บังคับ)

- **ห้ามใช้ native `<select>`** → ใช้ `FormSelect` แทนเสมอ
- **ห้าม text-xs/text-sm** สำหรับ body content → เฉพาะ badge/label/subtitle
- **Dropdown/Popover** → ใช้ `ActionMenu` (createPortal, z-9999) หรือ `z-[999]`
- **ห้ามสร้างหน้า view แยก** → ใช้หน้า edit form เดียว (`/xxx/new` + `/xxx/[id]`)
- **Mobile responsive** → table ใช้ `hidden md:block` + mobile cards `md:hidden`

---

## Business Domain (Critical Rules)

### GP Pricing
- `resolveGp()` returns **NET price** (หลังหัก GP แล้ว) — **ห้ามหัก GP ซ้ำ!**
- ใช้ `lib/gp-resolver.ts`
- **4 levels** (ลำดับความสำคัญ สูง→ต่ำ):
  1. **Customer Brand Override** — `customer_brand_commissions` table
  2. **Customer Default GP** — `customers.consignment_gp_rate`
  3. **Global Brand GP** — `companies.settings.brand_gp_overrides`
  4. **Global Default GP** — `companies.settings.consignment.default_gp_rate`

### Address System
- **ที่อยู่จัดส่ง** = `shipping_*` fields (ThaiAddressInput, แยก field)
- **ที่อยู่ออกบิล** = `billing_address` (textarea เดียว, ในส่วนข้อมูลภาษี)
- ถ้า billing ว่าง → `buildCustomerPayload()` join shipping fields
- ลูกค้าที่มี order แล้ว → lock customer_type (ห้ามเปลี่ยน)
- **Order shipments (chat-order flow)**: `/api/orders` POST/PUT จะ validate `shipments[]` **เฉพาะเมื่อ order มี `shipping_address_id`** (POST) หรือ **มี item ใดมี shipments entry** (PUT) — ถ้าไม่มี address ทั้ง order → ยอม `shipments = []` ทุก item ได้ → save ผ่าน
  - Use case: พนักงานพิมพ์ชื่อลูกค้า + สินค้า → save → ลูกค้ากรอกที่อยู่เองทีหลังผ่าน link (TBD)
  - `OrderForm.doSave()` auto-create shipping_address เมื่อ user กรอก delivery fields เท่านั้น — ถ้าไม่กรอก ก็ save with shipments=[] ได้

### ยอดเงินของออเดอร์ — **แอปเป็นเจ้าของ `orders.total_amount`** (2026-08-30)
- สูตรเดียวอยู่ที่ [lib/order-totals.ts](lib/order-totals.ts) — `computeOrderTotals()` = สินค้า − ส่วนลดท้ายบิล **+ ค่าจัดส่ง + ค่าการ์ดอวยพร** แล้วถอด VAT ออกจากยอดรวม (ราคาทุกที่เป็นราคารวม VAT แล้ว) · ใช้ร่วมทั้ง OrderForm กับ `/api/orders` — **ห้ามเขียนสูตร `/1.07` เองที่อื่นอีก**
- DB trigger เหลือ `sync_order_vat_split()` ที่**แตะแค่ `subtotal`/`vat_amount`** (แตกตาม `companies.vat_registered` จริง) — **ห้ามเอาการคิด `total_amount` กลับเข้า trigger** ตัวเก่าคิดจากรายการสินค้าอย่างเดียวจึงกินค่าส่งหายทุกบิล (ดู [fix-bug.md](fix-bug.md) 2026-08-30)
- **`shipping_fee` มีสองความหมาย** — บิลที่ร้านออกเอง = ค่าส่งที่บวกให้ลูกค้าจ่าย · ออเดอร์ marketplace = ค่าส่งที่แพลตฟอร์มหักเรา (`total_amount` มาจากยอดของแพลตฟอร์ม) **ห้ามบวกเข้ายอด**
- ค่าส่ง**แก้มือได้เสมอ** (เคส Lalamove/ส่งด่วน) — โซนจัดส่งเติมให้เป็นค่าตั้งต้นเท่านั้น ไม่ทับค่าที่ staff พิมพ์เอง · บิลที่ยังไม่มีที่อยู่ก็เก็บค่าส่งได้ (API รับ `shipping_fee` ตรงเป็นค่าสำรองเมื่อไม่มี `shipments`)

### Weighted Average Cost (WAC)
- `product_variations.cost_price` = WAC
- สูตร: `new_wac = (existing_qty × old_wac + received_qty × new_cost) / total_qty`
- **ห้ามเรียก WAC** จากย้ายคลัง, ส่งตัวแทน, ส่งห้าง, return — เฉพาะ inventory receives เท่านั้น

### Product variations — Soft-archive only (ห้าม hard-delete)
- `product_variations.id` ถูก FK reference **19 ตาราง** (order_items, inventory*, reports, supplier_snapshot_*, marketplace_product_links ฯลฯ); หลายตัวเป็น RESTRICT → DB reject; หลายตัวเป็น CASCADE → wipe history
- **ทุก "ลบ variation"** ใน API/RPC ต้องใช้ `UPDATE is_active=false` ไม่ใช่ `.delete()`
- **Type-switch (Simple ↔ Variation)** ใน `/api/products` PUT: detect ผ่าน `currentProduct.variation_label` vs incoming → soft-archive variations เก่าทั้งหมด → insert ตัวใหม่ใน branch ตามประเภทใหม่
- Front-end: ProductForm มี `pendingTypeChange` modal warning ก่อน toggle (เฉพาะ edit mode)

### Discount price < Default price (บังคับทั่วระบบ)
- กฎ: `discount_price > 0 AND discount_price >= default_price` → reject. `discount_price = 0` = "ไม่มีส่วนลด" อนุญาตเสมอ
- บังคับ 3 จุด:
  1. `ProductForm` UI — inline error "ราคาขายต้องน้อยกว่าราคาปกติ" (simple + per-variation)
  2. `bulk_create_products` RPC — error row, ระบุ variation label
  3. `bulk_update_variation_prices` RPC — เช็ค **FINAL value** (incoming OR existing) catch partial edit

### Bulk Excel templates — Format conventions
- **Row structure**: Row 1 = header (orange/white bold), Row 2 = instruction (gray italic — ใช้ **red bold** เฉพาะ required), Row 3+ = data
- ใช้ `addHeaderRow` / `addInstructionRow` / `addTemplateHeader` จาก [lib/bulk/excel-template.ts](lib/bulk/excel-template.ts) เสมอ
- Instruction cells: `string` = gray ปกติ; `{ text, required: true }` = red bold (เช่น "จำเป็นต้องกรอก")
- Status column: ใช้ `STATUS_COLUMN_HEADER` (= "สถานะ"), `STATUS_INSTRUCTION`, `STATUS_LABEL_ACTIVE/INACTIVE` จาก [lib/bulk/status-enum.ts](lib/bulk/status-enum.ts) — ห้าม hardcode "เปิด"/"ปิด" หรือ "ใช้งาน"/"ไม่ใช้งาน"
- **Create templates** = ตัวอย่างพอดี (1-3 records): create-categories 3 rows = 2 records (1 มี sub + 1 ไม่มี); create-brands 2 rows; create products 3 patterns (simple, 1-dim, 2-dim variation)
- **Edit templates** = export ของจริง + lock ID columns + instructions เป็น "(ค่าว่าง = ไม่แก้)"
- Variation product: ใช้ "ประเภทตัวเลือก 1/2 + ตัวเลือก 1/2" pattern; RPC จะ resolve / auto-create `variation_types` per company แล้ว set `products.selected_variation_types` + `product_variations.attributes`
- Freeze pane: `ySplit: 2` (lock both header + instruction rows)

### Orders Page — Flow Type Filter
- หน้าคำสั่งซื้อ (`/orders`) exclude `w_cash,w_credit,c_consign,d_consign` อัตโนมัติ
- ใช้ `p_exclude_flow_types` parameter ใน RPC `get_orders_list`

---

## DB Schema (สำคัญ)

### Product System
```
products → product_variations (1:N) → product_images (variation-level)
                                    → inventory (per warehouse)
                                    → marketplace_product_links
```
- Simple: `variation_label IS NOT NULL`, 1 variation
- Variable: `variation_label IS NULL`, 2+ variations
- Image priority: `variation_image > product_image > null`
- **รูปจิ๋วทุกที่ต้องผ่าน `thumbUrl()` จาก [lib/image-thumb.ts](lib/image-thumb.ts)** (2026-09-07) — Shopee CDN ต่อ `_tn` (190KB→42KB) · Lazada `_120x120q80.jpg` (150KB→6KB) · storage ของเรา → Supabase Image Transformation `render/image` (150KB→2KB, CDN แคช 1 ชม.) · เก็บรูปเดียว 1200px ไม่มีไฟล์ย่อ (ย่อตอนเรียก ไม่เพิ่มพื้นที่) · **Image Transformation เป็นของแผน Pro**: รวม 100 origin images/เดือน เกินคิด $5/1,000 (นับรูปต้นฉบับที่ถูกย่ออย่างน้อยหนึ่งครั้งในเดือน ไม่ใช่จำนวน request) · ห้ามใช้กับอวาตาร์/โลโก้/สลิป/QR/lightbox
- Variable product: **ห้าม** fallback ไปรูป product ถ้า variation ไม่มีรูป

### Order System
```
orders → order_items → (promotion_components)
       → order_shipments
       → delivery_notes, tax_invoices, abbreviated_invoices, receipts
```

### Marketplace
```
marketplace_accounts → marketplace_product_links → product_variations
                     → orders (marketplace_account_id)
```
- Shopee status: `PROCESSED` = **processing** (ไม่ใช่ shipping!)

### เปลี่ยน schema
- **เพิ่มค่าใหม่ให้คอลัมน์ enum-แบบ-text → ไล่ CHECK constraint ก่อน** (`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='<table>'::regclass and contype='c'`) — RLS/function ไม่ใช่ที่เดียวที่อ้างค่า (role `staff` เคยตกที่ `company_members_roles_valid`) · โค้ดใหม่ต้องอ่านค่าเก่าได้ก่อน แล้วค่อยแปลงข้อมูล **หลัง deploy** (โค้ดเก่าไม่รู้จักค่าใหม่ = คนหลุดสิทธิ์ทันที)

---

## File References
- **todo.md** — งานที่ยังไม่ได้ทำ (ไม่ sync git)
- **memory/** — Claude memory files (auto-loaded)
- **.claude/rules/** — กติกา + ความรู้แยกตามเรื่อง (สารบัญที่หัวข้อ 📚 Rules) — ส่วนใหญ่โหลดเฉพาะเมื่อแตะโค้ดที่เกี่ยว
- **memo/** — บันทึกของ session (git ignore · **ไม่โหลดอัตโนมัติ** — อ่านเฉพาะช่วงที่ต้องใช้)
