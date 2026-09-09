// Path: lib/chat/recent-picks.ts
// "ใช้บ่อย" ของตัวเลือกอีโมจิ/สติกเกอร์ในหน้าแชท — จำจากที่กดจริงในเครื่องนี้ (localStorage)
//
// เก็บต่อเครื่อง ไม่ผูกบริษัท: ความชอบอีโมจิเป็นของคนพิมพ์ ไม่ใช่ของร้าน
// จัดอันดับด้วย "จำนวนครั้ง" ก่อน เสมอกันค่อยดู "ล่าสุด" — ตัวที่กดวันละครั้งมาเป็นเดือน
// ต้องชนะตัวที่เพิ่งลองกดครั้งเดียว
// localStorage ห่อ try/catch ทุกครั้ง — Safari โหมดส่วนตัว throw ตอนเขียน

export type RecentKind = 'emoji' | 'sticker';

const KEY: Record<RecentKind, string> = {
  emoji: 'aoo-chat-recent-emoji',
  sticker: 'aoo-chat-recent-sticker',
};
const MAX_ENTRIES = 40;          // เก็บไว้มากกว่าที่แสดง จะได้จัดอันดับได้แม่นเมื่อความชอบเปลี่ยน

type Entry = { id: string; n: number; t: number };

function load(kind: RecentKind): Entry[] {
  try {
    const raw = localStorage.getItem(KEY[kind]);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Entry =>
      !!e && typeof e === 'object'
      && typeof (e as Entry).id === 'string'
      && typeof (e as Entry).n === 'number'
      && typeof (e as Entry).t === 'number');
  } catch {
    return [];
  }
}

function rank(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (b.n - a.n) || (b.t - a.t));
}

/** id ที่ใช้บ่อยสุด เรียงจากมากไปน้อย (สูงสุด `limit` ตัว) */
export function readRecent(kind: RecentKind, limit: number): string[] {
  return rank(load(kind)).slice(0, limit).map(e => e.id);
}

/** นับการใช้หนึ่งครั้ง แล้วคืนอันดับใหม่ (เขียนไม่ได้ก็ยังคืนอันดับที่คิดในหน่วยความจำ) */
export function bumpRecent(kind: RecentKind, id: string, limit: number): string[] {
  const entries = load(kind);
  const now = Date.now();
  const hit = entries.find(e => e.id === id);
  if (hit) { hit.n += 1; hit.t = now; } else entries.push({ id, n: 1, t: now });
  const ranked = rank(entries).slice(0, MAX_ENTRIES);
  try { localStorage.setItem(KEY[kind], JSON.stringify(ranked)); } catch { /* โหมดส่วนตัว/เต็ม — ข้าม */ }
  return ranked.slice(0, limit).map(e => e.id);
}
