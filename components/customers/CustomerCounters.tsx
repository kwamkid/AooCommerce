'use client';

// สาขาฝากขาย (PC) ของลูกค้ารายนี้ — จัดการครบจบที่หน้าลูกค้า:
// เพิ่ม/แก้/ปิดสาขา + มอบหมายพนักงาน PC ประจำสาขา + toggle หน่วยแทน
// (แทนหน้า /settings/counters เดิมที่ถูกยุบ) — ใช้ /api/counters + /api/counters/assignments ชุดเดิม
// 1 สาขา = 1 คลังฝากขาย ระบบสร้างคลังให้อัตโนมัติตอนเพิ่มสาขา

import { useState } from 'react';
import { Store, Plus, Edit2, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Modal from '@/components/ui/Modal';
import ListRow from '@/components/ui/ListRow';
import Toggle from '@/components/ui/Toggle';
import Checkbox from '@/components/ui/Checkbox';
import Badge from '@/components/ui/Badge';
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

interface Assignment {
  id: string;
  counter_id: string;
  user_id: string;
  user_name: string | null;
}

interface MemberOption {
  user_id: string;
  name: string;
  roles: string[];
  pc_all_counters: boolean;
}

export default function CustomerCounters({ customerId, customerType }: { customerId: string; customerType: string }) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const canManage = can(userProfile?.roles, 'counter.manage');

  const [counters, setCounters] = useState<Counter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Branch create/rename modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // PC assignment modal (per branch)
  const [pcTarget, setPcTarget] = useState<Counter | null>(null);
  const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set());

  const isCounterType = COUNTER_CUSTOMER_TYPES.includes(customerType);

  const loadAll = async () => {
    try {
      const requests: Promise<Response>[] = [apiFetch(`/api/counters?customer_id=${customerId}&active=false`)];
      // Assignments/members are admin-only endpoints — skip for viewers
      if (canManage) {
        requests.push(apiFetch('/api/counters/assignments'), apiFetch('/api/companies/members'));
      }
      const [countersRes, assignRes, membersRes] = await Promise.all(requests);
      if (countersRes.ok) {
        const data = await countersRes.json();
        setCounters((data.counters || []) as Counter[]);
      }
      if (assignRes?.ok) {
        const data = await assignRes.json();
        setAssignments((data.assignments || []) as Assignment[]);
      }
      if (membersRes?.ok) {
        const data = await membersRes.json();
        setMembers(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((data.members || []) as any[])
            .filter(m => m.is_active && m.user?.id)
            .map(m => ({
              user_id: m.user.id as string,
              name: (m.user?.name as string) || 'Unknown',
              roles: (m.roles as string[]) || [],
              pc_all_counters: m.pc_all_counters === true,
            }))
            // PC-role members first, then by name — same ordering as the old settings page
            .sort((a, b) => {
              const aPc = a.roles.includes('pc') ? 0 : 1;
              const bPc = b.roles.includes('pc') ? 0 : 1;
              return aPc - bPc || a.name.localeCompare(b.name, 'th');
            })
        );
      }
    } finally {
      setLoaded(true);
    }
  };

  useFetchOnce(loadAll, isCounterType && !!customerId && !!userProfile);

  if (!isCounterType) return null;

  const rovers = members.filter(m => m.pc_all_counters);
  const assignedNames = (counterId: string) => {
    const rows = assignments.filter(a => a.counter_id === counterId);
    const assignedIds = new Set(rows.map(a => a.user_id));
    const names = rows.map(a => a.user_name || 'ไม่ทราบชื่อ');
    // Rovers reach every branch — list them too, but don't double-list one who is also assigned here
    return [...names, ...rovers.filter(r => !assignedIds.has(r.user_id)).map(r => `${r.name} (หน่วยแทน)`)];
  };

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
      await loadAll();
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

  const setUserBusy = (userId: string, busy: boolean) =>
    setBusyUserIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(userId); else next.delete(userId);
      return next;
    });

  const handleToggleAssign = async (member: MemberOption, counter: Counter) => {
    if (busyUserIds.has(member.user_id)) return;
    const existing = assignments.find(a => a.counter_id === counter.id && a.user_id === member.user_id);
    setUserBusy(member.user_id, true);
    try {
      if (existing) {
        const res = await apiFetch(`/api/counters/assignments?id=${existing.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'ถอนการมอบหมายไม่สำเร็จ');
        }
        setAssignments(prev => prev.filter(a => a.id !== existing.id));
      } else {
        const res = await apiFetch('/api/counters/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counter_id: counter.id, user_id: member.user_id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'มอบหมายไม่สำเร็จ');
        setAssignments(prev => [...prev, {
          id: data.assignment_id as string,
          counter_id: counter.id,
          user_id: member.user_id,
          user_name: member.name,
        }]);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setUserBusy(member.user_id, false);
    }
  };

  const handleToggleRover = async (member: MemberOption, next: boolean) => {
    if (busyUserIds.has(member.user_id)) return;
    setUserBusy(member.user_id, true);
    try {
      const res = await apiFetch('/api/counters/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.user_id, pc_all_counters: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
      }
      setMembers(prev => prev.map(m => (m.user_id === member.user_id ? { ...m, pc_all_counters: next } : m)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setUserBusy(member.user_id, false);
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
            จุดขายของลูกค้ารายนี้ — 1 สาขา = 1 คลังฝากขาย สต็อกและรายงานยอด (DSR) แยกตามสาขา
            และมอบหมายพนักงาน PC เข้าประจำสาขาได้จากปุ่มรูปคนในแต่ละแถว
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
        {counters.map(c => {
          const pcList = canManage ? assignedNames(c.id) : [];
          return (
            <ListRow
              key={c.id}
              inactive={!c.is_active}
              icon={
                <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                  <Store className="w-4 h-4 text-primary" />
                </div>
              }
              title={c.name}
              subtitle={
                <>
                  {c.warehouse?.name || 'ไม่มีคลัง'}
                  {canManage && <> · PC: {pcList.length > 0 ? pcList.join(', ') : 'ยังไม่มี'}</>}
                </>
              }
              actions={canManage ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPcTarget(c)}
                    className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    title="พนักงาน PC ประจำสาขา"
                  >
                    <Users className="w-4 h-4" />
                  </button>
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
          );
        })}
      </div>

      {/* Branch create/rename modal */}
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

      {/* PC assignment modal — checkbox = ประจำสาขานี้, toggle ขวา = หน่วยแทน (ทุกสาขา) */}
      <Modal
        open={pcTarget !== null}
        onClose={() => setPcTarget(null)}
        title={`พนักงาน PC — สาขา${pcTarget?.name || ''}`}
        icon={<Users className="w-5 h-5 text-primary" />}
        size="md"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => setPcTarget(null)}>ปิด</Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-1">
          {members.length === 0 ? (
            <p className="subtitle-text text-gray-500 dark:text-slate-400">
              ยังไม่มีสมาชิกในร้าน — เชิญพนักงาน (ตำแหน่ง PC ประจำห้าง) ได้ที่ ตั้งค่า → จัดการสมาชิก
            </p>
          ) : (
            <>
              <p className="subtitle-text text-gray-500 dark:text-slate-400 mb-3">
                ติ๊ก = ประจำสาขานี้ (เป็นสาขาเริ่มต้นตอนเปิดหน้าขาย PC) · &quot;หน่วยแทน&quot; = เข้าได้ทุกสาขาของทุกลูกค้า —
                เป็นทั้งสองอย่างพร้อมกันได้ เช่น ประจำลาดพร้าวแต่วิ่งแทนสาขาอื่นด้วย
              </p>
              {members.map(m => {
                const isAssigned = !!pcTarget && assignments.some(a => a.counter_id === pcTarget.id && a.user_id === m.user_id);
                const busy = busyUserIds.has(m.user_id);
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={isAssigned}
                        disabled={busy}
                        onChange={() => pcTarget && handleToggleAssign(m, pcTarget)}
                      />
                      <span className="truncate text-gray-900 dark:text-white">{m.name}</span>
                      {m.roles.includes('pc') && <Badge tone="orange" size="sm">PC</Badge>}
                      {m.pc_all_counters && <Badge tone="indigo" size="sm">หน่วยแทน</Badge>}
                    </div>
                    <label className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-500 dark:text-slate-400">
                      หน่วยแทน
                      <Toggle checked={m.pc_all_counters} onChange={v => handleToggleRover(m, v)} disabled={busy} />
                    </label>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}
