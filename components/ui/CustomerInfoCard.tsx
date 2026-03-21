'use client';

import { CheckCircle, Loader2 } from 'lucide-react';

/** Customer data needed for the info card */
export interface CustomerInfoData {
  name: string;
  phone?: string | null;
  contact_person?: string | null;
  email?: string | null;
  customer_code?: string | null;
}

interface CustomerInfoCardProps {
  customer: CustomerInfoData;
  /** Loading GP / pricing */
  loading?: boolean;
  /** Badge elements (e.g. เครดิต/เงินสด) */
  badge?: React.ReactNode;
  /** Extra content below (e.g. address selector) */
  children?: React.ReactNode;
  /** Compact mode = inline text only */
  compact?: boolean;
}

/**
 * Shared customer info display — used by DealerOrderForm + ReplenishmentForm
 * Shows: name + badge, phone, contact_person, email
 */
export default function CustomerInfoCard({
  customer, loading, badge, children, compact,
}: CustomerInfoCardProps) {
  const c = customer;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-slate-400">
        {c.contact_person && <span>ติดต่อ: {c.contact_person}</span>}
        {c.phone && <span>โทร: {c.phone}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      {loading
        ? <Loader2 className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5 animate-spin" />
        : <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{c.name}</span>
          {badge}
        </div>
        {loading && (
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลดราคา...
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {c.phone && <span className="text-xs text-gray-500 dark:text-slate-400">โทร: {c.phone}</span>}
          {c.email && <span className="text-xs text-gray-500 dark:text-slate-400">{c.email}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
