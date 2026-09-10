// Path: app/marketing/audiences/[id]/page.tsx
//
// แก้ไขกลุ่มเป้าหมาย — โหลดใบนี้แล้วส่งให้ `AudienceForm` (ตัวเดียวกับหน้าสร้าง)
//
// หน้านี้ถือ `audience` ไว้เอง เพราะหัวเรื่องกับเมนูลบต้องเปลี่ยนตามของจริง — ฟอร์มยิง
// `onAudienceChange` กลับมาทุกครั้งที่บันทึกหรือสถานะ sync ขยับ
'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Tooltip from '@/components/ui/Tooltip';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { Send, Target, Trash2 } from 'lucide-react';
import AudienceForm from '../components/AudienceForm';
import type { AudienceView } from '../components/types';

export default function EditAudiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('marketing.audiences', { noRedirect: true });

  const [audience, setAudience] = useState<AudienceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/audiences/${id}`);
        if (!res.ok) throw new Error('failed');
        setAudience((await res.json())?.audience ?? null);
      } catch {
        showToast('โหลดกลุ่มเป้าหมายไม่สำเร็จ', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, id, showToast]);

  const handleAudienceChange = useCallback((a: AudienceView) => setAudience(a), []);

  const handleDelete = async () => {
    if (!audience) return;
    const ok = await confirm({
      title: `ลบกลุ่ม "${audience.name}"?`,
      description: `บรอดแคสต์ที่เคยส่งไม่ได้รับผลกระทบ · Custom Audience ใน Meta (${audience.syncs.length} บัญชี)`
        + ' จะถูกลบด้วย — โฆษณาที่ใช้กลุ่มนี้อยู่จะหยุดหาคนใหม่',
      variant: 'danger',
      confirmLabel: 'ลบกลุ่ม',
      confirmIcon: <Trash2 className="w-4 h-4" />,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/audiences/${id}?delete_remote=1`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      const data = await res.json().catch(() => ({}));
      invalidateApiCache('/api/audiences');
      showToast(data.warning || 'ลบกลุ่มแล้ว', data.warning ? 'error' : 'success');
      router.push('/marketing/audiences');
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'ลบกลุ่มไม่สำเร็จ', 'error');
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="full"><NoPermissionCard /></Container></Layout>;
  }
  if (!audience) {
    return (
      <Layout>
        <Container size="full">
          <EmptyCard
            icon={<Target className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title="ไม่พบกลุ่มเป้าหมายนี้"
            subtitle="อาจถูกลบไปแล้ว"
            actions={
              <Button variant="secondary" onClick={() => router.push('/marketing/audiences')}>
                กลับไปหน้ารายการ
              </Button>
            }
          />
        </Container>
      </Layout>
    );
  }

  /** กลุ่มที่ไม่มีห้องแชท LINE ส่งบรอดแคสต์ไม่ได้ — ปุ่มยังอยู่แต่กดไม่ได้พร้อมบอกเหตุผล */
  const hasLine = audience.sources.some(s => s.kind === 'chat' && s.platform === 'line');
  const menu: ActionItem[] = [{
    key: 'delete',
    label: 'ลบกลุ่ม',
    icon: <Trash2 className="w-4 h-4" />,
    danger: true,
    disabled: deleting,
    onClick: handleDelete,
  }];

  return (
    <Layout>
      {confirmDialog}
      <Container size="full">
        <PageHeader
          backHref="/marketing/audiences"
          title={audience.name}
          subtitle={audience.description || 'แก้เงื่อนไขแล้วบันทึก — ทุกบัญชีโฆษณาที่ผูกไว้จะคำนวณส่วนต่างใหม่ในรอบถัดไป'}
          actions={
            <>
              <Tooltip
                text={hasLine ? '' : 'กลุ่มนี้ไม่มีช่องทาง LINE — บรอดแคสต์ส่งได้เฉพาะ LINE'}
                box="inline-flex"
              >
                <Button
                  variant="secondary"
                  icon={<Send className="w-4 h-4" />}
                  disabled={!hasLine}
                  onClick={() => router.push(`/marketing/broadcast/new?audience=${audience.id}`)}
                >
                  ส่งบรอดแคสต์หากลุ่มนี้
                </Button>
              </Tooltip>
              <ActionMenu items={menu} />
            </>
          }
        />
        <AudienceForm mode="edit" initial={audience} onAudienceChange={handleAudienceChange} />
      </Container>
    </Layout>
  );
}
