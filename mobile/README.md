# AooCommerce — เปลือกแอป native (Capacitor)

แอปนี้ **ไม่ได้บรรจุโค้ดเว็บ** — เปิด `https://aoocommerce.vercel.app` ตัวจริงใน WebView
→ หน้าเว็บ/API แก้แล้ว push ขึ้น Vercel ใช้ได้ทันที **ไม่ต้องยื่น review**
สิ่งที่ต้องยื่น review คือตัวเปลือกนี้เท่านั้น (ไอคอน · splash · plugin native · SDK ประจำปี)

สิ่งที่ native ทำต่างจาก PWA (โค้ดฝั่งเว็บอยู่ที่ `lib/native/bridge.ts` และตรวจ `isNativeApp()`):
- **Push**: device token ผ่าน FCM ทั้ง iOS/Android → `POST /api/push/subscribe { kind:'fcm' }` → เซิร์ฟเวอร์ยิงด้วย `lib/push/fcm.ts`
- **เลขบนไอคอน**: เซิร์ฟเวอร์ส่งเลข (จำนวนแชทที่ยังไม่อ่าน) มากับ push — ไม่ต้องนับเองเหมือน service worker
- **Login Google/LINE**: เปิดใน system browser (Google บล็อก WebView) แล้วกลับเข้าแอปด้วย Universal Link / App Link
- **ไอคอน**: มีเวอร์ชัน dark/tinted จริง (iOS) · adaptive icon (Android)

---

## 0. บัญชีที่ต้องมี (คอขวดที่รอนานสุด — สมัครก่อน)

| | ที่ไหน | ค่าใช้จ่าย | รอ |
|---|---|---|---|
| Apple Developer Program | developer.apple.com/programs | $99/ปี | บุคคล ~2 วัน · นิติบุคคลต้องมี DUNS 2–7 วัน |
| Google Play Console | play.google.com/console | $25 ครั้งเดียว | 1–2 วัน · **บัญชีใหม่ต้อง closed testing 14 วัน ผู้ทดสอบ 12 คน** ก่อนขึ้น production |
| Firebase (ฟรี) | console.firebase.google.com | 0 | ทันที — ใช้ส่ง push ทั้งสองค่าย |

⚠️ ห้ามมีปุ่มซื้อ/อัปเกรดแพ็กเกจในแอป — ไม่งั้น Apple บังคับ In-App Purchase (หัก 15–30%) ให้ซื้อบนเว็บเท่านั้น

## 1. เครื่องที่ใช้ build

- **iOS**: Mac + Xcode (App Store, ~12GB) + CocoaPods (`brew install cocoapods`) — เครื่องที่ scaffold ไว้ยังไม่มี Xcode จึงยังไม่เคย build
- **Android**: Android Studio (ติดตั้ง SDK + JDK ให้เอง)

```bash
cd mobile
npm install
npm run assets:src && npm run assets   # ไอคอน/splash จาก ../public/logo.svg (ทำแล้ว)
npx cap sync                           # copy config + plugin ลง ios/ android/
npm run ios      # เปิด Xcode
npm run android  # เปิด Android Studio
```

## 2. Firebase (push ทั้งสองค่าย)

1. สร้างโปรเจกต์ Firebase → Add app **Android** package `com.aoocommerce.app` → ดาวน์โหลด `google-services.json` วางที่ `android/app/`
2. Add app **iOS** bundle `com.aoocommerce.app` → ดาวน์โหลด `GoogleService-Info.plist` วางที่ `ios/App/App/` แล้วลากเข้า Xcode (target App)
3. **APNs key**: Apple Developer › Keys › สร้าง key แบบ APNs (.p8) → Firebase › Project settings › Cloud Messaging › iOS app › อัปโหลด .p8 + Key ID + Team ID (ไม่ทำ = iOS ไม่ได้รับ push)
4. Firebase › Project settings › Service accounts › **Generate new private key** → ได้ JSON → ตั้ง env บน Vercel **`FIREBASE_SERVICE_ACCOUNT_JSON`** = เนื้อไฟล์ทั้งก้อน (หรือ base64 ของมัน) → redeploy
5. iOS ต้องต่อ Firebase Messaging ใน Xcode: Podfile มี `pod 'FirebaseMessaging'` แล้ว → `cd ios/App && pod install` · `AppDelegate.swift` แปลง APNs token → FCM token ให้แล้ว
   · Xcode › Signing & Capabilities › + **Push Notifications** และ + **Background Modes › Remote notifications**

## 3. Universal Links / App Links (ขา login กลับเข้าแอป)

