// Path: lib/chat/quick-reply-vars.ts
//
// ตัวแปรในข้อความสำเร็จรูปของแชท — **ทะเบียนเดียว** ที่ทั้งหน้าจัดการ (ชิปให้กด)
// และหน้าแชท (ตอนแทนค่า) อ่านร่วมกัน · เพิ่มตัวแปรใหม่ = เพิ่ม 1 บรรทัดที่นี่ที่เดียว
//
// แทนค่า **ตอนแทรกลงช่องพิมพ์ ไม่ใช่ตอนส่ง** — ผู้ใช้จะได้เห็นข้อความจริงก่อนกดส่ง
// และแก้ได้ถ้าชื่อที่ระบบรู้ไม่ใช่ชื่อที่อยากเรียก
//
// ⚠️ ตัวแปรที่หาค่าไม่ได้ **คงโทเคนไว้ตามเดิม ห้ามแทนด้วยค่าว่าง** — "สวัสดีค่ะ คุณ"
// ที่ห้อยอยู่ลอย ๆ ผู้ใช้มองผ่านได้ง่ายกว่า `{{ชื่อลูกค้า}}` ที่เตะตาให้แก้ก่อนส่ง

export interface QuickReplyVarContext {
  /** ชื่อผู้ติดต่อในแชท (ผูกลูกค้าแล้วใช้ชื่อลูกค้า) */
  customerName?: string | null;
  /** ชื่อร้าน/บริษัทที่กำลังใช้งานอยู่ */
  shopName?: string | null;
  /** ชื่อพนักงานที่กำลังตอบ */
  agentName?: string | null;
}

export interface QuickReplyVar {
  token: string;
  label: string;
  hint: string;
  resolve: (ctx: QuickReplyVarContext) => string | null | undefined;
}

export const QUICK_REPLY_VARS: QuickReplyVar[] = [
  {
    token: '{{ชื่อลูกค้า}}',
    label: 'ชื่อลูกค้า',
    hint: 'ชื่อผู้ติดต่อในแชท — ผูกลูกค้าแล้วใช้ชื่อลูกค้าในระบบ',
    resolve: ctx => ctx.customerName,
  },
  {
    token: '{{ชื่อร้าน}}',
    label: 'ชื่อร้าน',
    hint: 'ชื่อร้านที่กำลังใช้งานอยู่',
    resolve: ctx => ctx.shopName,
  },
  {
    token: '{{ชื่อผู้ตอบ}}',
    label: 'ชื่อผู้ตอบ',
    hint: 'ชื่อพนักงานที่กำลังตอบแชทอยู่',
    resolve: ctx => ctx.agentName,
  },
];

/** แทนค่าตัวแปรทุกตัวที่หาค่าได้ · ตัวที่หาไม่ได้คงโทเคนไว้ให้ผู้ใช้เห็นและแก้เอง */
export function applyQuickReplyVars(text: string, ctx: QuickReplyVarContext): string {
  let out = text;
  for (const v of QUICK_REPLY_VARS) {
    const value = (v.resolve(ctx) || '').trim();
    if (!value) continue;
    out = out.split(v.token).join(value);
  }
  return out;
}

/** โทเคนที่ยังแทนค่าไม่ได้ในข้อความนี้ — หน้าแชทใช้เตือนก่อนส่ง */
export function unresolvedQuickReplyVars(text: string): string[] {
  return QUICK_REPLY_VARS.filter(v => text.includes(v.token)).map(v => v.token);
}
