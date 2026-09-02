'use client';

// การ์ด "เรื่องที่ต้องแก้" บน dashboard ของร้าน
//
// เจ้าของร้านต้องรู้เองว่าช่องทางไหนของตัวเองพัง ไม่ใช่รอให้ผู้ดูแลระบบมาบอก
// รายการมาจากตัวเฝ้าตัวเดียวกับกระดิ่ง/แจ้งเตือน (lib/marketplace/watchdog.ts)
// **ทุกแถวต้องมีทั้งวิธีแก้และปุ่มพาไปหน้าที่แก้ได้จริง** — บอกว่าพังเฉย ๆ ไม่พอ

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import ChannelBadge from '@/components/ui/ChannelBadge';
import { useHeaderSummary } from '@/lib/header-summary-context';
import { useFeatures } from '@/lib/features-context';

export default function SystemIssuesCard({ className = '' }: { className?: string }) {
  const { summary } = useHeaderSummary();
  const { features } = useFeatures();

  const issues = summary?.marketplaceHealth?.issues || [];
  if (!features.marketplace_sync || issues.length === 0) return null;

  return (
    <Card padding="none" className={className}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-slate-700">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="heading-3">เรื่องที่ต้องแก้ ({issues.length})</h3>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-slate-700">
        {issues.map(issue => (
          <li
            key={issue.code}
            // ความรุนแรงอ่านจากแถบซ้าย เพื่อเว้นที่ให้โลโก้ร้านบอกว่า "เรื่องของร้านไหน"
            className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 border-l-2 ${
              issue.severity === 'critical' ? 'border-red-500' : 'border-amber-400'
            }`}
          >
            {issue.channel && (
              <ChannelBadge
                size="md"
                channel={{ platform: issue.channel.platform, picture_url: issue.channel.picture_url }}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 dark:text-white">{issue.title}</p>
              <p className="subtitle-text text-gray-600 dark:text-slate-300">{issue.detail}</p>
              <p className="subtitle-text text-gray-500 dark:text-slate-400 mt-1">
                <span className="font-medium">วิธีแก้:</span> {issue.fix}
              </p>
            </div>
            <Link href={issue.url} className="btn btn-sm btn-secondary flex-shrink-0 self-start sm:self-auto">
              {issue.actionLabel}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
