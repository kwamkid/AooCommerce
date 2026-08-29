import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// อัปโหลดรูปโลโก้ร้าน marketplace เอง — POST multipart { file, account_id }
//
// ทำไมต้องมี: โลโก้ร้านที่แพลตฟอร์มโชว์อยู่ **อ่านผ่าน API ไม่ได้ทุกเจ้า**
//   · TikTok  — Seller Center มีสนาม Shop logo (อัปเอง ผ่านรีวิว) แต่ไม่มี API ให้ดึง
//   · Lazada  — /seller/get บางร้านไม่คืน logo_url เลย บางร้านคืนไฟล์ที่ถูก archive
//   · Shopee  — คืนให้ปกติ (ร้านที่ไม่มีปัญหาก็ไม่ต้องใช้ทางนี้)
// การให้ผู้ใช้ลากไฟล์รูปมาวางจึงเป็นทางที่ได้โลโก้ "ตรงจริง" เสมอ ไม่ต้องพึ่ง API
// ของใคร ไม่ต้อง OAuth เพิ่ม และใช้ได้กับทุกแพลตฟอร์มเหมือนกันหมด
//
// เก็บใน bucket `company-logos` เดียวกับโลโก้บริษัท แยกโฟลเดอร์ตามบริษัท

export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;  // ฝั่งหน้าเว็บย่อมาให้แล้ว (~0.5MB) นี่คือกันพลาด

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  const accountId = form?.get('account_id') as string | null;
  if (!file || !accountId) {
    return NextResponse.json({ error: 'ต้องมีไฟล์และร้าน' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'อัปโหลดได้เฉพาะไฟล์รูป' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 2MB' }, { status: 400 });
  }

  // ร้านต้องเป็นของบริษัทนี้ — กันการยิง account_id ของบริษัทอื่นมาเปลี่ยนรูป
  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('id, platform, metadata')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .single();
  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 });

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${companyId}/shops/${accountId}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('company-logos')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // ชื่อไฟล์เดิมทุกครั้ง (upsert) → URL ไม่เปลี่ยน เบราว์เซอร์จะโชว์รูปเก่าค้าง
  // ต่อ ?v= ให้ URL ต่างกันทุกครั้งที่อัปใหม่ (บทเรียนเดียวกับโลโก้บริษัท)
  const { data: urlData } = supabaseAdmin.storage.from('company-logos').getPublicUrl(path);
  const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error } = await supabaseAdmin
    .from('marketplace_accounts')
    .update({
      // merge เสมอ — เขียนทับทั้งก้อนจะล้าง shop_cipher/open_id ที่ขาเชื่อมร้านเก็บไว้
      metadata: {
        ...((account.metadata || {}) as Record<string, unknown>),
        shop_logo: logoUrl,
        // รูปที่ผู้ใช้อัปเองไม่ได้มาจากบัญชี TikTok — ล้างป้ายเก่าไม่ให้เข้าใจผิด
        tiktok_profile_name: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('company_id', companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, shop_logo: logoUrl });
}
