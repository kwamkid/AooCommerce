'use client';

// ซิงค์สินค้า & สต็อก — **หน้าเดียวทุกแพลตฟอร์ม** (`?job=&account=&run=`)
//
// เดิมเป็นโมดัลบนหน้าช่องทางการขาย: กดดึง/ส่งสต็อกแล้วยิงทันที ไม่มีใครรู้ว่าจะเกิดอะไร
// กดพลาดแล้วย้อนไม่ได้ · ตอนนี้เป็นหน้าเต็มที่มี 4 ขั้น เลือกร้าน → ตรวจตาราง → ยืนยัน → ผลลัพธ์
//
// สถานะทั้งหมดอยู่ใน URL เพื่อให้ลิงก์จากที่อื่นเปิดตรงจุดได้:
//   `?job=pull_stock&account=<id>` — โมดัลต้อนรับ · ตัวเฝ้า (`stock_not_initialized`)
//   `?run=<id>`                    — หน้าความเคลื่อนไหวสต็อก (reference_id ของงานซิงค์ = id ของรอบ)
//
// ⛔ ห้ามเขียนเงื่อนไขแยกตาม platform ในหน้านี้ — ป้าย/ไอคอนมาจาก MARKETPLACE_PLATFORMS

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Stepper, { type StepState } from '@/components/ui/Stepper';
import { LoadingCard } from '@/components/ui/StateCard';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { can } from '@/lib/permissions';
import { useMarketplaceGuard } from '@/lib/useMarketplaceGuard';
import {
  useMarketplaceAccounts,
  type MarketplaceAccount,
} from '@/app/settings/sales-channels/useMarketplaceAccounts';
import JobPicker, { isStockJob, visibleJobs, type JobKey } from './components/JobPicker';
import ShopPicker from './components/ShopPicker';
import StockPreview from './components/StockPreview';
import RunResult from './components/RunResult';
import RunHistory from './components/RunHistory';
import { useAuthGuard } from '@/lib/useAuthGuard';

const BACK_HREF = '/settings/sales-channels?tab=marketplace';

type Stage = 'pick' | 'preview' | 'result';

function MarketplaceSyncContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile } = useAuth();
  const { gates } = useFeatures();
  const { allowed, checking } = useMarketplaceGuard();

  const canPush = can(userProfile, 'marketplace.push');
  const jobs = useMemo(
    () => visibleJobs({ stockEnabled: gates.stockEnabled, canPush }),
    [gates.stockEnabled, canPush],
  );

  const accountsState = useMarketplaceAccounts(allowed);
  const { shopee, lazada, tiktok, loading: accountsLoading } = accountsState;
  const accounts: MarketplaceAccount[] = useMemo(
    () => [...shopee, ...lazada, ...tiktok],
    [shopee, lazada, tiktok],
  );

  const [applying, setApplying] = useState(false);

  // ── สถานะจาก URL ─────────────────────────────────────────────────────────
  const rawJob = searchParams.get('job');
  const accountId = searchParams.get('account');
  const runId = searchParams.get('run');

  const job = useMemo(() => {
    const found = jobs.find(j => j.key === rawJob);
    return found || null;
  }, [jobs, rawJob]);

  const account = accounts.find(a => a.id === accountId) || null;

  const stage: Stage = runId ? 'result'
    : job && isStockJob(job.key) && account ? 'preview'
      : 'pick';

  /** เขียน URL ใหม่ทั้งชุด — ค่าที่เป็น null คือถอดพารามิเตอร์นั้นทิ้ง */
  const setParams = useCallback((next: { job?: JobKey | null; account?: string | null; run?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else if (value !== undefined) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `/marketplace/sync?${query}` : '/marketplace/sync');
  }, [router, searchParams]);

  const pickJob = (key: JobKey) => setParams({ job: key, account: null, run: null });

  const pickShop = (picked: MarketplaceAccount) => {
    if (!job) return;
    // สองงานนี้เป็น wizard คนละหน้า — ที่นี่แค่เลือกร้านให้แล้วส่งต่อ
    if (job.key === 'import') { router.push(`/marketplace/import?account=${picked.id}`); return; }
    if (job.key === 'export') { router.push(`/marketplace/export?account=${picked.id}`); return; }
    setParams({ account: picked.id, run: null });
  };

  const backToPick = () => { setApplying(false); setParams({ account: null, run: null }); };
  const openRun = (id: string) => { setApplying(false); setParams({ run: id }); };
  const recheck = (nextJob: 'pull_stock' | 'push_stock', nextAccountId: string) =>
    setParams({ job: nextJob, account: nextAccountId, run: null });

  // ── แถบขั้นตอน ───────────────────────────────────────────────────────────
  const stepState = (index: number): StepState => {
    const current = stage === 'result' ? 3 : applying ? 2 : stage === 'preview' ? 1 : 0;
    if (index < current) return 'done';
    return index === current ? 'current' : 'todo';
  };

  const steps = [
    { key: 'pick', label: 'เลือกร้าน', state: stepState(0) },
    { key: 'preview', label: 'ตรวจตาราง', state: stepState(1) },
    { key: 'confirm', label: 'ยืนยัน', state: stepState(2) },
    { key: 'result', label: 'ผลลัพธ์', state: stepState(3) },
  ];

  const onStepSelect = (key: string) => {
    if (key === 'pick') { backToPick(); return; }
    // ย้อนกลับมาตรวจตารางใหม่ = อ่านยอดใหม่เสมอ (ของเก่าเชื่อไม่ได้แล้ว)
    if (key === 'preview' && account) setParams({ run: null });
  };

  // ── render ───────────────────────────────────────────────────────────────
  if (checking) return <LoadingCard />;
  if (!allowed) return null;
  // ลิงก์ที่ระบุร้านมาแล้ว (โมดัลต้อนรับ · ตัวเฝ้า) — รอรายชื่อร้านก่อน ไม่งั้นเห็นขั้นเลือกร้าน
  // แวบหนึ่งแล้วกระโดดไปตารางเอง ดูเหมือนกดอะไรไปโดยไม่ได้ตั้งใจ
  if (accountId && accountsLoading && rawJob && isStockJob(rawJob) && !runId) {
    return <LoadingCard />;
  }

  // 4xl พอ — ตารางพรีวิวมีเลข 3 คอลัมน์ + สถานะ ส่วนที่เหลือเป็นชื่อสินค้า กว้างกว่านี้ชื่อยืดเปล่า ๆ
  return (
    <Container size="4xl">
      <PageHeader
        icon={<RefreshCw />}
        title="ซิงค์สินค้า &amp; สต็อก"
        subtitle="เลือกงานก่อน แล้วค่อยเลือกร้าน — งานที่ไปแตะข้อมูลจริงอยู่ที่นี่ทั้งหมด"
        backHref={BACK_HREF}
      />

      <Stepper steps={steps} onSelect={onStepSelect} ariaLabel="ขั้นตอนการซิงค์" />

      {stage === 'result' && runId ? (
        <RunResult runId={runId} onBack={backToPick} onOpenRun={openRun} onRecheck={recheck} />
      ) : (
        <>
          {stage === 'preview' && account && job && isStockJob(job.key) ? (
            <StockPreview
              key={`${account.id}-${job.key}`}
              account={account}
              direction={job.key === 'pull_stock' ? 'pull' : 'push'}
              onApplied={openRun}
              onBack={backToPick}
              onApplyingChange={setApplying}
            />
          ) : (
            <>
              <Card>
                <h2 className="heading-3 mb-3">จะทำอะไรกับร้าน</h2>
                <JobPicker jobs={jobs} value={job?.key ?? null} onChange={pickJob} />
              </Card>

              {job && (
                <Card>
                  <h2 className="heading-3 mb-3">{job.label} — เลือกร้าน</h2>
                  <ShopPicker
                    accounts={accounts}
                    loading={accountsLoading}
                    job={job}
                    value={accountId}
                    onSelect={pickShop}
                  />
                </Card>
              )}
            </>
          )}

          {/* ประวัติอยู่ท้ายหน้าเสมอเมื่อรู้ว่าร้านไหน — ตอบคำถาม "ยอดเปลี่ยนเพราะรอบไหน" */}
          {accountId && <RunHistory accountId={accountId} onOpenRun={openRun} />}
        </>
      )}
    </Container>
  );
}

export default function MarketplaceSyncPage() {
  const { allowed, loading: permLoading } = useAuthGuard('marketplace.sync');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <Suspense fallback={<LoadingCard />}>
        <MarketplaceSyncContent />
      </Suspense>
    </Layout>
  );
}
