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

## 2026-07-27 — Security รอบ decision: OAuth CSRF + POS void + brand-products + portal rate-limit

**ที่เกิด**: 4 ช่องโหว่ที่ audit ค้างไว้ (รอ decision) — ปิดครบ

1. **[CRITICAL] OAuth CSRF (Shopee/TikTok)** — [callback](app/api/shopee/oauth/callback/route.ts) เดิม `state = companyId` ดิบ + ไม่ auth → attacker attach ร้าน (พร้อม token) เข้าบริษัทเหยื่อผ่าน `marketplace_accounts` upsert (service-role bypass RLS)
   - แก้: [lib/oauth-state.ts](lib/oauth-state.ts) `signOAuthState`/`verifyOAuthState` (HMAC-SHA256 base64url + expiry 10 นาที, timing-safe) + `authorizeMarketplaceCallback()` — auth-url ส่ง signed state (ผูก userId+companyId); callback verify state + auth session ผ่าน **cookie** (`extractRequestToken`+`verifyAccessToken`) + ตรวจ `sessionUserId === state.userId` + membership `can(roles,'marketplace.connect')` + ใช้ companyId จาก **verified state** เท่านั้น
   - secret: `OAUTH_STATE_SECRET || SUPABASE_SECRET_KEY || SERVICE_ROLE_KEY` (มีค่าเสมอ ไม่ต้องตั้ง env ใหม่); cookie เปลี่ยน `*_company_id` → `*_oauth_state`
2. **[MEDIUM] `pos/orders/void` ไม่ gate** → ใครก็ void บิล (คืนสต็อก+cancel+ปรับ session) — แก้: gate `pos.manage` (manager/admin) + ซ่อนปุ่ม void ใน [PosOrderCard](app/pos/components/PosOrderCard.tsx) (prop `canVoid`) — cashier ไม่เห็นปุ่ม (decision: supervisor override)
3. **[MEDIUM] `brands/[id]/products` ไม่ gate** → assign/unassign product ให้ brand ได้ — แก้: gate `masterdata.brands`
4. **[HIGH] Portal brute-force** — supplier code 30-bit เป็น **global oracle** ไม่มี rate limit — แก้ 2 ชั้น:
   - **entropy**: [suppliers regenerate-code](app/api/suppliers/[id]/regenerate-code/route.ts) + [customers regenerate-portal-code](app/api/customers/[id]/regenerate-portal-code/route.ts) 6→12 ตัว (~60-bit) — code เก่ายังใช้ได้จน regenerate
   - **rate-limit**: migration `portal_auth_rate_limit` (apply live) — table `portal_auth_attempts` + atomic RPC `check_portal_auth_rate_limit` (SECURITY DEFINER, revoke จาก anon/authenticated) + [lib/portal-rate-limit.ts](lib/portal-rate-limit.ts) (fail-open on error) + [lib/request-ip.ts](lib/request-ip.ts); wire [supplier-portal/auth](app/api/supplier-portal/auth/route.ts) (key `supplier:<ip>`) + [consignment/portal-auth](app/api/consignment/portal-auth/route.ts) (key `consign:<token>:<ip>`) — 10 fail/15นาที → lock 15นาที

**ทดสอบ**: build ผ่าน (277 หน้า) · rate-limit E2E (dev :3100) 10×403 → 11+×429 · OAuth HMAC roundtrip ok + tampered payload/sig → null · RPC smoke (fail×3 lock + reset)

**ป้องกัน regression**:
- ทุก OAuth callback ที่ผูก resource เข้าบริษัท → verify signed state + auth session + membership เสมอ (ห้าม trust companyId จาก param) · **ห้าม**ใช้ `checkAuthWithCompany` resolve company ใน callback (fallback บริษัทแรก)
- POS/destructive action → gate `pos.manage` + ซ่อน UI ด้วย (ไม่งั้น cashier กดได้ 403)
- Public login endpoint → rate-limit + entropy สูง เสมอ

