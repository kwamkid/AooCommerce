import Link from 'next/link';
import type { ReactNode } from 'react';

interface MasterDataCellProps {
  icon: ReactNode;
  title: string;
  href?: string;
  subtitle?: ReactNode;
  tone?: 'primary' | 'muted';
  nested?: boolean;
}

/** Reusable name cell for category, brand, supplier, and other master-data lists. */
export default function MasterDataCell({
  icon,
  title,
  href,
  subtitle,
  tone = 'primary',
  nested = false,
}: MasterDataCellProps) {
  const rootClass = ['master-data-cell', nested ? 'master-data-cell-nested' : ''].filter(Boolean).join(' ');
  return (
    <div className={rootClass}>
      <span className={`master-data-cell-icon master-data-cell-icon-${tone}`}>{icon}</span>
      <div className="master-data-cell-content">
        {href
          ? <Link href={href} className="master-data-cell-link">{title}</Link>
          : <p className="master-data-cell-title">{title}</p>}
        {subtitle && <p className="master-data-cell-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
