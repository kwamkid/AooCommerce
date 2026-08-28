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

## 2026-08-28 — หน้าเปิดบิลในแชท: กดบันทึกแล้วเงียบ + layout โดนบีบ/ล้นบนจอ notebook

**ที่เกิด**: [components/orders/OrderForm.tsx](components/orders/OrderForm.tsx) `handleSave` + [components/ui/CustomerSelectionCard.tsx](components/ui/CustomerSelectionCard.tsx)
**อาการ**: (1) กดบันทึกในหน้าเปิดบิล (panel ในแชท) แล้วไม่มีอะไรเกิดขึ้นเลย — ไม่มี error ไม่มี toast (2) บนจอ notebook ปกติ (1280-1440px) panel เปิดบิลโดนบีบเป็น 2 คอลัมน์แคบๆ + มี scrollbar แนวนอน
**Root cause**:
1. validation เบอร์โทรใช้ regex ที่**ไม่รับขีด/เว้นวรรค** — เบอร์ที่ prefill จาก customer record มักเป็น "081-5554544" (placeholder ของ input เองก็เขียน 0xx-xxx-xxxx!) → validate fail → `return` เงียบสนิท เพราะ `fieldErrors.deliveryPhone`/`deliveryEmail` **ไม่มีจุด render ใน UI เลย** + ไม่อยู่ใน scroll-to-error branch + ไม่มี toast
2. grid ในฟอร์มใช้ **viewport breakpoint** (`sm:`/`md:`/`lg:grid-cols-2`) แต่ฟอร์มถูกฝังใน panel กว้าง ~600px บนจอ 1280+ — breakpoint เห็นจอกว้างเลยบังคับ 2 คอลัมน์ในพื้นที่ที่ไม่พอ
**วิธีแก้**:
1. ตัด `[-\s()]` ออกก่อน validate เบอร์ · validation fail ทุกกรณี **toast ข้อความ error ตัวแรกเสมอ** (กันคลาส bug "ปุ่มเงียบ" ทั้งชุด) · scroll ครอบเคส phone/email ด้วย
2. `narrowForm`: ResizeObserver วัดความกว้างจริงของ form root (< 700px = แคบ) → ส่ง `singleColumn` prop เข้า `CustomerSelectionCard` (ลูกค้า/จัดส่งถึง ซ้อนแนวตั้ง) + grid หมายเหตุ/ของขวัญ/วันส่ง-โซน เป็นคอลัมน์เดียว
**ป้องกัน regression**: inline validation ห้าม return เงียบ — error ทุก field ต้องมีทางมองเห็น (inline หรือ toast อย่างน้อยหนึ่ง) · component ที่ถูกฝังใน panel/sidebar ห้ามใช้ viewport breakpoint ตัดสิน layout — วัด container จริงด้วย ResizeObserver (pattern `narrowForm`/`summaryWide` ใน OrderForm)

## 2026-08-28 — รูปร้าน Lazada แตก (broken image) ทั้งที่ refresh สำเร็จ

**ที่เกิด**: [lib/lazada/api.ts](lib/lazada/api.ts) `getSellerInfo` + card Lazada ใน [MarketplaceConnections.tsx](app/settings/sales-channels/MarketplaceConnections.tsx)
**อาการ**: กด refresh โลโก้ร้าน Lazada แล้ว API สำเร็จ แต่ card แสดงรูปแตก (broken image glyph)
**Root cause**: Lazada `/seller/get` คืน `logo_url` เป็น **`http://`** (OSS aliyuncs) — หน้าเราเป็น https เบราว์เซอร์บล็อกเป็น mixed content · host เดิมรองรับ https อยู่แล้ว (curl 200)
**วิธีแก้**: (1) `getSellerInfo` normalize `http://` → `https://` ก่อนคืนค่าเสมอ (2) SQL update แถวเก่าใน DB (3) avatar ทั้ง Shopee/Lazada เปลี่ยนเป็น icon รองพื้น + img ทับ + `onError` ซ่อนตัวเอง — URL ตายเห็น icon ไม่เห็นรูปแตก · แถม: overlay spinner refresh แสดงค้างระหว่างโหลด (เดิม `opacity-0 group-hover` ต้อง hover ถึงเห็น)
**ป้องกัน regression**: URL รูปจาก external API (marketplace/social) ต้อง normalize เป็น https ก่อนเก็บเสมอ — docs Lazada เองก็โชว์ตัวอย่างเป็น http · ทุก avatar ใช้ pattern icon รองพื้น + img + onError (ครั้งที่ 4 แล้วที่เจอ avatar ชั้นเดียวพัง)

## 2026-08-28 — กด back จากหน้า OAuth marketplace แล้วปุ่ม "เชื่อมต่อร้าน" ค้าง loading กดไม่ได้