**ยังไม่แก้ (จดไว้)**: consignment data endpoint ([portal/route.ts](app/api/consignment/portal/route.ts)) ไม่เช็ค access_code — token 122-bit ยัง mitigate (defense-in-depth ทีหลัง) · `products/bulk-brand` ไม่ gate (staff surface, product.bulk_edit territory) · **recommend regenerate supplier/customer code เก่าที่ sensitive** (entropy ใหม่ผลเฉพาะ code ใหม่)

---

## 2026-07-26 — Masterdata capability sweep: gate write routes ที่ขาด

**ที่เกิด**: brands/categories/variation-types/suppliers `route.ts` — write methods (POST/PUT/DELETE) เช็คแค่ `auth.isAuth + companyId` ไม่มี `can()` role gate (warehouses/carriers/sales-channels มีอยู่แล้ว)
**อาการ**: member ระดับต่ำ (sales/cashier) ยิง API สร้าง/แก้/ลบ brand, category, variation type, supplier ได้ตรง (gate มีแค่ฝั่ง client ผ่าน useAuthGuard บนหน้า settings) — ข้าม UI ได้
**Root cause**: capability `masterdata.brands/categories/suppliers` มีใน [permissions.ts](lib/permissions.ts) แต่ route ไม่เรียกใช้ · `masterdata.variation_types` ยังไม่มี
**วิธีแก้**:
1. เพิ่ม `'masterdata.variation_types': ADMIN` ใน permissions.ts
2. ทั้ง 4 route: import `can` + เพิ่ม `if (!can(auth.companyRoles, 'masterdata.X')) return 403` หลัง isAuth check ใน **POST/PUT/DELETE เท่านั้น** (GET เปิดให้ member อ่านได้ตามเดิม — ต้องใช้เลือกตอนสร้างสินค้า)
**ป้องกัน regression**: masterdata write route ใหม่ทุกตัวต้อง gate ด้วย `can(auth.companyRoles, 'masterdata.X')` เสมอ · reads (GET) ไม่ต้อง gate · pattern reference: warehouses/route.ts
**หมายเหตุ**: pos-terminals, payment-channels(route), chat channels — เช็คต่อว่า gate ครบหรือยัง (payment-channels GET mask secret แล้วรอบก่อน แต่ write methods ยังไม่ได้ตรวจ)

---

## 2026-07-26 — Security รอบ 2: ลบ debug endpoints + block SVG upload (XSS)

**ที่เกิด**: ต่อจาก audit 2026-07-25 — ปิด 2 ช่องที่เป็น code ล้วน
**ช่องโหว่ + วิธีแก้**:
1. **Debug endpoints คืน buyer PII** — `app/api/shopee/test-order-detail/route.ts` (คืนชื่อ/เบอร์/ที่อยู่ผู้ซื้อจาก account ใดก็ได้ ไม่ scope company) + `app/api/shopee/webhook/test/route.ts` → **ลบทิ้ง** (`git rm`, เช็คแล้วไม่มีใครอ้างอิง) — build 272→270 หน้า
2. **SVG upload = XSS** — [bills](app/api/bills/route.ts):455 + [transfers/receive](app/api/transfers/receive/route.ts):113 + [replenishments/receive](app/api/replenishments/receive/route.ts):147 เช็คแค่ `type.startsWith('image/')` → `image/svg+xml` ผ่าน + `contentType` echo type → SVG ฝัง script served จาก origin เรา = XSS — แก้: helper กลาง [lib/upload-validation.ts](lib/upload-validation.ts) `isAllowedImageUpload()` allowlist raster (jpg/png/webp/gif/heic) + reject นามสกุล .svg/.svgz
**ป้องกัน regression**: จุดรับ upload รูปจาก public (unauth) ต้องใช้ `isAllowedImageUpload` เสมอ — allowlist ไม่ใช่ blocklist · ห้าม `startsWith('image/')` เปลือยๆ
**หมายเหตุ — ยังไม่แก้ (ตั้งใจ)**: `variation-types` capability gate — brands/categories/masterdata routes อื่นก็ไม่มี `can()` เหมือนกัน (gate อยู่ client-side ผ่าน useAuthGuard) → เป็น gap ร่วมทั้งชุด ควรทำเป็น **sweep เดียวกันทุก masterdata route** ไม่ใช่แก้จุดเดียวให้ inconsistent

