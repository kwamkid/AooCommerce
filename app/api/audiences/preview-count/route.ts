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
  audienceSourceLabel,
  resolveAudienceMembers,
  validateAudienceDefinition,
  type AudienceSource,
} from '@/lib/audiences/resolve';

export const maxDuration = 60;

/** เกินนี้แล้วไม่ต้องไปนับแยกรายแหล่งต่อ — ผู้ใช้รออยู่หน้าจอ */
const BY_SOURCE_BUDGET_MS = 20_000;
/** แหล่งเยอะกว่านี้การนับแยกจะใช้เวลาเป็นเท่าตัวโดยไม่ได้ช่วยตัดสินใจอะไรเพิ่ม */
const BY_SOURCE_MAX_SOURCES = 3;

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

    // นับแยกรายแหล่งเพื่อบอกว่า "คนส่วนใหญ่มาจากไหน" — ตัวเลขรวมกันอาจมากกว่ายอดรวม
    // เพราะคนเดียวกันอยู่ได้หลายแหล่ง (ตัดซ้ำเกิดตอนรวม ไม่ใช่ตอนนับแยก)
    let bySource: { kind: AudienceSource['kind']; platform?: string; chat_account_id?: string; label: string; total: number; syncable: number }[] | undefined;
    if (parsed.def.sources.length > 1
      && parsed.def.sources.length <= BY_SOURCE_MAX_SOURCES
      && Date.now() - startedAt < BY_SOURCE_BUDGET_MS) {
      bySource = [];
      for (const source of parsed.def.sources) {
        const one = await resolveAudienceMembers(auth.companyId, { ...parsed.def, sources: [source] });
        bySource.push({
          kind: source.kind,
          ...(source.kind === 'chat'
            ? { platform: source.platform, chat_account_id: source.chat_account_id }
            : {}),
          label: audienceSourceLabel(source),
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