**ที่เกิด**: [app/settings/sales-channels/page.tsx](app/settings/sales-channels/page.tsx) (ปุ่มเชื่อมต่อ — เดิมอยู่ใน MarketplaceConnections) + [app/settings/chat-channels/page.tsx](app/settings/chat-channels/page.tsx) `handleConnectMarketplaceChat`
**อาการ**: กดเชื่อม Shopee → เด้งไปหน้า login Shopee → กด back (เช่นกดผิด ตั้งใจจะเชื่อม Lazada) → ปุ่มเชื่อมต่อหมุนค้าง disabled ตลอด ต้อง refresh เอง — ปุ่มเดียวใช้ร่วมทุก platform เลยเชื่อมตัวอื่นต่อไม่ได้ด้วย
**Root cause**: `handleConnect` ตั้ง `connecting=true` แล้ว `window.location.href = oauthUrl` (ถูกต้อง — ไม่ reset เพราะกำลังออกจากหน้า) แต่ตอนกด back browser **restore หน้าจาก bfcache พร้อม React state เดิมทั้งหมด** → `connecting` ยังเป็น true โดยไม่มี code เส้นไหน reset
**วิธีแก้**: hook กลาง [lib/useBfcacheReset.ts](lib/useBfcacheReset.ts) — ฟัง event `pageshow` แล้วเรียก reset callback (mount ปกติ state เป็นค่าเริ่มต้นอยู่แล้ว reset ซ้ำไม่มีผล) — ใช้ทั้งหน้า sales-channels (`setMpConnecting(false)`) และ chat-channels (`setConnectingChatAuth(false)`)
**ป้องกัน regression**: ปุ่มไหนตั้ง loading แล้วจบด้วย `window.location.href` ออกไปหน้าภายนอก (OAuth ทุก platform) ต้องมี `useBfcacheReset` คู่กันเสมอ — ห้ามคิดว่า "เดี๋ยวหน้า reload เอง" เพราะ bfcache คืน state เดิม

## 2026-08-27 — สลับบริษัทแล้วหน้าแสดงข้อมูลบริษัทเดิมค้าง (ไม่ reload)

**ที่เกิด**: [components/layout/Sidebar.tsx](components/layout/Sidebar.tsx) `handleSwitchCompany`
**อาการ**: พนักงานสลับบริษัทใน dropdown แล้วหน้า `/chat` ว่าง/ค้างของบริษัทเดิมจนกด refresh เอง — เข้าใจผิดว่า "แชทหาย"
**Root cause**: `switchCompany` เปลี่ยนแค่ context + localStorage ไม่ reload — หน้าที่ effect ไม่ได้ผูก dep กับ `currentCompany` (เช่น /chat ผูกกับ userProfile/filters เท่านั้น) จะไม่ refetch, realtime channels เดิมก็ยังต่อบริษัทเก่า
**วิธีแก้**: `window.location.reload()` หลัง switch — ทุกหน้า/ทุก channel/ทุก cache reset สะอาดพร้อมกัน (สลับบริษัทเป็น action นานๆ ครั้ง reload ได้)
**ป้องกัน regression**: หน้าที่ fetch ด้วย apiFetch ต้องมองว่า companyId เปลี่ยนกลาง session ได้เสมอ — ถ้าจะเลิก reload ในอนาคต ทุก fetch effect ต้องผูก dep `currentCompany?.id` ครบก่อน

---

## 2026-08-27 — รับคำเชิญบริษัทใหม่แล้วระบบเปิดบริษัทเก่าให้ทุกครั้ง (invite ไม่ switch company)

**ที่เกิด**: [app/invite/[token]/page.tsx](app/invite/[token]/page.tsx)
**อาการ**: พนักงานใหม่ (บัญชีเก่าที่เป็นสมาชิกบริษัทอื่นอยู่แล้ว) กดรับคำเชิญเข้า "ทดสอบ จำกัด" แต่ทุกครั้งที่เข้าระบบมันโหลดข้อมูล Joolz — ดูเหมือน cross-tenant แต่ไม่ใช่
**Root cause**: 3 เรื่องซ้อน — (1) บัญชี kwankwan@gmail.com มีอยู่แล้วตั้งแต่ ธ.ค. 2025 (provider=email) และเป็น manager ของ Joolz → เห็นข้อมูล Joolz ได้ถูกต้องตามสิทธิ์ (2) เครื่องนั้นมี session ค้างตั้งแต่ ก.พ. → กดลิงก์เชิญแล้วเข้าได้เลยไม่ต้อง login (จึงงงว่า "ไม่ได้กด Google") (3) **หน้า accept คำเชิญ redirect ไป dashboard โดยไม่ switch ไปบริษัทที่เพิ่งเข้าร่วม** → `aoo-current-company-id` ใน localStorage ยังเป็น Joolz → CompanyProvider restore เป็น Joolz ทุกครั้ง
**วิธีแก้**: หลัง accept สำเร็จ set `localStorage['aoo-current-company-id'] = invitation.company.id` ก่อน redirect
**ป้องกัน regression**: flow ไหนที่พาผู้ใช้ "เข้าร่วม/สร้าง" บริษัทใหม่ ต้องจบด้วยการ switch context ไปบริษัทนั้นเสมอ อย่าปล่อยให้ default/localStorage ตัดสิน · บัญชี provider=email ยุคเก่ายัง login ได้และ session อยู่ได้นานหลายเดือน — จะบังคับ Google-only จริงต้องปิด password path + กวาดบัญชีเก่า
---

## 2026-08-27 — Webhook ออเดอร์ซ้อนกันทำ monitor แดงหลอกวันละหลายใบ (duplicate key race)

