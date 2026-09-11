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
//
// ล็อกอินได้ 2 แบบ: Facebook Login เดิม (`scope`) และ Facebook Login for Business (`config_id`
// จาก `FB_LOGIN_CONFIG`) — ใส่ config ครบก่อนแล้วค่อยกดเปลี่ยนระบบล็อกอินของ app ใน App Dashboard
'use client';

import { useCallback, useEffect, useState } from 'react';

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';

/**
 * Facebook Login for Business — รหัส configuration ที่ตั้งไว้ใน App Dashboard
 * (Facebook Login for Business › Configurations) · **ว่าง = ใช้ Facebook Login แบบเดิม (`scope`)**
 * ⚠️ ถ้าถอยระบบล็อกอินของ app กลับเป็น Facebook Login ต้องล้าง env พวกนี้ด้วย
 * (Facebook Login ไม่รู้จัก `config_id` หน้าต่างล็อกอินจะเปิดไม่ขึ้น)
 */
export const FB_LOGIN_CONFIG = {
  /** เชื่อมเพจ (หน้าช่องทางแชท) — token ผู้ใช้ */
  pages: process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_CONFIG_PAGES || '',
  /** เชื่อมบัญชีโฆษณา — token ผู้ใช้ */
  ads: process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_CONFIG_ADS || '',
  /** ข้อความการตลาด (Marketing Messages) — token แบบ System-business ผ่าน `response_type: 'code'` */
  marketing: process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_CONFIG_MARKETING || '',
};

type LoginOptions = NonNullable<Parameters<Window['FB']['login']>[1]>;
type AuthResponse = NonNullable<Parameters<Parameters<Window['FB']['login']>[0]>[0]['authResponse']>;

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

/** เปิดหน้าต่างของ Facebook — reject `not_ready` เมื่อ SDK ยังไม่พร้อม · `denied` เมื่อผู้ใช้ปิด/ไม่ให้สิทธิ์ */
function openLoginDialog(options: LoginOptions): Promise<AuthResponse> {
  return new Promise<AuthResponse>((resolve, reject) => {
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
        resolve(response.authResponse);
      }, options);
    };
    // ออกจากระบบก่อนถ้ายังค้าง session เดิมอยู่ — กัน warning "overriding current access token"
    window.FB.getLoginStatus((statusResponse) => {
      if (statusResponse.status === 'connected') window.FB.logout(() => doLogin());
      else doLogin();
    });
  });
}

export interface FacebookSdk {
  /** SDK พร้อมเรียก login แล้ว — ปุ่มที่พาไป Facebook ต้อง disable จนกว่าค่านี้เป็น true */
  ready: boolean;
  /** ว่าง = ยังไม่ได้ตั้ง NEXT_PUBLIC_FACEBOOK_APP_ID → ล็อกอินไม่ได้ ต้องเหลือทางกรอกเอง */
  appId: string;
  /**
   * เปิดหน้าต่างขอสิทธิ์ของ Facebook แล้วคืน short-lived user token · ส่ง `configId`
   * = Facebook Login for Business (สิทธิ์ตั้งใน config แทน `scope`) · reject ด้วย
   * `Error('not_ready')` / `Error('denied')` — ผู้เรียกแปลเป็นข้อความไทยเอง
   */
  login: (scope: string, opts?: { configId?: string }) => Promise<string>;
  /** Facebook Login for Business แบบ token System-business — คืน authorization code ให้เซิร์ฟเวอร์แลกเอง */
  loginForCode: (configId: string) => Promise<string>;
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

  const login = useCallback(async (scope: string, opts?: { configId?: string }) => {
    const auth = await openLoginDialog(
      opts?.configId ? { config_id: opts.configId } : { scope, auth_type: 'reauthorize' },
    );
    if (!auth.accessToken) throw new Error('denied');
    return auth.accessToken;
  }, []);

  const loginForCode = useCallback(async (configId: string) => {
    const auth = await openLoginDialog({ config_id: configId, response_type: 'code', override_default_response_type: true });
    if (!auth.code) throw new Error('denied');
    return auth.code;
  }, []);

  return { ready, appId: FB_APP_ID, login, loginForCode };
}
