---
paths:
  - "public/sw.js"
  - "public/.well-known/**/*"
  - "lib/push/**/*"
  - "lib/native/**/*"
  - "lib/pwa-install.ts"
  - "lib/in-app-browser.ts"
  - "app/manifest.ts"
  - "app/superadmin/manifest.webmanifest/**/*"
  - "app/install/**/*"
  - "app/api/push/**/*"
  - "components/PwaRegister.tsx"
  - "components/InstallAppBanner.tsx"
  - "components/PullToRefresh.tsx"
  - "components/ui/PushNotificationToggle.tsx"
  - "app/superadmin/components/SuperAdminNotificationBell.tsx"
  - "mobile/**/*"
  - "scripts/generate-pwa-icons.mjs"
  - "app/layout.tsx"
  - "lib/auth/session-manager.ts"
---
# PWA + Push Notifications + แอป native (Capacitor)

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 📱 PWA + Push Notifications (เพิ่ม 2026-08-23 — pattern กลาง: `aoo-techstack/pwa-push/PWA-PUSH.md`)

เว็บติดตั้งเป็นแอพได้ (Add to Home Screen) + แจ้งเตือนแชทใหม่/ออเดอร์ใหม่ถึงมือถือแม้ปิดจอ — repo เดียวกับเว็บ deploy เดียวกัน