**ที่เกิด**: [lib/shopee/sync.ts](lib/shopee/sync.ts) `upsertOrder` · [lib/tiktok/sync.ts](lib/tiktok/sync.ts) + [lib/lazada/sync.ts](lib/lazada/sync.ts) (พังแบบเดียวกันรออยู่)
**อาการ**: `order_create_error` + `webhook_sync_error` "duplicate key ... idx_orders_external_unique" วันละ ~3 ออเดอร์ × 2 log — แต่ออเดอร์อยู่ครบทุกใบ (เช็คแล้ว)
**Root cause**: Shopee ยิง webhook ออเดอร์เดียวกันซ้อนกัน ~ปกติ (และ webhook+cron ก็ชนกันได้) — สอง request ผ่านจุด "check ว่ามี order หรือยัง" พร้อมกัน → แข่งกัน insert → ตัวแพ้ชน unique constraint แล้ว code ปฏิบัติกับมันเหมือน error จริง (log error + throw → เข้าคิว retry ทั้งที่ไม่มีอะไรต้องทำ)
**วิธีแก้**: ตัวแพ้ตรวจ 23505/`idx_orders_external_unique` → **วนกลับเข้าเส้น update** (Shopee: recurse `upsertOrder` ครั้งเดียวด้วย flag กันวน · TikTok/Lazada: catch ที่ wrapper → re-query existing → `updateExistingOrder`) — ได้ status ล่าสุด apply ด้วย ไม่ใช่แค่เงียบ
**ป้องกัน regression**: unique constraint ชนตอน insert ของ entity ที่ upsert ได้ = สัญญาณ "มีอยู่แล้ว" ให้สลับไป update — ห้าม log เป็น error · marketplace ใหม่ทุกเจ้าต้องมี branch นี้ตั้งแต่แรก

---

## 2026-08-26 — Cron Shopee ตายเงียบตั้งแต่ 14 ก.ค. (cron-job.org ปิด job อัตโนมัติ)

**ที่เกิด**: [app/api/shopee/sync-all/route.ts](app/api/shopee/sync-all/route.ts) + [app/api/shopee/webhook/retry/route.ts](app/api/shopee/webhook/retry/route.ts) (+ [app/api/tiktok/webhook/retry/route.ts](app/api/tiktok/webhook/retry/route.ts) พังแบบเดียวกันรออยู่)
**อาการ**: API monitor แสดง "cron เงียบผิดปกติ" · คิว retry ค้าง 179 ใบไม่มีใครไล่ · cron-job.org แสดง job Inactive, Last execution Failed (HTTP error) ตั้งแต่ 07/14
**Root cause**: ทั้งสอง route **ทำงานหนักให้เสร็จก่อนค่อยตอบ** — retry ไล่ 10 ใบ (ใบละหลาย Shopee call) / sync-all ไล่ 6 ร้าน → เกินทั้ง Vercel maxDuration (504 FUNCTION_INVOCATION_TIMEOUT ยืนยันด้วย curl 61s) และ timeout ของ cron-job.org (30s) → fail ติดกันจน cron-job.org **ปิด job อัตโนมัติ** → ระบบอยู่ได้ด้วย webhook อย่างเดียวโดยไม่มีใครรู้
**วิธีแก้**: ตอบ 200 ทันที (auth + circuit breaker เช็ค sync) แล้วย้ายงานทั้งก้อนเข้า `after()` + time-box loop (45-50s) — ใบ/ร้านที่ไม่ทันรอบนี้ รอบหน้ามาต่อเอง (last_sync_at stamp ต่อร้าน, retry คิวเรียงตาม next_retry_at)
**ป้องกัน regression**: endpoint ที่ cron ภายนอกเรียก**ห้ามรอให้งานเสร็จก่อนตอบ** — ตอบเร็ว + `after()` + time-box เสมอ (TikTok/Lazada sync-all ทำถูกอยู่แล้ว) · ตั้ง cron ใหม่ทุกครั้งให้กด TEST RUN ดู status ใน history + เช็คการ์ด cron ใน `/superadmin/api-monitor` หลังตั้ง

---

## 2026-08-26 — Onboarding บริษัทใหม่โชว์โลโก้ของบริษัทอื่น

**ที่เกิด**: [components/onboarding/WizardShell.tsx](components/onboarding/WizardShell.tsx)
**อาการ**: สร้างบริษัทใหม่ (aDay Fresh) ไม่ได้อัปโหลดโลโก้ → header ของ wizard แสดง**โลโก้ของบริษัทเดิมที่ active อยู่** คู่กับชื่อบริษัทใหม่
**Root cause**: ชื่อกับโลโก้ fallback **แยกกันคนละตัวแปร** — `name = wizardPreview.name || currentCompany?.name` ได้ชื่อจาก wizard แต่ `logo = wizardPreview.logoDataUrl || currentCompany?.logo_url` wizard ไม่มีโลโก้เลยตกไปหยิบของ currentCompany มาปน
**วิธีแก้**: fallback เป็น**คู่** — ถ้า `wizardPreview.name` มีค่า (= กำลังสร้างบริษัทใหม่) ใช้ทั้งชื่อ+โลโก้จาก wizard เท่านั้น (โลโก้ว่าง = โชว์ตัวอักษรย่อ) · ไม่มีค่า → ใช้ทั้งคู่จาก currentCompany
**ป้องกัน regression**: ข้อมูลที่แสดง "เป็นชุดของ entity เดียวกัน" (ชื่อ+โลโก้, ชื่อ+ที่อยู่ ฯลฯ) ห้าม fallback แยกรายฟิลด์ — เลือก source เดียวแล้วใช้ทั้งชุด

