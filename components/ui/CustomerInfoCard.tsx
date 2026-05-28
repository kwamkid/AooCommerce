'use client';

import { Loader2, UserCheck } from 'lucide-react';

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
  /** Hide the phone number row — useful when the phone is already shown in
   *  a separate field on the same form. */
  hidePhone?: boolean;
}

/**
 * Shared customer info display — used by DealerOrderForm + ReplenishmentForm
 * Shows: name + badge, phone, contact_person, email
 */
export default function CustomerInfoCard({
  customer, loading, badge, children, compact, hidePhone,
}: CustomerInfoCardProps) {
  const c = customer;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-slate-400">
        {c.contact_person && <span>ติดต่อ: {c.contact_person}</span>}
        {!hidePhone && c.phone && <span>โทร: {c.phone}</span>}
      </div>
    );
  }

  // Only show the secondary row when there is actually something to show.
  const showSecondary = (!hidePhone && c.phone) || c.email;

  return (
    <div className="flex items-center gap-2">
      {loading
        ? <Loader2 className="w-5 h-5 text-primary flex-shrink-0 animate-spin" />
        : <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-medium text-gray-900 dark:text-slate-200">{c.name}</span>
          {badge}
        </div>
        {loading && (
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลดราคา...
          </div>
        )}
        {showSecondary && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {!hidePhone && c.phone && <span className="text-xs text-gray-500 dark:text-slate-400">โทร: {c.phone}</span>}
            {c.email && <span className="text-xs text-gray-500 dark:text-slate-400">{c.email}</span>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
