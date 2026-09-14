'use client';

// หน้าต่าง "ซิงค์สินค้า & สต็อก" — เปิดจากปุ่มบนหัวหน้า /settings/sales-channels
// (ข้างปุ่มเชื่อมต่อร้าน)
//
// ทำไมแยกออกมาจากการ์ดร้าน: เดิมทุกงาน (นำเข้าสินค้า · ส่งสินค้าขึ้นร้าน · ดึงสต็อก)
// เป็นปุ่มอยู่บนการ์ดของทุกร้าน — ร้านเดียวมีได้หลายสิบใบ กลายเป็นกำแพงปุ่มที่เจ้าของ
// ไม่กล้ากดเพราะไม่รู้ว่าอันไหนทำอะไรกับข้อมูลจริง · การ์ดร้านจึงเหลือแค่ "สถานะ +
// ตั้งค่า" ส่วนงานที่ไปแตะข้อมูลจริงมารวมที่นี่ทีละงาน: เลือกงานก่อน → แล้วเลือกร้าน
//
// ⛔ ห้าม `switch (platform)` ในไฟล์นี้ — ร้านทุกแพลตฟอร์มอยู่ในรายการเดียวกัน
// ป้ายชื่อมาจาก MARKETPLACE_PLATFORMS เสมอ (เพิ่ม LINE My Shop = ไม่ต้องแตะหน้านี้)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, PackageSearch, Upload, UploadCloud } from 'lucide-react';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Alert from '@/components/ui/Alert';
import ChannelBadge from '@/components/ui/ChannelBadge';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { pullStockRequest, pushStockAllRequest } from './stock-actions';
import type { MarketplaceAccountsState, MarketplaceAccount } from './useMarketplaceAccounts';

type JobKey = 'import' | 'export' | 'pull_stock' | 'push_stock';

interface JobDef {
  key: JobKey;
  label: string;
  /** อธิบายด้วยทิศทางของข้อมูลเสมอ — ชื่องานอย่างเดียวคนอ่านยังเดาผิดได้ */
  description: string;
  icon: React.ReactNode;
  /** ต้องผูกสินค้ากับร้านไว้ก่อนถึงจะทำได้ */
  needsLinks: boolean;
  /** เป็นงานของระบบคลัง — แพ็กเกจที่ไม่มีคลังไม่ต้องเห็น */
  stockOnly: boolean;
}

const JOBS: JobDef[] = [
  {
    key: 'import',
    label: 'นำเข้าสินค้าจากร้าน',
    description: 'ร้าน → ระบบ · ดึงรายการสินค้าบนร้านมาสร้าง/ผูกกับสินค้าในระบบ',
    icon: <Download className="w-5 h-5" />,
    needsLinks: false,
    stockOnly: false,
  },
  {
    key: 'export',
    label: 'ส่งสินค้าขึ้นร้าน',
    description: 'ระบบ → ร้าน · เอาสินค้าที่มีในระบบไปสร้างเป็นสินค้าใหม่บนร้าน',
    icon: <Upload className="w-5 h-5" />,
    needsLinks: false,
    stockOnly: false,
  },
  {
    key: 'pull_stock',
    label: 'ดึงสต็อกจากร้าน',
    description: 'ร้าน → ระบบ · เอายอดคงเหลือบนร้านมาเติมในคลัง เฉพาะรายการที่ยอดในระบบยังเป็น 0',
    icon: <PackageSearch className="w-5 h-5" />,
    needsLinks: true,
    stockOnly: true,
  },
  {
    key: 'push_stock',
    label: 'ส่งสต็อกขึ้นร้าน',
    description: 'ระบบ → ร้าน · ส่งยอดของคลังที่ร้านนั้นใช้ขึ้นไปทับบนร้าน ทั้งร้านในครั้งเดียว',
    icon: <UploadCloud className="w-5 h-5" />,
    needsLinks: true,
    stockOnly: true,
  },
];

interface Props {
  accounts: MarketplaceAccountsState;
  /** งานที่พาไป wizard คนละหน้า — ให้ผู้เรียกปิดหน้าต่างก่อนออกจากหน้านี้ */
  onNavigate?: () => void;
}

