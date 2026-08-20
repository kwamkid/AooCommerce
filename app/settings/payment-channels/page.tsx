'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import CopyField from '@/components/ui/CopyField';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import ListRow from '@/components/ui/ListRow';
import ReorderArrows from '@/components/ui/ReorderArrows';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import Toggle from '@/components/ui/Toggle';
import NumberInput from '@/components/ui/NumberInput';
import Alert from '@/components/ui/Alert';
import Checkbox from '@/components/ui/Checkbox';
import Radio from '@/components/ui/Radio';

// Beam Checkout signup — opens marketing site, user signs up + obtains Merchant ID + API Key
const BEAM_SIGNUP_URL = 'https://www.beamcheckout.com';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { THAI_BANKS, getBankByCode } from '@/lib/constants/banks';
import { BEAM_CHANNELS, BEAM_CHANNEL_CATEGORIES, CUSTOMER_TYPES, FEE_PAYERS } from '@/lib/constants/payment-gateway';
import { Banknote, Building2, Globe, Plus, Edit2, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ArrowUp, ArrowDown, QrCode, ExternalLink } from 'lucide-react';

// Types
interface PaymentChannel {
  id: string;
  channel_group: string;
  type: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface GatewayChannelConfig {
  enabled: boolean;
  min_amount: number;
  customer_types: string[];
  fee_payer: string;
  installment_plans?: string[];
}


export default function PaymentChannelsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  // Data
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // Derived
  const cashChannel = channels.find(c => c.type === 'cash');
  const bankAccounts = channels.filter(c => c.type === 'bank_transfer' && !(c.config as Record<string, unknown>)?.promptpay_id);
  const promptPayChannels = channels.filter(c => c.type === 'bank_transfer' && !!(c.config as Record<string, unknown>)?.promptpay_id);
  const gatewayChannel = channels.find(c => c.type === 'payment_gateway');

