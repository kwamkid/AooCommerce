// Path: components/customers/TagManager.tsx
// จัดการแท็ก (สร้าง / แก้ชื่อ+สี / ลบ) — self-contained: ดึงข้อมูลเองจาก
// /api/customers/tags และคืนรายการล่าสุดผ่าน onChanged ให้ผู้เรียก sync ต่อได้
//
// แท็กชุดนี้ใช้ร่วมกันทั้งลูกค้าและผู้ติดต่อในแชท — การลบจึงถอดแท็กออกจาก
// ทั้งสองฝั่งพร้อมกัน (FK cascade) กล่องยืนยันจึงต้องบอกจำนวนจริงของทั้งคู่
// และต้องเป็นตัวเลข "สด" เสมอ (โหลดใหม่ก่อนเปิดกล่อง) — ตัวเลขค้างคือสาเหตุ
// ที่คนเผลอลบแท็กที่ยังมีคนใช้อยู่
'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import FormInput from '@/components/ui/FormInput';
import ListRow from '@/components/ui/ListRow';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import { Tag as TagType, TAG_COLORS } from '@/components/ui/TagBadge';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { Edit2, Trash2, Tags, Loader2 } from 'lucide-react';

interface TagManagerProps {
  /** เรียกทุกครั้งที่รายการแท็กเปลี่ยน (สร้าง/แก้/ลบ) พร้อมรายการล่าสุด */
  onChanged?: (tags: TagType[]) => void;
}

