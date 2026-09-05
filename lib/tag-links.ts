/**
 * แท็กของลูกค้า/ผู้ติดต่อ — บันทึกแบบ "ส่วนต่าง" (diff) เท่านั้น
 *
 * WHY: ของเดิมทุกหน้าบันทึกแท็กด้วย `PUT .../tags { tag_ids: [ชุดที่จอนี้ถืออยู่] }`
 * ซึ่งฝั่ง API แปลว่า "ลบลิงก์ทั้งหมด แล้วใส่ชุดนี้แทน" (replace-all) — ชุดที่จอถืออยู่
 * มาจาก snapshot ตอนกดเปิด ไม่ใช่ความจริงล่าสุดใน DB ดังนั้น:
 *   - พนักงาน A ติดแท็กจากหน้าลูกค้า → หน้าแชทของ B ยังถือชุดเก่า → B ติดแท็กเพิ่ม 1 ตัว
 *     → PUT ส่งชุดเก่า+1 ทับ → แท็กของ A **หายเงียบ**
 *   - เชื่อม contact เข้ากับลูกค้าที่มีแท็กอยู่แล้ว → แถวในลิสต์ไม่รู้จักแท็กพวกนั้น
 *     → ติดแท็กครั้งแรกล้างของเดิมหมด
 * (ยืนยันจากตัวนับของ Postgres: customer link insert 22 / delete 16, contact 15 / 11)
 *
 * กติกา: ทุกที่ที่ "ติด/ปลดแท็กทีละตัว" ต้องยิง PATCH ด้วย { add, remove } ผ่านไฟล์นี้
 * — การกดหนึ่งครั้งต้องแตะเฉพาะแท็กตัวนั้น ห้ามแตะตัวอื่น
 * ⛔ ห้ามกลับไปใช้ PUT (replace-all) นอกจากกรณีที่ผู้เรียก "ถือชุดล่าสุดของเซิร์ฟเวอร์จริง"
 * เช่นหน้าสร้างลูกค้าใหม่ (ลูกค้าเพิ่งเกิด ไม่มีอะไรให้หาย)
 *
 * baseline ของ diff ต้องเป็น "ชุดล่าสุดที่เซิร์ฟเวอร์ยืนยัน" เสมอ — ห้าม diff กับสิ่งที่จอแสดงอยู่
 */

import { apiFetch } from '@/lib/api-client';
import type { Tag } from '@/components/ui/TagBadge';

export interface TagDiff {
  add: string[];
  remove: string[];
}

/** ส่วนต่างระหว่างชุดเดิม (จากเซิร์ฟเวอร์) กับชุดใหม่ที่ผู้ใช้เลือก */
export function diffTagIds(prev: Tag[], next: Tag[]): TagDiff {
  const prevIds = new Set((prev || []).map(t => t.id));
  const nextIds = new Set((next || []).map(t => t.id));
  return {
    add: [...nextIds].filter(id => !prevIds.has(id)),
    remove: [...prevIds].filter(id => !nextIds.has(id)),
  };
}

export function isEmptyDiff(diff: TagDiff): boolean {
  return diff.add.length === 0 && diff.remove.length === 0;
}

async function patchTags(url: string, body: Record<string, unknown>): Promise<Tag[]> {
  const res = await apiFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: { tags?: Tag[]; error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    // ปล่อยว่าง — ข้างล่างจะโยน error ตาม status แทน
  }
  if (!res.ok) throw new Error(payload.error || 'บันทึกแท็กไม่สำเร็จ');
  return payload.tags || [];
}

/**
 * ติด/ปลดแท็กของลูกค้า — คืนชุดแท็กล่าสุดจากเซิร์ฟเวอร์ (ใช้เป็น baseline รอบถัดไป)
 * คืน null เมื่อไม่มีอะไรเปลี่ยน (ไม่ยิง request) เพื่อให้ผู้เรียกคง state เดิมไว้
 */
export async function patchCustomerTags(customerId: string, diff: TagDiff): Promise<Tag[] | null> {
  if (isEmptyDiff(diff)) return null;
  return patchTags(`/api/customers/${customerId}/tags`, { add: diff.add, remove: diff.remove });
}

/**
 * ติด/ปลดแท็กระดับ contact (ยังไม่ได้เชื่อมลูกค้า) — คืนชุดล่าสุดจากเซิร์ฟเวอร์
 * คืน null เมื่อไม่มีอะไรเปลี่ยน
 */
export async function patchContactTags(
  contactId: string,
  platform: string,
  diff: TagDiff
): Promise<Tag[] | null> {
  if (isEmptyDiff(diff)) return null;
  return patchTags(`/api/chat/contacts/${contactId}/tags`, {
    platform,
    add: diff.add,
    remove: diff.remove,
  });
}
