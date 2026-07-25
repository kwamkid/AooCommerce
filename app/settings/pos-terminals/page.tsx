// Path: app/settings/pos-terminals/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { LoadingCard, NoPermissionCard, EmptyCard } from '@/components/ui/StateCard';
import Toggle from '@/components/ui/Toggle';
import ListRow from '@/components/ui/ListRow';
import Tabs from '@/components/ui/Tabs';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import Alert from '@/components/ui/Alert';
import { THAI_BANKS, getBankByCode } from '@/lib/constants/banks';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Edit2, Trash2, Monitor, Warehouse,
  CreditCard, Banknote, Building2, MoreHorizontal, ArrowUp, ArrowDown, Info, QrCode, ChevronDown,
} from 'lucide-react';

interface TerminalItem {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string | null;
  /** FK to tax_branches — VAT branch printed on receipts (e.g. "สำนักงานใหญ่"). NULL = no VAT branch. */
  tax_branch_id: string | null;
  is_active: boolean;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  tax_branch: { id: string; code: string; name: string } | null;
}

interface TaxBranchOption {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_default: boolean;
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

// Channel types user can create — order matches the "+ เพิ่ม" dropdown.
// "other" is no longer creatable, but `getChannelIcon` keeps handling it so
// legacy rows still display correctly.
const CHANNEL_TYPE_OPTIONS = [
  { value: 'bank_transfer', label: 'โอนผ่านธนาคาร', icon: Building2, color: 'text-emerald-500' },
  { value: 'promptpay',     label: 'PromptPay',       icon: QrCode,    color: 'text-blue-500' },
  { value: 'card_terminal', label: 'เครื่องรูดบัตร', icon: CreditCard, color: 'text-purple-500' },
] as const;

function getChannelIcon(type: string) {
  if (type === 'cash') return Banknote;
  if (type === 'promptpay') return QrCode;
  if (type === 'card_terminal') return CreditCard;
  if (type === 'bank_transfer') return Building2;
  return MoreHorizontal;
}

/** Shared PromptPay help tooltip — used in both create and edit channel forms */
function PromptPayHelpTooltip() {
  return (
    <span className="relative group inline-flex">
      <Info className="w-4 h-4 text-gray-400 dark:text-slate-500 cursor-help" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 normal-case font-normal">
        <span className="block font-semibold mb-1.5">วิธีสมัคร PromptPay</span>
        <span className="block font-medium text-yellow-300 mb-1">บุคคลธรรมดา:</span>
        <span className="block mb-1.5">ใช้เบอร์โทร (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก) ที่ผูก PromptPay ไว้กับธนาคาร</span>
        <span className="block font-medium text-yellow-300 mb-1">นิติบุคคล (บริษัท):</span>
        <span className="block mb-1.5">ใช้เลขประจำตัวผู้เสียภาษี (Tax ID 13 หลัก)</span>
        <span className="block text-red-300 mt-1">* เลขบัญชีธนาคารใช้ไม่ได้ ต้องเป็นเลขที่ผูก PromptPay แล้วเท่านั้น</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-slate-700"></span>
      </span>
    </span>
  );
}


export default function PosTerminalsPage() {
  const { userProfile } = useAuth();
  const { currentCompany } = useCompany();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const isVatRegistered = !!currentCompany?.vat_registered;
  const { confirmDialog, confirm } = useConfirmDialog();

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
  // FK to a tax_branches row. Branches are managed at company level so the
  // dropdown stays consistent across cashiers + the receipt counter can scope
  // per-branch (each branch gets its own continuous numbering).
  const [formTaxBranchId, setFormTaxBranchId] = useState('');
  // Cached branch list for the cashier dropdown
  const [taxBranches, setTaxBranches] = useState<TaxBranchOption[]>([]);
  // Inline "+ เพิ่มสาขา" mini-modal state — opens on top of the cashier modal
  const [showBranchQuickAdd, setShowBranchQuickAdd] = useState(false);
  const [quickAddBranchCode, setQuickAddBranchCode] = useState('');
  const [quickAddBranchName, setQuickAddBranchName] = useState('');
  const [quickAddBranchAddress, setQuickAddBranchAddress] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Tracks which row's Toggle is saving (one at a time, per list)
  const [togglingTerminalId, setTogglingTerminalId] = useState<string | null>(null);
  const [togglingChannelId, setTogglingChannelId] = useState<string | null>(null);

  // "+ เพิ่ม" dropdown for channels tab (3 types: bank/PromptPay/card)
  const [addChannelDropdownOpen, setAddChannelDropdownOpen] = useState(false);
  const addChannelDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!addChannelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (addChannelDropdownRef.current && !addChannelDropdownRef.current.contains(e.target as Node)) {
        setAddChannelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addChannelDropdownOpen]);

