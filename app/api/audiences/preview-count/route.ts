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
  resolveAudienceMembers,
  validateAudienceDefinition,
  type AudienceSource,
} from '@/lib/audiences/resolve';

export const maxDuration = 60;

/** เกินนี้แล้วไม่ต้องไปนับแยกรายแหล่งต่อ — ผู้ใช้รออยู่หน้าจอ */
const BY_SOURCE_BUDGET_MS = 20_000;

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

    const startedAt = Date.now();
    const { stats } = await resolveAudienceMembers(auth.companyId, parsed.def);

    // นับแยกตาม **ชนิดแหล่ง** (เพจ Facebook · LINE · ลูกค้าในระบบ) ไม่ใช่รายบัญชี — ตอบคำถามว่า
    // "แหล่งไหนส่งคนมากี่คน ขึ้น Meta ได้กี่คน" (เช่นติ๊ก LINE แล้วเห็นว่าขึ้น Meta ได้ 0) และนับ
    // ไม่เกิน 3 รอบเสมอไม่ว่าจะเลือกกี่เพจ · เดิมแยกรายบัญชีแล้วซ่อนทั้งบล็อกเมื่อเลือกเกิน 3 แหล่ง
    // เจ้าของเลยไม่เห็นว่า LINE ส่งมาเท่าไหร่ (11 ก.ย. 2026)
    // ผลรวมของแต่ละก้อนอาจมากกว่ายอดรวม เพราะคนเดียวกันอยู่ได้หลายแหล่ง (ตัดซ้ำตอนรวม)
    const groups = new Map<string, AudienceSource[]>();
    for (const s of parsed.def.sources) {
      const g = s.kind === 'customers' ? 'customers' : s.platform;
      groups.set(g, [...(groups.get(g) || []), s]);
    }
    let bySource: { kind: AudienceSource['kind']; platform?: string; label: string; total: number; syncable: number }[] | undefined;
    if (groups.size > 1 && Date.now() - startedAt < BY_SOURCE_BUDGET_MS) {
      bySource = [];
      for (const [group, list] of groups) {
        // หมดงบกลางทาง = ไม่ส่งบล็อกนี้เลย · ครึ่ง ๆ กลาง ๆ อ่านแล้วเข้าใจผิดว่าแหล่งที่หายไปมี 0 คน
        if (Date.now() - startedAt > BY_SOURCE_BUDGET_MS) { bySource = undefined; break; }
        const one = await resolveAudienceMembers(auth.companyId, { ...parsed.def, sources: list });
        const unit = group === 'facebook' ? 'เพจ' : 'บัญชี';
        bySource.push({
          kind: group === 'customers' ? 'customers' : 'chat',
          ...(group === 'customers' ? {} : { platform: group }),
          label: `${GROUP_LABEL[group] || group}${group !== 'customers' && list.length > 1 ? ` ${list.length} ${unit}` : ''}`,
          total: one.stats.total,
          syncable: one.stats.syncable,
        });
      }
    }

    return NextResponse.json({
      total: stats.total,
      reachable: {
        phone: stats.with_phone,
        email: stats.with_email,
        psid: stats.with_psid,
        any: stats.syncable,
      },
      not_syncable: stats.not_syncable,
      capped: stats.capped,
      ...(bySource ? { by_source: bySource } : {}),
    });
  } catch (e) {
    console.error('POST audience preview-count error:', e);
    return NextResponse.json({ error: 'นับจำนวนคนในกลุ่มไม่สำเร็จ' }, { status: 500 });
  }
}