---

## 2026-08-22 — แท็บ Marketplace: ลบร้าน TikTok/Lazada แล้วการ์ดไม่หาย + ปุ่ม Cancel sync ไม่ทำงาน (ผลพวง copy-paste การ์ด 3 platform)

**ที่เกิด**: [app/settings/sales-channels/MarketplaceConnections.tsx](app/settings/sales-channels/MarketplaceConnections.tsx)
**อาการ**: (1) กดลบร้าน TikTok/Lazada ขึ้น "สำเร็จ" แต่การ์ดยังอยู่จนกด reload (2) กด Cancel บน LoadingOverlay ตอน sync TikTok/Lazada แล้วไม่มีอะไรเกิดขึ้น (3) ร้าน Lazada ที่ถูกถอดแสดงสถานะ "Token หมดอายุ" แทน "ยกเลิกแล้ว"
**Root cause**: การ์ดร้าน + handler ถูก copy จาก Shopee ไป 3 ชุด — `handleDisconnect` refetch แค่ list Shopee, `handleTiktokSync`/`handleLazadaSync` ไม่ผูก `syncAbortRef`, status ternary ของ Lazada มีแค่ 2 branch — code review 2026-08-22 พบว่าไฟล์นี้ duplicate ~350 บรรทัด (การ์ด 3 ชุด + handler 2 ชุด byte-identical)
**วิธีแก้**: `handleDisconnect(accountId, platform)` refetch ตาม platform · sync handler ทั้งสองสร้าง AbortController + ส่ง `signal` เข้า apiFetch · เพิ่ม branch `disconnected` ให้ Lazada · ปุ่มนำเข้า/ส่งสินค้า Shopee เปลี่ยนเป็น `ImportButton`/`ExportButton` (กัน icon สลับ)
**ป้องกัน regression**: การแก้ที่ถูกระดับคือ extract `MarketplaceAccountCard` + config ต่อ platform ตาม pattern [app/settings/chat-channels](app/settings/chat-channels/page.tsx) (จดใน todo.md แล้ว) — ระหว่างนี้แก้อะไรในการ์ดต้องไล่ครบ 3 ชุดเสมอ

## 2026-08-22 — icon Export/Import สลับทิศ 2 หน้า + เพิ่ม helper กลางที่ขาด (formatThaiDate / useDebouncedCallback / downloadBlob)

**ที่เกิด**: [app/inventory/bulk-stock-update/page.tsx](app/inventory/bulk-stock-update/page.tsx) (Export ใช้ Download + อัพโหลดใช้ Upload — กลับด้านทั้งคู่) · [app/reports/sales/page.tsx](app/reports/sales/page.tsx) (Export CSV ใช้ Download) · native `confirm()` ใน [components/dealer/OrderStatusBar.tsx](components/dealer/OrderStatusBar.tsx) + `alert()` ใน ProcessingTab
**Root cause**: ไม่ได้ใช้ `ExportButton`/`ImportButton` ที่ bake icon ไว้ (ทั้งระบบมีคนใช้แค่ 1 หน้า) — bug ประเภทที่ component นี้เกิดมาเพื่อกัน · date/currency/debounce/download ไม่มี helper กลาง เลย copy กัน 96/31/17/11 จุดแล้ว drift
**วิธีแก้**: สลับเป็น ExportButton/ImportButton · confirm→useConfirmDialog, alert→showToast · เพิ่ม `formatThaiDate`/`formatThaiDateTime` ใน [lib/utils/format.ts](lib/utils/format.ts), `useDebouncedCallback` ใน [lib/useDebounce.ts](lib/useDebounce.ts), `downloadBlob` ใน [lib/utils/download.ts](lib/utils/download.ts) — กวาดแล้ว: 5 หน้า invoices (date+money), 5 หน้า list (debounce), 9 จุด download (จุด reports/sales เดิมลืม revokeObjectURL = blob ค้าง memory) · เพิ่ม brands/categories/suppliers/form-options/customer-tags เข้า `CACHED_GET_PATHS` (60s TTL)
**ป้องกัน regression**: ปุ่ม export/import ทุกปุ่ม**ต้อง**ใช้ ExportButton/ImportButton — ห้าม Button+icon เอง · หน้าใหม่ห้ามเขียน `toLocaleDateString('th-TH')`/setTimeout debounce/createObjectURL download inline — ใช้ helper กลางเสมอ · จุดที่เหลือในระบบ (date ~90 จุด, debounce 12 ไฟล์) ทยอยกวาดตาม todo

---

## 2026-08-21 — Checkout หน้าร้าน: login แล้วชื่อผู้สั่งยังว่าง — prefill ถูกข้ามทั้งก้อนเพราะแถวลูกค้ายังไม่ถูกสร้าง