---

## 2026-07-25 — Modal ปิดเองตอนลาก highlight ข้อความออกนอกกล่อง (backdrop close)

**ที่เกิด**: [components/ui/Modal.tsx](components/ui/Modal.tsx) + [app/globals.css](app/globals.css) `.modal-backdrop` — กระทบทุก modal + ConfirmDialog (ห่อ Modal)
**อาการ**: ลาก highlight ข้อความในกล่อง (จะ copy) แล้วเผลอปล่อยเมาส์นอกกล่อง → modal ปิดเอง งานที่กรอกหาย
**Root cause**: browser ยิง `click` ที่ **common ancestor ของ pointerdown กับ pointerup** — กดลงในกล่องแล้วปล่อยที่ฉากหลัง → click ตกที่ overlay → `onClick={onClose}` บน backdrop ปิดทันที (จุดปล่อยเป็นตัวตัดสิน = ผิด)
**วิธีแก้**:
1. `.modal-backdrop` → `pointer-events-none` (visual ล้วน) เพื่อให้ event พื้นที่ว่างตกที่ `.modal-root` = currentTarget
2. ย้ายการปิดไป `.modal-root` + pointerdown-guard: จำจาก `onPointerDown` ว่าเริ่มกดบน overlay จริง (`pressedOnOverlay`) แล้วปิดเฉพาะเมื่อ **ทั้งเริ่มกดและ click อยู่บน overlay** (`e.target === e.currentTarget && pressedOnOverlay.current`)
**ป้องกัน regression**: backdrop close ทุกที่ต้องใช้ pointerdown-guard ห้ามผูก `onClick={onClose}` บน overlay เปลือยๆ — ยกขึ้นเป็น pattern กลาง [aoo-techstack/ui/MODAL.md](../aoo-techstack/ui/MODAL.md) + template

---

## 2026-07-25 — Security audit: อุดช่องโหว่ 10 จุด (cross-tenant leak, payment bypass, SSRF, IDOR)

**ที่เกิด**: ตรวจทั้งระบบ (DB advisors + code audit 2 agents) หลัง migrate auth/RLS — เจอของจริงหลายจุด แก้แล้วทดสอบยืนยันทุกตัว

**ช่องโหว่ + วิธีแก้** (เรียงความร้ายแรง):
1. **[CRITICAL] View `products_with_variations` เป็น SECURITY DEFINER** → user ไม่เป็นสมาชิกบริษัทไหนเลยอ่านสินค้า+ต้นทุน 6,252 แถวข้าม 2 บริษัทผ่าน PostgREST ตรง (bypass RLS) — แก้: `alter view ... set (security_invoker = true)` (migration `fix_products_view_security_invoker`); ทดสอบ stranger เห็น 0. **บทเรียน: ทุก view ที่ client เข้าถึงได้ต้อง `security_invoker=true` ไม่งั้น RLS ไม่มีผล**
2. **[CRITICAL] Beam webhook รับ "จ่ายแล้ว" ปลอม** — [beam/webhook/route.ts:62](app/api/beam/webhook/route.ts) เช็คลายเซ็นเฉพาะตอนมี header → ไม่ส่ง header = ข้ามการเช็ค ตั้ง order เป็น paid ได้ฟรี — แก้: บังคับต้องมีลายเซ็น + verify เสมอ + `timingSafeEqual` + reject เมื่อไม่มี config
3. **[HIGH] `/api/image-proxy` SSRF** — ยิง `fetch(url)` จาก param ตรงๆ → อ่าน cloud metadata (169.254.169.254) ได้ — แก้: allowlist เฉพาะ host Google + บังคับ https + เช็ค content-type image + cap ขนาด (คงเปิด public เพราะใช้ใน `<img>` หน้า bill)
4. **[HIGH] `/api/beam/test-connection` SSRF** — ยิง `fetch(webhook_url)` จาก body — แก้: เพิ่ม auth + capability + derive webhook_url จาก origin ตัวเอง (ไม่รับจาก body)
5. **[HIGH] Storage buckets list ได้แบบ anon** — payment-slips/transfer/replenishment receipts/chat-media enumerate + โหลดได้หมดข้ามบริษัท — แก้: เปลี่ยน SELECT policy จาก `public` → `authenticated` (migration `storage_block_anon_listing_*`); public CDN read by exact path ยังได้ (bucket public=true) — **ทดสอบ canary transfer-receipts ก่อน rollout: read 200 / anon list []**
6. **[HIGH] Shopee/TikTok webhook คำนวณลายเซ็นแต่ไม่ block** → payload ปลอมสั่ง auto credit note + คืนสต็อกได้ — แก้: `signatureValid=false` → ไม่ประมวลผล (แต่ยัง ack 200 กัน retry/disable; cron sync-all ทุก 15 นาทีเป็น safety net)
7. **[MEDIUM] payment-channels GET คืน Beam secret ให้ทุก member** — แก้: mask `api_key/secret_key/webhook_secret/merchant_id` ถ้าไม่มี capability `masterdata.payment_channels`
8. **[MEDIUM] IDOR tag routes** — `customers/[id]/tags` + `chat/contacts/[id]/tags` ไม่เช็ค company → เขียนทับ tag ข้ามบริษัทได้ — แก้: verify ownership + filter tag_ids เป็นของบริษัท
9. **[MEDIUM] Cron 4 route fail-open** — `if (cronSecret)` → ถ้า env ไม่ตั้ง = เปิดโล่ง — แก้: fail-closed `if (!cronSecret || ...)` ทั้ง 4

