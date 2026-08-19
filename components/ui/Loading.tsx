'use client';

import type { CSSProperties } from 'react';

/**
 * Loading primitives — แบบเดียวกับ aoosocial
 *
 * เลือกใช้ตามบริบท:
 * - <FullPageLoading />  splash เต็มจอสีแบรนด์ + โลโก้หมุน — ใช้ตอนยังไม่รู้จะ render อะไร
 *                        (route loading.tsx, รอ auth resolve, สลับบริษัท)
 * - <PageLoading />      spinner กลางพื้นที่ content — ใช้ในหน้าที่มี Layout/Sidebar อยู่แล้ว
 * - <Spinner />          วงหมุนเปล่าๆ สำหรับวางในปุ่ม/แถว
 *
 * ถ้ารู้หน้าตาผลลัพธ์อยู่แล้ว (list/form/dashboard) ให้ใช้ skeleton แทน spinner —
 * ดู components/ui/Skeleton.tsx (PageSkeleton) จะรู้สึกเร็วกว่ามาก
 */

const SIZES = { sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-[3px]', lg: 'w-12 h-12 border-4' } as const;
export type SpinnerSize = keyof typeof SIZES;

/** วงกลมหมุนเปล่า — ใช้ในปุ่ม, แถวตาราง, inline */
export function Spinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return (
    <div
      role="status"
      aria-label="กำลังโหลด"
      className={`${SIZES[size]} border-primary border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}

/**
 * Splash เต็มจอ พื้นสีแบรนด์ + โลโก้หมุนสีขาว (ไม่มีข้อความ — โลโก้อย่างเดียว)
 * ใช้ตอน "ยังไม่มีอะไรจะโชว์เลย" — first paint, route transition, สลับบริษัท
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

/**
 * Spinner กลางพื้นที่ content — ใช้ในหน้าที่ Layout/Sidebar render แล้ว
 * (ไม่ต้องมีกรอบการ์ด ไม่บังทั้งจอ)
 */
export function PageLoading({
  label = 'กำลังโหลด...',
  size = 'lg',
  minHeight = '60vh',
}: { label?: string; size?: SpinnerSize; minHeight?: number | string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="w-full flex flex-col items-center justify-center gap-4 p-6 animate-in fade-in duration-200"
      style={{ minHeight }}
    >
      <Spinner size={size} />
      {label && <p className="text-gray-500 dark:text-slate-400 text-sm">{label}</p>}
    </div>
  );
}
