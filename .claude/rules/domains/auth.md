---
paths:
  - "lib/auth/**/*"
  - "proxy.ts"
  - "lib/supabase-admin.ts"
  - "lib/auth-context.tsx"
  - "lib/company-context.tsx"
  - "lib/oauth-state.ts"
  - "lib/line-login.ts"
  - "app/auth/**/*"
  - "app/login/**/*"
  - "app/register/**/*"
  - "app/invite/**/*"
  - "app/line-callback/**/*"
  - "app/onboarding/**/*"
  - "app/api/auth/**/*"
  - "components/auth/**/*"
  - "app/bills/**/*"
  - "app/transfers/**/*"
  - "app/replenishments/receive/**/*"
  - "app/portal/**/*"
  - "app/supplier-portal/**/*"
---
# Auth (cookie + JWT) + หน้า public ที่ส่งลิงก์ให้ลูกค้า (SSR)

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 🔐 Auth Architecture (เพิ่มเมื่อ 2026-07-24 — cookie-based แบบเดียวกับ aoosocial/aoobooking)

### ภาพรวม
- **Session เก็บใน cookie** (`sb-<projectRef>-auth-token`, chunked ได้) ผ่าน `createBrowserClient` ของ `@supabase/ssr` — ไม่ใช่ localStorage แล้ว (key เดิม `joolzjuice-auth` มี one-time migration ตอน boot ใน session-manager)
- **[proxy.ts](../../../proxy.ts)** (Next.js 16 middleware) กัน route ตั้งแต่ edge — ไม่มี auth cookie → redirect `/login?redirect=...`; อยู่ `/login|/register` พร้อม token ที่ verify ผ่าน → `/onboarding`. **Matcher ยกเว้น `/api` ทั้งหมด** (routes กันตัวเอง + webhook/cron ใช้ secret ของตัวเอง) — PUBLIC_PREFIXES ใน proxy.ts ต้อง sync กับ PUBLIC_ROUTES ใน auth-context.tsx เสมอ
- **API auth เป็น dual-mode**: `Bearer` header (apiFetch — ทางหลัก) → fallback อ่านจาก auth cookie (`extractRequestToken`) — SSR pages ในอนาคตเรียก API ได้เลย

### โมดูล `lib/auth/`
| File | Runtime | หน้าที่ |
|---|---|---|
| [lib/auth/login-methods.ts](../../../lib/auth/login-methods.ts) | client | ฟังก์ชัน login ต่อ provider (password/Google/LINE) + `verifyMfaCode()` — คืน `LoginResult` (`success/redirect/mfa_required/error`) — **เพิ่มวิธี login ใหม่ = เพิ่มฟังก์ชันในไฟล์นี้ไฟล์เดียว** (provider ที่ server mint session ปิดท้ายด้วย `adoptSession()`) |
| [lib/auth/session-manager.ts](../../../lib/auth/session-manager.ts) | client | เจ้าของ token cache ตัวเดียว — `getAccessToken()` (apiFetch ใช้), `adoptSession()`, `clearSession()`, `migrateLegacyLocalStorageSession()` |
| [lib/auth/jwt-local.ts](../../../lib/auth/jwt-local.ts) | **edge-safe** | `verifyJwtLocally()` — jose + JWKS (ES256) ล้วน ไม่แตะ Supabase client — ใช้ได้ทั้ง proxy.ts และ API routes |
| [lib/auth/cookie-token.ts](../../../lib/auth/cookie-token.ts) | edge-safe | parse auth cookie (chunk + `base64-` prefix) + `extractRequestToken()` (Bearer → cookie) + `hasAuthCookie()` |
| [lib/auth/verify-token.ts](../../../lib/auth/verify-token.ts) | server (node) | `verifyAccessToken()` — local verify ผ่าน jwt-local → fallback `auth.getUser()` network (retry transient, warn ครั้งเดียว/process); expired = reject ทันที |