- iOS: Xcode › Signing & Capabilities › + **Associated Domains** → `applinks:aoocommerce.vercel.app`
  แล้วแก้ `public/.well-known/apple-app-site-association` บนเว็บ: แทน `TEAM_ID` ด้วย Team ID จริง (Apple Developer › Membership) → push ขึ้น Vercel
- Android: หลังตั้ง upload key ใน Play Console (App integrity › App signing) เอา **SHA-256** ของ *App signing key* มาแทน `REPLACE_WITH_UPLOAD_KEY_SHA256` ใน `public/.well-known/assetlinks.json` → push
- ตรวจ: `curl https://aoocommerce.vercel.app/.well-known/apple-app-site-association` ต้องได้ JSON (ไม่ redirect ไป login)
- ยังไม่ตั้ง = login ในแอปจะไปจบที่ Safari/Chrome แทน (ล็อกอินได้แต่ไม่กลับเข้าแอป) — ระบบอื่นใช้ได้ปกติ

## 4. ทดสอบก่อนส่ง

1. เปิดแอป → ล็อกอิน Google (ต้องเด้งไป Safari แล้วกลับเข้าแอปเอง) · LINE เช่นกัน
2. กระดิ่ง › เปิด "แจ้งเตือนบนอุปกรณ์นี้" → ต้องขอสิทธิ์ของ OS → กด "ส่งแจ้งเตือนทดสอบ" → แจ้งเตือนขึ้นแบบ native (ไม่มีบรรทัด "from …")
3. ให้ลูกค้าทักแชท 1 ข้อความ → เลขบนไอคอน = จำนวนแชทที่ยังไม่อ่าน · เปิดแอปแล้วเลขหาย
4. แตะแจ้งเตือน → เปิดหน้าแชท/ออเดอร์ที่ถูก (deep link จาก `data.url`)
5. เช็คใน DB: `select kind, platform, count(*) from push_subscriptions group by 1,2` ต้องเห็นแถว `fcm`

## 5. ส่ง store

**App Store**: Xcode › Product › Archive → Distribute → TestFlight ก่อน (ทดสอบบนเครื่องจริง) → App Store Connect กรอก:
screenshot 6.7" + 6.5" · App Privacy (เก็บ: ชื่อ/อีเมล/เบอร์ ผูกตัวตน · ใช้เพื่อการทำงานของแอป · ไม่ tracking) · Privacy Policy URL = `https://aoocommerce.vercel.app/legal/privacy` · Support URL · **บัญชีทดสอบให้ reviewer** (มีหน้า `/login/email` + บัญชี reviewer อยู่แล้วจากรอบ Shopee/TikTok) · Review notes: "แอปสำหรับร้านค้าที่มีบัญชีอยู่แล้ว ไม่มีการซื้อในแอป มี push/แจ้งเตือนแชท-ออเดอร์/สแกนบาร์โค้ด"
- ถ้าโดน 4.2 "เป็นแค่เว็บห่อ" → ตอบว่าใช้ push native + badge + สแกนบาร์โค้ด + Universal Links และเป็น B2B tool ของลูกค้าที่มีบัญชี

**Google Play**: Android Studio › Build › Generate Signed Bundle (.aab, Play App Signing) → Play Console › Testing › **Closed testing** เพิ่มผู้ทดสอบ 12 คน (อีเมล Google ของพนักงาน) รอ 14 วัน → Apply for production → Data safety + Privacy policy → Production

## 6. อัปเดตครั้งต่อไปต้องยื่นอะไร

- แก้หน้าเว็บ/API/หลังบ้าน → **ไม่ต้อง** (push Vercel เหมือนเดิม)
- เปลี่ยนไอคอน/ชื่อ/splash · เพิ่ม plugin native · Capacitor/SDK ใหม่ (Apple บังคับ SDK ประจำปีราว เม.ย.–มิ.ย.) → build ใหม่ + ยื่น review

## ไฟล์สำคัญ

- `capacitor.config.ts` — appId `com.aoocommerce.app` (เปลี่ยนไม่ได้หลังขึ้น store) · `server.url` เว็บตัวจริง
- `assets/` ต้นทางไอคอน (สร้างจาก `scripts/make-assets.mjs`) → `npm run assets` กระจายลง ios/android
- `android/app/src/main/AndroidManifest.xml` — App Links 2 path + POST_NOTIFICATIONS
- `ios/App/App/AppDelegate.swift` — APNs token → FCM token · `Podfile` มี FirebaseMessaging
- ฝั่งเว็บ: `lib/native/bridge.ts` · `lib/push/fcm.ts` · `app/api/push/subscribe` (kind fcm) · `public/.well-known/*` · migration `20260907_push_subscriptions_native`
