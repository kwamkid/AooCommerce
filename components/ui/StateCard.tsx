'use client';

import type { ReactNode } from 'react';
import { Loader2, AlertCircle, Check, AlertTriangle } from 'lucide-react';
import Card from './Card';
import { SkeletonCard } from './Skeleton';

/**
 * Generic centered state card — used for loading/empty/no-permission/result screens.
 * Three preset wrappers below cover the common cases.
 */
interface StateCardProps {
  icon: ReactNode;
  /** ไม่ส่ง = แสดงแค่ icon (เช่น LoadingCard แบบโลโก้ล้วน) */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Buttons / actions shown under the message */
  actions?: ReactNode;
  /** Tighter padding for compact contexts */
  compact?: boolean;
}

export function StateCard({ icon, title, subtitle, actions, compact = false }: StateCardProps) {
  return (
    <Card padding={compact ? 'md' : 'lg'} className="text-center space-y-4">
      <div className="flex justify-center">{icon}</div>
      {(title || subtitle) && (
        <div>
          {title && <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>}
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
      )}
      {actions && <div className="flex items-center justify-center gap-3 pt-2">{actions}</div>}
    </Card>
  );
}

/* ---------- Preset wrappers ---------- */

/**
 * Loading / busy state
 * - ไม่ส่ง title = กำลัง "อ่าน" ข้อมูล → skeleton (ไม่มี spinner ไม่มีคำว่า กำลังโหลด)
 * - ส่ง title = กำลัง "ทำงาน" ที่ควรบอกผู้ใช้ (เช่น "กำลังตรวจสอบข้อมูล...") → spinner + ข้อความ
 */
export function LoadingCard({ title, subtitle, compact }: { title?: ReactNode; subtitle?: ReactNode; compact?: boolean }) {
  if (!title && !subtitle) {
    return (
      <div role="status" aria-busy="true" aria-label="กำลังโหลด">
        <SkeletonCard lines={compact ? 2 : 4} />
      </div>
    );
  }
  return (
    <StateCard
      icon={<Loader2 className="w-12 h-12 text-[#F4511E] animate-spin" />}
      title={title}
      subtitle={subtitle}
      compact={compact}
    />
  );
}

/** Empty list / no-results state. */
export function EmptyCard({ title = 'ไม่พบข้อมูล', subtitle, icon, actions }: { title?: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <StateCard
      icon={icon || <Check className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
      title={title}
      subtitle={subtitle}
      actions={actions}
    />
  );
}

/** Permission denied. Default copy targets owner/admin-only pages. */
export function NoPermissionCard({
  title = 'ไม่มีสิทธิ์เข้าถึง',
  subtitle = 'เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้น',
}: { title?: ReactNode; subtitle?: ReactNode } = {}) {
  return (
    <StateCard
      icon={<AlertCircle className="w-12 h-12 text-red-400" />}
      title={title}
      subtitle={subtitle}
    />
  );
}

/**
 * Done / result state for bulk operations. Color of the badge follows
 * `hasErrors` — emerald when all successful, amber when partial errors.
 */
interface DoneCardProps {
  hasErrors: boolean;
  title?: ReactNode;
  /** Inline badges describing the outcome (e.g., "5 สร้างใหม่", "2 ล้มเหลว") */
  summary?: ReactNode;
  actions?: ReactNode;
}
export function DoneCard({ hasErrors, title = 'เสร็จสิ้น', summary, actions }: DoneCardProps) {
  return (
    <Card padding="lg" className="text-center space-y-4">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
          hasErrors ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
        }`}
      >
        {hasErrors ? (
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        ) : (
          <Check className="w-8 h-8 text-emerald-600" />
        )}
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      {summary && <div className="flex flex-wrap items-center justify-center gap-4 text-sm">{summary}</div>}
      {actions && <div className="flex items-center justify-center gap-3 pt-2">{actions}</div>}
    </Card>
  );
}
