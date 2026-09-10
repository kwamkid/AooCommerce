// Path: lib/useFacebookSdk.ts
// โหลด Facebook JS SDK แล้วเปิดหน้าต่างขอสิทธิ์ — ใช้ร่วมทุกหน้าที่ต้องล็อกอิน Facebook
// (ช่องทางแชท = ขอสิทธิ์เพจ · บัญชีโฆษณา = ขอสิทธิ์ ads_management/business_management)
//
// ⚠️ `<script>` ของ SDK มีได้ตัวเดียวต่อหน้าเว็บ และ `FB.init()` เรียกซ้ำไม่ได้ —
// ตัวโหลดจึงเป็น singleton ระดับโมดูล (`loadPromise`) ทุกหน้าที่เรียก hook นี้
// แชร์ script ตัวเดียวกัน · เดิมหน้าช่องทางแชทจดตัวโหลดไว้ใน ref ของตัวเอง
// พอมีหน้าที่สองที่ต้องใช้ SDK เหมือนกันจะกลายเป็นสอง script ที่ init ชนกัน
//
// ท่าล็อกอินยกมาจากหน้าช่องทางแชทเป๊ะ ๆ: getLoginStatus → logout ถ้ายัง connected อยู่
// → FB.login (กัน warning "overriding current access token" และบังคับให้ Facebook
// แสดงหน้าต่างเลือกสิทธิ์ใหม่จริง ๆ ผ่าน auth_type: 'reauthorize')
'use client';

import { useCallback, useEffect, useState } from 'react';

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';

/** SDK โหลด + init เสร็จแล้วหรือยัง — ระดับโมดูล เพราะ script มีตัวเดียวทั้งหน้าเว็บ */
let sdkReady = false;
let loadPromise: Promise<void> | null = null;

function loadSdk(appId: string): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve) => {
    // SDK ถูกโหลดไว้แล้วจากที่อื่น (init ไปแล้ว) — ใช้ต่อได้เลย
    if (window.FB) {
      sdkReady = true;
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
      sdkReady = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
  return loadPromise;
}

export interface FacebookSdk {
  /** SDK พร้อมเรียก login แล้ว — ปุ่มที่พาไป Facebook ต้อง disable จนกว่าค่านี้เป็น true */
  ready: boolean;
  /** ว่าง = ยังไม่ได้ตั้ง NEXT_PUBLIC_FACEBOOK_APP_ID → ล็อกอินไม่ได้ ต้องเหลือทางกรอกเอง */
  appId: string;
  /**
   * เปิดหน้าต่างขอสิทธิ์ของ Facebook แล้วคืน short-lived access token
   * reject ด้วย `Error('not_ready')` เมื่อ SDK ยังไม่พร้อม และ `Error('denied')`
   * เมื่อผู้ใช้ปิดหน้าต่าง/ไม่ให้สิทธิ์ — ผู้เรียกแปลเป็นข้อความไทยเอง
   */
  login: (scope: string) => Promise<string>;
}

/**
 * @param enabled โหลด SDK เมื่อจำเป็นเท่านั้น (หน้าช่องทางแชทโหลดเฉพาะตอนอยู่แท็บ Facebook)
 */
export function useFacebookSdk(enabled: boolean): FacebookSdk {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || !FB_APP_ID) return;
    let cancelled = false;
    loadSdk(FB_APP_ID).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [enabled]);

  const login = useCallback((scope: string) => new Promise<string>((resolve, reject) => {
    if (!sdkReady || typeof window === 'undefined' || !window.FB) {
      reject(new Error('not_ready'));
      return;
    }
    const doLogin = () => {
      window.FB.login((response) => {
        if (response.status !== 'connected' || !response.authResponse) {
          reject(new Error('denied'));
          return;
        }
        resolve(response.authResponse.accessToken);
      }, { scope, auth_type: 'reauthorize' });
    };
    // ออกจากระบบก่อนถ้ายังค้าง session เดิมอยู่ — กัน warning "overriding current access token"
    window.FB.getLoginStatus((statusResponse) => {
      if (statusResponse.status === 'connected') window.FB.logout(() => doLogin());
      else doLogin();
    });
  }), []);

  return { ready, appId: FB_APP_ID, login };
}
