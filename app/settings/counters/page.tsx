// Path: app/settings/counters/page.tsx
// Manage branch counters (สาขา/จุดขาย PC) for consignment customers + assign PC users.
'use client';

import { useState, useCallback, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import Toggle from '@/components/ui/Toggle';
import ListRow from '@/components/ui/ListRow';
import Badge from '@/components/ui/Badge';
import { LoadingCard, EmptyCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Store, Plus, Users, Pencil, X } from 'lucide-react';

interface Counter {
  id: string;
  customer_id: string;
  warehouse_id: string;
  name: string;
  is_active: boolean;
  customer?: { id: string; name: string; customer_type: string } | null;
  warehouse?: { id: string; name: string } | null;
}

interface Assignment {
  id: string;
  counter_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
}

interface MemberOption {
  user_id: string;
  name: string;
  roles: string[];
  pc_all_counters: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
}

export default function CountersSettingsPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('counter.manage', { noRedirect: true });
  const { showToast } = useToast();

  const [counters, setCounters] = useState<Counter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<Counter | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<Counter | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [countersRes, assignRes, membersRes, deptRes, dealerRes] = await Promise.all([
        apiFetch('/api/counters?active=false'),
        apiFetch('/api/counters/assignments'),
        apiFetch('/api/companies/members'),
        apiFetch('/api/customers?active=true&type=department_store'),
        apiFetch('/api/customers?active=true&type=consignment_dealer'),
      ]);
      const countersData = await countersRes.json();
      const assignData = await assignRes.json();
      const membersData = await membersRes.json();
      const deptData = await deptRes.json();
      const dealerData = await dealerRes.json();

      setCounters(countersData.counters || []);
      setAssignments(assignData.assignments || []);
      setMembers(
        (membersData.members || [])
          .filter((m: any) => m.is_active)
          .map((m: any) => ({
            user_id: m.user?.id,
            name: m.user?.name || 'Unknown',
            roles: m.roles || [],
            pc_all_counters: m.pc_all_counters === true,
          }))
          .filter((m: MemberOption) => !!m.user_id)
      );
      const deptList = deptData.data || deptData.customers || [];
      const dealerList = dealerData.data || dealerData.customers || [];
      setCustomers([...deptList, ...dealerList].map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(fetchAll, allowed);

  const assignmentsByCounter = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      map.set(a.counter_id, [...(map.get(a.counter_id) || []), a]);
    }
    return map;
  }, [assignments]);

  // PC-role members first in the assign dropdown; others still assignable
  const memberOptions = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      const aPc = a.roles.includes('pc') ? 0 : 1;
      const bPc = b.roles.includes('pc') ? 0 : 1;
      return aPc - bPc || a.name.localeCompare(b.name, 'th');
    });
    return sorted.map(m => ({
      id: m.user_id,
      label: m.roles.includes('pc') ? `${m.name} (PC)` : m.name,
    }));
  }, [members]);

  const groupedCounters = useMemo(() => {
    const groups = new Map<string, { customerName: string; rows: Counter[] }>();
    for (const c of counters) {
      const key = c.customer_id;
      const g = groups.get(key) || { customerName: c.customer?.name || 'ไม่ทราบลูกค้า', rows: [] };
      g.rows.push(c);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.customerName.localeCompare(b.customerName, 'th'));
  }, [counters]);

  const handleCreate = async () => {
    if (!createCustomerId || !createName.trim()) {
      showToast('กรุณาเลือกลูกค้าและกรอกชื่อสาขา', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/api/counters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: createCustomerId, name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างไม่สำเร็จ');
      showToast('สร้างสาขาสำเร็จ', 'success');
      setShowCreate(false);
      setCreateCustomerId('');
      setCreateName('');
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const res = await apiFetch('/api/counters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameTarget.id, name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
      showToast('แก้ไขชื่อสาขาแล้ว', 'success');
      setRenameTarget(null);
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setRenaming(false);
    }
  };

  const handleToggleActive = async (counter: Counter, next: boolean) => {
    try {
      const res = await apiFetch('/api/counters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: counter.id, is_active: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
      }
      setCounters(prev => prev.map(c => c.id === counter.id ? { ...c, is_active: next } : c));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignUserId) return;
    setAssigning(true);
    try {
      const res = await apiFetch('/api/counters/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter_id: assignTarget.id, user_id: assignUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'มอบหมายไม่สำเร็จ');
      showToast('มอบหมาย PC แล้ว', 'success');
      setAssignUserId('');
      const assignRes = await apiFetch('/api/counters/assignments');
      const assignData = await assignRes.json();
      setAssignments(assignData.assignments || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleToggleRover = async (member: MemberOption, next: boolean) => {
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
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, pc_all_counters: next } : m));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleUnassign = async (assignment: Assignment) => {
    try {
      const res = await apiFetch(`/api/counters/assignments?id=${assignment.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ลบไม่สำเร็จ');
      }
      setAssignments(prev => prev.filter(a => a.id !== assignment.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  if (guardLoading) return <Layout><Container size="2xl"><LoadingCard /></Container></Layout>;
  if (!allowed) return <Layout><Container size="2xl"><NoPermissionCard /></Container></Layout>;

  return (
    <Layout>
      <Container size="2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-1 flex items-center gap-2">
              <Store className="w-7 h-7 text-primary" />
              สาขาฝากขาย (PC)
            </h1>
            <p className="page-subtitle">จุดขายตามห้าง/ตัวแทน — 1 สาขามีสต็อกของตัวเอง และมอบหมาย PC เข้าประจำสาขาได้</p>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            เพิ่มสาขา
          </Button>
        </div>

        {loading ? (
          <LoadingCard />
        ) : counters.length === 0 ? (
          <EmptyCard
            icon={<Store className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title="ยังไม่มีสาขา"
            subtitle="เพิ่มสาขาให้ลูกค้าห้าง/ตัวแทนฝากขาย เพื่อแยกสต็อกและให้ PC บันทึกยอดขายรายวัน"
            actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>เพิ่มสาขา</Button>}
          />
        ) : (
          <div className="space-y-6">
            {groupedCounters.map(group => (
              <div key={group.customerName}>
                <h3 className="heading-4 text-gray-700 dark:text-gray-300 mb-2">{group.customerName}</h3>
                <div className="space-y-2">
                  {group.rows.map(counter => {
                    const pcs = assignmentsByCounter.get(counter.id) || [];
                    return (
                      <ListRow
                        key={counter.id}
                        icon={
                          <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                            <Store className="w-4 h-4 text-primary" />
                          </div>
                        }
                        title={counter.name}
                        subtitle={
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span>คลัง: {counter.warehouse?.name || '-'}</span>
                            {pcs.length > 0 ? (
                              <span>· PC: {pcs.map(p => p.user_name || '?').join(', ')}</span>
                            ) : (
                              <Badge tone="amber" size="sm">ยังไม่มี PC</Badge>
                            )}
                          </span>
                        }
                        inactive={!counter.is_active}
                        actions={
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setAssignTarget(counter); setAssignUserId(''); }}
                              className="p-2 text-gray-500 hover:text-primary transition-colors"
                              title="มอบหมาย PC"
                            >
                              <Users className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setRenameTarget(counter); setRenameValue(counter.name); }}
                              className="p-2 text-gray-500 hover:text-primary transition-colors"
                              title="แก้ไขชื่อ"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <Toggle checked={counter.is_active} onChange={(v) => handleToggleActive(counter, v)} />
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rover PCs — หน่วยแทน */}
        {!loading && members.some(m => m.roles.includes('pc')) && (
          <div>
            <h3 className="heading-4 text-gray-700 dark:text-gray-300 mb-1">PC หน่วยแทน</h3>
            <p className="section-desc mb-2">
              เปิดสวิตช์ = เข้าได้<b>ทุกสาขา</b>อัตโนมัติ (รวมสาขาที่เปิดใหม่ในอนาคต) โดยไม่ต้องมอบหมายรายสาขา
            </p>
            <div className="space-y-2">
              {members.filter(m => m.roles.includes('pc')).map(m => (
                <ListRow
                  key={m.user_id}
                  icon={
                    <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-teal-600" />
                    </div>
                  }
                  title={m.name}
                  subtitle={m.pc_all_counters
                    ? <Badge tone="emerald" size="sm">หน่วยแทน — เข้าได้ทุกสาขา</Badge>
                    : `ประจำสาขาที่ถูกมอบหมาย (${assignments.filter(a => a.user_id === m.user_id).length} สาขา)`}
                  actions={<Toggle checked={m.pc_all_counters} onChange={(v) => handleToggleRover(m, v)} aria-label="หน่วยแทน" />}
                />
              ))}
            </div>
          </div>
        )}

        {/* Create modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} size="sm" title="เพิ่มสาขา">
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="field-label">ลูกค้า (ห้าง/ตัวแทนฝากขาย)</label>
              <FormSelect
                value={createCustomerId}
                onChange={setCreateCustomerId}
                options={customers.map(c => ({ id: c.id, label: c.name }))}
                placeholder="-- เลือกลูกค้า --"
              />
            </div>
            <FormInput
              label="ชื่อสาขา"
              required
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="เช่น สาขาลาดพร้าว, จุดขายชั้น 3"
            />
            <p className="helper-text text-gray-500">
              สาขาแรกของลูกค้าจะใช้คลังฝากขายเดิม (สต็อกที่ส่งไปแล้วยังอยู่ครบ) — สาขาถัดไประบบจะสร้างคลังใหม่ให้
            </p>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button variant="primary" loading={creating} onClick={handleCreate}>บันทึก</Button>
          </div>
        </Modal>

        {/* Rename modal */}
        <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} size="sm" title="แก้ไขชื่อสาขา">
          <div className="px-6 py-5">
            <FormInput
              label="ชื่อสาขา"
              required
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>ยกเลิก</Button>
            <Button variant="primary" loading={renaming} onClick={handleRename}>บันทึก</Button>
          </div>
        </Modal>

        {/* Assign PC modal */}
        <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} size="sm" title={`มอบหมาย PC — ${assignTarget?.name || ''}`}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="field-label">PC ที่ประจำสาขานี้</label>
              {(assignmentsByCounter.get(assignTarget?.id || '') || []).length === 0 ? (
                <p className="subtitle-text text-gray-500">ยังไม่มี PC ประจำสาขานี้</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(assignmentsByCounter.get(assignTarget?.id || '') || []).map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-sm text-gray-800 dark:text-gray-200">
                      {a.user_name || a.user_email || '?'}
                      <button onClick={() => handleUnassign(a)} className="text-gray-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="field-label">เพิ่ม PC</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <FormSelect
                    value={assignUserId}
                    onChange={setAssignUserId}
                    options={memberOptions}
                    placeholder="-- เลือกสมาชิก --"
                  />
                </div>
                <Button variant="primary" loading={assigning} onClick={handleAssign} disabled={!assignUserId}>
                  เพิ่ม
                </Button>
              </div>
              <p className="helper-text text-gray-500 mt-1.5">
                เชิญ PC เข้าระบบด้วย role &quot;PC ประจำห้าง&quot; ได้ที่ ตั้งค่า → สมาชิก
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>ปิด</Button>
          </div>
        </Modal>
      </Container>
    </Layout>
  );
}