**ที่เกิด**: [app/store/[slug]/checkout/checkout-client.tsx](app/store/[slug]/checkout/checkout-client.tsx) + `/api/storefront/me`
**อาการ**: ลูกค้า login Google ที่หน้า checkout — แถบบนหัวโชว์ชื่อ+รูปครบ แต่ช่อง "ชื่อผู้สั่ง" ว่างเปล่า ต้องพิมพ์เองทั้งที่เพิ่ง login
**Root cause**: แถวลูกค้า (`customers` ผูก `auth_user_id`) ถูกสร้างเฉพาะตอนเข้า**หน้าบัญชี** (มีแค่ account-client ที่ยิง POST /api/storefront/me) → login ที่หน้า checkout GET ได้ `customer: null` → โค้ด `if (!c) return` ข้าม prefill ทั้งบล็อก · แถบหัวโชว์ชื่อได้เพราะอ่านจาก session โดยตรง — คนละทางกับฟอร์ม เลยดูย้อนแย้ง
**วิธีแก้**: เพิ่ม fallback ชั้นที่ 3 ใน checkout-client — signed in แต่ไม่มีแถวลูกค้า/แถวข้อมูลไม่ครบ → อ่านชื่อ+อีเมลจาก `supabase.auth.getSession()` (แหล่งเดียวกับ CheckoutAccountBar) · ลำดับ prefill: localStorage (ที่พิมพ์ล่าสุดบนเครื่องนี้) > customer row > session metadata — commit `78ed60e`
**ป้องกัน regression**: ฟีเจอร์ใดที่พึ่ง linked customer row ต้องจำว่า row เกิดตอน**สั่งซื้อสำเร็จ/เข้าหน้าบัญชี**เท่านั้น — login อย่างเดียวไม่สร้าง row · อย่า assume ว่า signed_in = มี customer

---

## 2026-08-22 — Shopee ลดเพดาน API รายวัน (บทลงโทษ success rate <90%) แล้วระบบยิงต่อทั้งวัน = fail ทุก call ยิ่งโดนลงโทษต่อ

**ที่เกิด**: Shopee Open Platform Console — "Punishment: API calls limit" + [lib/shopee/api.ts](lib/shopee/api.ts) และทุก cron/webhook/manual sync
**อาการ**: โควตารายวันหมดเร็วผิดปกติ (โดนลดเพดานเป็นบทลงโทษ) แล้วหลังหมด ทุก call ที่ cron ทุก 15 นาที + webhook processing + retry worker ยิงออกไปทั้งวัน = error `daily API call limit` ทั้งหมด → success rate รายวันยิ่งต่ำ → บทลงโทษไม่หลุด (วงจรอุบาทว์) — ต้นเหตุ success rate พังคือช่วงร้านหลุดการเชื่อมต่อ + bug 15-day range (ดู entry 2026-08-21)
**Root cause**: ไม่มี circuit breaker — Shopee นับ success จาก HTTP 200 + error field ว่าง ทุก call หลังโควตาหมดคือ fail ที่รู้ผลล่วงหน้าแต่ระบบยังยิง
**วิธีแก้**: `shopeeApiRequest` เจอ error `daily API call limit` → เขียน flag `shopee_quota_exhausted` ลงตารางใหม่ `app_flags` (จนถึงเที่ยงคืน UTC+8) · `isShopeeQuotaBlocked()` ถูกเช็คก่อนทำงานใน sync-all, webhook retry worker, `syncSingleOrder` (fail เร็วไม่ยิง API), และ manual sync ทุก route (คืน 429 ข้อความไทย) · retry worker ตอน circuit เปิดจะ skip ทั้งรอบไม่เผา retry_count — ทุกอย่างเก็บตกเองหลัง reset
**ป้องกัน regression**: งาน bulk ใดๆ (backfill/import สินค้า) ต้องประเมิน call budget เทียบเพดานใน Console ก่อนรัน และห้ามรันช่วงโดนบทลงโทษ · เพิ่ม integration ใหม่ที่มี daily quota → ใส่ breaker แบบเดียวกันตั้งแต่แรก

---

## 2026-08-21 — จัดการสมาชิก: เชิญซ้ำ role ไม่อัปเดต + ปุ่มบันทึกโมดัลแก้ไขตายเงียบ + DB constraint ไม่มี role `pc`