- **2 แอปแยกกัน (เพิ่ม 2026-09-02)** — ติดตั้งเป็นคนละไอคอน **และแจ้งเตือนแยกสายกันจริง**:
  | | แอปของร้าน | แอปผู้ดูแลระบบ |
  |---|---|---|
  | manifest | [app/manifest.ts](../../../app/manifest.ts) → `/manifest.webmanifest` | [app/superadmin/manifest.webmanifest/route.ts](../../../app/superadmin/manifest.webmanifest/route.ts) |
  | เปิดที่ (`start_url`) | `/dashboard` | `/superadmin` |
  | ไอคอน / ธีม | **โลโก้แดงบนพื้นขาว** (theme `#F4511E`) | **โลโก้ม่วง `#9333ea` บนพื้นขาว** (`admin-*.png`) · theme `#0f172a` |
  | manifest `scope` | `/` | `/` — **ห้ามจำกัดเป็น `/superadmin`** (ดูด้านล่าง) |
  | SW scope (แยกสายแจ้งเตือน) | `/` | `/superadmin/` |
  | ได้รับแจ้งเตือน | แชท · ออเดอร์ใหม่ · เรื่องที่ร้านแก้เอง | เรื่องระดับระบบจาก watchdog |
  - **ไอคอนทั้งสองแอป = โลโก้สีบนพื้นขาว แยกกันด้วยสีโลโก้ (แดง/ม่วง) ไม่ใช่สีพื้น** (2026-09-05) — iOS 18+ ย้อมไอคอนที่ไม่มีเวอร์ชัน dark ให้เองตอนหน้าจอโฮมเป็นโหมดมืด: พื้นกลายเป็นดำ โลโก้คงสี → ได้ "พื้นดำ+โลโก้แดง / พื้นดำ+โลโก้ม่วง" ตามต้องการโดยไม่ต้องมีไอคอน dark (PWA ส่งแยกไม่ได้อยู่แล้ว) · ⚠️ **พื้นสีอิ่มไม่รอดจากการย้อม** — เคยลองพื้นแดง+โลโก้ขาว iOS ย้อมพื้นเป็นดำเหมือนกัน (จอจริง 5 ก.ย.) อย่ากลับไปพึ่งสีพื้น · เปลี่ยนสี = แก้จานสีใน [scripts/generate-pwa-icons.mjs](../../../scripts/generate-pwa-icons.mjs) แล้วรันใหม่
  - **กลไกที่ทำให้แยกได้**: ไฟล์ `/sw.js` ตัวเดียวกัน แต่ `register()` คนละ `scope` → เบราว์เซอร์นับเป็นคนละ registration → `pushManager.subscribe()` ได้คนละ endpoint · คอลัมน์ `push_subscriptions.audience` (`app`/`superadmin`) บอกว่าแถวนั้นเป็นของแอปไหน · `sendPushToUsers(ids, payload, { audience })` เลือกสายตอนส่ง
  - **1 เครื่องเปิดได้ทั้งสองสาย** ต้องกดเปิดแยกกัน 2 ครั้ง (สวิตช์ในกระดิ่งของแอปร้าน = สาย `app` · สวิตช์ในกระดิ่งบน header ของ shell superadmin ([SuperAdminNotificationBell](../../../app/superadmin/components/SuperAdminNotificationBell.tsx) — โชว์ issue ของตัวเฝ้าด้วย) = สาย `superadmin`) · ⚠️ **SW ของสายไหนต้องถูกจดตั้งแต่เปิดแอป ไม่ใช่ตอนกดสวิตช์** — `pushManager.subscribe()` บน worker ที่ยังไม่ active ล้มทันที (แอปร้าน PwaRegister จดให้ · shell superadmin จดใน SuperAdminLayout) และ `enablePush` รอ active + เช็คว่าเซิร์ฟเวอร์รับ subscription จริงก่อนบอกว่าเปิดแล้ว
  - ⚠️ **`scope` ของ manifest ต้องเป็น `/` ทั้งสองแอป** — ของเดิมจำกัดแอปแอดมินไว้ที่ `/superadmin` เพื่อกันเดินหลง แต่พอ session หมดอายุ ตัวกันสิทธิ์พาไป `/login` ซึ่งอยู่นอก scope → **iOS เตะออกไปเปิดใน Safari** ซึ่งล็อกอินเป็นผู้ใช้ปกติอยู่แล้ว เลยไปโผล่หน้า "เลือกบริษัท" แล้ววนแบบนี้ตลอด (แอปที่ติดตั้งบน iOS มีถังคุกกี้ของตัวเอง แยกจาก Safari และแยกจากกันเอง — **การล็อกอินต้องเกิดในแอปเดียวกันเท่านั้น**) · scope ของ manifest **คนละเรื่องกับ scope ของ service worker** ตัวหลังต่างหากที่แยกสายแจ้งเตือน
  - **ทางที่พาออกนอกแอปได้ต้องพก `?redirect=` กลับเสมอ** — `useSuperAdminGuard` + auth-context อ่านค่านี้แล้วพากลับที่เดิม ไม่งั้นล็อกอินเสร็จไปจบที่ `/onboarding` ทุกครั้ง
  - **เลขบนไอคอนแอป = unread จริงจากเซิร์ฟเวอร์ (2026-09-07)** — `countUnreadChatForUser()` ใน [lib/push/badge.ts](../../../lib/push/badge.ts) (ผลรวม unread_count ทุกคู่สนทนา ทุกบริษัทของผู้ใช้ = สูตรเดียวกับตัวเลขในแอป) แนบ `badge` ไปกับ push ทุกใบ (SW ตั้งตรง ๆ · FCM ใส่ `aps.badge`) และ `/api/header/summary` คืน `badgeTotal` ให้ `HeaderSummaryProvider` เรียก `syncAppBadge()` ทุกครั้งที่เลขเปลี่ยน · **ห้ามกลับไปล้างเลขตอนเปิดแอป/แตะ/แตะแจ้งเตือน** (ผู้ใช้ตีกลับว่าเปิดแอปแล้วเลขหายทั้งที่ยังอ่านไม่หมด) · SW ยังบวกหนึ่งเป็น fallback เมื่อ push ไม่มี badge
  - **เลขบนไอคอนแอปต้องเรียก Badging API เอง** — iOS/Android ไม่ได้แปะจำนวนแจ้งเตือนให้ PWA อัตโนมัติ · `sw.js` นับใน Cache API (ต่อคิวงานตัวนับเส้นเดียว กัน push 2 ใบพร้อมกันอ่านค่าเดิม) แล้ว `setAppBadge()` ตอน push เข้า — **ตั้งเลขก่อน แล้วค่อยเขียนตัวนับ** และอ่านตัวนับมี timeout 1.5 วิ (อ่านไม่ทัน = ตั้ง 1 ไปก่อน) เพราะ SW ที่ถูกปลุกจากศูนย์อาจโดนฆ่าก่อน Cache API ตอบ · **SW จดผลครั้งล่าสุดไว้** (`/__badge_last_push` = ตั้งได้ไหม/เลขอะไร · `/__badge_last_clear` = ใครสั่งล้าง: เปิดแอป/แตะ/กดแจ้งเตือน) → สวิตช์แจ้งเตือนในกระดิ่งโชว์บรรทัดสรุป + ปุ่ม "ทดสอบเลขบนไอคอน" (ตั้งจากหน้าเว็บตรง ๆ แยกว่า OS ปิดป้ายกำกับ หรือสาย push พัง) — **เลขไม่ขึ้นครั้งหน้าให้ดูบรรทัดนี้ก่อน ห้ามเดา** · **ล้างเลขเมื่อผู้ใช้ "เห็น" จริง** ใน [components/PwaRegister.tsx](../../../components/PwaRegister.tsx): เปิดแอปใหม่ (mount) = ล้างทันที · แต่ **กลับมา visible (ปลดล็อกจอ/สลับแอปกลับ) แค่ตั้งท่ารอ แล้วล้างเมื่อแตะ/กดครั้งแรก** — เดิมล้างทันทีตอน visible ทำให้เคส "เปิดแอปค้างไว้แล้วล็อกจอ → push เข้า → ปลดล็อก" เลขหายก่อนได้เห็น = "มีบ้างไม่มีบ้าง" (4 ก.ย. 2026) · ยิง push พลาดลง `integration_logs` (`webpush`) แล้ว ขาสำเร็จไม่ log
  - **รูดลงเพื่อรีเฟรช** ([components/PullToRefresh.tsx](../../../components/PullToRefresh.tsx) ใน Layout) — **เฉพาะ standalone** (เบราว์เซอร์มีท่าของตัวเอง เปิดซ้อนจะรีเฟรชสองรอบ) · ฟัง touch ที่ `<main>` แล้ว `location.reload()` เมื่อลากลง ≥80px (หน้าเป็น client component ที่ fetch เอง `router.refresh()` ไม่ได้ข้อมูลใหม่) · ไล่เช็คทุกกล่องที่เลื่อนได้ตั้งแต่จุดแตะถึง main ต้องอยู่ที่ยอด (scrollTop 0) · กล่องที่ไม่อยากให้ท่านี้ทำงานใส่ `data-ptr-ignore` (รายการข้อความในหน้าแชท — เลื่อนขึ้นดูของเก่าแล้วลากต่อไม่ควรรีเฟรชทิ้ง)
  - **safe area ของจอขอบโค้ง**: root layout ตั้ง `viewportFit: 'cover'` → **ทุกอย่างที่ fixed/sticky ติดขอบจอต้องเผื่อระยะเอง** ด้วยคลาส `.pt-safe* / .pb-safe* / .px-safe* / .top-safe-2 / .left-safe-3` ใน globals.css · ⚠️ `.px-safe` **แทนที่** padding ซ้ายขวาไม่ใช่บวกเพิ่ม — กล่องที่มี `p-4` อยู่แล้วให้ใช้ `.px-safe-4` · shell ของ superadmin ตั้ง status bar เป็น `black-translucent` (เนื้อหาไหลไปใต้นาฬิกา) จึงต้องเผื่อครบทั้ง header · ปุ่มเมนู · sidebar · ท้ายหน้า
  - **session บน iOS หลุดเพราะ Safari บีบอายุคุกกี้ที่ JS เขียนเหลือ 7 วัน** — `/api/auth/persist-session` ให้เซิร์ฟเวอร์เขียนคุกกี้ชุดเดิมทับด้วยอายุ 400 วัน (คุกกี้จาก `Set-Cookie` ไม่โดนเพดานนั้น) · [lib/auth/session-manager.ts](../../../lib/auth/session-manager.ts) ยิงตามหลังทุก `SIGNED_IN`/`TOKEN_REFRESHED` เพื่อให้คนเขียนคนสุดท้ายเป็นเซิร์ฟเวอร์เสมอ
  - **สาย `superadmin` ขอได้เฉพาะ superadmin จริง** — `/api/push/subscribe` เช็ค `is_super_admin` ก่อนบันทึก
  - ⚠️ **แยกแอปไม่ใช่การกันสิทธิ์** — คนทั่วไปเข้า `/superadmin` ไม่ได้อยู่แล้วจาก `useSuperAdminGuard` + `checkSuperAdmin` (และไม่มีเมนูใน Sidebar) · manifest เป็นแค่ทางลัด