export default function TagManager({ onChanged }: TagManagerProps) {
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [tags, setTags] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(true);

  // ฟอร์มบนสุด — ใช้ทั้งสร้างใหม่และแก้ของเดิม (editing = null คือกำลังสร้าง)
  const [editing, setEditing] = useState<TagType | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const applyTags = useCallback((next: TagType[]) => {
    setTags(next);
    onChanged?.(next);
  }, [onChanged]);

  /** ดึงรายการแท็ก · `fresh` = ข้าม cache ของ apiFetch (ใช้ตอนต้องการตัวเลขสดก่อนลบ) */
  const fetchTags = useCallback(async (fresh = false): Promise<TagType[]> => {
    if (fresh) invalidateApiCache('/api/customers/tags');
    const res = await apiFetch('/api/customers/tags');
    if (!res.ok) throw new Error('โหลดแท็กไม่สำเร็จ');
    const data = await res.json();
    return (data.tags || []) as TagType[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTags()
      .then(list => { if (!cancelled) setTags(list); })
      .catch(() => { if (!cancelled) showToast('โหลดแท็กไม่สำเร็จ', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // ตั้งใจรันครั้งเดียวตอน mount — showToast/fetchTags เป็น callback คงที่
  }, [fetchTags, showToast]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setColor(TAG_COLORS[0]);
  };

  const startEdit = (tag: TagType) => {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color);
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await apiFetch('/api/customers/tags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, name: name.trim(), color }),
        });
        if (!res.ok) { const r = await res.json().catch(() => ({})); throw new Error(r.error || 'แก้ไขแท็กไม่สำเร็จ'); }
        const { tag } = await res.json();
        // คงตัวนับเดิมไว้ — API ขาแก้ไขไม่ได้คืน count กลับมา
        applyTags(tags.map(t => (t.id === tag.id
          ? { ...tag, count: t.count, contact_count: t.contact_count }
          : t)));
        showToast('แก้ไขแท็กสำเร็จ');
      } else {
        const res = await apiFetch('/api/customers/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), color }),
        });
        if (!res.ok) { const r = await res.json().catch(() => ({})); throw new Error(r.error || 'สร้างแท็กไม่สำเร็จ'); }
        const { tag } = await res.json();
        applyTags([...tags, { ...tag, count: 0, contact_count: 0 }]
          .sort((a, b) => a.name.localeCompare(b.name, 'th')));
        showToast('สร้างแท็กสำเร็จ');
      }
      resetForm();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกแท็กไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: TagType) => {
    // โหลดตัวเลขสดก่อนถาม — ระหว่างเปิดหน้าค้างไว้ คนอื่นอาจติดแท็กนี้เพิ่ม
    let current = tag;
    let latest: TagType[] | null = null;
    try {
      latest = await fetchTags(true);
      const found = latest.find(t => t.id === tag.id);
      if (!found) {
        applyTags(latest);
        showToast('แท็กนี้ถูกลบไปแล้ว', 'error');
        return;
      }
      current = found;
      applyTags(latest);
    } catch {
      // อ่านตัวเลขใหม่ไม่ได้ ก็ยังถามต่อด้วยตัวเลขที่มีอยู่ ดีกว่าค้างไม่ให้ทำอะไรเลย
    }

    const customers = current.count ?? 0;
    const contacts = current.contact_count ?? 0;
    const description = customers === 0 && contacts === 0
      ? 'ยังไม่มีใครใช้แท็กนี้'
      : `ติดอยู่กับลูกค้า ${customers} คน และแชท ${contacts} รายการ — ทั้งหมดจะถูกถอดแท็กนี้ออกทันที ย้อนกลับไม่ได้`;

    const ok = await confirm({
      title: `ลบแท็ก "${current.name}"?`,
      description,
      variant: 'danger',
      confirmLabel: 'ลบแท็ก',
    });
    if (!ok) return;

    setDeletingId(current.id);
    try {
      const res = await apiFetch('/api/customers/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id }),
      });
      if (!res.ok) { const r = await res.json().catch(() => ({})); throw new Error(r.error || 'ลบแท็กไม่สำเร็จ'); }
      applyTags((latest ?? tags).filter(t => t.id !== current.id));
      if (editing?.id === current.id) resetForm();
      showToast('ลบแท็กสำเร็จ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบแท็กไม่สำเร็จ', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* ฟอร์มสร้าง / แก้ไข */}
      <Card padding="md">
        <div className="space-y-4">
          <FormInput
            label={editing ? 'แก้ไขแท็ก' : 'สร้างแท็กใหม่'}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
              if (e.key === 'Escape' && editing) resetForm();
            }}
            placeholder={editing ? 'แก้ไขชื่อแท็ก...' : 'ชื่อแท็กใหม่...'}
            hint="แท็กชุดเดียวกันใช้ได้ทั้งหน้าลูกค้าและหน้าแชท"
          />

          <div>
            <span className="field-label block mb-2">สีแท็ก</span>
            <div className="flex items-center gap-2 flex-wrap">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`เลือกสี ${c}`}
                  aria-pressed={color === c}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-800'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {editing && (
              <Button variant="secondary" disabled={saving} onClick={resetForm}>
                ยกเลิก
              </Button>
            )}
            {editing ? (
              <SaveButton loading={saving} disabled={!name.trim()} onClick={handleSave} />
            ) : (
              <Button
                variant="primary"
                loading={saving}
                disabled={!name.trim()}
                onClick={handleSave}
              >
                สร้าง
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* รายการแท็ก */}
      {loading ? (
        <LoadingCard />
      ) : tags.length === 0 ? (
        <EmptyCard
          icon={<Tags className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title="ยังไม่มีแท็ก"
          subtitle="สร้างแท็กแรกจากช่องด้านบน แล้วนำไปติดกับลูกค้าหรือผู้ติดต่อในแชทได้เลย"
        />
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <ListRow
              key={tag.id}
              icon={
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: tag.color + '30' }}
                >
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: tag.color }} />
                </span>
              }
              title={tag.name}
              subtitle={`ลูกค้า ${tag.count ?? 0} คน · แชท ${tag.contact_count ?? 0} รายการ`}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Edit2 className="w-4 h-4" />}
                    onClick={() => startEdit(tag)}
                    aria-label={`แก้ไขแท็ก ${tag.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={deletingId === tag.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                    disabled={deletingId === tag.id}
                    onClick={() => handleDelete(tag)}
                    aria-label={`ลบแท็ก ${tag.name}`}
                    className="!text-gray-400 hover:!text-red-500"
                  />
                </>
              }
            />
          ))}
        </div>
      )}

      {confirmDialog}
    </>
  );
}