**ป้องกัน regression**:
- ⚠️ **ต้องตั้ง `CRON_SECRET` ใน Vercel prod** ไม่งั้น cron ยิงไม่ผ่าน (fail-closed แล้ว)
- ทุก view ใหม่ที่ client แตะ → `security_invoker=true` เสมอ
- ทุก webhook → verify ก่อนประมวลผล (ack 200 ได้ แต่ห้ามทำงานถ้าลายเซ็นไม่ผ่าน)
- ทุก route ที่รับ `:id` → เช็ค `.eq('company_id', auth.companyId)` ก่อน mutate (service role bypass RLS)
- E2E `scripts/test-onboarding-flow.mjs` ผ่าน 16/16 หลังแก้ (ไม่มี regression)

**ยังไม่แก้ (รอ decision — ต้องมี rate-limit infra)**: supplier-portal รหัส 30-bit + ไม่มี rate limit (brute-force ได้), consignment portal PIN เช็คแค่ frontend (token 122-bit ยัง mitigate อยู่), OAuth callback state ไม่ bind session (CSRF), debug endpoints (`shopee/test-order-detail`) ยังอยู่ prod

---

## 2026-05-28 — สินค้า variation: แยก "ลบ" vs "ปิด" ด้วย deleted_at column ใหม่ (overwrite ของ fix ก่อนหน้านี้)

