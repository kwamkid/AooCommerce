'use client';

import type { CSSProperties } from 'react';

/**
 * Loading ของทั้งระบบมี 4 ชั้น — เลือกจาก "ตอนนั้นระบบรู้อะไรแล้ว"
 * (เคยมี PageLoading กับ Spinner อยู่ในไฟล์นี้ด้วย แต่ทั้งระบบไม่มีใครเรียกเลย
 *  สักจุด เอกสารเลยชี้ไปคนละทางกับของจริง — ลบทิ้งแล้ว 2026-08-21)
 *
 * 1. <FullPageLoading />         ← ไฟล์นี้
 *    ยังไม่รู้ว่าใคร login อยู่ บริษัทไหน เมนูมีอะไร — ไม่มี chrome จะให้ดู
 *    จึงบังทั้งจอ · เปิดเว็บครั้งแรก, refresh, สลับบริษัท, กลับจาก OAuth
 *
 * 2. <PageSkeleton />            ← components/ui/Skeleton.tsx
 *    chrome วาดแล้ว เหลือแค่เนื้อหา · ใช้ผ่าน loading.tsx ของแต่ละ segment
 *    (components/layout/AppSegmentLoading.tsx) — เปลี่ยนหน้าในระบบใช้ตัวนี้เสมอ
 *
 * 3. <LoadingCard />             ← components/ui/StateCard.tsx
 *    อยู่ในหน้าแล้ว กำลัง "อ่าน" ข้อมูลของบล็อกใดบล็อกหนึ่ง · ส่วนอื่นยังกดได้
 *
 * 4. <LoadingOverlay />          ← components/ui/LoadingOverlay.tsx
 *    ผู้ใช้สั่งงานเป็นชุดแล้วระบบกำลัง "เขียน" ข้อมูล · บังจอกันกดซ้ำ + มี progress
 *
 * spinner เล็กในปุ่ม/ในแถว → ใช้ <Loader2 className="animate-spin" /> ของ lucide ตรง ๆ
 */

/**
 * Splash เต็มจอ พื้นสีแบรนด์ + โลโก้หมุนสีขาว (ไม่มีข้อความ — โลโก้อย่างเดียว)
 * ใช้ตอน "ยังไม่มีอะไรจะโชว์เลย" — first paint, สลับบริษัท, รอ auth resolve
 */
export function FullPageLoading({
  /** ใช้เป็นชื่อสำหรับ screen reader เท่านั้น — splash ไม่แสดงข้อความ (โลโก้หมุนอย่างเดียว) */
  label = 'กำลังโหลด...',
  /** true = บล็อกคลิกทั้งจอ (กันกดซ้ำระหว่างสลับ) */
  blocking = false,
  /** ทับทั้ง viewport (fixed) — ปิดเมื่ออยากให้เต็มแค่กล่องพ่อ */
  fixed = true,
}: { label?: string; blocking?: boolean; fixed?: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-[300] flex items-center justify-center bg-gradient-to-br from-[#F4511E] to-[#B23A0E] animate-in fade-in duration-200`}
      style={{ pointerEvents: blocking ? 'auto' : 'none', cursor: blocking ? 'wait' : undefined } as CSSProperties}
    >
      {/* โลโก้จริง flatten เป็นสีขาว — หมุนช้าๆ แทน spinner ธรรมดา */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className="w-24 h-auto animate-spin"
        style={{ filter: 'brightness(0) invert(1)', animationDuration: '1.4s' }}
      />
    </div>
  );
}
