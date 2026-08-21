// Path: lib/useMarketplaceGuard.ts
// กันหน้าที่มีไว้เพื่อ marketplace โดยเฉพาะ เมื่อร้านปิดฟีเจอร์ marketplace
//
// ใช้กับ "หน้าที่ทั้งหน้าไม่มีความหมายเลยถ้าไม่ได้ต่อ marketplace"
// (ตั้งค่า Marketplace, นำเข้า/ส่งออกสินค้า Shopee, log การเชื่อมต่อ)
// ส่วนหน้าที่มี marketplace เป็นแค่ส่วนหนึ่ง ให้ซ่อนเฉพาะส่วนนั้นด้วย
// features.marketplace_sync ตรง ๆ ไม่ต้องใช้ตัวนี้
//
// ⚠️ ต้องรอ `fetched` ก่อนตัดสิน — ค่าเริ่มต้นของ FeatureFlags คือปิดหมด
// ถ้าเช็คทันทีจะเด้งผู้ใช้ที่เปิดฟีเจอร์ไว้ออกจากหน้าตัวเองทุกครั้งที่รีเฟรช
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatures } from '@/lib/features-context';

export function useMarketplaceGuard(): { allowed: boolean; checking: boolean } {
  const { features, fetched } = useFeatures();
  const router = useRouter();
  const allowed = features.marketplace_sync;

  useEffect(() => {
    if (fetched && !allowed) router.replace('/dashboard');
  }, [fetched, allowed, router]);

  return { allowed, checking: !fetched };
}