**ที่เกิด**: [app/settings/members/page.tsx](app/settings/members/page.tsx) + [app/api/auth/accept-invite/route.ts](app/api/auth/accept-invite/route.ts) + [app/api/users/route.ts](app/api/users/route.ts) + CHECK constraint `company_members_roles_valid`
**อาการ**: (1) เชิญสมาชิกโดยติ๊ก ผู้จัดการ+แอดมินออนไลน์ → คนรับกดรับแล้วขึ้นแค่แอดมินออนไลน์ (2) เปิดโมดัลแก้ไขสมาชิก ติ๊กผู้จัดการ กดบันทึก → เงียบ ไม่มีอะไรเกิดขึ้น ไม่ save ไม่มี toast (3) ยังไม่มีใครเจอแต่รอระเบิด: ติ๊ก "PC ประจำห้าง" แล้ว save ไม่เข้า
**Root cause**:
1. **accept-invite ข้ามสมาชิกเดิม** — คำเชิญเก็บ roles ครบ (`["sales","manager"]` ยืนยันใน DB) แต่ถ้า user เป็นสมาชิกบริษัทนั้นอยู่แล้ว route แค่ mark invitation accepted โดยไม่เอา roles/warehouse/cost จากคำเชิญมาอัปเดต membership เดิม → admin เชิญซ้ำเพื่อเปลี่ยนสิทธิ์ = ไม่มีผลอะไรเลย
2. **ปุ่มบันทึกใช้ `type="submit" form="edit-member-form"` ผูกข้าม DOM จาก Modal footer** — เป็นที่เดียวในระบบที่ใช้ pattern นี้ · Supabase edge logs ยืนยันว่าคลิกแล้ว **ไม่มี request ยิงออกจาก browser เลยสักตัว** (save รอบก่อนหน้าที่ผ่านเข้ามาได้คือ implicit submit ตอนกด Enter ในช่องชื่อ) → submit ตายเงียบ 100%
3. **PUT `/api/users` ไม่เช็ค error ตอน update `company_members`** — ถ้า update fail (เช่นชน constraint) ก็ toast "สำเร็จ" · แถมเขียน `is_active` ลง `user_profiles` (ปิด login ทั้งระบบข้ามบริษัท!) แทนที่จะเป็น membership ของบริษัทนั้น · และไม่มี guard กัน manager แก้/มอบสิทธิ์ admin (ฝั่ง `/api/companies/members` PUT มีครบ)
4. **CHECK `company_members_roles_valid` ไม่มี `'pc'`** — โค้ดเพิ่ม role pc ไปแล้ว (PC Counter Sales 2026-07-26) แต่ constraint ใน DB ไม่ได้แก้ตาม → ติ๊ก pc = constraint violation = fail เงียบ (ตามข้อ 3)
**วิธีแก้**:
1. accept-invite: สมาชิกเดิม → **UPDATE** roles + warehouse_ids + terminal_ids + can_view_cost + `is_active=true` ตามคำเชิญ (เชิญซ้ำ = ตั้งสิทธิ์ใหม่) + เช็ค error ทั้ง insert/update · [register](app/api/auth/register/route.ts) เช็ค error ตอน insert member ด้วย
2. หน้า members: ปุ่มบันทึกเรียก `handleSaveEdit()` ตรงผ่าน `onClick` (เลิกใช้ `form=` attribute) — form เก็บ `onSubmit` ไว้รับ Enter + กัน double-run ด้วย `isSaving` guard
3. PUT `/api/users`: เช็ค error ทุก update + `is_active` ย้ายไปเขียน `company_members` + เพิ่ม escalation guards (owner แก้ได้เฉพาะ owner, manager แตะ admin ไม่ได้) เท่ากับ `/api/companies/members`
4. Migration `company_members_roles_valid_add_pc` — เพิ่ม `'pc'` ใน CHECK (apply live แล้ว)
5. ปุ่มโมดัลเพิ่มสมาชิก (ยกเลิก/สร้างลิงก์/ปิด/สร้างลิงก์ใหม่) เปลี่ยนจาก raw `<button>` เป็น global `Button` + footer ใช้ `justify-end gap-2 px-6 py-4` ตาม convention · คำอธิบาย role ระบุชัดว่า **Marketplace = ผู้จัดการขึ้นไป** (แอดมินออนไลน์ทำไม่ได้)
6. Data fix: อัปเดต roles สมาชิกที่โดน bug (Meyou) เป็น `['sales','manager']` ตามคำเชิญที่ค้าง
**ป้องกัน regression**: ห้ามใช้ `type="submit" form="<id>"` ผูกปุ่มนอก `<form>` อีก — ปุ่มใน Modal footer ให้เรียก handler ตรงเสมอ · เพิ่ม role ใหม่ต้องแก้ 3 ที่พร้อมกัน: `VALID_ROLES` (supabase-admin.ts), `ROLE_OPTIONS` (members page), **CHECK constraint ใน DB** · ทุก write ไป `company_members` ต้องเช็ค error — ห้าม await ทิ้ง

**Regression follow-up (2026-08-21 บ่าย — code review เจอช่องโหว่ในตัวแก้ชุดแรก แก้แล้วทั้งหมด)**:
1. **[SECURITY] accept-invite UPDATE branch ไม่มี guard** — ลิงก์เชิญ (ไม่ผูก email) เขียนทับ roles/scope ของสมาชิกเดิมได้ทุกคน = sales เปิดลิงก์ admin ในแชท → เลื่อนขั้นตัวเอง / owner เปิดลิงก์เก่า → โดนลดขั้นถาวร → รวม logic รับคำเชิญทั้ง 4 เส้นทาง (accept-invite / invitations/[token] / LINE / register) เป็น [lib/invitations.ts](lib/invitations.ts) ตัวเดียว: สมาชิกเดิมอัพเดทได้**เฉพาะคำเชิญที่ผูก email ตรงกัน**, เป้าหมาย owner ไม่แตะเสมอ, no-op ไม่เผา token · เส้นทางหลัก invitations/[token] ที่ยัง no-op (bug เดิมไม่หายจริง) ก็ถูกแก้พร้อมกัน
2. **is_active ย้ายตารางแล้วฝั่งอ่านไม่ตาม** — GET /api/users filter `is_active=true` → กดระงับแล้ว user หายจากลิสต์ถาวร → GET เลิก filter + merge `is_active` จาก membership · DELETE soft เลิกเขียน `user_profiles.is_active` (global kill ที่ไม่มีทางเปิดคืน)
3. **Escalation guard ขาดใน endpoint ข้างเคียง** — warehouse-permissions PUT + /api/users DELETE ไม่มี guard (manager ปิดคลัง owner / ลบ owner ได้) → extract `assertMemberMutationAllowed()` + `resolveCanViewCost()` ไป [lib/permissions.ts](lib/permissions.ts) ใช้ทุก endpoint ที่แตะ membership — **ห้าม copy guard เอง**
4. **UI คลัง**: กติกาแฝง "เปิดสวิตช์แล้วไม่ติ๊ก = ทุกคลัง" เปลี่ยนเป็น radio 3 ตัวเลือกชัดๆ (ทุกคลัง/เฉพาะที่เลือก/ไม่ให้เข้าถึง) · โปรโมทเป็น admin บันทึก scope = null จริงตามที่ UI ประกาศ · ลดขั้นจาก admin apply preset ไม่ปล่อยให้ได้ทุกคลังต่อ · save call ที่สองเช็ค res.ok แล้ว · ปุ่มบันทึกเช็คชื่อว่างเอง (native required ใช้ไม่ได้กับ onClick ตรง)
5. register: member insert fail หลังสร้างบัญชี → คืน success + warning แทน 500 (เดิมผู้ใช้ติดกับ: สมัครซ้ำไม่ได้ รับเชิญก็ไม่ได้เพราะไม่มี session)

