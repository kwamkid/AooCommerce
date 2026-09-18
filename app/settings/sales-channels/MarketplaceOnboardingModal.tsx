'use client';

// โมดัล "เริ่มใช้งานร้านนี้" — เปิดทันทีหลังเชื่อมต่อร้านสำเร็จ และเปิดซ้ำได้จากการ์ดร้าน
//
// ทำไมเป็นลำดับขั้น ไม่ใช่ถามว่า "จะซิงค์สินค้า / สต็อก / ทั้งคู่":
// ลำดับผิดแล้วพังจริง — ดึงสต็อกก่อนนำเข้าสินค้า = ไม่มีรายการที่ผูกกันให้เติมยอด ·
// เปิดซิงค์อัตโนมัติก่อนตั้งยอด = ระบบส่งเลข 0 ขึ้นไปทับของจริงบนร้าน
// (กติกาอยู่ที่ lib/marketplace/onboarding.ts — ห้ามเขียนลำดับซ้ำที่นี่)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageSearch, UploadCloud } from 'lucide-react';
import { DownloadIcon, StoreIcon } from '@/lib/icons';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import Modal, { ModalFormBody, ModalFormFooter } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Stepper from '@/components/ui/Stepper';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { marketplaceOnboardingSteps, nextOnboardingStep } from '@/lib/marketplace/onboarding';
import type { MarketplaceAccount } from './useMarketplaceAccounts';

interface Props {
  account: MarketplaceAccount | null;
  onClose: () => void;
  /** ดึงข้อมูลร้านใหม่หลังทำขั้นใดขั้นหนึ่งเสร็จ — ขั้นถัดไปจะติ๊กเองตามข้อมูลจริง */
  onChanged: () => void;
}

