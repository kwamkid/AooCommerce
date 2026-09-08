// Path: lib/chat/line-room-identity.ts
//
// ชื่อ/รูปของ "ห้อง" LINE ที่ **ไม่มี API ให้ถาม**
//
// LINE มี `/v2/bot/group/{id}/summary` (ชื่อ+รูปของกลุ่ม) แต่ **ไม่มีของ room เลย**
// (room = แชทหลายคนแบบเฉพาะกิจ) · แอป LINE เองก็แก้ด้วยการประกอบจากสมาชิก:
// ชื่อ = ชื่อสมาชิกต่อกัน · รูป = โมเสกรูปโปรไฟล์สมาชิก — เราทำแบบเดียวกัน
//
// ⚡ ข้อมูลมาจากโปรไฟล์คนส่งที่ **ดึงอยู่แล้วทุกข้อความ** (ใช้แสดงชื่อ/รูปในฟองแชท)
// จึงไม่มีการยิง API เพิ่ม และไม่มี query เพิ่ม (แพตช์ไปกับ UPDATE เดิม)
//
// client-safe — หน้าแชทใช้ตอนวาดอวาตาร์ · service ใช้ตอนบันทึกข้อความ

export interface MemberProfile {
  user_id: string;
  name: string;
  picture_url: string | null;
}

/** เก็บมากสุดกี่คน — เท่ากับช่องในโมเสก 2×2 ที่ LINE ใช้ */
export const MAX_ROOM_MEMBERS = 4;

/** ชื่อสำรองที่โค้ดเราตั้งเองตอนถาม LINE ไม่ได้ — เจอชื่อพวกนี้ = ยังไม่ใช่ชื่อจริง เขียนทับได้ */
const FALLBACK_NAMES = new Set(['กลุ่มลูกค้า', 'Unknown', '']);

export function isFallbackRoomName(name: string | null | undefined): boolean {
  return FALLBACK_NAMES.has((name || '').trim());
}

/**
 * เพิ่มสมาชิกใหม่เข้ารายการ — คืน `null` เมื่อ**ไม่มีอะไรเปลี่ยน** เพื่อให้ผู้เรียกข้ามการเขียน DB
 *
 * ครบ 4 คนแล้วหยุดสะสม (คืน null ทุกครั้ง) ⇒ ห้องที่คุยกันทั้งวันไม่ได้เขียนทับซ้ำ ๆ
 * แต่ยังอัปเดตให้ถ้าคนเดิมเปลี่ยนชื่อหรือเพิ่งมีรูป
 */
export function mergeMemberProfile(
  current: MemberProfile[] | null | undefined,
  incoming: MemberProfile,
): MemberProfile[] | null {
  const list = Array.isArray(current) ? current : [];
  const at = list.findIndex(m => m.user_id === incoming.user_id);

  if (at >= 0) {
    const old = list[at];
    if (old.name === incoming.name && old.picture_url === incoming.picture_url) return null;
    const next = [...list];
    next[at] = incoming;
    return next;
  }

  if (list.length >= MAX_ROOM_MEMBERS) return null;
  return [...list, incoming];
}

/**
 * ชื่อห้องจากชื่อสมาชิก — `"Golf, สมชาย, มานี (3)"`
 * วงเล็บท้ายคือจำนวนคนที่เรารู้จัก **ไม่ใช่จำนวนสมาชิกจริงของห้อง** (LINE ไม่บอก)
 * จึงใส่เฉพาะตอนเก็บครบเพดานแล้ว ซึ่งแปลว่า "อย่างน้อยเท่านี้"
 */
export function composeRoomName(members: MemberProfile[]): string | null {
  const names = members.map(m => m.name.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const joined = names.join(', ');
  return names.length >= MAX_ROOM_MEMBERS ? `${joined} …` : joined;
}

/** รูปที่เอาไปวาดโมเสกได้จริง (ตัดคนที่ไม่มีรูปทิ้ง) */
export function roomMosaicPictures(members: MemberProfile[] | null | undefined): string[] {
  if (!Array.isArray(members)) return [];
  return members.map(m => m.picture_url).filter((u): u is string => !!u).slice(0, MAX_ROOM_MEMBERS);
}
