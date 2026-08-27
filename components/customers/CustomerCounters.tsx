'use client';

// สาขาฝากขาย (PC) ของลูกค้ารายนี้ — จัดการจากหน้าลูกค้าได้เลย ไม่ต้องไป
// ตั้งค่า → สาขาฝากขาย (PC) (หน้านั้นยังเป็นศูนย์รวม + ที่มอบหมายพนักงาน PC)
// ใช้ /api/counters ชุดเดียวกัน: 1 สาขา = 1 คลังฝากขาย สร้างคลังให้อัตโนมัติ

import { useState } from 'react';
import Link from 'next/link';
import { Store, Plus, Edit2, ExternalLink } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Modal from '@/components/ui/Modal';
import ListRow from '@/components/ui/ListRow';
import Toggle from '@/components/ui/Toggle';
import FormInput from '@/components/ui/FormInput';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { useFetchOnce } from '@/lib/use-fetch-once';

const COUNTER_CUSTOMER_TYPES = ['department_store', 'consignment_dealer'];

interface Counter {
  id: string;
  name: string;
  is_active: boolean;
  warehouse: { id: string; name: string } | null;
}

export default function CustomerCounters({ customerId, customerType }: { customerId: string; customerType: string }) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const canManage = can(userProfile?.roles, 'counter.manage');

  const [counters, setCounters] = useState<Counter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isCounterType = COUNTER_CUSTOMER_TYPES.includes(customerType);

  const loadCounters = async () => {
    try {
      const res = await apiFetch(`/api/counters?customer_id=${customerId}&active=false`);
      if (!res.ok) return;
      const data = await res.json();
      setCounters((data.counters || []) as Counter[]);
    } finally {
      setLoaded(true);
    }
  };

  useFetchOnce(loadCounters, isCounterType && !!customerId);

  if (!isCounterType) return null;

  const openCreate = () => { setEditingId(null); setFormName(''); setModalOpen(true); };
  const openEdit = (c: Counter) => { setEditingId(c.id); setFormName(c.name); setModalOpen(true); };

  const handleSave = async () => {
    if (!formName.trim()) { showToast('กรุณากรอกชื่อสาขา', 'error'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/counters', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId
          ? { id: editingId, name: formName.trim() }
          : { customer_id: customerId, name: formName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกสาขาไม่สำเร็จ');
      showToast(editingId ? 'แก้ไขสาขาสำเร็จ' : `เพิ่มสาขา "${formName.trim()}" สำเร็จ`);
      setModalOpen(false);
      await loadCounters();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกสาขาไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: Counter) => {
    if (togglingId) return;
    setTogglingId(c.id);
    try {
      const res = await apiFetch('/api/counters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เปลี่ยนสถานะไม่สำเร็จ');
      setCounters(prev => prev.map(x => (x.id === c.id ? { ...x, is_active: !c.is_active } : x)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            <h3 className="heading-4">สาขาฝากขาย (PC)</h3>
          </div>
          <p className="section-desc">
            จุดขายของลูกค้ารายนี้ — 1 สาขา = 1 คลังฝากขาย สต็อกและรายงานยอด (DSR) แยกตามสาขา ·
            มอบหมายพนักงาน PC ประจำสาขาที่{' '}
            <Link href="/settings/counters" className="text-primary hover:underline inline-flex items-center gap-0.5">
              ตั้งค่า → สาขาฝากขาย <ExternalLink className="w-3 h-3" />
            </Link>
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
            เพิ่มสาขา
          </Button>
        )}
      </div>

      {loaded && counters.length === 0 && (
        <p className="subtitle-text text-gray-500 dark:text-slate-400">
          ยังไม่มีสาขา — ถ้าขายอยู่จุดเดียวจะไม่สร้างสาขาก็ได้ ระบบใช้คลังฝากขายหลักของลูกค้าตามเดิม
        </p>
      )}

      <div className="space-y-2">
        {counters.map(c => (
          <ListRow
            key={c.id}
            inactive={!c.is_active}
            icon={
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                <Store className="w-4 h-4 text-primary" />
              </div>
            }
            title={c.name}
            subtitle={c.warehouse?.name || 'ไม่มีคลัง'}
            actions={canManage ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="แก้ไขชื่อสาขา"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <Toggle checked={c.is_active} onChange={() => handleToggle(c)} disabled={togglingId === c.id} />
              </div>
            ) : undefined}
          />
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'แก้ไขสาขา' : 'เพิ่มสาขา'}
        icon={<Store className="w-5 h-5 text-primary" />}
        size="sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <SaveButton loading={saving} onClick={handleSave} />
          </div>
        }
      >
        <div className="px-6 py-5">
          <FormInput
            label="ชื่อสาขา"
            required
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น ลาดพร้าว, ชิดลม, เซ็นทรัลเวิลด์"
            hint={editingId ? undefined : 'ระบบจะสร้างคลังฝากขายของสาขานี้ให้อัตโนมัติ'}
          />
        </div>
      </Modal>
    </Card>
  );
}