---

## 2026-08-21 — เชื่อม Shopee/Lazada ใหม่แล้วร้านไม่โผล่ — upsert ใช้ onConflict ไม่ตรง unique index แล้วจบแบบ "สำเร็จ" เงียบๆ

**ที่เกิด**: [app/api/shopee/oauth/callback/route.ts](app/api/shopee/oauth/callback/route.ts) + [app/api/lazada/oauth/callback/route.ts](app/api/lazada/oauth/callback/route.ts)
**อาการ**: กดเชื่อม Shopee ผ่าน OAuth สำเร็จ (7 ร้าน) ระบบขึ้น toast "เชื่อมต่อสำเร็จ" แต่หน้า Marketplace ว่างเปล่า — DB ไม่มี row ไหนถูก insert/update เลย
**Root cause**: ตอนเพิ่ม Lazada (2026-08-14) unique index ของ `marketplace_accounts` ถูกเปลี่ยนจาก `(company_id, shop_id)` เป็น `(company_id, platform, shop_id)` — TikTok callback ถูกแก้ตาม แต่ **Shopee + Lazada callback ยังใช้ `onConflict: 'company_id,shop_id'`** → Postgres error 42P10 (no matching constraint) ทุก upsert → โค้ด Shopee `continue` ข้าม error แล้ว redirect `?shopee=connected` = ผู้ใช้เห็น "สำเร็จ" ทั้งที่ไม่ได้ save · อาการเพิ่งปรากฏตอน re-connect หลัง token ชุดเก่าหมดอายุ (13 ส.ค.)
**วิธีแก้**: เปลี่ยน onConflict เป็น `'company_id,platform,shop_id'` ทั้ง 2 callback + ใส่ `platform: 'shopee'` ใน payload ชัดๆ + Shopee callback นับ `connectedCount` — ถ้า save ไม่สำเร็จเลยสักร้าน redirect เป็น `?error=shopee_save_failed` แทน success
**ป้องกัน regression**: เปลี่ยน unique index ตัวไหน → **grep `onConflict` ทั้ง repo** หา upsert ที่อ้าง constraint เดิมให้ครบทุก platform (อย่าแก้เฉพาะตัวที่กำลังทำ) · callback ที่วน loop หลาย record ห้าม swallow error แล้วจบ success — ต้องนับสำเร็จจริงเสมอ

---

## 2026-08-18 — PostfixInput: ตัวเลขเกยกับ postfix เมื่อ postfix ยาวกว่า "฿" (โมดัลรอบส่ง/โซนส่ง)

**ที่เกิด**: [components/ui/PostfixInput.tsx](components/ui/PostfixInput.tsx) — ใช้ที่ [app/settings/delivery/page.tsx](app/settings/delivery/page.tsx) (รับได้ต่อวัน "ออเดอร์", ปิดรับก่อนเริ่มรอบ "นาที", ยอดขั้นต่ำส่งฟรี, ต้องสั่งล่วงหน้า) + [GeneralInfoCard](app/promotions/components/promotion-form/GeneralInfoCard.tsx) (จำกัดการซื้อ "ครั้ง")
**อาการ**: ในโมดัล "แก้ไขรอบส่ง"/"เพิ่มรอบส่ง" เลข `20` ทับคำว่า "ออเดอร์" และ `120` ทับ "นาที" อ่านไม่ออก
**Root cause**: input hardcode `pr-6` (24px) ซึ่งพอดีแค่ postfix สั้นอย่าง "฿"/"%" — postfix ไทยยาว 30-45px จึงล้ำเข้ามาทับ value ที่ `text-right` (ยิ่งกล่อง default `w-24` = 96px ยิ่งไม่มีที่)
**วิธีแก้**: วัดความกว้าง postfix จริงด้วย ref + `useLayoutEffect` + `ResizeObserver` แล้วเซ็ต `paddingRight = width + 14px` แบบ inline (fallback `pr-6` ตอนยังไม่วัด) + `whitespace-nowrap` ที่ span — แก้ที่ component เดียวได้ทุกหน้าที่ใช้ · เพิ่ม `width="w-full" inputClassName="w-full"` ให้ 4 ช่องในหน้า delivery (ช่อง 96px แคบเกินสำหรับ postfix ไทย + placeholder ยาว "เว้นว่าง = ไม่จำกัด")
**ป้องกัน regression**: postfix ที่ยาวกว่า 1-2 ตัวอักษร ห้ามพึ่ง padding คงที่ · ถ้าจะเพิ่ม variant ใหม่ของ PostfixInput ให้คงการวัดนี้ไว้ และวางในกริดด้วย `w-full` เสมอเมื่อ postfix เป็นคำไทย

