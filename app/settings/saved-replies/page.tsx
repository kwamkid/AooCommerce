// Path: app/settings/saved-replies/page.tsx
//
// จัดการข้อความสำเร็จรูปของแชท — คลังกลางต่อบริษัท ใช้ร่วมกันทั้งร้าน
// ลำดับในหน้านี้ = ลำดับที่เห็นในรายการตอนกดปุ่มในหน้าแชท (เอาที่ใช้บ่อยไว้บนสุด)
'use client';

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import ListRow from '@/components/ui/ListRow';
import Tooltip from '@/components/ui/Tooltip';
import Toggle from '@/components/ui/Toggle';
import SearchInput from '@/components/ui/SearchInput';
import { LoadingCard, EmptyCard, NoPermissionCard } from '@/components/ui/StateCard';
import SavedReplyModal from '@/components/chat/SavedReplyModal';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { filterSavedReplies, savedReplyPreview, savedReplyThumb, type SavedReply } from '@/lib/chat/saved-replies';
import { MessageSquareText, Plus, Edit2, Trash2, Image as ImageIcon } from 'lucide-react';

export default function SavedRepliesSettingsPage() {
  const { allowed, loading: authLoading } = useAuthGuard('chat.reply', { noRedirect: true });
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();

  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reordering, setReordering] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavedReply | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/chat/saved-replies');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setReplies((data.replies || []) as SavedReply[]);
    } catch {
      showToast('โหลดข้อความสำเร็จรูปไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };
  useFetchOnce(load, !authLoading && allowed);

  /** หน้าแชทแคชรายการไว้ 60 วิ — แก้ที่นี่แล้วต้องล้าง ไม่งั้นของใหม่ไม่โผล่ */
  const invalidate = () => invalidateApiCache('/api/chat/saved-replies');

  const move = async (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= replies.length) return;
    const next = [...replies];
    [next[index], next[target]] = [next[target], next[index]];
    setReplies(next);
    setReordering(true);
    try {
      const res = await apiFetch('/api/chat/saved-replies', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: next.map((r, i) => ({ id: r.id, sort_order: i })) }),
      });
      if (!res.ok) throw new Error('reorder failed');
      invalidate();
    } catch {
      showToast('เรียงลำดับไม่สำเร็จ', 'error');
      void load();
    } finally {
      setReordering(false);
    }
  };

  const toggleActive = async (reply: SavedReply) => {
    const nextActive = !reply.is_active;
    setReplies(prev => prev.map(r => r.id === reply.id ? { ...r, is_active: nextActive } : r));
    const res = await apiFetch('/api/chat/saved-replies', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reply.id, is_active: nextActive }),
    });
    if (!res.ok) {
      setReplies(prev => prev.map(r => r.id === reply.id ? { ...r, is_active: !nextActive } : r));
      showToast('เปลี่ยนสถานะไม่สำเร็จ', 'error');
      return;
    }
    invalidate();
  };

  const remove = async (reply: SavedReply) => {
    const ok = await confirm({
      title: 'ลบข้อความสำเร็จรูป',
      description: `ลบ "${reply.title}" ออกจากคลังของร้าน? ข้อความที่ส่งไปหาลูกค้าแล้วจะไม่ถูกแตะต้อง`,
      confirmLabel: 'ลบ',
      variant: 'danger',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/chat/saved-replies?id=${reply.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('ลบไม่สำเร็จ', 'error'); return; }
    setReplies(prev => prev.filter(r => r.id !== reply.id));
    invalidate();
    showToast('ลบแล้ว');
  };

  const onSaved = (saved: SavedReply) => {
    setReplies(prev => prev.some(r => r.id === saved.id)
      ? prev.map(r => r.id === saved.id ? saved : r)
      : [...prev, saved]);
    invalidate();
  };

  const shown = filterSavedReplies(replies, search);

  return (
    <Layout>
      <Container size="4xl">
        <PageHeader
          icon={<MessageSquareText />}
          title="ข้อความสำเร็จรูป"
          subtitle="ข้อความที่ใช้ตอบลูกค้าบ่อย ๆ — ทุกคนในร้านใช้ชุดเดียวกัน เรียกใช้ในหน้าแชทด้วยปุ่มข้างช่องพิมพ์ หรือพิมพ์ /"
          actions={
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setModalOpen(true); }}>
              เพิ่มข้อความ
            </Button>
          }
        />

        {authLoading || loading ? (
          <LoadingCard />
        ) : !allowed ? (
          <NoPermissionCard />
        ) : replies.length === 0 ? (
          <EmptyCard
            icon={<MessageSquareText className="w-10 h-10" />}
            title="ยังไม่มีข้อความสำเร็จรูป"
            subtitle="เพิ่มข้อความที่ตอบลูกค้าบ่อย ๆ เช่น ค่าส่ง เลขบัญชี วิธีสั่งซื้อ แล้วเรียกใช้ได้ทันทีในหน้าแชท"
          />
        ) : (
          <>
            {replies.length > 5 && (
              <div className="data-filter-card">
                <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อหรือข้อความ..." />
              </div>
            )}
            <div className="space-y-2">
              {shown.map((r) => {
                // ลูกศรเรียงลำดับอ้างตำแหน่งในลิสต์จริง ไม่ใช่ผลค้นหา (กดแล้วต้องสลับกับใบที่อยู่ติดกันจริง ๆ)
                const realIndex = replies.findIndex(x => x.id === r.id);
                return (
                  <ListRow
                    key={r.id}
                    inactive={!r.is_active}
                    reorder={!search && replies.length > 1 ? {
                      onMoveUp: () => move(realIndex, 'up'),
                      onMoveDown: () => move(realIndex, 'down'),
                      disableUp: realIndex === 0,
                      disableDown: realIndex === replies.length - 1,
                      disabled: reordering,
                    } : undefined}
                    icon={
                      savedReplyThumb(r) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={savedReplyThumb(r)!} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <MessageSquareText className="w-4 h-4 text-primary" />
                        </div>
                      )
                    }
                    title={
                      <span className="flex items-center gap-1.5">
                        {r.title}
                        {r.image_urls.length > 0 && (
                          <Tooltip text={r.image_urls.length > 1 ? `มีรูปแนบ ${r.image_urls.length} ใบ` : 'มีรูปแนบ'}>
                            <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                          </Tooltip>
                        )}
                      </span>
                    }
                    subtitle={savedReplyPreview(r, 110)}
                    actions={
                      <div className="flex items-center gap-1">
                        <Tooltip text={r.is_active ? 'ปิดไม่ให้ขึ้นในหน้าแชท' : 'เปิดให้ใช้ในหน้าแชท'} box="inline-flex">
                          <Toggle checked={r.is_active} onChange={() => toggleActive(r)} />
                        </Tooltip>
                        <Tooltip text="แก้ไข">
                          <button onClick={() => { setEditing(r); setModalOpen(true); }} aria-label="แก้ไข" className="p-2 text-gray-500 hover:text-primary rounded-lg">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip text="ลบ">
                          <button onClick={() => remove(r)} aria-label="ลบ" className="p-2 text-gray-500 hover:text-red-600 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    }
                  />
                );
              })}
              {shown.length === 0 && (
                <p className="subtitle-text text-gray-500 text-center py-6">ไม่พบข้อความที่ค้น</p>
              )}
            </div>
          </>
        )}
      </Container>

      <SavedReplyModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        reply={editing}
        onSaved={onSaved}
      />
      {confirmDialog}
    </Layout>
  );
}
