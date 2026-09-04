// ติดตั้งเว็บเป็นแอป (PWA install) — ตรวจแพลตฟอร์ม + จับ beforeinstallprompt ของ Chrome
//
// ที่รวมไว้ที่เดียวเพราะ "รู้ว่าเครื่องนี้เป็นอะไร" ถูกใช้ทั้งเรื่องแจ้งเตือน
// (lib/push/client.ts) และเรื่องชวนติดตั้ง (หน้า /install + แถบชวนติดตั้ง)
// — เคยมี isStandalone/isIos ซ้ำสองที่แล้วเกณฑ์หลุดกัน
'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * event ของ Chrome ที่ยังไม่อยู่ใน lib.dom — ประกาศเองให้ type ตรง
 * (`prompt()` เรียกได้ครั้งเดียวต่อ event หนึ่งใบ ใช้แล้วต้องทิ้ง)
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** ที่เก็บ event จาก inline script ใน app/layout.tsx (ยิงก่อน React hydrate) */
    __aooBip?: BeforeInstallPromptEvent;
  }
}

// ─────────────────────────────────────────────────────────────
// ตรวจสภาพเครื่อง / เบราว์เซอร์
// ─────────────────────────────────────────────────────────────

/** เปิดอยู่จากแอปที่ติดตั้งแล้ว (ไม่ใช่แท็บเบราว์เซอร์) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS ไม่รองรับ display-mode ในบางเวอร์ชัน — Safari ใช้ navigator.standalone แทน
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): InstallPlatform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS 13+ แอบอ้างเป็น Macintosh ใน UA — แยกออกได้ด้วย "มีจอสัมผัส" เท่านั้น
  // ถ้าไม่เช็ค iPad จะได้คำสอนของ Mac (เมนู ไฟล์ → เพิ่มลง Dock) ซึ่งไม่มีจริงบน iPad
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export type InAppBrowser = 'LINE' | 'Facebook' | 'Instagram' | 'TikTok' | 'Messenger';

/**
 * เบราว์เซอร์ในแอปโซเชียล — **ติดตั้ง PWA จากในนี้ไม่ได้ทุกตัว**
 * (ไม่มีเมนูแชร์ของ Safari / ไม่ยิง beforeinstallprompt) ต้องบอกผู้ใช้ให้
 * "เปิดในเบราว์เซอร์" ก่อน ไม่งั้นเขาจะกดหาปุ่มที่ไม่มีอยู่จริงจนเลิกไปเอง
 */
export function getInAppBrowserName(): InAppBrowser | null {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/Instagram/i.test(ua)) return 'Instagram';
  // Messenger ต้องเช็คก่อน Facebook — UA ของมันมี FBAN/ ติดมาด้วย
  if (/Messenger/i.test(ua)) return 'Messenger';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/TikTok|BytedanceWebview|musical_ly/i.test(ua)) return 'TikTok';
  return null;
}

// ─────────────────────────────────────────────────────────────
// ที่เก็บ beforeinstallprompt (external store สำหรับ React)
// ─────────────────────────────────────────────────────────────

export interface InstallPromptState {
  /** มี event ค้างอยู่ → กดปุ่มเดียวติดตั้งได้เลย */
  canPrompt: boolean;
  /** เพิ่งติดตั้งสำเร็จในเซสชันนี้ (จาก event `appinstalled`) */
  installed: boolean;
}

const SERVER_STATE: InstallPromptState = { canPrompt: false, installed: false };

let currentState: InstallPromptState = SERVER_STATE;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let captureStarted = false;

function setState(next: InstallPromptState) {
  if (next.canPrompt === currentState.canPrompt && next.installed === currentState.installed) return;
  currentState = next;
  listeners.forEach((fn) => fn());
}

function adopt(evt: BeforeInstallPromptEvent) {
  deferredPrompt = evt;
  setState({ canPrompt: true, installed: currentState.installed });
}

/**
 * เริ่มดักจับ event (idempotent — เรียกซ้ำได้)
 *
 * Chrome ยิง `beforeinstallprompt` **ครั้งเดียวและเร็วมาก** (ก่อน React hydrate)
 * inline script ใน app/layout.tsx จึงเก็บใส่ `window.__aooBip` ไว้ก่อน แล้วยิง
 * custom event `aoo-bip` — ที่นี่แค่มารับช่วงต่อ ถ้าไม่มีใครรับ ปุ่ม "ติดตั้งเลย"
 * จะไม่มีวันโผล่
 */
export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined' || captureStarted) return;
  captureStarted = true;

  if (window.__aooBip) adopt(window.__aooBip);

  window.addEventListener('beforeinstallprompt', (e) => {
    // ต้อง preventDefault ไม่งั้น Chrome เด้ง mini-infobar ของตัวเองแล้วทิ้ง event
    e.preventDefault();
    window.__aooBip = e as BeforeInstallPromptEvent;
    adopt(e as BeforeInstallPromptEvent);
  });

  // custom event จาก inline script (กรณี script จับได้ก่อนโมดูลนี้ถูกโหลด)
  window.addEventListener('aoo-bip', () => {
    if (window.__aooBip) adopt(window.__aooBip);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    delete window.__aooBip;
    setState({ canPrompt: false, installed: true });
  });
}

export function subscribeInstallPrompt(cb: () => void): () => void {
  initInstallPromptCapture();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getInstallPromptState(): InstallPromptState {
  return currentState;
}

function getServerInstallPromptState(): InstallPromptState {
  return SERVER_STATE;
}

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** ปุ่ม "ติดตั้งเลย" ของ Chrome — คืน 'unavailable' เมื่อเบราว์เซอร์ไม่มีทางลัดนี้ */
export function useInstallPrompt(): {
  canPrompt: boolean;
  installed: boolean;
  promptInstall: () => Promise<InstallPromptOutcome>;
} {
  const state = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptState,
    getServerInstallPromptState
  );

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    const evt = deferredPrompt;
    if (!evt) return 'unavailable';
    // event หนึ่งใบใช้ได้ครั้งเดียว — ทิ้งทันทีไม่ว่าผลจะเป็นยังไง
    deferredPrompt = null;
    if (typeof window !== 'undefined') delete window.__aooBip;
    setState({ canPrompt: false, installed: currentState.installed });
    try {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      if (outcome === 'accepted') setState({ canPrompt: false, installed: true });
      return outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  return { canPrompt: state.canPrompt, installed: state.installed, promptInstall };
}

// ─────────────────────────────────────────────────────────────
// พักแถบชวนติดตั้ง (snooze)
// ─────────────────────────────────────────────────────────────

export const INSTALL_BANNER_DISMISS_KEY = 'aoo-install-banner-dismissed-at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 วัน

/** ปิดแถบไปแล้วภายใน 14 วัน — ชวนซ้ำทุกวันคือทางที่เร็วที่สุดที่จะโดนมองข้ามถาวร */
export function isInstallBannerSnoozed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(INSTALL_BANNER_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < SNOOZE_MS;
  } catch {
    // โหมดส่วนตัว / ปิดคุกกี้ → อ่านไม่ได้ ก็ถือว่ายังไม่เคยปิด
    return false;
  }
}

export function snoozeInstallBanner(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSTALL_BANNER_DISMISS_KEY, String(Date.now()));
  } catch { /* เขียนไม่ได้ก็แค่ชวนใหม่รอบหน้า */ }
}