**ที่เกิด**: หน้า edit `/products/[id]/edit` + list `/products` + RPC `get_product_for_edit` + view `products_with_variations`
**อาการรอบที่ 2 (หลัง fix รอบแรก)**: รอบแรกแก้โดย filter `is_active=false` ออกจากฟอร์ม edit + list → user complain ใหญ่ว่า toggle "ใช้งาน/ไม่ใช้งาน" ทำงานไม่ได้ — ถ้า untick = ซ่อนไป จะ retick กลับมาได้ยังไง? และ list ก็ควรเห็น inactive ด้วย (แค่เป็น "ปิด") ส่วน "ลบ" ต้องเป็นเหตุการณ์ต่างหากที่หายจริง
**Root cause (เชิงดีไซน์)**: ใช้ `is_active` column เดียวสำหรับทั้ง 2 ความหมาย (ลบ + ปิด) → ขัดแย้งกัน. ผู้ใช้คาดหวัง 2 states แยกกัน:
- `inactive` = แค่ปิดการขาย (ค้นหาไม่เจอ ขายไม่ได้ แต่ยังเห็นในหน้า list/edit เพื่อกดเปิดกลับมาได้)
- `deleted` = ลบจริง (หายจาก UI ทุกที่)
แต่ hard-delete ทำไม่ได้เพราะ variation_id เป็น FK ของ 19 ตาราง → ใช้ `deleted_at` เป็น soft-delete marker
**วิธีแก้** (overwrite fix รอบก่อน):
1. Migration `product_variations_add_deleted_at_split_delete_from_inactive` (apply ผ่าน Supabase MCP) — เพิ่ม column `deleted_at TIMESTAMPTZ` + partial index + **backfill** `deleted_at = updated_at WHERE is_active=false` (ของเดิมที่ user กดถังขยะมาก่อนหน้านี้ ถือเป็น "ลบ" ตามเจตนา)
2. Migration `get_product_for_edit_filter_deleted_at` — RPC subquery variations ใช้ `WHERE pv.deleted_at IS NULL` (ไม่ filter is_active แล้ว — ให้ paused ขึ้นมาให้ user toggle ได้) + order `is_active DESC, created_at`
3. Migration `products_with_variations_expose_deleted_at` — view เพิ่ม column `variation_deleted_at`
4. [app/api/products/route.ts](app/api/products/route.ts) GET list: `variationVisible = row.variation_id && !row.variation_deleted_at` (รวม paused), `variationActiveAndVisible` (เฉพาะ active) ใช้สำหรับ `simple_*` fields
5. [app/api/products/route.ts](app/api/products/route.ts) PUT — `toArchive` เปลี่ยนเป็น `toDelete` = `update { deleted_at: now() }`; type-switch ก็เปลี่ยนเป็น deleted_at ด้วย; SKU/barcode dup check ใส่ `.is('deleted_at', null)` (deleted variations ไม่บล็อก SKU reuse); existing-variation lookup ใส่ `.is('deleted_at', null)`
6. [app/products/page.tsx](app/products/page.tsx) list UI — variation rows ที่ `!is_active` → badge "ปิด" (tone=gray) + `opacity-50` ที่ราคา/SKU/Barcode/cost
7. [components/products/ProductForm.tsx](components/products/ProductForm.tsx) — `removeVariation` เพิ่ม `useConfirmDialog` ถ้า variation มี id (existing in DB) → ถาม "ลบ X? — ลบถาวร..." ก่อนค่อย proceed; variation card ที่ `!is_active` → bg เข้มขึ้น + badge "ปิด" header; type-switch modal warning text เปลี่ยนจาก "ปิดใช้งาน" → "ลบ"
**สรุป semantic ใหม่**:
| Action | DB state | List | Edit form | Search/Sale |
|--------|----------|------|-----------|-------------|
| Active | `is_active=true, deleted_at=NULL` | ขึ้นปกติ | toggle on | ใช้ได้ |
| Paused (toggle off) | `is_active=false, deleted_at=NULL` | "ปิด" badge + grey | toggle off | ไม่ขึ้น |
| Deleted (ถังขยะ) | `deleted_at=now()` | ไม่ขึ้น | ไม่ขึ้น | ไม่ขึ้น |
**ป้องกัน regression**:
- ทุก SQL/RPC ที่ join `product_variations` ต้องตอบคำถาม: "ต้องการรวม deleted ด้วยมั้ย?" — ส่วนใหญ่ "ไม่" ต้องใส่ `WHERE deleted_at IS NULL`
- ถ้าเป็น query สำหรับขาย/ค้นหา → ต้อง `WHERE is_active=true AND deleted_at IS NULL`
- ถ้าเป็น query สำหรับรายงาน history (orders, inventory) → join ปกติได้ ไม่ filter อะไรเลย (variation_id stays FK-valid)
- **ผ่าน soft-delete pattern นี้อาจต้อง audit consumers อื่น** เช่น product search ใน OrderForm, promotion picker, marketplace export ฯลฯ — แต่ระยะแรกที่ filter `is_active=true` อยู่ตอนนี้ก็จะ exclude deleted ones โดยอัตโนมัติ (เพราะ backfill ทำให้ deleted_at IS NOT NULL ⟹ is_active=false จากเดิม). New consumers ต้อง filter ทั้ง 2 conditions

---