### กติกา
- `checkAuthWithCompany` / `checkAuth` / `checkSuperAdmin` ใน [lib/supabase-admin.ts](../../../lib/supabase-admin.ts) ใช้ `extractRequestToken` + `verifyAccessToken` แล้ว — **ห้ามเรียก `supabaseAdmin.auth.getUser(token)` ตรงๆ ใน route ใหม่**
- **หน้าคำเชิญพนักงาน `/invite/[token]` มีทางเข้าเดียว = Google** — ห้ามเพิ่มปุ่มล็อกอินทางอื่นหรือลิงก์ไป `/login` `/register` ในหน้านี้ ถ้าทางนั้นไม่ได้พา `invite_token` ไปด้วย (คนกดแล้วจะไปโผล่หน้า "สร้างบริษัทใหม่") · LINE Login เหลือใช้เฉพาะหน้าร้านฝั่งลูกค้า
- **อะไรที่ต้องรอดข้าม OAuth round trip ห้ามฝากไว้กับ cookie อย่างเดียว** — ใส่ใน `state` หรือ query ของ redirect (เบราว์เซอร์ในแอป LINE/FB สลับ context ได้ ทำ cookie หาย ดู fix-bug.md 2026-09-02)
- Google OAuth เป็น **PKCE** แล้ว (default ของ @supabase/ssr) — [app/auth/callback/page.tsx](../../../app/auth/callback/page.tsx) poll getSession สูงสุด 10×300ms รอ exchange
- `AuthResult.aal` = `'aal2'` เมื่อ session ผ่าน 2FA — ไว้บังคับ MFA per-route ในอนาคต
- Trade-off ที่ยอมรับ: ban user กลางทาง token เดิมยังผ่าน local verify จนหมดอายุ (~1 ชม.) แต่ปิด membership (`is_active=false`) มีผล ≤30s เท่าเดิม (auth cache TTL); middleware เช็คแค่ cookie presence สำหรับหน้า protected (token หมดอายุแต่ refresh ได้ต้องผ่านเข้าไปให้ client refresh)
- **2FA พร้อมเชิงโครงสร้าง**: `loginWithPassword` คืน `mfa_required` เมื่อบัญชี enroll TOTP → login page มี step กรอกรหัส 6 หลัก → `completeMfaLogin()`; state `mfaPending` กัน redirect ระหว่างกรอกรหัส — เหลือแค่หน้า enroll (settings) ตอนเปิดใช้จริง

## 🌐 Public Online Pages — SSR pattern (เพิ่มเมื่อ 2026-07-25)

หน้า public (ลิงก์แชร์ผ่าน LINE, ไม่ต้อง login) ใช้ pattern **server wrapper + client island**:
- `page.tsx` = server component: ดึงข้อมูลโดย **import GET handler ของ API route มาเรียก in-process** (single source of truth, ไม่มี HTTP hop) ห่อด้วย React `cache()` (dedupe ระหว่าง generateMetadata กับ page) + `generateMetadata` ทำ OG preview + **`robots: noindex` เสมอ** (ลิงก์ส่วนตัว)
- `*-client.tsx` = UI เดิมทั้งหมด รับ `initialData` prop — มีข้อมูลตั้งแต่ first paint; ถ้า server fetch fail จะ fallback fetch ฝั่ง client เอง

| หน้า | สถานะ |
|---|---|
| [/bills/[id]](../../../app/bills/[id]/page.tsx) (บิลออนไลน์) | ✅ SSR + OG (เลขบิล/ร้าน/ยอด/สถานะ + โลโก้) |
| [/transfers/receive/[token]](../../../app/transfers/receive/[token]/page.tsx) (รับของโอนย้าย) | ✅ SSR + OG |
| [/replenishments/receive/[token]](../../../app/replenishments/receive/[token]/page.tsx) (รับของเติม) | ✅ SSR + OG |
| /portal/consignment + /supplier-portal + /invite | ⚠️ **static metadata เท่านั้น** (layout) — มี PIN/code gate ฝั่ง client **ห้าม SSR ข้อมูล** ไม่งั้นข้อมูลอยู่ใน HTML ก่อนผ่าน PIN |

หน้า public ใหม่ทุกหน้า → ใช้ pattern นี้ตั้งแต่แรก (หน้า gated → metadata อย่างเดียว)