  // Open channel modal pre-filled with a type chosen from the dropdown.
  // Sets a sensible default name (user can edit) and the modal handles the rest.
  const openCreateChannel = (type: string, defaultName: string) => {
    setAddChannelDropdownOpen(false);
    resetChannelForm();
    setChannelType(type);
    setChannelName(defaultName);
    setShowChannelForm(true);
  };

  // Payment channels state
  const [channels, setChannels] = useState<PaymentChannelItem[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelType, setChannelType] = useState('bank_transfer');
  const [channelName, setChannelName] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelPromptPayId, setChannelPromptPayId] = useState('');
  // Type-specific fields used during shift close to reconcile per-channel totals
  const [channelBankCode, setChannelBankCode] = useState('');         // bank_transfer
  const [channelAccountNumber, setChannelAccountNumber] = useState(''); // bank_transfer
  const [channelAccountName, setChannelAccountName] = useState('');   // bank_transfer
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Close bank dropdown on outside click
  useEffect(() => {
    if (!bankDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bankDropdownOpen]);

  useFetchOnce(() => {
    fetchTerminals();
    fetchWarehouses();
    fetchChannels();
    if (isVatRegistered) fetchTaxBranches();
  }, can(userProfile?.roles, 'masterdata.pos_terminals'));

  const fetchTaxBranches = async () => {
    try {
      const response = await apiFetch('/api/settings/tax-branches');
      if (!response.ok) return;
      const data = await response.json();
      setTaxBranches((data.branches || []) as TaxBranchOption[]);
    } catch {
      // Silent — branches are optional; user can still save cashier without one
    }
  };

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
    // Auto-pick the default tax branch (HQ) so VAT-registered shops with a
    // single registration don't have to think about it each time.
    const defaultBranchId = taxBranches.find(b => b.is_default)?.id || taxBranches[0]?.id || '';
    setFormTaxBranchId(defaultBranchId);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (t: TerminalItem) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormCode(t.code || '');
    setFormWarehouseId(t.warehouse_id || '');
    setFormTaxBranchId(t.tax_branch_id || '');
    setShowForm(true);
  };

  // Inline branch quick-add — user can create a new VAT branch from the
  // cashier modal without leaving to /settings/company. Newly created branch
  // is auto-selected in the FormSelect so the flow stays uninterrupted.
  const openBranchQuickAdd = () => {
    // Suggest the next code: highest existing + 1 (or "00000" for first)
    const maxCode = taxBranches.reduce((max, b) => {
      const n = parseInt(b.code, 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, -1);
    const nextCode = String(Math.max(0, maxCode + 1)).padStart(5, '0');
    setQuickAddBranchCode(nextCode);
    setQuickAddBranchName(nextCode === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${parseInt(nextCode, 10)}`);
    setQuickAddBranchAddress('');
    setShowBranchQuickAdd(true);
  };

  const handleSaveQuickAddBranch = async () => {
    if (!quickAddBranchName.trim() || !quickAddBranchCode.trim()) {
      showToast('กรุณากรอกรหัสและชื่อสาขา', 'error');
      return;
    }
    setSavingBranch(true);
    try {
      const response = await apiFetch('/api/settings/tax-branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: quickAddBranchCode.trim(),
          name: quickAddBranchName.trim(),
          address: quickAddBranchAddress.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'บันทึกสาขาไม่สำเร็จ');
      // Refresh list and auto-select the new branch in the cashier form
      await fetchTaxBranches();
      setFormTaxBranchId(data.branch.id);
      setShowBranchQuickAdd(false);
      showToast(`เพิ่มสาขา "${data.branch.name}" สำเร็จ`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('กรุณากรอกชื่อแคชเชียร์', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = editingId
        ? { id: editingId, name: formName, code: formCode, warehouse_id: formWarehouseId || null, tax_branch_id: formTaxBranchId || null }
        : { name: formName, code: formCode, warehouse_id: formWarehouseId || null, tax_branch_id: formTaxBranchId || null };

      const response = await apiFetch('/api/pos/terminals', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast(editingId ? 'อัปเดตแคชเชียร์สำเร็จ' : 'สร้างแคชเชียร์สำเร็จ');
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
    setTogglingTerminalId(t.id);
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
    } finally {
      setTogglingTerminalId(null);
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
      showToast('ลบแคชเชียร์สำเร็จ');
      await fetchTerminals();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
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
    setChannelType('promptpay');
    setChannelName('');
    setChannelPromptPayId('');
    setChannelBankCode('');
    setChannelAccountNumber('');
    setChannelAccountName('');
    setShowChannelForm(false);
    setEditingChannelId(null);
  };

  const startEditChannel = (ch: PaymentChannelItem) => {
    setEditingChannelId(ch.id);
    setChannelName(ch.name);
    setChannelType(ch.type);
    const cfg = (ch.config || {}) as Record<string, unknown>;
    setChannelPromptPayId(ch.type === 'promptpay' ? ((cfg.promptpay_id as string) || '') : '');
    setChannelBankCode(ch.type === 'bank_transfer' ? ((cfg.bank_code as string) || '') : '');
    setChannelAccountNumber(ch.type === 'bank_transfer' ? ((cfg.account_number as string) || '') : '');
    setChannelAccountName(ch.type === 'bank_transfer' ? ((cfg.account_name as string) || '') : '');
    setShowChannelForm(true);
  };

  const handleSaveChannel = async () => {
    if (!channelName.trim()) {
      showToast('กรุณากรอกชื่อช่องทาง', 'error');
      return;
    }

    // Type-specific validation — fields are required so shift-close
    // reconciliation can match deposits/transfers back to the right channel.
    if (channelType === 'promptpay') {
      if (!channelPromptPayId.trim()) {
        showToast('กรุณากรอก PromptPay ID', 'error');
        return;
      }
      const id = channelPromptPayId.trim().replace(/\D/g, '');
      if (id.length !== 10 && id.length !== 13) {
        showToast('PromptPay ID ต้องเป็นเบอร์โทร (10 หลัก) หรือ เลขบัตรประชาชน/Tax ID (13 หลัก)', 'error');
        return;
      }
    }
    if (channelType === 'bank_transfer') {
      if (!channelBankCode) {
        showToast('กรุณาเลือกธนาคาร', 'error');
        return;
      }
      if (!channelAccountNumber.trim()) {
        showToast('กรุณากรอกเลขบัญชี', 'error');
        return;
      }
      if (!channelAccountName.trim()) {
        showToast('กรุณากรอกชื่อบัญชี', 'error');
        return;
      }
    }

    setSavingChannel(true);
    try {
      const config: Record<string, unknown> = {};
      if (channelType === 'promptpay' && channelPromptPayId.trim()) {
        config.promptpay_id = channelPromptPayId.trim().replace(/\D/g, '');
      }
      if (channelType === 'bank_transfer') {
        config.bank_code = channelBankCode;
        config.account_number = channelAccountNumber.trim();
        config.account_name = channelAccountName.trim();
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
    setTogglingChannelId(ch.id);
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
    } finally {
      setTogglingChannelId(null);
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
  if (userProfile && !can(userProfile.roles, 'masterdata.pos_terminals')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="heading-1">แคชเชียร์</h1>
            <p className="page-subtitle">จัดการแคชเชียร์ที่เชื่อมกับคลังสินค้าและช่องทางชำระเงิน</p>
          </div>
          {features.pos && !loading && (
            activeTab === 'terminals' ? (
              // Terminals: simple button — hidden when list is empty (EmptyCard CTA takes over)
              terminals.length > 0 && (
                <Button
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => { resetForm(); setShowForm(true); }}
                >
                  เพิ่ม
                </Button>
              )
            ) : (
              // Channels: button with chevron → dropdown picks channel type
              <div ref={addChannelDropdownRef} className="relative print:hidden">
                <Button
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  iconRight={<ChevronDown className="w-3.5 h-3.5" />}
                  onClick={() => setAddChannelDropdownOpen(o => !o)}
                >
                  เพิ่ม
                </Button>
                {addChannelDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1">
                    {CHANNEL_TYPE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => openCreateChannel(opt.value, opt.label)}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                        >
                          <Icon className={`w-4 h-4 ${opt.color}`} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          )}
        </div>
        {/* POS feature flag not enabled */}
        {!features.pos && !loading && (
          <Alert tone="warning" title="ฟีเจอร์แคชเชียร์ยังไม่เปิดใช้งาน" className="mb-6">
            กรุณาเปิดใช้งานในหน้า <a href="/settings/features" className="underline font-medium">ปรับแต่ง Features</a>
          </Alert>
        )}

        {loading ? (
          <LoadingCard />
        ) : features.pos ? (
          <div>
            <Tabs
              activeKey={activeTab}
              onSelect={(k) => setActiveTab(k as 'terminals' | 'channels')}
              tabs={[
                { key: 'terminals', label: 'แคชเชียร์', icon: <Monitor className="w-4 h-4" /> },
                { key: 'channels', label: 'ช่องทางชำระเงิน', icon: <CreditCard className="w-4 h-4" /> },
              ]}
            />

            {/* ══════ Tab: Cashiers ══════ */}
            {activeTab === 'terminals' && (
              <div>
                {terminals.length === 0 ? (
                  <EmptyCard
                    icon={<Monitor className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                    title="ยังไม่มีแคชเชียร์"
                    subtitle="สร้างแคชเชียร์แรกเพื่อเริ่มขายผ่านระบบ"
                    actions={
                      <Button
                        variant="primary"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => { resetForm(); setShowForm(true); }}
                      >
                        สร้างแคชเชียร์แรก
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <p className="subtitle-text text-gray-500 dark:text-slate-400 mb-4">
                      แต่ละแคชเชียร์เลือกผูกคลังสินค้าเพื่อตัดสต็อกได้
                    </p>

                    <div className="space-y-3">
                      {terminals.map((t) => (
                        <ListRow
                          key={t.id}
                          inactive={!t.is_active}
                          icon={
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Monitor className="w-4 h-4 text-primary" />
                            </div>
                          }
                          title={
                            <span className="inline-flex items-center gap-2">
                              <span className="truncate">{t.name}</span>
                              {t.code && <span className="text-xs text-gray-400 dark:text-slate-500">({t.code})</span>}
                            </span>
                          }
                          subtitle={
                            <span className="inline-flex items-center gap-1.5">
                              {t.is_active ? (
                                <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                              ) : (
                                <span className="text-gray-400">ปิดใช้งาน</span>
                              )}
                              {t.warehouse ? (
                                <span className="inline-flex items-center gap-1">
                                  <Warehouse className="w-3 h-3" />
                                  {t.warehouse.name}
                                </span>
                              ) : (
                                <span className="text-gray-400">ไม่ตัดสต็อก</span>
                              )}
                            </span>
                          }
                          actions={
                            <>
                              <Toggle
                                checked={t.is_active}
                                onChange={() => handleToggleActive(t)}
                                loading={togglingTerminalId === t.id}
                              />
                              <button
                                onClick={() => startEdit(t)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                aria-label="แก้ไข"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => { const ok = await confirm({ title: 'ต้องการลบแคชเชียร์นี้?', variant: 'danger' }); if (ok) handleDelete(t.id); }}
                                disabled={deletingId === t.id}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                aria-label="ลบ"
                              >
                                {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </>
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══════ Tab: Payment Channels ══════ */}
            {activeTab === 'channels' && (
              <div>
                <p className="subtitle-text text-gray-500 dark:text-slate-400 mb-4">
                  เปิด/ปิดช่องทางที่ต้องการใช้ในแคชเชียร์
                </p>

                {channels.length > 1 && (
                  <div className="helper-text text-gray-400 dark:text-slate-500 flex items-center gap-1.5 mb-3">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>ใช้ปุ่มลูกศรเพื่อจัดลำดับการแสดงผลในแคชเชียร์</span>
                  </div>
                )}

                {loadingChannels ? (
                  <LoadingCard compact />
                ) : (
                  <div className="space-y-3">
                    {channels.map((ch, idx) => {
                      const Icon = getChannelIcon(ch.type);
                      const canDelete = ch.type !== 'cash' && ch.type !== 'payment_gateway';
                      const canEdit = ch.type !== 'cash';
                      const isFirst = idx === 0;
                      const isLast = idx === channels.length - 1;
                      const isEditing = editingChannelId === ch.id && showChannelForm;
                      return (
                        <div key={ch.id}>
                          <ListRow
                            inactive={!ch.is_active}
                            reorder={channels.length > 1 ? {
                              onMoveUp: () => handleMoveChannel(ch.id, 'up'),
                              onMoveDown: () => handleMoveChannel(ch.id, 'down'),
                              disableUp: isFirst,
                              disableDown: isLast,
                              disabled: reordering,
                            } : undefined}
                            icon={
                              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                                <Icon className="w-4 h-4 text-green-600 dark:text-green-400" />
                              </div>
                            }
                            title={ch.name}
                            subtitle={
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                {ch.is_active ? (
                                  <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                                ) : (
                                  <span className="text-gray-400">ปิดใช้งาน</span>
                                )}
                                {ch.type === 'promptpay' && ch.config?.promptpay_id ? (
                                  <span className="text-blue-500">QR: {String(ch.config.promptpay_id)}</span>
                                ) : null}
                                {ch.type === 'bank_transfer' && (() => {
                                  const cfg = ch.config as Record<string, string>;
                                  if (!cfg?.account_number) return null;
                                  const bank = cfg.bank_code ? getBankByCode(cfg.bank_code) : null;
                                  return (
                                    <span className="text-gray-500 dark:text-slate-400">
                                      {bank?.name_th || cfg.bank_code} • {cfg.account_number}
                                      {cfg.account_name ? ` • ${cfg.account_name}` : ''}
                                    </span>
                                  );
                                })()}
                              </span>
                            }
                            actions={
                              <>
                                <Toggle
                                  checked={ch.is_active}
                                  onChange={() => handleToggleChannel(ch)}
                                  loading={togglingChannelId === ch.id}
                                />
                                {canEdit && (
                                  <button
                                    onClick={() => startEditChannel(ch)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                    aria-label="แก้ไข"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={async () => { const ok = await confirm({ title: 'ต้องการลบช่องทางชำระเงินนี้?', variant: 'danger' }); if (ok) handleDeleteChannel(ch.id); }}
                                    disabled={deletingChannelId === ch.id}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                    aria-label="ลบ"
                                  >
                                    {deletingChannelId === ch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Container>
      {renderTerminalModal()}
      {renderChannelModal()}

      {/* Quick-add VAT branch — opens on top of the cashier modal so user
          stays in flow when they realize they need a new branch */}
      <Modal
        open={showBranchQuickAdd}
        onClose={() => !savingBranch && setShowBranchQuickAdd(false)}
        title="เพิ่มสาขา VAT"
        size="sm"
        disableBackdropClose={savingBranch}
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" onClick={() => setShowBranchQuickAdd(false)} disabled={savingBranch}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveQuickAddBranch}
              loading={savingBranch}
              disabled={savingBranch || !quickAddBranchName.trim() || !quickAddBranchCode.trim()}
            >
              บันทึก
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          <FormInput
            label="รหัสสาขา"
            required
            value={quickAddBranchCode}
            onChange={e => setQuickAddBranchCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="00000"
            hint="ตัวเลข 5 หลัก จาก ภพ.20 — สำนักงานใหญ่ใช้ 00000"
            inputMode="numeric"
          />
          <FormInput
            label="ชื่อสาขา"
            required
            value={quickAddBranchName}
            onChange={e => setQuickAddBranchName(e.target.value)}
            placeholder="เช่น สำนักงานใหญ่, สาขาที่ 1"
          />
          <FormInput
            label="ที่อยู่สาขา"
            value={quickAddBranchAddress}
            onChange={e => setQuickAddBranchAddress(e.target.value)}
            placeholder="ไม่กรอก = ใช้ที่อยู่บริษัท"
            hint="ใส่ที่อยู่จริงของสาขานี้ ถ้าต่างจากที่อยู่หลักของบริษัท"
          />
        </div>
      </Modal>

      {confirmDialog}
    </Layout>
  );

  function renderTerminalModal() {
    return (
      <Modal
        open={showForm}
        onClose={() => !saving && resetForm()}
        title={editingId ? 'แก้ไขแคชเชียร์' : 'เพิ่มแคชเชียร์'}
        icon={<Monitor className="w-5 h-5 text-primary" />}
        size="md"
        disableBackdropClose={saving}
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" onClick={resetForm} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving || !formName.trim()}>
              บันทึก
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          <FormInput
            label="ชื่อแคชเชียร์"
            required
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น สาขาสยาม, Event ตลาดนัด JJ"
            autoFocus
          />

          <FormInput
            label="รหัสแคชเชียร์"
            value={formCode}
            onChange={e => setFormCode(e.target.value)}
            placeholder="เช่น CASH01"
            hint="ใช้แสดงในใบเสร็จ / รายงาน (ไม่กรอกก็ได้)"
          />

          {/* VAT branch — only when company is VAT-registered. FK to tax_branches
              so the receipt counter scopes per branch (each branch gets its own
              continuous sequence, code printed in receipt number). Inline
              "+ เพิ่มสาขา" follows the master-data inline quick-add convention. */}
          {isVatRegistered && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="field-label !mb-0">สาขา VAT (สำหรับใบกำกับภาษี) <span className="text-red-500">*</span></label>
                <button
                  type="button"
                  onClick={openBranchQuickAdd}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  เพิ่มสาขา
                </button>
              </div>
              <FormSelect
                value={formTaxBranchId}
                onChange={setFormTaxBranchId}
                options={taxBranches.map(b => ({ id: b.id, label: `${b.code} — ${b.name}` }))}
                placeholder={taxBranches.length === 0 ? 'ยังไม่มีสาขา — กด + เพิ่มสาขา' : 'เลือกสาขา'}
                searchThreshold={99}
                portal
              />
              <p className="helper-text text-gray-500 mt-1">
                เลขใบกำกับจะใช้รหัสสาขานี้เป็น prefix (เช่น RCP-00000-YYYYMM-NNNN)
              </p>
            </div>
          )}

          <div>
            <label className="field-label">คลังสินค้า (ตัดสต็อก)</label>
            <FormSelect
              value={formWarehouseId}
              onChange={value => setFormWarehouseId(value)}
              options={warehouses.map(wh => ({ id: wh.id, label: wh.name + (wh.code ? ` (${wh.code})` : '') }))}
              placeholder="ไม่ตัดสต็อก"
              clearLabel="ไม่ตัดสต็อก"
              icon={<Warehouse className="w-4 h-4" />}
              searchThreshold={99}
              portal
            />
          </div>
        </div>
      </Modal>
    );
  }

  /** PromptPay ID field — used inside the channel modal when type is promptpay */
  function renderPromptPayField() {
    const digits = channelPromptPayId.replace(/\D/g, '').length;
    const hasValue = !!channelPromptPayId.trim();
    const isValid = digits === 10 || digits === 13;
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="field-label !mb-0">PromptPay ID (QR Code)</span>
          <PromptPayHelpTooltip />
        </div>
        <FormInput
          value={channelPromptPayId}
          onChange={e => setChannelPromptPayId(e.target.value.replace(/[^\d-]/g, ''))}
          placeholder="เบอร์โทร (10 หลัก) หรือ Tax ID (13 หลัก)"
          error={hasValue && !isValid ? `PromptPay ID ต้องเป็น 10 หลัก (เบอร์โทร) หรือ 13 หลัก (บัตร ปชช./Tax ID) — ตอนนี้ ${digits} หลัก` : undefined}
          hint={!hasValue ? 'กรอกเพื่อแสดง QR PromptPay อัตโนมัติตอนชำระเงิน' : undefined}
        />
        {hasValue && isValid && (
          <p className="helper-text text-green-500 mt-1">
            {digits === 10 ? 'เบอร์โทรศัพท์ (10 หลัก)' : 'บัตรประชาชน / Tax ID (13 หลัก)'}
          </p>
        )}
      </div>
    );
  }

  function renderChannelModal() {
    // Header icon + label follow the channel type so user always sees what
    // they're editing (Bank vs PromptPay vs Card reader). Type is fixed once
    // chosen from the dropdown / set on existing rows — can't be swapped here.
    const TypeIcon = getChannelIcon(channelType);
    const typeOption = CHANNEL_TYPE_OPTIONS.find(o => o.value === channelType);
    const typeLabel = typeOption?.label ?? 'ช่องทางชำระเงิน';
    const titleVerb = editingChannelId ? 'แก้ไข' : 'เพิ่ม';
    return (
      <Modal
        open={showChannelForm}
        onClose={() => !savingChannel && resetChannelForm()}
        title={`${titleVerb}${typeLabel}`}
        icon={<TypeIcon className={`w-5 h-5 ${typeOption?.color ?? 'text-primary'}`} />}
        size="md"
        disableBackdropClose={savingChannel}
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" onClick={resetChannelForm} disabled={savingChannel}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={handleSaveChannel} loading={savingChannel} disabled={savingChannel || !channelName.trim()}>
              บันทึก
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          {/* Bank picker (bank_transfer only) — also auto-fills the channel
              name with the bank's Thai name so user gets something sensible
              for free; they can still rename later. */}
          {channelType === 'bank_transfer' && (
            <div ref={bankDropdownRef} className="relative">
              <label className="field-label">ธนาคาร <span className="text-red-500">*</span></label>
              <button
                type="button"
                onClick={() => setBankDropdownOpen(!bankDropdownOpen)}
                className="w-full h-10 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-left flex items-center gap-2 bg-white dark:bg-slate-700 hover:border-gray-400 dark:hover:border-slate-500 transition-colors"
              >
                {channelBankCode ? (
                  <>
                    {getBankByCode(channelBankCode)?.logo ? (
                      <img src={getBankByCode(channelBankCode)!.logo} alt="" className="w-5 h-5 rounded-full flex-shrink-0 object-contain" />
                    ) : (
                      <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: getBankByCode(channelBankCode)?.color }} />
                    )}
                    <span className="text-sm text-gray-900 dark:text-white">{getBankByCode(channelBankCode)?.name_th}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-slate-500">เลือกธนาคาร</span>
                )}
                <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
              </button>
              {bankDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {THAI_BANKS.map(b => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => {
                        setChannelBankCode(b.code);
                        setBankDropdownOpen(false);
                        // Auto-fill channel name if untouched or empty
                        if (!channelName.trim() || channelName === getBankByCode(channelBankCode)?.name_th) {
                          setChannelName(b.name_th);
                        }
                      }}
                      className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left ${channelBankCode === b.code ? 'bg-primary/10' : ''}`}
                    >
                      {b.logo ? <img src={b.logo} alt={b.name_th} className="w-5 h-5 rounded-full flex-shrink-0 object-contain" /> : <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />}
                      <span className="text-sm text-gray-900 dark:text-white">{b.name_th}</span>
                      <span className="text-xs text-gray-400 ml-auto">{b.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Channel name — label/placeholder adapt to type so user knows
              what to type (terminal device name vs generic channel name). */}
          <FormInput
            label={
              channelType === 'card_terminal' ? 'ชื่อเครื่องรูดบัตร'
              : channelType === 'bank_transfer' ? 'ชื่อช่องทาง (แสดงผล)'
              : 'ชื่อช่องทาง'
            }
            required
            value={channelName}
            onChange={e => setChannelName(e.target.value)}
            placeholder={
              channelType === 'card_terminal' ? 'เช่น EDC กสิกร เคาน์เตอร์ 1'
              : channelType === 'bank_transfer' ? 'เช่น กสิกร (บัญชีร้าน)'
              : 'เช่น โอนเงิน, บัตรเครดิต'
            }
            hint={
              channelType === 'card_terminal'
                ? 'ใช้แยกยอดเมื่อปิดกะ ถ้ามีหลายเครื่องให้ตั้งชื่อต่างกัน'
                : undefined
            }
            autoFocus
          />

          {/* Bank account fields (bank_transfer only) */}
          {channelType === 'bank_transfer' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormInput
                label="เลขที่บัญชี"
                required
                value={channelAccountNumber}
                onChange={e => setChannelAccountNumber(e.target.value)}
                placeholder="xxx-x-xxxxx-x"
              />
              <FormInput
                label="ชื่อบัญชี"
                required
                value={channelAccountName}
                onChange={e => setChannelAccountName(e.target.value)}
                placeholder="ชื่อ-สกุล หรือ ชื่อบริษัท"
              />
            </div>
          )}

          {channelType === 'promptpay' && renderPromptPayField()}
        </div>
      </Modal>
    );
  }
}
