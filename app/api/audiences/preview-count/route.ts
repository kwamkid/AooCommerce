// Path: app/api/audiences/preview-count/route.ts
//
// "กลุ่มนี้ได้กี่คน และส่งให้ Meta จับคู่ได้กี่คน" — ตอบก่อนผู้ใช้กดบันทึก
//
// ⚠️ ตัวเลข **จับคู่ได้** สำคัญกว่าตัวเลขรวม: กลุ่ม 1,400 คนที่ไม่มีเบอร์/อีเมลเลยสัก 20 คน
// อัปขึ้น Meta แล้วได้กลุ่มเล็กจนยิงโฆษณาไม่ได้ (Meta ต้องการอย่างน้อย ~100 คนที่จับคู่ติด)
// — หน้าจอต้องเห็นตั้งแต่ก่อนสร้าง ไม่ใช่ไปเจอตอนซิงก์เสร็จ
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  assertSourcesBelongToCompany,
  countMarketplaceOnlyAmongUnsyncable,
  summarizeBySource,
  resolveAudienceMembers,
  validateAudienceDefinition,
  type AudienceSource,
} from '@/lib/audiences/resolve';

export const maxDuration = 60;

/** ป้ายของก้อนแหล่ง — นับรวมตามชนิด ไม่แยกรายบัญชี (เพจ Facebook 7 เพจ = ก้อนเดียว) */
const GROUP_LABEL: Record<string, string> = {
  facebook: 'เพจ Facebook',
  line: 'LINE OA',
  customers: 'ลูกค้าในระบบ',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateAudienceDefinition(body.definition);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const ownershipError = await assertSourcesBelongToCompany(auth.companyId, parsed.def);
    if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 400 });

    const { members, stats } = await resolveAudienceMembers(auth.companyId, parsed.def);
    // คนที่ส่งไม่ได้ส่วนใหญ่มาจากไหน — ไม่บอกแล้วร้านที่ขายผ่าน marketplace เป็นหลักจะนึกว่าระบบนับผิด
    const marketplaceOnly = stats.not_syncable > 0
      ? await countMarketplaceOnlyAmongUnsyncable(auth.companyId, members)
      : 0;

    // นับแยกตามชนิดแหล่ง (เพจ Facebook · LINE · ลูกค้าในระบบ) **จากรายชื่อที่รวมแล้ว**
    // ตอบว่า "แหล่งไหนเพิ่มคนที่แหล่งอื่นไม่มีกี่คน" ได้ตรง ๆ — ติ๊ก LINE แล้วยอดไม่ขยับเพราะคนพวกนั้น
    // ถูกนับผ่านลูกค้าในระบบไปแล้ว ต้องอ่านออกจากหน้าจอ ไม่ใช่ให้เดาเอง
    const accountsPerGroup = new Map<string, number>();
    for (const s of parsed.def.sources) {
      const g = s.kind === 'customers' ? 'customers' : s.platform;
      accountsPerGroup.set(g, (accountsPerGroup.get(g) || 0) + 1);
    }
    const rows = summarizeBySource(members).map(row => {
      const n = accountsPerGroup.get(row.group) || 0;
      const unit = row.group === 'facebook' ? 'เพจ' : 'บัญชี';
      return {
        kind: (row.group === 'customers' ? 'customers' : 'chat') as AudienceSource['kind'],
        ...(row.group === 'customers' ? {} : { platform: row.group }),
        label: `${GROUP_LABEL[row.group] || row.group}${row.group !== 'customers' && n > 1 ? ` ${n} ${unit}` : ''}`,
        total: row.total,
        syncable: row.syncable,
        only: row.only,
      };
    });
    // แหล่งเดียว = บล็อกนี้ไม่บอกอะไรเพิ่มจากยอดรวม
    const bySource = rows.length > 1 ? rows : undefined;

    return NextResponse.json({
      total: stats.total,
      reachable: {
        phone: stats.with_phone,
        email: stats.with_email,
        psid: stats.with_psid,
        any: stats.syncable,
      },
      not_syncable: stats.not_syncable,
      ...(marketplaceOnly != null ? { not_syncable_marketplace: marketplaceOnly } : {}),
      capped: stats.capped,
      ...(bySource ? { by_source: bySource } : {}),
    });
  } catch (e) {
    console.error('POST audience preview-count error:', e);
    return NextResponse.json({ error: 'นับจำนวนคนในกลุ่มไม่สำเร็จ' }, { status: 500 });
  }
}
