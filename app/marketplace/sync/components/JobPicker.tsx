'use client';

// การ์ดเลือกงาน 4 อย่างของหน้า "ซิงค์สินค้า & สต็อก"
//
// ทำไมเลือกงานก่อนเลือกร้าน: เดิมทุกงานเป็นปุ่มอยู่บนการ์ดของทุกร้าน — ร้านเดียวมีได้
// หลายสิบใบ กลายเป็นกำแพงปุ่มที่เจ้าของไม่กล้ากดเพราะไม่รู้ว่าอันไหนทำอะไรกับข้อมูลจริง
//
// ⛔ ห้าม `switch (platform)` ในไฟล์นี้ — งานทั้งสี่ไม่ผูกกับแพลตฟอร์มไหนเลย

import type { ReactNode } from 'react';
import { PackageSearch, UploadCloud } from 'lucide-react';
import { DownloadIcon, UploadIcon } from '@/lib/icons';

export type JobKey = 'import' | 'export' | 'pull_stock' | 'push_stock';

/** งานสองตัวที่มีตารางพรีวิว — ที่เหลือพาไป wizard คนละหน้า */
export const STOCK_JOBS: JobKey[] = ['pull_stock', 'push_stock'];

export function isStockJob(job: string | null): job is 'pull_stock' | 'push_stock' {
  return job === 'pull_stock' || job === 'push_stock';
}

export interface JobDef {
  key: JobKey;
  label: string;
  /** อธิบายด้วยทิศทางของข้อมูลเสมอ — ชื่องานอย่างเดียวคนอ่านยังเดาผิดได้ */
  description: string;
  icon: ReactNode;
  /** ต้องผูกสินค้ากับร้านไว้ก่อนถึงจะทำได้ */
  needsLinks: boolean;
  /** เป็นงานของระบบคลัง — แพ็กเกจที่ไม่มีคลังไม่ต้องเห็น */
  stockOnly: boolean;
  /** งานที่เขียนข้อมูลบนร้านคนอื่น — ต้องมีสิทธิ์ `marketplace.push` */
  needsPush: boolean;
}

export const JOBS: JobDef[] = [
  {
    key: 'import',
    label: 'นำเข้าสินค้าจากร้าน',
    description: 'ร้าน → ระบบ · ดึงรายการสินค้าบนร้านมาสร้าง/ผูกกับสินค้าในระบบ',
    icon: <DownloadIcon className="w-5 h-5" />,
    needsLinks: false,
    stockOnly: false,
    needsPush: false,
  },
  {
    key: 'export',
    label: 'ส่งสินค้าขึ้นร้าน',
    description: 'ระบบ → ร้าน · เอาสินค้าที่มีในระบบไปสร้างเป็นสินค้าใหม่บนร้าน',
    icon: <UploadIcon className="w-5 h-5" />,
    needsLinks: false,
    stockOnly: false,
    needsPush: true,
  },
  {
    key: 'pull_stock',
    label: 'ดึงสต็อกจากร้าน',
    description: 'ร้าน → ระบบ · เอายอดคงเหลือบนร้านมาลงคลัง — ดูตารางก่อนว่าตัวไหนจะเปลี่ยนบ้าง',
    icon: <PackageSearch className="w-5 h-5" />,
    needsLinks: true,
    stockOnly: true,
    needsPush: false,
  },
  {
    key: 'push_stock',
    label: 'ส่งสต็อกขึ้นร้าน',
    description: 'ระบบ → ร้าน · ส่งยอดของคลังที่ร้านนั้นใช้ขึ้นไปทับบนร้าน — ดูตารางก่อนว่าตัวไหนจะเปลี่ยนบ้าง',
    icon: <UploadCloud className="w-5 h-5" />,
    needsLinks: true,
    stockOnly: true,
    needsPush: true,
  },
];

export function visibleJobs(opts: { stockEnabled: boolean; canPush: boolean }): JobDef[] {
  return JOBS.filter(j => (opts.stockEnabled || !j.stockOnly) && (opts.canPush || !j.needsPush));
}

interface Props {
  value: JobKey | null;
  onChange: (job: JobKey) => void;
  jobs: JobDef[];
}

export default function JobPicker({ value, onChange, jobs }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {jobs.map(def => (
        <button
          key={def.key}
          type="button"
          onClick={() => onChange(def.key)}
          className={`choice-card p-4 text-left flex gap-3 items-start ${value === def.key ? 'choice-card-active' : ''}`}
        >
          <span className={`mt-0.5 flex-shrink-0 ${value === def.key ? 'text-[#F4511E]' : 'text-gray-400 dark:text-slate-500'}`}>
            {def.icon}
          </span>
          <span className="min-w-0">
            <span className="block body-text font-medium">{def.label}</span>
            <span className="block helper-text mt-0.5">{def.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
