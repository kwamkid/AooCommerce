// Path: app/settings/carriers/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Modal from '@/components/ui/Modal';
import SearchInput from '@/components/ui/SearchInput';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import Tabs from '@/components/ui/Tabs';
import Card from '@/components/ui/Card';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { CARRIER_PRESETS } from '@/lib/constants/carriers';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Lock,
} from 'lucide-react';

interface Carrier {
  id: string;
  code: string;
  name: string;
  tracking_url_template: string | null;
  shippop_courier_code: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
}

type ModalMode = 'create' | 'edit' | null;


export default function CarriersSettingsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mine' | 'api'>('mine');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Carrier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formTrackingUrl, setFormTrackingUrl] = useState('');
  const [formShippopCode, setFormShippopCode] = useState('');
  const [formActive, setFormActive] = useState(true);

  const isAdmin = can(userProfile?.roles, 'masterdata.carriers');

  const loadCarriers = async () => {
    try {
      const res = await apiFetch('/api/carriers');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const json = await res.json();
      // Pin "self" (จัดส่งเอง) to the top — it's the default fallback every
      // store uses, so it should be the first option in the list.
      const all = (json.carriers || []) as Carrier[];
      const sorted = [
        ...all.filter(c => c.code === 'self'),
        ...all.filter(c => c.code !== 'self'),
      ];
      setCarriers(sorted);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) loadCarriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return carriers;
    return carriers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.shippop_courier_code || '').toLowerCase().includes(q)
    );
  }, [carriers, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + rowsPerPage);

  const openCreate = () => {
    setEditing(null);
    setFormCode('');
    setFormName('');
    setFormTrackingUrl('');
    setFormShippopCode('');
    setFormActive(true);
    setModalMode('create');
  };

  const openEdit = (c: Carrier) => {
    setEditing(c);
    setFormCode(c.code);
    setFormName(c.name);
    setFormTrackingUrl(c.tracking_url_template || '');
    setFormShippopCode(c.shippop_courier_code || '');
    setFormActive(c.is_active);
    setModalMode('edit');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const isCreate = modalMode === 'create';
      const payload = isCreate
        ? {
            code: formCode.trim().toLowerCase(),
            name: formName.trim(),
            tracking_url_template: formTrackingUrl.trim() || null,
            shippop_courier_code: formShippopCode.trim().toUpperCase() || null,
            is_active: formActive,
          }
        : {
            id: editing!.id,
            name: formName.trim(),
            tracking_url_template: formTrackingUrl.trim() || null,
            shippop_courier_code: formShippopCode.trim().toUpperCase() || null,
            is_active: formActive,
          };
      const res = await apiFetch('/api/carriers', {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      showToast(isCreate ? 'เพิ่มขนส่งสำเร็จ' : 'บันทึกการแก้ไขแล้ว');
      setModalMode(null);
      await loadCarriers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (c: Carrier) => {
    try {
      const res = await apiFetch('/api/carriers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      setCarriers(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !c.is_active } : x));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/carriers?id=${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ลบไม่สำเร็จ');
      if (json.soft_deleted) {
        showToast(json.message || 'ปิดใช้งานแทนการลบ');
      } else {
        showToast('ลบขนส่งแล้ว');
      }
      setDeleteTarget(null);
      await loadCarriers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <LoadingCard />
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  const columns: DataTableColumn<Carrier>[] = [
    {
      key: 'name',
      label: 'ขนส่ง',
      alwaysVisible: true,
      headerClassName: 'min-w-[200px]',
      render: (c) => (
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[16px] text-gray-900 dark:text-white">{c.name}</span>
              {c.is_system && (
                <span title="ขนส่งของระบบ" className="inline-flex items-center text-gray-400">
                  <Lock className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400 dark:text-slate-500">{c.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'tracking',
      label: 'URL ติดตาม',
      headerClassName: 'min-w-[260px]',
      render: (c) =>
        c.tracking_url_template ? (
          <span className="data-text text-gray-500 dark:text-slate-400 line-clamp-1 break-all">
            {c.tracking_url_template}
          </span>
        ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>,
    },
    {
      key: 'shippop',
      label: 'Shippop',
      headerClassName: 'w-[120px]',
      render: (c) =>
        c.shippop_courier_code ? (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            {c.shippop_courier_code}
          </span>
        ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>,
    },
    {
      key: 'status',
      label: 'สถานะ',
      headerClassName: 'w-[80px]',
      stopPropagation: true,
      render: (c) => (
        <Toggle checked={c.is_active} onChange={() => handleToggleActive(c)} aria-label={c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-[44px]',
      stopPropagation: true,
      hideMobile: true,
      render: (c) => {
        const items: ActionItem[] = [
          { key: 'edit', label: 'แก้ไข', icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(c) },
          {
            key: 'toggle',
            label: c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
            icon: c.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />,
            onClick: () => handleToggleActive(c),
          },
        ];
        if (!c.is_system) {
          items.push({
            key: 'delete',
            label: 'ลบ',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => setDeleteTarget(c),
            danger: true,
            dividerBefore: true,
          });
        }
        return <ActionMenu items={items} />;
      },
    },
  ];

  return (
    <Layout>
      <Container size="full">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="heading-1 flex items-center">
              <Truck className="w-8 h-8 mr-3 text-primary" />
              ขนส่ง
            </h1>
            <p className="page-subtitle">จัดการรายชื่อบริษัทขนส่งและลิงก์ติดตามพัสดุ</p>
          </div>
          {activeTab === 'mine' && (
            <Button variant="primary" icon={<Plus className="w-5 h-5" />} onClick={openCreate}>
              เพิ่ม
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k as 'mine' | 'api')}
          tabs={[
            { key: 'mine', label: 'ขนส่งของฉัน' },
            { key: 'api', label: 'เชื่อมต่อ API' },
          ]}
        />

        {activeTab === 'api' && (
          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h2 className="heading-3 mb-1">เชื่อมต่อ Shippop</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                  ใช้ API ของ Shippop จัดส่งและจองพัสดุได้อัตโนมัติ — เร็วๆ นี้
                </p>
                <span className="badge badge-sm badge-pill badge-gray">เร็วๆ นี้</span>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'mine' && (<>
        {/* Search */}
        <div className="data-filter-card">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ / รหัส / Shippop courier" className="py-2" />
        </div>

        {/* Table */}
        <DataTable<Carrier>
          storageKey="carriers-list"
          columns={columns}
          data={paginated}
          loading={false}
          getRowId={(c) => c.id}
          onRowClick={(c) => openEdit(c)}
          emptyMessage="ยังไม่มีขนส่ง"
          emptyIcon={<Truck className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filtered.length}
          recordsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRowsPerPage}
          mobileCardRender={(c) => (
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{c.name}</p>
                  {c.is_system && <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                </div>
                <p className="text-sm text-gray-400 dark:text-slate-500 truncate">{c.code}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {c.shippop_courier_code && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {c.shippop_courier_code}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {c.is_active ? 'เปิด' : 'ปิด'}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                className="p-2 text-gray-400 hover:text-primary"
                aria-label="แก้ไข"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        />
        </>)}

        {/* Modal */}
        <Modal
          open={modalMode !== null}
          onClose={() => !submitting && setModalMode(null)}
          title={modalMode === 'edit' ? 'แก้ไขขนส่ง' : 'เพิ่มขนส่ง'}
          icon={<Truck className="w-5 h-5 text-primary" />}
          size="md"
          disableBackdropClose={submitting}
          footer={
            <div className="flex gap-3 p-5">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setModalMode(null)}
                disabled={submitting}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting || !formName.trim() || (modalMode === 'create' && !formCode.trim())}
              >
                บันทึก
              </Button>
            </div>
          }
        >
          <div className="p-5 space-y-4">
            {/* Preset picker — create mode only, hides codes already added */}
            {modalMode === 'create' && (() => {
              const existingCodes = new Set(carriers.map(c => c.code));
              const available = CARRIER_PRESETS.filter(p => !existingCodes.has(p.code));
              if (available.length === 0) return null;
              return (
                <div className="-mx-1">
                  <div className="px-1 mb-2 text-sm text-gray-500 dark:text-slate-400">
                    เลือกจาก preset (กดเพื่อกรอกฟอร์มอัตโนมัติ) หรือกรอกเองด้านล่าง
                  </div>
                  <div className="px-1 flex flex-wrap gap-1.5">
                    {available.map(p => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => {
                          setFormName(p.name);
                          setFormCode(p.code);
                          setFormShippopCode(p.shippop || '');
                          setFormTrackingUrl(p.tracking_url || '');
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${
                          formCode === p.code
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:border-primary hover:text-primary'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="mx-1 mt-4 border-t border-gray-200 dark:border-slate-700" />
                </div>
              );
            })()}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                ชื่อขนส่ง <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="เช่น Flash Express"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                รหัส (code) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formCode}
                onChange={e => setFormCode(e.target.value.toLowerCase())}
                disabled={modalMode === 'edit'}
                placeholder="เช่น flash, my_courier"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
              />
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {modalMode === 'edit'
                  ? 'รหัสไม่สามารถแก้ไขได้ เพื่อรักษาประวัติออเดอร์เดิม'
                  : 'a-z, 0-9, -, _, & ความยาว 2-32 ตัว'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                URL ติดตามพัสดุ
              </label>
              <input
                type="text"
                value={formTrackingUrl}
                onChange={e => setFormTrackingUrl(e.target.value)}
                placeholder="https://example.com/track?no={tracking}"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">ใส่ <code className="px-1 bg-gray-100 dark:bg-slate-700 rounded">{'{tracking}'}</code> ตรงตำแหน่งของเลขพัสดุ</p>
            </div>

            {/* Shippop courier code is no longer surfaced — preset auto-fills it,
                manual entries leave it empty (= not booked via Shippop). To map a
                manual carrier to Shippop later, go to the "เชื่อมต่อ API" tab. */}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formActive}
                onChange={e => setFormActive(e.target.checked)}
                className="w-4 h-4 accent-[#F4511E]"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">เปิดใช้งาน</span>
            </label>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="ลบขนส่ง"
          description={`ยืนยันการลบ "${deleteTarget?.name || ''}" — ถ้ามีออเดอร์เคยใช้ขนส่งนี้ ระบบจะปิดใช้งานแทน`}
          confirmLabel="ลบ"
          variant="danger"
          loading={deleting}
          icon={<Trash2 className="w-6 h-6 text-red-600" />}
        />
      </Container>
    </Layout>
  );
}