- **ชิ้นส่วน**: [app/manifest.ts](../../../app/manifest.ts) (Next serve `/manifest.webmanifest` เอง) · [public/sw.js](../../../public/sw.js) (**push-only — ห้ามเพิ่ม offline caching** stale cache กับ Next = บั๊กยาก) · [lib/push/client.ts](../../../lib/push/client.ts) (browser: register SW + state `unsupported/ios-needs-install/denied/subscribed/unsubscribed`) · [lib/push/send.ts](../../../lib/push/send.ts) (server: `sendPushToCompany` / `sendChatPush` / `sendNewOrderPushById` — **ไม่ throw เด็ดขาด** อยู่ใน webhook flow, endpoint ตาย 404/410 ลบ row อัตโนมัติ) · `/api/push/subscribe` (POST/DELETE) + `/api/push/test` · toggle ต่อ device ใน dropdown กระดิ่ง Header ([components/ui/PushNotificationToggle.tsx](../../../components/ui/PushNotificationToggle.tsx)) · icon gen ด้วย [scripts/generate-pwa-icons.mjs](../../../scripts/generate-pwa-icons.mjs)
- **Table**: `push_subscriptions` (unique `endpoint`, upsert ทับ = device ตาม company ล่าสุดที่เปิด, RLS มาตรฐาน) + `audience` (`app`/`superadmin`) แยกสายแจ้งเตือน
- **จุดยิง push ปัจจุบัน**: แชทขาเข้า 4 platform (line/facebook/shopee/lazada — หลัง insert message สำเร็จใน `lib/services/chat/*`) + ออเดอร์ใหม่ (shopee/tiktok/lazada `createNewOrder` + storefront checkout — ผ่าน `sendNewOrderPushById`)
- **หลายบริษัท: ยิงตาม "คน" ไม่ใช่ตาม `push_subscriptions.company_id`** — คอลัมน์นั้นเป็นแค่ *ร้านล่าสุดที่เครื่องนี้เปิดค้างไว้* (upsert ทับด้วย endpoint) ไม่ใช่สิทธิ์การรับแจ้งเตือน · `sendPushToCompany()` หาผู้รับจาก `company_members` ที่ยัง active → คนดูแลหลายร้านได้ครบทุกร้านโดยไม่ต้องกดสลับ · เคยกรองด้วย `company_id` แล้ว **บางบริษัทไม่มีเครื่องรับเลยสักเครื่อง** (ดู [fix-bug.md](../../../fix-bug.md) 2026-09-04)
- **แจ้งเตือนต้องบอกว่าร้านไหน + กดแล้วพาไปร้านนั้น** — ชื่อบริษัทนำหน้า body เฉพาะคนที่อยู่หลายบริษัท · url ต่อ `?company=<id>` (`withCompanyParam`) แล้ว [lib/company-context.tsx](../../../lib/company-context.tsx) สลับให้ตอน provider เริ่มทำงาน **โดยไม่ reload** (`switchCompany()` สั่ง reload จะหลุดจากหน้าปลายทาง) · **เพิ่มจุดยิง push ใหม่ต้องผ่าน `sendPushToCompany()` เสมอ** จะได้ของพวกนี้ครบเอง
- **Freshness guard บังคับ**: แชทเก่า >10 นาที / ออเดอร์เก่า >30 นาที (ใช้เวลาจริงของ platform) **ไม่ยิง** — กัน initial sync/backfill/webhook retry ถล่มแจ้งเตือนทุกเครื่อง · เพิ่ม event ใหม่ต้องคิดเรื่องนี้เสมอ
- **tag ต่อ conversation/order** — แจ้งเตือน tag เดียวกันแทนที่กัน กัน spam
- **หน้าตาแจ้งเตือน (เปลี่ยน 2026-09-06)** — หัวข้อคือ **ช่องทาง** ไม่ใช่ชื่อคนทัก: แชท = `{ชื่อร้าน/เพจ/OA} · {แพลตฟอร์ม}` + เนื้อ `{ชื่อลูกค้า}: {ข้อความ}` · ออเดอร์ = `{ชื่อร้าน} · {แพลตฟอร์ม}` + เนื้อ `ออเดอร์ใหม่ ฿1,290 · {ชื่อลูกค้า}` (**ไม่ใส่เลขที่บิล** — กดแล้วเปิดใบนั้นอยู่แล้ว) · ไม่รู้ชื่อร้าน = เหลือชื่อแพลตฟอร์มอย่างเดียว **ห้ามเหลือหัวข้อเปล่า**
- **ไอคอนแจ้งเตือน `/api/push/icon`** — ประกอบ PNG 192px: รูปช่องทาง (โลโก้ร้าน / รูปเพจ / รูป OA) ครอบวงกลม + ตราแพลตฟอร์มมุมขวาล่าง · ไม่มีรูป → วงกลมสีแบรนด์ + ตราตัวใหญ่ · **พังเมื่อไหร่ตกไปที่ไอคอนแอปเสมอ ห้าม 500** (ไอคอนพังต้องไม่ทำให้แจ้งเตือนพัง) · แคชที่ edge ต่อร้าน (`s-maxage`) · ที่มาของรูปใช้ `resolveAccountPicture()` จาก [lib/chat/account-picture.ts](../../../lib/chat/account-picture.ts) **ตัวเดียวกับหน้าตั้งค่าช่องทาง** · SVG โลโก้อ่านจาก `public/` จึงต้องมีชื่ออยู่ใน `outputFileTracingIncludes` ของ [next.config.ts](../../../next.config.ts) ไม่งั้นบน Vercel หาไฟล์ไม่เจอแบบเงียบ ๆ
- ⚠️ **iOS ไม่สนไอคอนที่เราส่งไป** — แจ้งเตือนบน iPhone ใช้ไอคอนแอปเสมอ **ข้อความจึงต้องบอกช่องทางให้ครบด้วยตัวเอง** ไอคอนเป็นของแถมสำหรับ Android/เดสก์ท็อป ห้ามย้ายข้อมูลสำคัญไปฝากไว้กับรูป
- **Env 3 ตัว** (มีใน .env.local แล้ว — **ต้องเพิ่มบน Vercel ตอน deploy**): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **iOS**: push ได้เฉพาะ installed PWA (iOS 16.4+) — client.ts คืน state `ios-needs-install` ให้ UI สอนวิธี Add to Home Screen
- **ชวนติดตั้งแอป (เพิ่ม 2026-09-04)** — หน้า [/install](../../../app/install/install-client.tsx) เป็น **public** (อยู่ใน `PUBLIC_PREFIXES` + `PUBLIC_ROUTES` ทั้งสองที่) ส่งลิงก์ให้พนักงานเปิดก่อน login ได้ · จับอุปกรณ์เองแล้วเปิดแท็บ iPhone/Android/คอม พร้อมขั้นตอน · **Android/Chrome กดติดตั้งทีเดียว** ผ่าน `beforeinstallprompt` ซึ่ง **ต้องดักไว้ใน inline script ของ [app/layout.tsx](../../../app/layout.tsx) ก่อน React hydrate** (Chrome ยิงครั้งเดียวและเร็วมาก — ไว้ที่ `window.__aooBip` แล้ว [lib/pwa-install.ts](../../../lib/pwa-install.ts) มารับช่วง) · เตือนเมื่อเปิดใน LINE/Facebook (ติดตั้งจากในนั้นไม่ได้) · แถบชวน [components/InstallAppBanner.tsx](../../../components/InstallAppBanner.tsx) ใต้หัวเว็บเฉพาะ **<1024px + ไม่ใช่ standalone + ไม่ได้ปิดใน 14 วัน** ยกเว้น `/install` `/pos` `/pc` · **หน้าที่ต้องสูงเต็มพื้นที่ที่เหลือ (หน้าแชท) ห้ามคิดจาก `100dvh - <หัวเว็บ>`** — ใช้ `<Layout noPadding>` ที่ให้กล่องเนื้อหาเป็น `h-full` แล้วกล่องข้างในสูง `100%` (หัวเว็บจริง 65px ไม่ใช่ 64 · แถบชวนติดตั้งแทรกได้ · ผิด 1px ก็ทำให้ `main` เลื่อนแล้ว rubber band ดู [fix-bug.md](../../../fix-bug.md) 2026-09-04) · แถบนี้ยังตั้ง `--app-banner-h` ไว้ให้หน้าเก่าที่ยังใช้ `calc(100vh-64px)` (fb-chat, line-chat) หักออก · `isStandalone()`/`detectPlatform()` อยู่ที่ `lib/pwa-install.ts` ที่เดียว (`lib/push/client.ts` re-export) · เบราว์เซอร์ในแอป (LINE/FB/IG/TikTok) = `detectInAppBrowser()` + `IN_APP_LABELS` ใน [lib/in-app-browser.ts](../../../lib/in-app-browser.ts) ที่เดียว ใช้ทั้งหน้า /install (LINE ได้ปุ่ม "เปิดด้วยเบราว์เซอร์" ผ่านธง `openExternalBrowser=1`) และ `InAppBrowserNotice` หน้า login — ยุบ `getInAppBrowserName()` ที่เคยซ้ำแล้ว 2026-09-07 **ห้ามเขียน UA sniff ซ้ำ**
- proxy.ts matcher ยกเว้นไฟล์มีนามสกุลอยู่แล้ว → `/sw.js`, `/manifest.webmanifest`, `/icons/*` เป็น public โดยไม่ต้องแก้