  // Bank form state
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({ bank_code: '', account_number: '', account_name: '' });
  const [savingBank, setSavingBank] = useState(false);
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);

  // PromptPay form state
  const [showPromptPayForm, setShowPromptPayForm] = useState(false);
  const [promptPayId, setPromptPayId] = useState('');
  const [savingPromptPay, setSavingPromptPay] = useState(false);

  // Gateway form state
  const [gatewayForm, setGatewayForm] = useState({ merchant_id: '', api_key: '', environment: 'sandbox' as 'sandbox' | 'production' });
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);
  const [gatewayChannels, setGatewayChannels] = useState<Record<string, GatewayChannelConfig>>({});
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  // Collapse state for sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [reordering, setReordering] = useState(false);
  // Tracks which row's Toggle is currently saving (only one at a time)
  const [togglingChannelId, setTogglingChannelId] = useState<string | null>(null);

  // API group (this page only manages bill_online — POS lives in /settings/pos-terminals)
  const [activeTab] = useState<'bill_online' | 'pos'>('bill_online');

  // Top-right "+ เพิ่ม" dropdown
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!addDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addDropdownOpen]);

  // Fetch data
  const fetchChannels = async () => {
    try {
      const response = await apiFetch(`/api/settings/payment-channels?group=${activeTab}`);

      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      const data = result.data || [];
      setChannels(data);

      // Collapse all sections by default
      setCollapsedSections(new Set(data.map((c: PaymentChannel) => c.id)));

      // Populate gateway form if exists
      const gw = (result.data || []).find((c: PaymentChannel) => c.type === 'payment_gateway');
      if (gw) {
        const cfg = gw.config as Record<string, unknown>;
        setGatewayForm({
          merchant_id: (cfg.merchant_id as string) || '',
          api_key: (cfg.api_key as string) || '',
          environment: (cfg.environment as 'sandbox' | 'production') || 'sandbox',
        });
        setGatewayChannels((cfg.channels as Record<string, GatewayChannelConfig>) || {});
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useFetchOnce(() => {
    fetchChannels();
  }, can(userProfile?.roles, 'masterdata.payment_channels'));

  // Close bank dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper: API call
  const apiCall = async (method: string, body?: unknown, query?: string) => {
    const url = `/api/settings/payment-channels${query || ''}`;
    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Request failed');
    }
    return response.json();
  };

  // === CASH TOGGLE ===
  const handleCashToggle = async (active: boolean) => {
    if (!cashChannel) return;
    setTogglingChannelId(cashChannel.id);
    try {
      await apiCall('PUT', { id: cashChannel.id, is_active: active });
      setChannels(prev => prev.map(c => c.id === cashChannel.id ? { ...c, is_active: active } : c));
      showToast(active ? 'เปิดรับเงินสดแล้ว' : 'ปิดรับเงินสดแล้ว');
    } catch {
      showToast('บันทึกไม่สำเร็จ', 'error');
    } finally {
      setTogglingChannelId(null);
    }
  };

  const handleGatewayToggle = async (active: boolean) => {
    if (!gatewayChannel) return;
    setTogglingChannelId(gatewayChannel.id);
    try {
      await apiCall('PUT', { id: gatewayChannel.id, is_active: active });
      setChannels(prev => prev.map(c => c.id === gatewayChannel.id ? { ...c, is_active: active } : c));
      showToast(active ? 'เปิดชำระออนไลน์แล้ว' : 'ปิดชำระออนไลน์แล้ว');
    } catch {
      showToast('บันทึกไม่สำเร็จ', 'error');
    } finally {
      setTogglingChannelId(null);
    }
  };

  // === BANK ACCOUNT CRUD ===
  const resetBankForm = () => {
    setBankForm({ bank_code: '', account_number: '', account_name: '' });
    setShowBankForm(false);
    setEditingBankId(null);
  };

  const handleSaveBank = async () => {
    if (!bankForm.bank_code || !bankForm.account_number.trim() || !bankForm.account_name.trim()) {
      showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
      return;
    }
    setSavingBank(true);
    try {
      const bank = getBankByCode(bankForm.bank_code);
      if (editingBankId) {
        await apiCall('PUT', {
          id: editingBankId,
          name: bank?.name_th || bankForm.bank_code,
          config: bankForm,
        });
        showToast('แก้ไขบัญชีสำเร็จ');
      } else {
        await apiCall('POST', {
          type: 'bank_transfer',
          name: bank?.name_th || bankForm.bank_code,
          config: bankForm,
        });
        showToast('เพิ่มบัญชีสำเร็จ');
      }
      resetBankForm();
      fetchChannels();
    } catch (err) {
      showToast((err as Error).message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingBank(false);
    }
  };

  const handleEditBank = (channel: PaymentChannel) => {
    const cfg = channel.config as Record<string, string>;
    setBankForm({
      bank_code: cfg.bank_code || '',
      account_number: cfg.account_number || '',
      account_name: cfg.account_name || '',
    });
    setEditingBankId(channel.id);
    setShowBankForm(true);
  };

  const handleDeleteBank = async (id: string, name: string) => {
    const ok = await confirm({ title: `ลบบัญชี "${name}" หรือไม่?`, variant: 'danger' }); if (!ok) return;
    try {
      await apiCall('DELETE', undefined, `?id=${id}`);
      showToast('ลบบัญชีสำเร็จ');
      fetchChannels();
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    }
  };

  // === PROMPTPAY CRUD ===
  const resetPromptPayForm = () => {
    setPromptPayId('');
    setShowPromptPayForm(false);
  };

  const handleSavePromptPay = async () => {
    const cleaned = promptPayId.replace(/[^0-9]/g, '');
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      showToast('PromptPay ID ต้องเป็นเบอร์โทร 10 หลัก หรือ เลขบัตร/Tax ID 13 หลัก', 'error');
      return;
    }
    setSavingPromptPay(true);
    try {
      await apiCall('POST', {
        type: 'bank_transfer',
        name: 'PromptPay QR',
        config: { promptpay_id: cleaned },
      });
      showToast('เพิ่ม PromptPay QR สำเร็จ');
      resetPromptPayForm();
      fetchChannels();
    } catch (err) {
      showToast((err as Error).message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingPromptPay(false);
    }
  };

  const handleDeletePromptPay = async (id: string) => {
    const ok = await confirm({ title: 'ลบ PromptPay QR นี้หรือไม่?', variant: 'danger' }); if (!ok) return;
    try {
      await apiCall('DELETE', undefined, `?id=${id}`);
      showToast('ลบ PromptPay QR สำเร็จ');
      fetchChannels();
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    }
  };

  // === GATEWAY CONFIG ===
  const handleSaveGateway = async () => {
    if (!gatewayForm.merchant_id.trim() || !gatewayForm.api_key.trim()) {
      showToast('กรุณากรอก Merchant ID และ API Key', 'error');
      return;
    }
    setSavingGateway(true);
    try {
      const config = {
        merchant_id: gatewayForm.merchant_id.trim(),
        api_key: gatewayForm.api_key.trim(),
        environment: gatewayForm.environment,
        channels: gatewayChannels,
      };

      if (gatewayChannel) {
        await apiCall('PUT', { id: gatewayChannel.id, config });
      } else {
        await apiCall('POST', {
          type: 'payment_gateway',
          name: 'Beam Checkout',
          config,
        });
      }
      showToast('บันทึกสำเร็จ');
      fetchChannels();
    } catch (err) {
      showToast((err as Error).message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingGateway(false);
    }
  };

  const handleToggleBeamChannel = (code: string, enabled: boolean) => {
    const defaultMinAmount = code === 'CARD_INSTALLMENTS' ? 3000 : 0;
    setGatewayChannels(prev => ({
      ...prev,
      [code]: {
        ...(prev[code] || { min_amount: defaultMinAmount, customer_types: ['retail', 'wholesale', 'distributor'], fee_payer: 'merchant' }),
        enabled,
      },
    }));
  };

  const handleUpdateBeamChannel = (code: string, field: string, value: unknown) => {
    setGatewayChannels(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value },
    }));
  };

  // === COLLAPSE TOGGLE ===
  const toggleCollapse = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // === REORDER ===
  const handleMoveChannel = async (channelId: string, direction: 'up' | 'down') => {
    const idx = channels.findIndex(c => c.id === channelId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= channels.length) return;

    // Swap in local state
    const newChannels = [...channels];
    [newChannels[idx], newChannels[swapIdx]] = [newChannels[swapIdx], newChannels[idx]];

    // Assign new sort_order based on position
    const orders = newChannels.map((c, i) => ({ id: c.id, sort_order: i }));
    const reordered = newChannels.map((c, i) => ({ ...c, sort_order: i }));
    setChannels(reordered);

    // Save to DB
    setReordering(true);
    try {
      await apiCall('PATCH', { orders });
    } catch {
      showToast('บันทึกลำดับไม่สำเร็จ', 'error');
      fetchChannels(); // revert
    } finally {
      setReordering(false);
    }
  };

  // Admin guard
  if (userProfile && !can(userProfile.roles, 'masterdata.payment_channels')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  // Group beam channels by category
  const channelsByCategory = BEAM_CHANNELS.reduce((acc, ch) => {
    if (!acc[ch.category]) acc[ch.category] = [];
    acc[ch.category].push(ch);
    return acc;
  }, {} as Record<string, typeof BEAM_CHANNELS>);

  return (
    <Layout>
      <Container size="full">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="heading-1">ช่องทางชำระเงิน</h1>
            <p className="page-subtitle">ช่องทางที่ลูกค้าใช้จ่ายเงินผ่านลิงก์ Bill Online ของ manual order</p>
          </div>

          {/* Top-right add dropdown — for PromptPay / Bank account (Beam gateway is system-managed) */}
          <div ref={addDropdownRef} className="relative print:hidden">
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              iconRight={<ChevronDown className="w-3.5 h-3.5" />}
              onClick={() => setAddDropdownOpen(o => !o)}
            >
              เพิ่ม
            </Button>
            {addDropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={() => { setAddDropdownOpen(false); resetPromptPayForm(); setShowPromptPayForm(true); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <QrCode className="w-4 h-4 text-blue-500" />
                  PromptPay QR
                </button>
                <button
                  onClick={() => { setAddDropdownOpen(false); resetBankForm(); setShowBankForm(true); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <Building2 className="w-4 h-4 text-emerald-500" />
                  บัญชีธนาคาร
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingCard />
        ) : (
          <div className="space-y-2">
            {/* Tip — only when there are multiple rows to sort */}
            {channels.length > 1 && (
              <div className="helper-text text-gray-400 flex items-center gap-1.5 mb-1">
                <ArrowUp className="w-3.5 h-3.5" />
                <ArrowDown className="w-3.5 h-3.5" />
                <span>ใช้ปุ่มลูกศรเพื่อจัดลำดับการแสดงผลในหน้า Bill Online</span>
              </div>
            )}

            {channels
              .map((channel, idx, visibleChannels) => {
              const isCollapsed = collapsedSections.has(channel.id);
              const isFirst = idx === 0;
              const isLast = idx === visibleChannels.length - 1;
              // Hide reorder arrows when there's only one row to sort
              const showReorder = visibleChannels.length > 1;
              // Check if this is the last non-promptpay bank_transfer card (to render add-bank button after it)
              const isLastBank = channel.type === 'bank_transfer' &&
                !(channel.config as Record<string, string>)?.promptpay_id &&
                !channels.slice(idx + 1).some(c => c.type === 'bank_transfer' && !(c.config as Record<string, string>)?.promptpay_id);

              // === CASH CARD ===
              if (channel.type === 'cash') {
                return (
                  <ListRow
                    key={channel.id}
                    reorder={showReorder ? {
                      onMoveUp: () => handleMoveChannel(channel.id, 'up'),
                      onMoveDown: () => handleMoveChannel(channel.id, 'down'),
                      disableUp: isFirst,
                      disableDown: isLast,
                      disabled: reordering,
                    } : undefined}
                    icon={
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <Banknote className="w-4 h-4 text-green-600" />
                      </div>
                    }
                    title="เงินสด"
                    subtitle="รับเงินสดจากลูกค้า / จ่ายหน้าร้าน"
                    actions={<Toggle checked={channel.is_active} onChange={handleCashToggle} loading={togglingChannelId === channel.id} />}
                  />
                );
              }

              // === PROMPTPAY CARD ===
              if (channel.type === 'bank_transfer' && (channel.config as Record<string, string>)?.promptpay_id) {
                const cfg = channel.config as Record<string, string>;
                const ppId = cfg.promptpay_id;
                const formatted = ppId.length === 10
                  ? `${ppId.slice(0, 3)}-${ppId.slice(3, 6)}-${ppId.slice(6)}`
                  : `${ppId.slice(0, 1)}-${ppId.slice(1, 5)}-${ppId.slice(5, 10)}-${ppId.slice(10, 12)}-${ppId.slice(12)}`;

                return (
                  <ListRow
                    key={channel.id}
                    reorder={showReorder ? {
                      onMoveUp: () => handleMoveChannel(channel.id, 'up'),
                      onMoveDown: () => handleMoveChannel(channel.id, 'down'),
                      disableUp: isFirst,
                      disableDown: isLast,
                      disabled: reordering,
                    } : undefined}
                    icon={
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <QrCode className="w-4 h-4 text-blue-600" />
                      </div>
                    }
                    title="PromptPay QR"
                    subtitle={formatted}
                    actions={
                      <button
                        onClick={() => handleDeletePromptPay(channel.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        aria-label="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    }
                  />
                );
              }

              // === BANK TRANSFER CARD ===
              if (channel.type === 'bank_transfer') {
                const cfg = channel.config as Record<string, string>;
                const bank = getBankByCode(cfg.bank_code);

                return (
                  <ListRow
                    key={channel.id}
                    reorder={showReorder ? {
                      onMoveUp: () => handleMoveChannel(channel.id, 'up'),
                      onMoveDown: () => handleMoveChannel(channel.id, 'down'),
                      disableUp: isFirst,
                      disableDown: isLast,
                      disabled: reordering,
                    } : undefined}
                    icon={
                      bank?.logo ? (
                        <img src={bank.logo} alt={bank.name_th} className="w-8 h-8 rounded-full object-contain" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: bank?.color || '#999' }}
                        >
                          {bank?.code?.slice(0, 2) || '?'}
                        </div>
                      )
                    }
                    title={bank?.name_th || cfg.bank_code}
                    subtitle={`${cfg.account_number} • ${cfg.account_name}`}
                    actions={
                      <>
                        <button
                          onClick={() => handleEditBank(channel)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                          aria-label="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBank(channel.id, bank?.name_th || cfg.bank_code)}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          aria-label="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    }
                  />
                );
              }

              // === PAYMENT GATEWAY CARD ===
              if (channel.type === 'payment_gateway') {
                return (
                  <Card key={channel.id} padding="none">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      {showReorder && (
                        <ReorderArrows
                          onMoveUp={() => handleMoveChannel(channel.id, 'up')}
                          onMoveDown={() => handleMoveChannel(channel.id, 'down')}
                          disableUp={isFirst}
                          disableDown={isLast}
                          disabled={reordering}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleCollapse(channel.id)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Globe className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-white">ชำระออนไลน์</h3>
                          <p className="text-sm text-gray-500 dark:text-slate-400">รับชำระผ่านช่องทางออนไลน์</p>
                        </div>
                        <img src="/beam_payment_gateway/beam_logo.svg" alt="Beam" className="h-4 opacity-40 dark:invert dark:opacity-60 flex-shrink-0" />
                        {isCollapsed ? (
                          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                      <Toggle
                        checked={channel.is_active}
                        onChange={handleGatewayToggle}
                        loading={togglingChannelId === channel.id}
                      />
                    </div>

                    {/* Expandable content */}
                    {!isCollapsed && (
                      <div className="p-4 border-t border-gray-100 dark:border-slate-700 space-y-4">
                        {/* API Config */}
                        <div className="space-y-3">
                          <h4 className="heading-4">API Configuration</h4>

                          {/* Sign-up prompt — shown only when credentials are empty */}
                          {!gatewayForm.merchant_id && !gatewayForm.api_key && (
                            <Alert tone="info" title="ยังไม่มีบัญชี Beam Checkout?">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>สมัครก่อนเพื่อรับ Merchant ID และ API Key</span>
                                <a
                                  href={BEAM_SIGNUP_URL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-medium hover:underline"
                                >
                                  สมัคร Beam Checkout
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </Alert>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormInput
                              label="Merchant ID"
                              value={gatewayForm.merchant_id}
                              onChange={e => setGatewayForm(prev => ({ ...prev, merchant_id: e.target.value }))}
                              placeholder="Merchant ID จาก Beam"
                            />
                            <FormInput
                              label="API Key"
                              type={showApiKey ? 'text' : 'password'}
                              value={gatewayForm.api_key}
                              onChange={e => setGatewayForm(prev => ({ ...prev, api_key: e.target.value }))}
                              placeholder="API Key จาก Beam"
                              postfix={
                                <button
                                  type="button"
                                  onClick={() => setShowApiKey(!showApiKey)}
                                  className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                                  aria-label={showApiKey ? 'ซ่อน API Key' : 'แสดง API Key'}
                                >
                                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              }
                            />
                          </div>

                          {/* Environment */}
                          <div>
                            <label className="field-label">Environment</label>
                            <div className="flex gap-2">
                              {(['sandbox', 'production'] as const).map(env => (
                                <Button
                                  key={env}
                                  variant={gatewayForm.environment === env ? 'primary' : 'secondary'}
                                  size="sm"
                                  onClick={() => setGatewayForm(prev => ({ ...prev, environment: env }))}
                                >
                                  {env === 'sandbox' ? 'Sandbox (ทดสอบ)' : 'Production (ใช้งานจริง)'}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {/* Webhook Info */}
                          {gatewayForm.merchant_id && (() => {
                            const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/beam/webhook` : '/api/beam/webhook';
                            return (
                              <Alert tone="info" title="Webhook URL (ตั้งค่าที่ Beam Lighthouse)">
                                <div className="mt-2">
                                  <CopyField value={webhookUrl} />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    variant="success"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        showToast('กำลังทดสอบ...');
                                        const res = await fetch('/api/beam/test-connection', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            merchant_id: gatewayForm.merchant_id,
                                            api_key: gatewayForm.api_key,
                                            environment: gatewayForm.environment,
                                            webhook_url: webhookUrl,
                                          }),
                                        });
                                        const data = await res.json();
                                        if (data.error) {
                                          showToast(data.error, 'error');
                                        } else if (data.credentials && data.webhook) {
                                          showToast('API credentials ถูกต้อง + Webhook พร้อมรับข้อมูล');
                                        } else if (data.credentials && !data.webhook) {
                                          showToast('API credentials ถูกต้อง แต่ Webhook เข้าถึงไม่ได้ — กรุณาตรวจสอบ URL', 'error');
                                        } else {
                                          showToast('API credentials ไม่ถูกต้อง', 'error');
                                        }
                                      } catch {
                                        showToast('ไม่สามารถทดสอบการเชื่อมต่อได้', 'error');
                                      }
                                    }}
                                  >
                                    ทดสอบ
                                  </Button>
                                </div>
                                <p className="helper-text mt-2">
                                  Events: <span className="font-mono">payment_link.paid</span>, <span className="font-mono">charge.succeeded</span>
                                </p>
                              </Alert>
                            );
                          })()}

                        </div>

                        {/* Payment Channels */}
                        {(gatewayChannel || gatewayForm.merchant_id) && (
                          <>
                            <hr className="border-gray-200 dark:border-slate-700" />
                            <div className="space-y-4">
                              <h4 className="heading-4">ช่องทางการชำระเงิน</h4>

                              {Object.entries(channelsByCategory).map(([category, beamChannels]) => (
                                <div key={category}>
                                  <div className="helper-text font-medium text-gray-400 uppercase tracking-wider mb-2">
                                    {BEAM_CHANNEL_CATEGORIES[category]}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {beamChannels.map(ch => {
                                      const chConfig = gatewayChannels[ch.code];
                                      const isEnabled = chConfig?.enabled || false;
                                      const isExpanded = expandedChannel === ch.code;
                                      return (
                                        <Fragment key={ch.code}>
                                          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                                            <div className="flex items-center gap-3 px-3 py-2.5">
                                              <Toggle checked={isEnabled} onChange={(v) => handleToggleBeamChannel(ch.code, v)} />
                                              {ch.logo && (
                                                <img src={ch.logo} alt={ch.name_th} className="w-6 h-6 object-contain flex-shrink-0" />
                                              )}
                                              <span className="body-text text-gray-900 dark:text-white flex-1 truncate">{ch.name_th}</span>
                                              {isEnabled && (
                                                <button type="button" onClick={() => setExpandedChannel(isExpanded ? null : ch.code)} className="p-1 text-gray-400 hover:text-gray-600 dark:text-slate-400">
                                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          {isEnabled && isExpanded && (
                                            <div className="md:col-span-2 lg:col-span-3 px-4 py-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg space-y-3">
                                              <div>
                                                <label className="field-label">ยอดสั่งซื้อขั้นต่ำ (บาท)</label>
                                                <NumberInput min="0" value={chConfig?.min_amount || 0} onChange={(n) => handleUpdateBeamChannel(ch.code, 'min_amount', n)} className="w-40 h-10 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
                                              </div>
                                              <div>
                                                <label className="field-label">ประเภทลูกค้าที่ใช้ได้</label>
                                                <div className="flex gap-4 flex-wrap">
                                                  {CUSTOMER_TYPES.map(ct => {
                                                    const types = chConfig?.customer_types || ['retail', 'wholesale', 'distributor'];
                                                    const checked = types.includes(ct.value);
                                                    return (
                                                      <Checkbox
                                                        key={ct.value}
                                                        checked={checked}
                                                        onChange={() => {
                                                          const newTypes = checked ? types.filter((t: string) => t !== ct.value) : [...types, ct.value];
                                                          handleUpdateBeamChannel(ch.code, 'customer_types', newTypes);
                                                        }}
                                                        label={ct.label}
                                                      />
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                              <div>
                                                <label className="field-label">ผู้รับผิดชอบค่าธรรมเนียม</label>
                                                <div className="flex gap-4 flex-wrap">
                                                  {FEE_PAYERS.map(fp => {
                                                    const selected = (chConfig?.fee_payer || 'merchant') === fp.value;
                                                    return (
                                                      <Radio
                                                        key={fp.value}
                                                        checked={selected}
                                                        onChange={() => handleUpdateBeamChannel(ch.code, 'fee_payer', fp.value)}
                                                        label={fp.label}
                                                      />
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                              {/* Installment month options — only for CARD_INSTALLMENTS */}
                                              {ch.code === 'CARD_INSTALLMENTS' && (
                                                <div>
                                                  <label className="field-label">จำนวนเดือนที่รับผ่อน</label>
                                                  <div className="flex flex-wrap gap-4">
                                                    {[
                                                      { key: 'installments3m', label: '3 เดือน' },
                                                      { key: 'installments4m', label: '4 เดือน' },
                                                      { key: 'installments6m', label: '6 เดือน' },
                                                      { key: 'installments10m', label: '10 เดือน' },
                                                    ].map(opt => {
                                                      const plans = chConfig?.installment_plans || ['installments3m', 'installments4m', 'installments6m', 'installments10m'];
                                                      const checked = plans.includes(opt.key);
                                                      return (
                                                        <Checkbox
                                                          key={opt.key}
                                                          checked={checked}
                                                          onChange={() => {
                                                            const newPlans = checked ? plans.filter((p: string) => p !== opt.key) : [...plans, opt.key];
                                                            handleUpdateBeamChannel(ch.code, 'installment_plans', newPlans);
                                                          }}
                                                          label={opt.label}
                                                        />
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Save button — right-aligned per global form action convention */}
                        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
                          <Button
                            variant="primary"
                            onClick={handleSaveGateway}
                            loading={savingGateway}
                            disabled={savingGateway}
                          >
                            บันทึก
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              }

              return null;
            })}

          </div>
        )}
      </Container>

      {/* PromptPay Modal — add only (delete via card icon) */}
      <Modal
        open={showPromptPayForm}
        onClose={() => !savingPromptPay && resetPromptPayForm()}
        title="เพิ่ม PromptPay QR"
        size="md"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" disabled={savingPromptPay} onClick={resetPromptPayForm}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={savingPromptPay}
              disabled={!promptPayId.trim()}
              onClick={handleSavePromptPay}
            >
              บันทึก
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5">
          <FormInput
            label="PromptPay ID"
            required
            value={promptPayId}
            onChange={(e) => setPromptPayId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="เบอร์โทร 10 หลัก หรือ เลขบัตร 13 หลัก"
            maxLength={13}
            inputMode="numeric"
            hint="เบอร์โทรศัพท์ 10 หลัก หรือ เลขประจำตัว/Tax ID 13 หลัก"
          />
        </div>
      </Modal>

      {/* Bank Modal — shared for add + edit (mode driven by editingBankId) */}
      <Modal
        open={showBankForm}
        onClose={() => !savingBank && resetBankForm()}
        title={editingBankId ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีธนาคาร'}
        size="md"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" disabled={savingBank} onClick={resetBankForm}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={savingBank}
              disabled={!bankForm.bank_code || !bankForm.account_number.trim() || !bankForm.account_name.trim()}
              onClick={handleSaveBank}
            >
              บันทึก
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          {/* Bank dropdown — custom because options include logo + brand color */}
          <div ref={bankDropdownRef} className="relative">
            <label className="field-label">ธนาคาร <span className="text-red-500">*</span></label>
            <button
              type="button"
              onClick={() => setBankDropdownOpen(!bankDropdownOpen)}
              className="w-full h-10 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-left flex items-center gap-2 bg-white dark:bg-slate-700 hover:border-gray-400 dark:hover:border-slate-500 transition-colors"
            >
              {bankForm.bank_code ? (
                <>
                  {getBankByCode(bankForm.bank_code)?.logo ? (
                    <img src={getBankByCode(bankForm.bank_code)!.logo} alt="" className="w-5 h-5 rounded-full flex-shrink-0 object-contain" />
                  ) : (
                    <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: getBankByCode(bankForm.bank_code)?.color }} />
                  )}
                  <span className="text-sm text-gray-900 dark:text-white">{getBankByCode(bankForm.bank_code)?.name_th}</span>
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
                    onClick={() => { setBankForm(prev => ({ ...prev, bank_code: b.code })); setBankDropdownOpen(false); }}
                    className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left ${bankForm.bank_code === b.code ? 'bg-primary/10' : ''}`}
                  >
                    {b.logo ? <img src={b.logo} alt={b.name_th} className="w-5 h-5 rounded-full flex-shrink-0 object-contain" /> : <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />}
                    <span className="text-sm text-gray-900 dark:text-white">{b.name_th}</span>
                    <span className="text-xs text-gray-400 ml-auto">{b.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <FormInput
            label="เลขที่บัญชี"
            required
            value={bankForm.account_number}
            onChange={(e) => setBankForm(prev => ({ ...prev, account_number: e.target.value }))}
            placeholder="xxx-x-xxxxx-x"
          />
          <FormInput
            label="ชื่อบัญชี"
            required
            value={bankForm.account_name}
            onChange={(e) => setBankForm(prev => ({ ...prev, account_name: e.target.value }))}
            placeholder="ชื่อ-สกุล หรือ ชื่อบริษัท"
          />
        </div>
      </Modal>

      {confirmDialog}
    </Layout>
  );
}
