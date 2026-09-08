// Path: lib/chat/saved-replies.ts
//
// ข้อความสำเร็จรูปของแชท — type + ตัวช่วยค้นหา ที่หน้าแชทกับหน้าจัดการใช้ร่วมกัน
// (client-safe · ตัวแปรในข้อความอยู่ที่ [saved-reply-vars.ts](./saved-reply-vars.ts))

export interface SavedReply {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * กรองตามคำค้น — ค้นทั้ง **ชื่อและเนื้อข้อความ** เพราะพนักงานจำได้ทั้งสองแบบ
 * ("ค่าส่ง" อาจเป็นชื่อใบ หรือเป็นคำที่อยู่ในข้อความก็ได้) · ชื่อที่ตรงมาก่อนเสมอ
 */
export function filterSavedReplies(list: SavedReply[], query: string): SavedReply[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const byTitle: SavedReply[] = [];
  const byContent: SavedReply[] = [];
  for (const r of list) {
    if (r.title.toLowerCase().includes(q)) byTitle.push(r);
    else if (r.content.toLowerCase().includes(q)) byContent.push(r);
  }
  return [...byTitle, ...byContent];
}

/** ตัวอย่างข้อความบรรทัดเดียวสำหรับรายการ/พรีวิว */
export function savedReplyPreview(reply: SavedReply, max = 80): string {
  const body = reply.content.replace(/\s+/g, ' ').trim();
  if (body) return body.length > max ? `${body.slice(0, max)}…` : body;
  return reply.image_url ? '[รูปภาพ]' : '';
}