## 2026-05-28 — สินค้า variation: ลบ variation ไม่ได้ — soft-archived แสดงซ้ำหลังบันทึก (SUPERSEDED โดย entry ด้านบน)

**ที่เกิด**: RPC `public.get_product_for_edit` + [app/api/products/route.ts:534-612](app/api/products/route.ts#L534) GET list — ทั้งหน้า edit `/products/[id]/edit` และ list `/products`
**อาการ**: สร้าง/แก้สินค้าแบบ variation → กดถังขยะลบ variation → save → reload → variation ที่ลบกลับมาแสดงเหมือนเดิม (checkbox "ใช้งาน" ไม่ติ๊ก) → ลบยังไงก็ไม่หาย
**Root cause**: ตามกฎ [code-simplicity.md](../.claude/rules/code-simplicity.md) + CLAUDE.md → variation_id เป็น FK ของ 19 ตาราง (orders, inventory, snapshots…) → ห้าม hard-delete ใช้ `is_active=false` แทน → API PUT (`/api/products`) ทำถูกแล้ว (soft-archive). **แต่ฝั่งอ่านไม่ได้ filter inactive:**
1. RPC `get_product_for_edit` subquery variations ไม่มี `WHERE pv.is_active = true` → ส่ง archived rows กลับมาด้วย
2. View `products_with_variations` (ใช้ใน /api/products GET list) ก็เป็น LEFT JOIN ตรงๆ ไม่กรอง
→ ProductForm `initFormData` ([components/products/ProductForm.tsx:245](components/products/ProductForm.tsx#L245)) map `editingProduct.variations` ตรงๆ รวม inactive → ผู้ใช้ลบในฟอร์ม → save (API archive ซ้ำ) → next load show ใหม่ — loop ตลอด
**วิธีแก้รอบแรก (แล้วโดน revert)**:
1. Migration `fix_get_product_for_edit_filter_inactive_variations` — `CREATE OR REPLACE FUNCTION` เพิ่ม `AND pv.is_active = true`
2. [app/api/products/route.ts](app/api/products/route.ts) — refactor grouping loop, skip inactive variations
**ทำไมโดน revert**: ผู้ใช้ feedback ว่า toggle "ใช้งาน" ใน form กลายเป็น useless (untick = หาย, retick ไม่ได้) → ต้องแยก "ลบ" vs "ปิด" เป็น 2 states ต่างหาก → ทำเป็น `deleted_at` column ใหม่ตาม entry ด้านบน

---

## 2026-05-28 — FormSelect portal dropdown scroll ดูข้อมูลไม่ได้ — โดน auto-close

**ที่เกิด**: [components/ui/FormSelect.tsx:120-128](components/ui/FormSelect.tsx#L120-L128) — เห็นชัดใน modal "เพิ่มหมวดหมู่ใหม่" บน ProductForm (categories > 8 รายการ)
**อาการ**: เปิด dropdown ใน FormSelect ที่ใช้ `portal` mode → list ยาวเกิน 240px → พอ scroll ใน list ทันที dropdown ปิด → ดูรายการที่เหลือไม่ได้
**Root cause**: `handleScroll = () => setOpen(false)` ผูกกับ `window.addEventListener('scroll', ..., true)` (capture phase) — มันจับ scroll event ของ **ทุก** scrollable element รวมถึง list ภายใน dropdown เอง → user scroll → event bubble ขึ้น capture → close ทันที (intent เดิมคือปิดเมื่อ scroll หน้าหลัก เพราะ portal float อยู่กลางจอ จะหลุดจาก trigger)
**วิธีแก้**: ใน `handleScroll` ให้ ignore event ที่ `target` อยู่ใน `dropdownRef.current` — ปิดเฉพาะ scroll นอก dropdown ([FormSelect.tsx:121-127](components/ui/FormSelect.tsx#L121-L127))
**ป้องกัน regression**: ทุก global capture-phase listener ที่จะเปลี่ยน state ของ popover ต้องเช็ค `target` ว่าอยู่ใน portal เองมั้ยก่อน — pattern เดียวกับ click-outside ที่มีอยู่แล้ว (line 93)

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
