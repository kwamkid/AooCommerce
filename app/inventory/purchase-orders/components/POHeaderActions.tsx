'use client';

import { useRouter } from 'next/navigation';
import ActionMenu, { ActionItem } from '@/app/orders/components/ActionMenu';
import { getStatusInfo } from './types';
import {
  ArrowLeft, ClipboardList, Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  Link2, Printer, Ban, Lock, Loader2,
} from 'lucide-react';

const statusIcons: Record<string, React.ReactNode> = {
  ClipboardList: <ClipboardList className="w-4 h-4" />,
  Send: <Send className="w-4 h-4" />,
  Clock: <Clock className="w-4 h-4" />,
  CheckCircle2: <CheckCircle2 className="w-4 h-4" />,
  AlertTriangle: <AlertTriangle className="w-4 h-4" />,
  XCircle: <XCircle className="w-4 h-4" />,
};

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
  const badge = getStatusInfo(status);
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
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${badge.color}`}>
          {badge.iconName && statusIcons[badge.iconName]} {badge.label}
        </span>
      </div>
      <ActionMenu items={menuItems} />
    </div>
  );
}