---

## 2026-08-14 — Shopee webhook ตรวจลายเซ็นไม่ผ่าน "ทุกรายการ" ตั้งแต่วันแรก (22,414 รายการ) — Push Partner Key เป็นคนละตัวกับ API Partner Key

**ที่เกิด**: [app/api/shopee/webhook/route.ts](app/api/shopee/webhook/route.ts) — `verifySignature()` ใช้ `SHOPEE_PARTNER_KEY` (API key)
**อาการ**: webhook ทุกตัวถูก log เป็น `signature_valid=false` → skipped ตั้งแต่ 2026-04-21 (22,414 รายการ ไม่เคยผ่านเลย) — ไม่มีใครสังเกตเพราะ cron polling (sync-all ทุก 15 นาที) ทำงานแทนตลอด ระบบเลยดูปกติ จนกระทั่ง partner key หมดอายุ (22 ก.ค.) แล้ว cron ตายด้วย → Shopee ทั้งระบบหยุด sync 1 เดือน + โดนใบเตือน API success rate
**Root cause**: Shopee มี key **2 ตัวแยกกัน** — "Live API Partner Key" (เราใช้ยิง API) กับ "**Live Push Partner Key**" (Shopee ใช้เซ็น webhook — อยู่ที่ Console > Push Mechanism > Set Push) ค่าไม่เหมือนกัน แต่โค้ด verify webhook ด้วย API key → fail เสมอ (Shopee เพิ่งเผยเรื่องนี้ใน dialog ตอน rotate key)
**วิธีแก้**: webhook route ใช้ `SHOPEE_PUSH_PARTNER_KEY || SHOPEE_PARTNER_KEY` (commit `63c74ba`) + เพิ่ม env `SHOPEE_PUSH_PARTNER_KEY` = ค่าจากหน้า Set Push ใน Vercel/.env.local · ฝั่ง ops: rotate API key ที่หมดอายุ + deactivate ร้านชั่วคราวหยุด cron ยิง fail กู้ success rate + ต้อง re-authorize ทุกร้าน (refresh token หมดอายุระหว่าง key เสีย)
**ป้องกัน regression**: ตรวจสุขภาพ webhook ต้องดู `signature_valid` ใน `marketplace_webhook_log` ไม่ใช่แค่ "มี log เข้า" — ลายเซ็น fail เงียบๆ ได้เพราะ cron กลบอาการ · rotate API Partner Key ไม่กระทบ Push Partner Key (และกลับกัน) — เป็นคนละ lifecycle

---

## 2026-07-27 — คลัง consignment query ด้วย `.single()` จะพังเมื่อลูกค้ามีหลายคลัง (PC counters)

**ที่เกิด**: 10 จุด / 8 ไฟล์ (replenishments receive+[id], inventory, department-orders receive+[id], department-store/reports/[id] ×2, consignment/reports+[id] ×2, consignment/portal) — ทุกจุด query `warehouses` ด้วย `customer_id + warehouse_type='consignment'` แล้ว `.single()`
**อาการ**: ยังไม่ทันเกิดกับลูกค้า (กันไว้ก่อน) — แต่ทันทีที่สร้างสาขา (counter) ใบที่ 2 ให้ลูกค้าห้าง = ลูกค้ามีคลัง consignment 2 ใบ → `.single()` โยน error → DSR confirm/void, CSR, รับของ, portal พังหมด
**Root cause**: สมมติฐานเดิม "1 ลูกค้า = 1 คลัง consignment" ถูกยกเลิกโดยระบบ PC counters (1 สาขา = 1 คลัง)
**วิธีแก้**: helper กลาง [lib/consignment-warehouse.ts](lib/consignment-warehouse.ts) — `getCustomerConsignmentWarehouse()` (เลือกคลัง**เก่าสุด** = ใบที่ counter #1 adopt — legacy flows ทำงานกับคลังเดิมต่อ) + `getConsignmentDestinationWarehouse()` (counter-aware: replenishment/dept-order/DSR ที่ระบุ `counter_id` ใช้คลังสาขานั้น) — แทนทั้ง 10 จุด (commit `feff9a5`)
**ป้องกัน regression**: **ห้าม query คลัง consignment ด้วย `.single()`/`.maybeSingle()` ตรงๆ อีกเด็ดขาด** — ใช้ helper จาก `lib/consignment-warehouse.ts` เสมอ (รับ supabase client เป็น param ใช้ได้ทั้ง route ปกติและ public route) · เช็คสิทธิ์ PC เข้าสาขาก็เช่นกัน — ใช้ `canAccessCounter()` จาก [lib/counter-access.ts](lib/counter-access.ts) ห้าม query `counter_assignments` ตรง (จะพลาดเคสหน่วยแทน `pc_all_counters`)

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
