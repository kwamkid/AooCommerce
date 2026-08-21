// Path: app/settings/carriers/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import Card from '@/components/ui/Card';
import ListRow from '@/components/ui/ListRow';
import FormInput from '@/components/ui/FormInput';
import Checkbox from '@/components/ui/Checkbox';
import Alert from '@/components/ui/Alert';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { CARRIER_PRESETS } from '@/lib/constants/carriers';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Truck, Plus, Pencil, Trash2, Lock, ArrowUp, ArrowDown, ExternalLink,
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

// Shippop signup — used in the integration card when no API key configured yet
const SHIPPOP_SIGNUP_URL = 'https://www.shippop.com';

/**
 * Generate a stable internal code from name. The DB column only allows
 * `a-z 0-9 _ - &` so Thai/CJK names fall back to a short random id.
 * User never sees this code — Shippop integration will Link/Merge by it later.
 */
function generateCarrierCode(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_&-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 32);
  if (slug.length >= 2) return slug;
  return `c_${Math.random().toString(36).slice(2, 8)}`;
}

/** Append _2, _3, ... if base code is already used in this company. */
function uniquifyCode(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base.slice(0, 30)}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `c_${Math.random().toString(36).slice(2, 8)}`;
}

const PRESET_BY_CODE = new Map(CARRIER_PRESETS.map(p => [p.code, p]));

/**
 * Carrier icon with brand-logo support + graceful fallback. Tries to render
 * the preset's logo (from public/carrier_logo/); if the file 404s, swaps to
 * the generic Truck icon so missing assets never break the UI.
 */
