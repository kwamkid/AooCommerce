'use client';

import { useRouter } from 'next/navigation';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, Link2, Printer, Ban, Lock, Loader2 } from 'lucide-react';

interface Props {
  status: string;
  updating: boolean;
  generatingPdf: boolean;
  onCopyLink: () => void;
  onPrintPdf: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export default function POHeaderActions({ status, updating, generatingPdf, onCopyLink, onPrintPdf, onCancel, onClose }: Props) {
  const router = useRouter();
  const busy = updating || generatingPdf;

  const menuItems: ActionItem[] = [
    { key: 'print', label: generatingPdf ? 'กำลังสร้าง...' : 'พิมพ์', icon: generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />, onClick: () => onPrintPdf(), disabled: busy },
    { key: 'copyLink', label: 'คัดลอกลิงก์ PO', icon: <Link2 className="w-4 h-4" />, onClick: () => onCopyLink(), disabled: busy },
  ];

  if (status === 'draft' || status === 'sent') {
    menuItems.push({ key: 'cancel', label: 'ยกเลิก', icon: <Ban className="w-4 h-4" />, danger: true, onClick: () => onCancel(), disabled: busy, dividerBefore: true });
  }

  if (status === 'partial_received' || status === 'received' || status === 'received_mismatch') {
    menuItems.push({ key: 'close', label: 'ปิด PO', description: 'จบ PO นี้ ไม่รอรับของเพิ่ม', icon: <Lock className="w-4 h-4" />, onClick: () => onClose(), disabled: busy, dividerBefore: true });
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push('/inventory/purchase-orders')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
        </button>
        <StatusBadge domain="purchaseOrder" status={status} size="md" />
      </div>
      <ActionMenu items={menuItems} />
    </div>
  );
}