export default function MarketplaceSyncHub({ accounts, onNavigate }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { gates } = useFeatures();
  const stockEnabled = gates.stockEnabled;
  const { confirmDialog, confirm } = useConfirmDialog();
  const [job, setJob] = useState<JobKey | null>(null);
  const [running, setRunning] = useState<{ title: string; message: string } | null>(null);

  const { shopee, tiktok, lazada, loading, refetch } = accounts;
  const allAccounts: MarketplaceAccount[] = [...shopee, ...lazada, ...tiktok];
  const jobs = JOBS.filter(j => stockEnabled || !j.stockOnly);
  const activeJob = jobs.find(j => j.key === job) || null;

  const platformOf = (a: MarketplaceAccount) => a.platform || 'shopee';
  const platformLabel = (a: MarketplaceAccount) => MARKETPLACE_PLATFORMS[platformOf(a)].label;
  const shopName = (a: MarketplaceAccount) => a.shop_name || `Shop #${a.shop_id}`;

  /**
   * ร้านที่ทำงานนี้ไม่ได้ **ยังต้องโชว์ในรายการ** พร้อมเหตุผล — ซ่อนทิ้งแล้วเจ้าของ
   * จะถามซ้ำว่า "ทำไมไม่เห็นร้าน GB TH"
   */
  const blockedReason = (account: MarketplaceAccount, def: JobDef): string | null => {
    if (account.connection_status === 'expired') {
      return `การเชื่อมต่อหมดอายุ — ไปที่แท็บ ${platformLabel(account)} แล้วกด "เชื่อมต่อใหม่" ก่อน`;
    }
    if (def.needsLinks && account.linked_product_count === 0) {
      return 'ยังไม่ได้ผูกสินค้ากับร้านนี้ — ทำ "นำเข้าสินค้าจากร้าน" ก่อน';
    }
    return null;
  };

  const runPullStock = async (account: MarketplaceAccount) => {
    const ok = await confirm({
      title: `ดึงสต็อกจาก ${platformLabel(account)} — ${shopName(account)}?`,
      description: `ระบบจะอ่านยอดคงเหลือทุกสินค้าที่ผูกกับร้านนี้ (${account.linked_product_count} รายการ) มาใส่คลังของร้านนี้ โดยเติมเฉพาะรายการที่คลังเรายังเป็น 0 — ยอดที่ตั้ง/นับไว้แล้วจะไม่ถูกทับ`,
      confirmLabel: 'ดึงสต็อก',
    });
    if (!ok) return;
    setRunning({ title: 'กำลังดึงสต็อกจากร้าน', message: shopName(account) });
    const result = await pullStockRequest(account.id);
    setRunning(null);
    showToast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) refetch();
  };

  const runPushStock = async (account: MarketplaceAccount) => {
    const linked = account.linked_product_count;
    const ok = await confirm({
      title: `ส่งสต็อกขึ้น ${platformLabel(account)} — ${shopName(account)}?`,
      description:
        `• ระบบจะส่งยอดของคลังที่ร้านนี้ใช้ ขึ้นไปทับยอดบนร้าน ทั้งร้าน ${linked} สินค้า\n` +
        `• ใช้โควตา ${platformLabel(account)} ประมาณ ${linked} ครั้ง\n` +
        `• ถ้ายอดในระบบยังไม่ตรงของจริง ร้านจะได้ยอดที่ผิดไปด้วย — ไม่แน่ใจให้ "ดึงสต็อกจากร้าน" ก่อน`,
      confirmLabel: 'ส่งสต็อก',
    });
    if (!ok) return;
    setRunning({ title: 'กำลังส่งสต็อกขึ้นร้าน', message: `${shopName(account)} — ${linked} สินค้า` });
    const result = await pushStockAllRequest(account.id, msg =>
      setRunning({ title: 'กำลังส่งสต็อกขึ้นร้าน', message: msg })
    );
    setRunning(null);
    showToast(result.message, result.ok ? 'success' : 'error');
  };

  const pickAccount = (account: MarketplaceAccount, def: JobDef) => {
    if (def.key === 'import') { onNavigate?.(); router.push(`/marketplace/import?account=${account.id}`); return; }
    if (def.key === 'export') { onNavigate?.(); router.push(`/marketplace/export?account=${account.id}`); return; }
    if (def.key === 'pull_stock') { runPullStock(account); return; }
    runPushStock(account);
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <LoadingOverlay isOpen={running !== null} title={running?.title || ''} message={running?.message} />

      <p className="helper-text">
        เลือกงานก่อน แล้วค่อยเลือกร้าน — งานที่ไปแตะข้อมูลจริงอยู่ที่นี่ทั้งหมด การ์ดร้านเหลือไว้ดูสถานะกับตั้งค่า
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {jobs.map(def => (
          <button
            key={def.key}
            type="button"
            onClick={() => setJob(job === def.key ? null : def.key)}
            className={`choice-card p-4 text-left flex gap-3 items-start ${job === def.key ? 'choice-card-active' : ''}`}
          >
            <span className={`mt-0.5 flex-shrink-0 ${job === def.key ? 'text-[#F4511E]' : 'text-gray-400 dark:text-slate-500'}`}>
              {def.icon}
            </span>
            <span className="min-w-0">
              <span className="block body-text font-medium">{def.label}</span>
              <span className="block helper-text mt-0.5">{def.description}</span>
            </span>
          </button>
        ))}
      </div>

      {activeJob && (
        <div className="inner-panel">
          <div className="inner-panel-head">{activeJob.label} — เลือกร้าน</div>
          <div className="inner-panel-body space-y-3">
            {loading ? (
              <LoadingCard />
            ) : allAccounts.length === 0 ? (
              <EmptyCard title="ยังไม่ได้เชื่อมต่อร้าน marketplace" subtitle="เชื่อมต่อร้านที่แท็บของแพลตฟอร์มก่อน แล้วกลับมาที่นี่" />
            ) : (
              <div className="space-y-2">
                {allAccounts.map(account => {
                  const reason = blockedReason(account, activeJob);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      disabled={reason !== null}
                      onClick={() => pickAccount(account, activeJob)}
                      className={`choice-card w-full p-3 text-left flex items-center gap-3 ${
                        reason ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <ChannelBadge channel={{ platform: platformOf(account), picture_url: account.metadata?.shop_logo as string | undefined }} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block body-text font-medium truncate">{shopName(account)}</span>
                        <span className="block helper-text">
                          {reason || `${platformLabel(account)} · ผูกสินค้าไว้ ${account.linked_product_count} รายการ`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeJob.key === 'push_stock' && (
              <Alert tone="warning">
                ส่งสต็อกขึ้นร้านคือการเอายอดในระบบไปทับของบนร้าน — ร้านที่ยังไม่เคยตั้งยอดในระบบจะถูกทับด้วยเลข 0
                ให้ทำ &quot;ดึงสต็อกจากร้าน&quot; ก่อนเสมอ
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