export default function MarketplaceOnboardingModal({ account, onClose, onChanged }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { gates } = useFeatures();
  const [savingToggle, setSavingToggle] = useState(false);

  if (!account) return null;

  const platform = account.platform || 'shopee';
  const label = MARKETPLACE_PLATFORMS[platform].label;
  const shopName = account.shop_name || `Shop #${account.shop_id}`;
  const steps = marketplaceOnboardingSteps(account, { stockEnabled: gates.stockEnabled });
  const current = nextOnboardingStep(steps);
  const allDone = current === null;

  const goImport = () => {
    onClose();
    router.push(`/marketplace/import?account=${account.id}`);
  };

  /**
   * ขั้นตั้งยอดตั้งต้น **ไม่ลงมือจากในโมดัล** — พาไปหน้าซิงค์ให้เห็นตารางก่อนเสมอ
   * (รอบนี้แตะยอดทีเป็นร้อยตัวเลือก กดจากโมดัลที่ไม่มีตารางคือกดตาบอด)
   */
  const goStockJob = (job: 'pull_stock' | 'push_stock') => {
    onClose();
    router.push(`/marketplace/sync?job=${job}&account=${account.id}`);
  };

  const setAutoSync = async (value: boolean) => {
    setSavingToggle(true);
    try {
      const res = await apiFetch('/api/marketplace/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, auto_sync_stock: value }),
      });
      if (!res.ok) { showToast('เปลี่ยนค่าไม่สำเร็จ', 'error'); return; }
      showToast(value ? 'เปิดซิงค์สต็อกอัตโนมัติแล้ว' : 'ปิดซิงค์สต็อกอัตโนมัติไว้ก่อนแล้ว', 'success');
      onChanged();
    } catch {
      showToast('เปลี่ยนค่าไม่สำเร็จ', 'error');
    } finally {
      setSavingToggle(false);
    }
  };

  /** ปุ่มของขั้นที่กำลังทำอยู่ — ขั้นละชุด ไม่เอามาโชว์พร้อมกันทั้งหมด
   *  คืนเป็นปุ่มล้วน ๆ (ไม่ห่อ div) เพราะไปวางใน footer แถวเดียวกับ "ไว้ทีหลัง" */
  const stepActions = () => {
    if (!current) return null;
    if (current.key === 'link_products') {
      return (
        <Button variant="primary" icon={<DownloadIcon />} onClick={goImport}>
          นำเข้าสินค้าจาก {label}
        </Button>
      );
    }
    if (current.key === 'init_stock') {
      return (
        <>
          <Button variant="secondary" icon={<UploadCloud />} onClick={() => goStockJob('push_stock')}>
            ยึดยอดในระบบ (ส่งขึ้นไป)
          </Button>
          <Button variant="primary" icon={<PackageSearch />} onClick={() => goStockJob('pull_stock')}>
            ยึดยอดของร้าน (ดึงลงมา)
          </Button>
        </>
      );
    }
    return (
      <Button variant="primary" loading={savingToggle} onClick={() => setAutoSync(true)}>
        เปิดซิงค์สต็อกอัตโนมัติ
      </Button>
    );
  };

  // เปิด auto sync ค้างไว้ทั้งที่ยังไม่ได้ตั้งยอด = อันตรายกว่าการยังตั้งไม่ครบ ต้องเตือนก่อนทุกขั้น
  const riskyStep = steps.find(s => s.warning);

  return (
    <Modal
      open
      onClose={onClose}
      /* 2xl เพราะปุ่มของขั้น "ตั้งยอดตั้งต้น" มีสองปุ่มยาว — แคบกว่านี้แล้วปุ่มตกบรรทัด */
      size="2xl"
      icon={<StoreIcon />}
      title={`เริ่มใช้งาน ${shopName}`}
      footer={
        <ModalFormFooter>
          <Button variant="ghost" onClick={onClose}>{allDone ? 'ปิด' : 'ไว้ทีหลัง'}</Button>
          {stepActions()}
        </ModalFormFooter>
      }
    >
      <ModalFormBody stacked>
        <p className="body-text">
          เชื่อมต่อ {label} แล้ว — เหลืออีก {steps.filter(s => !s.done).length} ขั้นก่อนที่ร้านนี้จะทำงานเองได้
          {allDone && ' (ตั้งครบแล้ว)'}
        </p>

        <Stepper
          steps={steps.map(s => ({
            key: s.key,
            label: s.label,
            note: current?.key === s.key ? s.description : undefined,
            state: s.done ? 'done' : current?.key === s.key ? 'current' : 'todo',
          }))}
          ariaLabel="ขั้นตอนเริ่มใช้งานร้าน"
        />

        {riskyStep?.warning && (
          <Alert tone="warning" title="ปิดซิงค์อัตโนมัติไว้ก่อนดีกว่า">
            <p className="mb-3">{riskyStep.warning}</p>
            <Button variant="secondary" size="sm" loading={savingToggle} onClick={() => setAutoSync(false)}>
              ปิดไว้ก่อน
            </Button>
          </Alert>
        )}

        {current ? (
          <div className="inner-panel">
            <div className="inner-panel-head">ขั้นต่อไป — {current.label}</div>
            <div className="inner-panel-body space-y-3">
              <p className="body-text">{current.description}</p>
              {current.key === 'init_stock' && (
                <p className="helper-text">
                  ร้านที่ขายอยู่แล้วและยอดบนร้านถูกต้อง → ยึดยอดของร้าน ·
                  ร้านที่เพิ่งเปิดและนับสต็อกในระบบไว้แล้ว → ยึดยอดในระบบ
                </p>
              )}
            </div>
          </div>
        ) : (
          <Alert tone="success">
            ตั้งครบทั้ง {steps.length} ขั้นแล้ว — จากนี้สต็อกจะซิงค์ให้เอง งานที่ต้องกดเองอยู่ที่หน้า &quot;ซิงค์สินค้า &amp; สต็อก&quot;
          </Alert>
        )}
      </ModalFormBody>
    </Modal>
  );
}
