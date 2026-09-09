// Path: app/api/chat/file-links/route.ts
//
// สร้าง "ลิงก์สั้นบนโดเมนเรา" (/f/<code>) ให้ไฟล์ที่แอดมินส่งในแชท
// เดิมส่ง URL ดิบของ Supabase Storage ไปให้ลูกค้า ซึ่งเป็นโดเมนที่ลูกค้าไม่รู้จัก
// อ่านแล้วดูเหมือนลิงก์หลอกลวง หลายคนจึงไม่กล้ากด
//
// ⚠️ ตัวสร้างลิงก์ต้องไม่ขวางการส่งข้อความ — ฝั่งหน้าแชทถ้าเรียกตัวนี้ไม่สำเร็จ
// จะตกกลับไปใช้ URL ดิบแล้วส่งต่อ (ลิงก์น่าเกลียดยังดีกว่าไฟล์ไม่ถึงลูกค้า)
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

/** โฟลเดอร์เดียวที่ยอมให้ทำลิงก์ได้ — ไฟล์ที่แอดมินอัปเพื่อส่งให้ลูกค้าเท่านั้น */
const ALLOWED_PREFIX = 'admin-files/';
const CODE_LENGTH = 10;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** unique index บน code — ชนกันแล้วสุ่มใหม่ */
const DUPLICATE_CODE = '23505';
const MAX_ATTEMPTS = 3;

/**
 * รหัส base62 ความยาว CODE_LENGTH จาก crypto.randomBytes
 * ทิ้งไบต์ที่ ≥ 248 (= 62×4) ก่อนหารเอาเศษ ไม่งั้นตัวอักษร 8 ตัวแรกของชุดจะออกบ่อยกว่าตัวอื่น
 */
export function generateFileCode(length: number = CODE_LENGTH): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 248
  let out = '';
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < limit) out += ALPHABET[buf[i] % ALPHABET.length];
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ส่งข้อความ' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
    const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';

    // กันไม่ให้ใครขอลิงก์ชี้ไปไฟล์อื่นในบัคเก็ต (สลิป/รูปสินค้า) — รับเฉพาะโฟลเดอร์ของไฟล์แนบในแชท
    if (!storagePath || !storagePath.startsWith(ALLOWED_PREFIX)) {
      return NextResponse.json({ error: 'storage_path ไม่ถูกต้อง' }, { status: 400 });
    }
    if (!fileName) return NextResponse.json({ error: 'ต้องมี file_name' }, { status: 400 });

    const row = {
      company_id: auth.companyId,
      storage_bucket: 'chat-media',
      storage_path: storagePath,
      file_name: fileName,
      mime: typeof body.mime === 'string' ? body.mime : null,
      size_bytes: typeof body.size_bytes === 'number' ? body.size_bytes : null,
      contact_platform: typeof body.contact_platform === 'string' ? body.contact_platform : null,
      contact_id: typeof body.contact_id === 'string' ? body.contact_id : null,
      created_by: auth.userId || null,
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = generateFileCode();
      const { error } = await supabaseAdmin.from('chat_file_links').insert({ ...row, code });
      if (!error) return NextResponse.json({ code });
      if (error.code !== DUPLICATE_CODE) {
        console.error('chat_file_links insert error:', error);
        return NextResponse.json({ error: 'สร้างลิงก์ไม่สำเร็จ' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'สร้างลิงก์ไม่สำเร็จ (รหัสชนกัน)' }, { status: 500 });
  } catch (error) {
    console.error('Create chat file link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
