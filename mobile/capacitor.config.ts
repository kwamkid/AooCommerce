import type { CapacitorConfig } from '@capacitor/cli';

// เปลือกแอป AooCommerce — **ไม่ได้ bundle โค้ดเว็บไว้ในแอป** แต่เปิดเว็บตัวจริงใน WebView
// → หน้าเว็บ/API แก้แล้ว push ขึ้น Vercel ใช้ได้ทันทีโดยไม่ต้องยื่น review
// สิ่งที่ต้องยื่น review = ตัวเปลือกนี้เท่านั้น (ไอคอน · splash · plugin native · SDK ประจำปี)
//
// ⚠️ appId เปลี่ยนไม่ได้หลังขึ้น store แล้ว — ต้องตรงกับ Bundle ID (Apple) / package name (Google)
const config: CapacitorConfig = {
  appId: 'com.aoocommerce.app',
  appName: 'AooCommerce',
  webDir: 'www',
  server: {
    // เว็บตัวจริง — ทุกหน้าโหลดจากที่นี่ (www/ เป็นแค่ placeholder ให้ Capacitor พอใจ)
    url: 'https://aoocommerce.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    // ห้ามให้ WebView ไปเปิด OAuth ของ Google/LINE เอง (Google บล็อก webview) — ฝั่งเว็บเปิด
    // ผ่าน Browser plugin (SFSafariViewController) แล้วกลับเข้าแอปด้วย Universal Link
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      // แอปเปิดอยู่ก็ให้เห็นแจ้งเตือน (พฤติกรรมเดียวกับตอนเป็น PWA)
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F4511E',
    },
  },
};

export default config;
