// Path: app/f/[code]/route.ts
//
// เปิดไฟล์จากลิงก์สั้นบนโดเมนเรา — ลูกค้าเห็น https://<โดเมนเรา>/f/k3Zq8vTb2x
// แทน URL ดิบของ Supabase Storage ที่ไม่มีใครรู้จัก (ดู migration 20260910_chat_file_links)
//
// **public ไม่มี auth** — คนรับไฟล์คือลูกค้าที่ไม่มีบัญชีในระบบ
// (ต้องมี '/f/' ใน PUBLIC_PREFIXES ของ proxy.ts + PUBLIC_ROUTES ของ auth-context ด้วย)
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** รหัสสั้นที่เราออกยาว 10 ตัว — เผื่อช่วงไว้กว้างหน่อยสำหรับลิงก์รุ่นเก่า/รุ่นหน้า */
const CODE_PATTERN = /^[A-Za-z0-9]{6,32}$/;

/** ชนิดที่เบราว์เซอร์เปิดดูได้ในตัว — ที่เหลือให้ดาวน์โหลดพร้อมชื่อไฟล์เดิม */
function canViewInline(mime: string | null): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m === 'application/pdf' || m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/');
}

function notFoundPage() {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ไม่พบไฟล์</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#374151">
<div style="text-align:center;padding:32px">
<div style="font-size:40px;line-height:1;margin-bottom:16px">📄</div>
<h1 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#111827">ไม่พบไฟล์นี้ หรือลิงก์ถูกยกเลิกแล้ว</h1>
<p style="font-size:15px;margin:0;color:#6b7280">กรุณาติดต่อร้านเพื่อขอลิงก์ใหม่อีกครั้ง</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!code || !CODE_PATTERN.test(code)) return notFoundPage();

    const { data: link, error } = await supabaseAdmin
      .from('chat_file_links')
      .select('id, storage_bucket, storage_path, file_name, mime, revoked_at')
      .eq('code', code)
      .maybeSingle();

    if (error || !link || link.revoked_at) return notFoundPage();

    const { data: urlData } = supabaseAdmin.storage.from(link.storage_bucket).getPublicUrl(link.storage_path);
    let target = urlData.publicUrl;
    if (!canViewInline(link.mime)) {
      // ?download=<ชื่อ> ให้ Storage ตั้ง Content-Disposition ตามชื่อไฟล์เดิม
      // (ไม่ใส่ = ลูกค้าได้ชื่อไฟล์เป็นคีย์ ASCII ที่เราแปลงไว้ตอนอัป อ่านไม่ออก)
      target += `?download=${encodeURIComponent(link.file_name)}`;
    }

    // นับยอดเปิดแบบไม่ขวางทาง — ล้มเมื่อไหร่ลูกค้าต้องยังได้ไฟล์เหมือนเดิม
    after(async () => {
      try {
        await supabaseAdmin.rpc('bump_chat_file_link_open', { p_id: link.id });
      } catch {
        /* ตัวนับพลาดไม่ใช่เรื่องที่ลูกค้าต้องรับรู้ */
      }
    });

    return NextResponse.redirect(target, {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Chat file link error:', err);
    return notFoundPage();
  }
}