## 📲 แอป native (เปลือก Capacitor) — `mobile/` (เพิ่ม 2026-09-07 · ยังไม่เคย build/ขึ้น store)

- **เปลือกเปิดเว็บตัวจริงใน WebView** (`server.url = https://aoocommerce.vercel.app`) — โค้ดเว็บ/API แก้แล้ว push Vercel ใช้ได้ทันที **ไม่ต้องยื่น review** · ยื่นเฉพาะตัวเปลือก (ไอคอน/splash/plugin/SDK ประจำปี) · runbook ครบใน [mobile/README.md](../../../mobile/README.md) (บัญชี Apple/Google/Firebase · Xcode/Android Studio · TestFlight · closed testing 14 วันของ Google · review notes)
- **ฝั่งเว็บรู้ว่าอยู่ในแอปด้วย `isNativeApp()`** จาก [lib/native/bridge.ts](../../../lib/native/bridge.ts) — เรียก plugin ผ่าน `window.Capacitor.registerPlugin()` ที่เปลือกฉีดให้ **ไม่ต้องติดตั้ง @capacitor/\* ใน repo เว็บ** (native side อยู่ใน `mobile/package.json`) · ทุกฟังก์ชันเงียบเมื่อไม่ใช่แอป
- **push ของแอป native = FCM** ทั้ง iOS/Android ([lib/push/fcm.ts](../../../lib/push/fcm.ts) เซ็น JWT service account ด้วย jose · env `FIREBASE_SERVICE_ACCOUNT_JSON`) · `push_subscriptions.kind` = `'webpush'` | `'fcm'` (`device_token`, `platform` · endpoint = `fcm:<token>` ใช้ unique เดิม) · `deliver()` ใน [lib/push/send.ts](../../../lib/push/send.ts) แยกทางตาม kind · **เลขบนไอคอนแอป native = จำนวนคู่สนทนาที่ยังไม่อ่านทุกบริษัทของคนนั้น ส่งมากับ push** (iOS รับแต่เลขจริง) — PWA ยังนับใน SW เหมือนเดิม
- **OAuth ในแอป**: Google/LINE เปิดใน system browser (`openInSystemBrowser`) แล้วกลับเข้าแอปด้วย Universal Link/App Link ที่ `/auth/callback` `/line-callback` — ไฟล์ [public/.well-known/](../../../public/.well-known/) (AASA ใส่ `TEAM_ID` · assetlinks ใส่ SHA256) · `/.well-known` อยู่ใน `PUBLIC_PREFIXES` ของ proxy.ts · next.config ตั้ง content-type ให้ AASA · ยังไม่ตั้ง = login ไปจบที่ Safari
- ⚠️ **ห้ามมีปุ่มซื้อ/อัปเกรดแพ็กเกจในแอป** (Apple บังคับ IAP หัก 15–30%) · appId `com.aoocommerce.app` เปลี่ยนไม่ได้หลังขึ้น store · แอปผู้ดูแลระบบไม่ขึ้น store (ใช้ PWA ต่อ)

