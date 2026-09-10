// Path: app/settings/ad-accounts/components/MetaAccountPickerModal.tsx
// เลือกบัญชีโฆษณา → เลือก Dataset (2 ขั้น) หลัง Login Facebook สำเร็จ
//
// ทำไมต้อง 2 ขั้น: Dataset ที่เลือกได้ขึ้นกับบัญชีโฆษณาที่เลือก (คนละบัญชีคนละชุด)
// เอามารวมหน้าเดียวแล้วผู้ใช้จะเลือก Dataset ของบัญชีอื่นได้ ซึ่ง API ปฏิเสธทีหลัง
'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Radio from '@/components/ui/Radio';
import SearchInput from '@/components/ui/SearchInput';
import Tooltip from '@/components/ui/Tooltip';
import { META_EVENTS_MANAGER_URL, type MetaOauthAccount } from '@/lib/ads/meta-ui';

/** มากกว่านี้ค่อยมีช่องค้นหา — บัญชีไม่กี่ใบแล้วมีช่องค้นหาคือ UI ที่ไม่ได้ช่วยอะไร */
const SEARCH_THRESHOLD = 5;

export interface MetaAccountPickerModalProps {
  open: boolean;
  accounts: MetaOauthAccount[];
  stage: 1 | 2;
  selectedAccountId: string | null;
  selectedDatasetId: string | null;
  saving: boolean;
  onSelectAccount: (accountId: string) => void;
  onSelectDataset: (datasetId: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function MetaAccountPickerModal({
  open, accounts, stage, selectedAccountId, selectedDatasetId, saving,
  onSelectAccount, onSelectDataset, onBack, onCancel, onSave,
}: MetaAccountPickerModalProps) {
  const [search, setSearch] = useState('');

  const selected = accounts.find(a => a.account_id === selectedAccountId) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q)
      || a.account_id.toLowerCase().includes(q)
      || (a.business?.name || '').toLowerCase().includes(q));
  }, [accounts, search]);

  const datasets = selected?.datasets || [];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="xl"
      disableBackdropClose={saving}
      hideCloseButton={saving}
      title={stage === 1
        ? `เลือกบัญชีโฆษณา (${accounts.length} บัญชี)`
        : `เลือก Dataset สำหรับ ${selected?.name || 'บัญชีที่เลือก'}`}
      footer={
        <div className="flex gap-2 justify-end p-4">
          {stage === 2 && (
            <Button variant="ghost" onClick={onBack} disabled={saving} icon={<ArrowLeft className="w-4 h-4" />}>
              กลับ
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
          {stage === 1 ? (
            <Button variant="primary" onClick={onSave} disabled={!selectedAccountId}>
              ถัดไป: เลือก Dataset
            </Button>
          ) : (
            <Button variant="primary" onClick={onSave} loading={saving} disabled={!selectedDatasetId}>
              บันทึก
            </Button>
          )}
        </div>
      }
    >
      <div className="p-4 space-y-3">
        {stage === 1 ? (
          <>
            <Alert tone="info">
              <span className="subtitle-text">
                แสดงเฉพาะบัญชีที่คุณมีสิทธิ์ใน Business Manager · เลือกได้ทีละบัญชี
              </span>
            </Alert>

            {accounts.length > SEARCH_THRESHOLD && (
              <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อบัญชี / เลขบัญชี / Business" />
            )}

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {filtered.map(account => {
                const active = account.account_id === selectedAccountId;
                return (
                  <Radio
                    key={account.account_id}
                    checked={active}
                    disabled={account.already_connected}
                    onChange={() => onSelectAccount(account.account_id)}
                    className={`choice-card w-full p-3 ${active ? 'choice-card-active' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="body-text font-medium text-gray-900 dark:text-white truncate">
                          {account.name}
                        </span>
                        {account.already_connected && (
                          <Tooltip text="ใช้เมนู › เชื่อมต่อใหม่ บนการ์ดเดิมแทน">
                            <Badge tone="gray" size="sm">เชื่อมอยู่แล้ว</Badge>
                          </Tooltip>
                        )}
                      </div>
                      <p className="subtitle-text text-gray-500 dark:text-slate-400 truncate">
                        act_{account.account_id}
                        {account.currency ? ` · ${account.currency}` : ''}
                        {account.business?.name ? ` · ${account.business.name}` : ''}
                      </p>
                    </div>
                    {active && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
                  </Radio>
                );
              })}
              {filtered.length === 0 && (
                <p className="subtitle-text text-gray-500 dark:text-slate-400 text-center py-6">
                  ไม่พบบัญชีที่ตรงกับคำค้น
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="subtitle-text text-gray-500 dark:text-slate-400">
              Dataset คือที่รับ event (Purchase / QualifiedLead) — เลือกอันที่ผูกกับเพจที่ลูกค้าทักมา
            </p>

            {datasets.length === 0 ? (
              <Alert tone="warning">
                <span className="subtitle-text">
                  บัญชีนี้ยังไม่มี Dataset — สร้างใน Events Manager ก่อน แล้วกด &ldquo;เชื่อมต่อ&rdquo; ใหม่
                </span>
                <a
                  href={META_EVENTS_MANAGER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 subtitle-text text-primary underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> เปิด Events Manager
                </a>
              </Alert>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {datasets.map(dataset => {
                  const active = dataset.id === selectedDatasetId;
                  return (
                    <Radio
                      key={dataset.id}
                      checked={active}
                      onChange={() => onSelectDataset(dataset.id)}
                      className={`choice-card w-full p-3 ${active ? 'choice-card-active' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="body-text font-medium text-gray-900 dark:text-white truncate">{dataset.name}</p>
                        <p className="subtitle-text text-gray-500 dark:text-slate-400">{dataset.id}</p>
                      </div>
                      {active && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
                    </Radio>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