function CarrierIcon({ carrierCode, carrierName }: { carrierCode: string; carrierName: string }) {
  const preset = PRESET_BY_CODE.get(carrierCode);
  const [failed, setFailed] = useState(false);

  if (preset?.logo && !failed) {
    return (
      <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 dark:border-slate-700">
        <img
          src={preset.logo}
          alt={carrierName}
          onError={() => setFailed(true)}
          className="w-6 h-6 object-contain"
        />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
      <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
    </div>
  );
}

export default function CarriersSettingsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Carrier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tracks which row's Toggle is saving (one at a time)
  const [togglingCarrierId, setTogglingCarrierId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Form state — shippop_courier_code removed: Shippop mapping happens
  // in the Shippop integration card, not on manual carriers.
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formTrackingUrl, setFormTrackingUrl] = useState('');
  const [formActive, setFormActive] = useState(true);

  const isAdmin = can(userProfile?.roles, 'masterdata.carriers');

  const loadCarriers = async () => {
    try {
      const res = await apiFetch('/api/carriers');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const json = await res.json();
      // Respect DB sort_order — user can reorder via up/down arrows
      setCarriers((json.carriers || []) as Carrier[]);
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

  const openCreate = () => {
    setEditing(null);
    setFormCode('');
    setFormName('');
    setFormTrackingUrl('');
    setFormActive(true);
    setModalMode('create');
  };

  const openEdit = (c: Carrier) => {
    setEditing(c);
    setFormCode(c.code);
    setFormName(c.name);
    setFormTrackingUrl(c.tracking_url_template || '');
    setFormActive(c.is_active);
    setModalMode('edit');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const isCreate = modalMode === 'create';
      // On create: use preset's code if a preset was picked, else auto-generate
      // from name. User never types code directly — they shouldn't have to know
      // it exists. Collisions are handled by uniquifyCode (suffix _2, _3, ...).
      const codeForCreate = isCreate
        ? uniquifyCode(
            formCode.trim().toLowerCase() || generateCarrierCode(formName.trim()),
            new Set(carriers.map(c => c.code)),
          )
        : '';
      const payload = isCreate
        ? {
            code: codeForCreate,
            name: formName.trim(),
            tracking_url_template: formTrackingUrl.trim() || null,
            is_active: formActive,
          }
        : {
            id: editing!.id,
            name: formName.trim(),
            tracking_url_template: formTrackingUrl.trim() || null,
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
      const msg = err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ';
      // Translate API code-collision error into a name-based message so internal
      // `code` detail never leaks into user-facing copy
      const userMsg = /รหัส.*มีอยู่แล้ว/.test(msg)
        ? 'ขนส่งชื่อนี้มีอยู่แล้ว — ลองใช้ชื่ออื่น'
        : msg;
      showToast(userMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (c: Carrier) => {
    setTogglingCarrierId(c.id);
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
    } finally {
      setTogglingCarrierId(null);
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

  // Reorder — swap rows in local state, persist new sort_order to DB
  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const idx = carriers.findIndex(c => c.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= carriers.length) return;

    const newList = [...carriers];
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    const reordered = newList.map((c, i) => ({ ...c, sort_order: i }));
    setCarriers(reordered);

    setReordering(true);
    try {
      const res = await apiFetch('/api/carriers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: reordered.map((c, i) => ({ id: c.id, sort_order: i })) }),
      });
      if (!res.ok) throw new Error('บันทึกลำดับไม่สำเร็จ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกลำดับไม่สำเร็จ', 'error');
      loadCarriers(); // revert
    } finally {
      setReordering(false);
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

  const showReorder = carriers.length > 1;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<Truck />}
          title="ขนส่ง"
          subtitle="จัดการรายชื่อบริษัทขนส่งและลิงก์ติดตามพัสดุ"
          actions={
            <Button variant="primary" icon={<Plus className="w-5 h-5" />} onClick={openCreate}>
              เพิ่ม
            </Button>
          }
        />

        <div className="space-y-2">
          {/* Tip — only relevant when there are multiple rows to sort */}
          {showReorder && (
            <div className="helper-text text-gray-400 flex items-center gap-1.5 mb-1">
              <ArrowUp className="w-3.5 h-3.5" />
              <ArrowDown className="w-3.5 h-3.5" />
              <span>ใช้ปุ่มลูกศรเพื่อจัดลำดับการแสดงผลในฟอร์มออเดอร์</span>
            </div>
          )}

          {/* Manual carriers */}
          {carriers.map((c, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === carriers.length - 1;
            return (
              <ListRow
                key={c.id}
                reorder={showReorder ? {
                  onMoveUp: () => handleMove(c.id, 'up'),
                  onMoveDown: () => handleMove(c.id, 'down'),
                  disableUp: isFirst,
                  disableDown: isLast,
                  disabled: reordering,
                } : undefined}
                icon={<CarrierIcon carrierCode={c.code} carrierName={c.name} />}
                title={
                  <span className="flex items-center gap-2">
                    {c.name}
                    {c.is_system && (
                      <span title="ขนส่งของระบบ" className="inline-flex items-center text-gray-400">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </span>
                }
                subtitle={c.tracking_url_template
                  ? <span className="truncate inline-block max-w-md align-bottom">{c.tracking_url_template}</span>
                  : undefined}
                inactive={!c.is_active}
                actions={
                  <>
                    <Toggle
                      checked={c.is_active}
                      onChange={() => handleToggleActive(c)}
                      loading={togglingCarrierId === c.id}
                      aria-label={c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    />
                    <button
                      onClick={() => openEdit(c)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      aria-label="แก้ไข"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!c.is_system && (
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        aria-label="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                }
              />
            );
          })}

          {/* Shippop integration — placeholder. Once API ships, expand pattern
              will mirror Beam in /settings/payment-channels (API key + courier toggle list). */}
          <Card padding="none">
            <div className="flex items-center gap-3 px-3 py-2.5">
              {showReorder && (
                <div className="w-5 flex-shrink-0" aria-hidden="true" />
              )}
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Truck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white">เชื่อมต่อ Shippop</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  จองพัสดุและซื้อ Label ผ่าน Shippop ในระบบเดียว
                </p>
              </div>
              <span className="badge badge-sm badge-pill badge-gray flex-shrink-0">เร็วๆ นี้</span>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
              <Alert tone="info" title="ยังไม่มีบัญชี Shippop?">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>สมัครก่อนเพื่อรับ API Key</span>
                  <a
                    href={SHIPPOP_SIGNUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium hover:underline"
                  >
                    สมัคร Shippop
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </Alert>
            </div>
          </Card>
        </div>

        {/* Modal */}
        <Modal
          open={modalMode !== null}
          onClose={() => !submitting && setModalMode(null)}
          title={modalMode === 'edit' ? 'แก้ไขขนส่ง' : 'เพิ่มขนส่ง'}
          icon={<Truck className="w-5 h-5 text-primary" />}
          size="md"
          disableBackdropClose={submitting}
          footer={
            <div className="flex justify-end gap-3 px-6 py-4">
              <Button variant="secondary" onClick={() => setModalMode(null)} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting || !formName.trim()}
              >
                บันทึก
              </Button>
            </div>
          }
        >
          <div className="px-6 py-5 space-y-4">
            {/* Preset picker — create mode only, hides codes already added */}
            {modalMode === 'create' && (() => {
              const existingCodes = new Set(carriers.map(c => c.code));
              const available = CARRIER_PRESETS.filter(p => !existingCodes.has(p.code));
              if (available.length === 0) return null;
              return (
                <div>
                  <div className="mb-2 text-sm text-gray-500 dark:text-slate-400">
                    เลือกจาก preset (กดเพื่อกรอกฟอร์มอัตโนมัติ) หรือกรอกเองด้านล่าง
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {available.map(p => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => {
                          setFormName(p.name);
                          setFormCode(p.code);
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
                  <div className="mt-4 border-t border-gray-200 dark:border-slate-700" />
                </div>
              );
            })()}

            <FormInput
              label="ชื่อขนส่ง"
              required
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="เช่น Flash Express"
            />

            {/* Internal `code` is intentionally not shown — auto-generated on
                create (from preset's code if picked, else slugified name).
                Shippop integration will link by code via the integration card. */}

            <FormInput
              id="carrier-tracking-url"
              label="URL ติดตามพัสดุ"
              value={formTrackingUrl}
              onChange={e => setFormTrackingUrl(e.target.value)}
              placeholder="https://example.com/track?no={tracking}"
              hint={
                <>
                  กด{' '}
                  <button
                    type="button"
                    // Prevent the input from losing focus on mousedown so we can
                    // read selectionStart/End accurately + restore cursor after
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const el = document.getElementById('carrier-tracking-url') as HTMLInputElement | null;
                      const token = '{tracking}';
                      if (el) {
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const next = el.value.slice(0, start) + token + el.value.slice(end);
                        setFormTrackingUrl(next);
                        // Restore caret right after the inserted token
                        requestAnimationFrame(() => {
                          el.focus();
                          const pos = start + token.length;
                          el.setSelectionRange(pos, pos);
                        });
                      } else {
                        setFormTrackingUrl(prev => prev + token);
                      }
                    }}
                    className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 hover:bg-primary/10 hover:text-primary rounded font-mono cursor-pointer transition-colors"
                  >
                    {'{tracking}'}
                  </button>
                  {' '}เพื่อเติมตรงตำแหน่งของเลขพัสดุ
                </>
              }
            />

            <Checkbox
              checked={formActive}
              onChange={setFormActive}
              label="เปิดใช้งาน"
            />
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
