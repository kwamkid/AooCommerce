// Path: app/settings/pos-terminals/page.tsx
'use client';

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Monitor, AlertTriangle, Warehouse,
  CreditCard, Banknote, Building2, MoreHorizontal, ArrowUp, ArrowDown, Info,
} from 'lucide-react';

interface TerminalItem {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string | null;
  is_active: boolean;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string | null;
}

interface PaymentChannelItem {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  sort_order: number;
  config: Record<string, unknown>;
}

const CHANNEL_TYPE_OPTIONS = [
  { value: 'bank_transfer', label: 'โอนเงิน', icon: Building2 },
  { value: 'card_terminal', label: 'บัตรเครดิต/เดบิต', icon: CreditCard },
  { value: 'other', label: 'อื่นๆ', icon: MoreHorizontal },
];

function getChannelIcon(type: string) {
  if (type === 'cash') return Banknote;
  if (type === 'card_terminal') return CreditCard;
  if (type === 'bank_transfer') return Building2;
  return MoreHorizontal;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function PosTerminalsPage() {
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'terminals' | 'channels'>('terminals');
  const [loading, setLoading] = useState(true);
  const [terminals, setTerminals] = useState<TerminalItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  // Terminal form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Payment channels state
  const [channels, setChannels] = useState<PaymentChannelItem[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelType, setChannelType] = useState('bank_transfer');
  const [channelName, setChannelName] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelPromptPayId, setChannelPromptPayId] = useState('');
  const [savingChannel, setSavingChannel] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  useFetchOnce(() => {
    fetchTerminals();
    fetchWarehouses();
    fetchChannels();
  }, userProfile?.role === 'admin' || userProfile?.role === 'owner');

  // ── Terminal CRUD ──

  const fetchTerminals = async () => {
    try {
      const response = await apiFetch('/api/pos/terminals');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setTerminals(data.terminals || []);
    } catch (error) {
      console.error('Error fetching terminals:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses');
      if (!response.ok) return;
      const data = await response.json();
      setWarehouses((data.warehouses || []).filter((w: any) => w.is_active));
    } catch {
      // Silent — warehouses are optional
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormCode('');
    setFormWarehouseId('');
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (t: TerminalItem) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormCode(t.code || '');
    setFormWarehouseId(t.warehouse_id || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('กรุณากรอกชื่อจุดขาย', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = editingId
        ? { id: editingId, name: formName, code: formCode, warehouse_id: formWarehouseId || null }
        : { name: formName, code: formCode, warehouse_id: formWarehouseId || null };

      const response = await apiFetch('/api/pos/terminals', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast(editingId ? 'อัปเดตจุดขายสำเร็จ' : 'สร้างจุดขายสำเร็จ');
      resetForm();
      await fetchTerminals();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: TerminalItem) => {
    try {
      const response = await apiFetch('/api/pos/terminals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle');
      }
      setTerminals(prev => prev.map(item =>
        item.id === t.id ? { ...item, is_active: !item.is_active } : item
      ));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/pos/terminals?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      showToast('ลบจุดขายสำเร็จ');
      await fetchTerminals();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Terminal Reorder ──

  const handleMoveTerminal = async (terminalId: string, direction: 'up' | 'down') => {
    const idx = terminals.findIndex(t => t.id === terminalId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= terminals.length) return;

    const newList = [...terminals];
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    const orders = newList.map((t, i) => ({ id: t.id, sort_order: i }));
    setTerminals(newList);

    setReordering(true);
    try {
      await apiFetch('/api/pos/terminals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
    } catch {
      showToast('บันทึกลำดับไม่สำเร็จ', 'error');
      fetchTerminals();
    } finally {
      setReordering(false);
    }
  };

  // ── Payment Channel CRUD ──

  const fetchChannels = async () => {
    try {
      const response = await apiFetch('/api/settings/payment-channels?group=pos');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setChannels(data.data || []);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const resetChannelForm = () => {
    setChannelType('bank_transfer');
    setChannelName('');
    setChannelPromptPayId('');
    setShowChannelForm(false);
    setEditingChannelId(null);
  };

  const startEditChannel = (ch: PaymentChannelItem) => {
    setEditingChannelId(ch.id);
    setChannelName(ch.name);
    setChannelType(ch.type);
    setChannelPromptPayId((ch.config?.promptpay_id as string) || '');
    setShowChannelForm(true);
  };

  const handleSaveChannel = async () => {
    if (!channelName.trim()) {
      showToast('กรุณากรอกชื่อช่องทาง', 'error');
      return;
    }

    // Validate PromptPay ID format
    if (channelType === 'bank_transfer' && channelPromptPayId.trim()) {
      const id = channelPromptPayId.trim().replace(/\D/g, '');
      if (id.length !== 10 && id.length !== 13) {
        showToast('PromptPay ID ต้องเป็นเบอร์โทร (10 หลัก) หรือ เลขบัตรประชาชน/Tax ID (13 หลัก)', 'error');
        return;
      }
    }

    setSavingChannel(true);
    try {
      const config: Record<string, unknown> = {};
      if (channelType === 'bank_transfer' && channelPromptPayId.trim()) {
        const cleaned = channelPromptPayId.trim().replace(/\D/g, '');
        config.promptpay_id = cleaned;
      }

      if (editingChannelId) {
        const response = await apiFetch('/api/settings/payment-channels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingChannelId, name: channelName, config }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update');
        }
        showToast('อัปเดตช่องทางสำเร็จ');
      } else {
        const response = await apiFetch('/api/settings/payment-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: channelType,
            name: channelName,
            channel_group: 'pos',
            config,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create');
        }
        showToast('เพิ่มช่องทางสำเร็จ');
      }
      resetChannelForm();
      await fetchChannels();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSavingChannel(false);
    }
  };

  const handleToggleChannel = async (ch: PaymentChannelItem) => {
    try {
      const response = await apiFetch('/api/settings/payment-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ch.id, is_active: !ch.is_active }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle');
      }
      setChannels(prev => prev.map(item =>
        item.id === ch.id ? { ...item, is_active: !item.is_active } : item
      ));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ';
      showToast(msg, 'error');
    }
  };

  const handleDeleteChannel = async (id: string) => {
    setDeletingChannelId(id);
    try {
      const response = await apiFetch(`/api/settings/payment-channels?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      showToast('ลบช่องทางสำเร็จ');
      await fetchChannels();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingChannelId(null);
    }
  };

  // ── Channel Reorder ──

  const handleMoveChannel = async (channelId: string, direction: 'up' | 'down') => {
    const idx = channels.findIndex(c => c.id === channelId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= channels.length) return;

    const newList = [...channels];
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    const orders = newList.map((c, i) => ({ id: c.id, sort_order: i }));
    const reordered = newList.map((c, i) => ({ ...c, sort_order: i }));
    setChannels(reordered);

    setReordering(true);
    try {
      await apiFetch('/api/settings/payment-channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
    } catch {
      showToast('บันทึกลำดับไม่สำเร็จ', 'error');
      fetchChannels();
    } finally {
      setReordering(false);
    }
  };

  // Admin guard
  if (userProfile && userProfile.role !== 'admin' && userProfile.role !== 'owner') {
    return (
      <Layout title="เครื่อง POS">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  return (
    <Layout
      title="เครื่อง POS"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'เครื่อง POS' },
      ]}
    >
      <div>
        {/* POS not enabled */}
        {!features.pos && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">ฟีเจอร์ POS ยังไม่เปิดใช้งาน</p>
              <p className="text-base text-amber-600 dark:text-amber-400 mt-1">กรุณาเปิดใช้งาน POS ในหน้าข้อมูลบริษัท &gt; ปรับแต่ง Features</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : features.pos ? (
          <div>
            {/* ══════ Tab Bar ══════ */}
            <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
              <button
                onClick={() => setActiveTab('terminals')}
                className={`px-5 py-3 text-base font-medium border-b-2 transition-colors ${
                  activeTab === 'terminals'
                    ? 'border-[#F4511E] text-[#F4511E]'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  สาขา POS
                </span>
              </button>
              <button
                onClick={() => setActiveTab('channels')}
                className={`px-5 py-3 text-base font-medium border-b-2 transition-colors ${
                  activeTab === 'channels'
                    ? 'border-[#F4511E] text-[#F4511E]'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  ช่องทางชำระเงิน POS
                </span>
              </button>
            </div>

            {/* ══════ Tab: Terminals ══════ */}
            {activeTab === 'terminals' && (
              <div className="max-w-2xl">
                <p className="text-base text-gray-500 dark:text-slate-400 mb-4">
                  แต่ละจุดขายเลือกผูกคลังสินค้าเพื่อตัดสต็อกได้
                </p>

                <div className="space-y-3">
                  {terminals.map((t, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === terminals.length - 1;
                    return (
                      <div key={t.id} className="space-y-3">
                        <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden ${!t.is_active ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-3 p-4">
                            {/* Reorder arrows */}
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => handleMoveTerminal(t.id, 'up')}
                                disabled={isFirst || reordering}
                                className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleMoveTerminal(t.id, 'down')}
                                disabled={isLast || reordering}
                                className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                              <Monitor className="w-5 h-5 text-[#F4511E]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-base text-gray-900 dark:text-white truncate">{t.name}</p>
                                {t.code && <span className="text-xs text-gray-400 dark:text-slate-500">({t.code})</span>}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                                {t.is_active ? (
                                  <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                                ) : (
                                  <span className="text-gray-400">ปิดใช้งาน</span>
                                )}
                                <span className="ml-1">
                                  {t.warehouse ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Warehouse className="w-3 h-3" />
                                      {t.warehouse.name}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">ไม่ตัดสต็อก</span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Toggle checked={t.is_active} onChange={() => handleToggleActive(t)} />
                              <button
                                onClick={() => startEdit(t)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('ลบจุดขายนี้?')) handleDelete(t.id);
                                }}
                                disabled={deletingId === t.id}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                              >
                                {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {editingId === t.id && showForm && renderTerminalForm()}
                      </div>
                    );
                  })}

                  {showForm && !editingId ? (
                    renderTerminalForm()
                  ) : !showForm ? (
                    <button
                      onClick={() => { resetForm(); setShowForm(true); }}
                      className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      เพิ่มจุดขาย
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* ══════ Tab: Payment Channels ══════ */}
            {activeTab === 'channels' && (
              <div className="max-w-2xl">
                <p className="text-base text-gray-500 dark:text-slate-400 mb-4">
                  เปิด/ปิดช่องทางที่ต้องการใช้ในหน้า POS
                </p>

                {loadingChannels ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-[#F4511E] animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {channels.map((ch, idx) => {
                      const Icon = getChannelIcon(ch.type);
                      const canDelete = ch.type !== 'cash' && ch.type !== 'payment_gateway';
                      const canEdit = ch.type !== 'cash';
                      const isFirst = idx === 0;
                      const isLast = idx === channels.length - 1;
                      return (
                        <div key={ch.id} className="space-y-3">
                          <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden ${!ch.is_active ? 'opacity-60' : ''}`}>
                            <div className="flex items-center gap-3 p-4">
                              {/* Reorder arrows */}
                              <div className="flex flex-col gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => handleMoveChannel(ch.id, 'up')}
                                  disabled={isFirst || reordering}
                                  className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleMoveChannel(ch.id, 'down')}
                                  disabled={isLast || reordering}
                                  className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-base text-gray-900 dark:text-white truncate">{ch.name}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                                  {ch.is_active ? (
                                    <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                                  ) : (
                                    <span className="text-gray-400">ปิดใช้งาน</span>
                                  )}
                                  {ch.type === 'bank_transfer' && ch.config?.promptpay_id && (
                                    <span className="text-blue-500">QR: {String(ch.config.promptpay_id)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Toggle checked={ch.is_active} onChange={() => handleToggleChannel(ch)} />
                                {canEdit && (
                                  <button
                                    onClick={() => startEditChannel(ch)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => {
                                      if (confirm('ลบช่องทางชำระเงินนี้?')) handleDeleteChannel(ch.id);
                                    }}
                                    disabled={deletingChannelId === ch.id}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                  >
                                    {deletingChannelId === ch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {editingChannelId === ch.id && showChannelForm && renderChannelForm()}
                        </div>
                      );
                    })}

                    {showChannelForm && !editingChannelId ? (
                      renderChannelForm()
                    ) : !showChannelForm ? (
                      <button
                        onClick={() => { resetChannelForm(); setShowChannelForm(true); }}
                        className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        เพิ่มช่องทางชำระเงิน
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );

  function renderTerminalForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
        <div className="text-base font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[#F4511E]" />
          {editingId ? 'แก้ไขจุดขาย' : 'เพิ่มจุดขาย'}
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">ชื่อจุดขาย *</label>
          <input
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น สาขาสยาม, Event ตลาดนัด JJ"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">รหัสจุดขาย</label>
          <input
            type="text"
            value={formCode}
            onChange={e => setFormCode(e.target.value)}
            placeholder="เช่น POS01"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">คลังสินค้า (ตัดสต็อก)</label>
          <select
            value={formWarehouseId}
            onChange={e => setFormWarehouseId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          >
            <option value="">ไม่ตัดสต็อก</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}{wh.code ? ` (${wh.code})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-base font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            บันทึก
          </button>
          <button
            onClick={resetForm}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-base font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" /> ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  function renderChannelForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
        <div className="text-base font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-green-600" />
          {editingChannelId ? 'แก้ไขช่องทาง' : 'เพิ่มช่องทางชำระเงิน'}
        </div>

        {!editingChannelId && (
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">ประเภท</label>
            <div className="flex gap-2">
              {CHANNEL_TYPE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setChannelType(opt.value);
                      if (!channelName) setChannelName(opt.label);
                    }}
                    className={`flex-1 p-2 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      channelType === opt.value
                        ? 'bg-[#F4511E]/10 text-[#F4511E] border-2 border-[#F4511E]'
                        : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">ชื่อช่องทาง *</label>
          <input
            type="text"
            value={channelName}
            onChange={e => setChannelName(e.target.value)}
            placeholder="เช่น โอนเงิน, บัตรเครดิต"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            autoFocus
          />
        </div>

        {channelType === 'bank_transfer' && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm text-gray-500 dark:text-slate-400">PromptPay ID (QR Code)</label>
              <div className="relative group">
                <Info className="w-4 h-4 text-gray-400 dark:text-slate-500 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <p className="font-semibold mb-1.5">วิธีสมัคร PromptPay</p>
                  <p className="font-medium text-yellow-300 mb-1">บุคคลธรรมดา:</p>
                  <p className="mb-1.5">ใช้เบอร์โทร (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก) ที่ผูก PromptPay ไว้กับธนาคาร — สมัครผ่าน Mobile Banking หรือสาขาธนาคาร</p>
                  <p className="font-medium text-yellow-300 mb-1">นิติบุคคล (บริษัท):</p>
                  <p className="mb-1.5">ใช้เลขประจำตัวผู้เสียภาษี (Tax ID 13 หลัก) — ต้องสมัครที่สาขาธนาคารที่บริษัทมีบัญชี</p>
                  <p className="text-red-300 mt-1">* เลขบัญชีธนาคารใช้ไม่ได้ ต้องเป็นเลขที่ผูก PromptPay แล้วเท่านั้น</p>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-slate-700"></div>
                </div>
              </div>
            </div>
            <input
              type="text"
              value={channelPromptPayId}
              onChange={e => {
                const v = e.target.value.replace(/[^\d-]/g, '');
                setChannelPromptPayId(v);
              }}
              placeholder="เบอร์โทร (10 หลัก) หรือ Tax ID (13 หลัก)"
              className={`w-full px-3 py-2 border rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] ${
                channelPromptPayId.trim() && channelPromptPayId.replace(/\D/g, '').length !== 10 && channelPromptPayId.replace(/\D/g, '').length !== 13
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-300 dark:border-slate-600'
              }`}
            />
            {channelPromptPayId.trim() ? (() => {
              const digits = channelPromptPayId.replace(/\D/g, '').length;
              if (digits === 10) return <p className="text-xs text-green-500 mt-1">เบอร์โทรศัพท์ (10 หลัก)</p>;
              if (digits === 13) return <p className="text-xs text-green-500 mt-1">บัตรประชาชน / Tax ID (13 หลัก)</p>;
              return <p className="text-xs text-red-500 mt-1">PromptPay ID ต้องเป็น 10 หลัก (เบอร์โทร) หรือ 13 หลัก (บัตร ปชช./Tax ID) — ตอนนี้ {digits} หลัก</p>;
            })() : (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                กรอกเพื่อแสดง QR PromptPay อัตโนมัติตอนชำระเงิน
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSaveChannel}
            disabled={savingChannel}
            className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-base font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {savingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            บันทึก
          </button>
          <button
            onClick={resetChannelForm}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-base font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" /> ยกเลิก
          </button>
        </div>
      </div>
    );
  }
}
