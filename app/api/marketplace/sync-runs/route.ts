import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { getRun, listRuns } from '@/lib/marketplace/sync-runs';
import { assessRevertability, loadRevertAccount } from '@/lib/marketplace/sync-revert';

/** ประวัติรอบซิงค์สต็อกของร้าน + รายละเอียดรายรอบ (อ่านอย่างเดียว)
 *
 * - `?account_id=&limit=` → `{ runs }` หัวรอบอย่างเดียว (หน้ารายการไม่ต้องการ items)
 * - `?id=`                → `{ run, items, revertability }` พร้อมคำตัดสินว่าย้อนได้ไหม
 *
 * ทั้งสองแบบบังคับว่าต้องเป็นของบริษัทนี้ (service role bypass RLS — ห้ามลืม filter เอง)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('id');

    if (runId) {
      const loaded = await getRun(runId, companyId);
      if (!loaded) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });

      const account = await loadRevertAccount(loaded.run.account_id);
      const revertability = await assessRevertability(loaded.run, loaded.items, account);
      return NextResponse.json({ run: loaded.run, items: loaded.items, revertability });
    }

    const accountId = searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'ต้องระบุ account_id หรือ id' }, { status: 400 });
    }

    // ร้านต้องเป็นของบริษัทนี้ — ไม่งั้นเดา uuid แล้วอ่านประวัติร้านคนอื่นได้
    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!account) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });

    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
    const runs = await listRuns(accountId, companyId, limit);
    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Sync runs error:', error);
    return NextResponse.json({ error: 'อ่านประวัติรอบซิงค์ไม่สำเร็จ' }, { status: 500 });
  }
}
