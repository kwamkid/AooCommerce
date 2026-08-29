'use client';

// แท็บ "เชื่อมต่อ Marketplace" ของหน้า /settings/sales-channels
// (ย้ายมาจาก /settings/integrations เดิม — path เก่า redirect มาที่นี่)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { ShoppingBag, RefreshCw, Clock, PackageSearch, Warehouse } from 'lucide-react';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import { ExportButton, ImportButton } from '@/components/ui/ExportImportButton';
import Alert from '@/components/ui/Alert';
import MarketplaceQuotaPausedAlert from '@/components/ui/MarketplaceQuotaPausedAlert';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import SaveButton from '@/components/ui/SaveButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import MarketplaceAccountCard, { SyncRangeSelect } from './MarketplaceAccountCard';
import { useMarketplaceAccounts, type MarketplaceAccount } from './useMarketplaceAccounts';

interface MarketplaceConnectionsProps {
  // Badge-tab เลือกดูทีละแพลตฟอร์ม — state อยู่ที่ parent เพราะปุ่ม
  // "เชื่อมต่อร้าน X" อยู่บน PageHeader ของหน้า (ตำแหน่งเดียวกับปุ่ม "+ เพิ่ม")
  activePlatform: 'shopee' | 'tiktok' | 'lazada';
  onPlatformChange: (platform: 'shopee' | 'tiktok' | 'lazada') => void;
  // flow เชื่อมแชท (promptChatConnect) ตั้ง loading ให้ปุ่มบน PageHeader
  setConnecting: (value: boolean) => void;
}

export default function MarketplaceConnections({
  activePlatform, onPlatformChange, setConnecting,
}: MarketplaceConnectionsProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  // fetch เดียวได้ทุก platform (แทน 3 calls เดิม) — refetch หลัง write ใดๆ
  const {
    shopee: shopeeAccounts, tiktok: tiktokAccounts, lazada: lazadaAccounts,
    loading, refetch, patchAccount,
  } = useMarketplaceAccounts(can(userProfile?.roles, 'settings.access'));
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncRange, setSyncRange] = useState<Record<string, number>>({}); // accountId → days
  const [refreshingLogoId, setRefreshingLogoId] = useState<string | null>(null);
  // ตั้งโลโก้เองด้วย URL — สำหรับร้านที่ API ของ marketplace ไม่คืนโลโก้มาให้เลย
  const [logoModal, setLogoModal] = useState<{ id: string; name: string; url: string } | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0); // 0-100
  const [syncPhaseLabel, setSyncPhaseLabel] = useState('');
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cleanUrl = '/settings/sales-channels?tab=marketplace';
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      refetch();
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('tiktok') === 'connected') {
      showToast('เชื่อมต่อ TikTok Shop สำเร็จ', 'success');
      refetch();
      onPlatformChange('tiktok');
      const askChat = params.get('chat') === 'prompt';
      window.history.replaceState({}, '', cleanUrl);
      if (askChat) promptChatConnect('tiktok');
    } else if (params.get('success') === 'lazada_connected') {
      showToast('เชื่อมต่อ Lazada สำเร็จ', 'success');
      refetch();
      onPlatformChange('lazada');
      const askChat = params.get('chat') === 'prompt';
      window.history.replaceState({}, '', cleanUrl);
      if (askChat) promptChatConnect('lazada');
    } else if (params.get('error')) {
      const err = params.get('error');
      const messages: Record<string, string> = {
        shopee_auth_failed: 'เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่',
        shopee_save_failed: 'เชื่อมต่อ Shopee ผ่าน แต่บันทึกร้านไม่สำเร็จ — กรุณาแจ้งผู้ดูแลระบบ',
        tiktok_auth_failed: 'เชื่อมต่อ TikTok Shop ไม่สำเร็จ กรุณาลองใหม่',
        missing_params: 'ข้อมูลไม่ครบ กรุณาลองใหม่',
        no_shops: 'ไม่พบร้านค้าในบัญชีนี้',
        lazada_token_exchange: 'เชื่อมต่อ Lazada ไม่สำเร็จ กรุณาลองใหม่',
      };
      showToast(messages[err || ''] || 'เกิดข้อผิดพลาด', 'error');
      window.history.replaceState({}, '', cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // เชื่อมร้านสำเร็จแล้ว → ถามต่อว่าจะเชื่อมแชทด้วยมั้ย (app แชทแยกจาก app
  // ออเดอร์ — บางร้านไม่ใช้แชท / บางร้านเชื่อมไว้แล้ว จึงไม่ต่อขาอัตโนมัติ)
  // callback ส่ง chat=prompt มาเฉพาะเมื่อยังมีร้านที่ไม่มี token แชทเท่านั้น
  const promptChatConnect = async (platform: 'tiktok' | 'lazada') => {
    const label = platform === 'tiktok' ? 'TikTok Shop' : 'Lazada';
    const ok = await confirm({
      title: `เชื่อมต่อแชท ${label} ต่อเลยหรือไม่?`,
      description:
        `ถ้าต้องการรับ-ส่งแชท ${label} ในหน้ารวมแชท ต้องกดอนุญาตเพิ่มอีกหนึ่งครั้ง — ข้ามไปก่อนได้ แล้วมาเชื่อมทีหลังที่ ตั้งค่า > ช่องทางแชท แท็บ ${label}`,
      confirmLabel: 'เชื่อมต่อแชท',
      cancelLabel: 'ไว้ทีหลัง',
    });
    if (!ok) return;
    setConnecting(true);
    try {
      const res = await apiFetch(`/api/${platform}/oauth/auth-url?app=chat`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
      showToast('ไม่สามารถสร้างลิงก์เชื่อมต่อได้', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setConnecting(false);
  };

  // Helper: read SSE stream from fetch response
  const readSSEStream = async (
    response: Response,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal
  ) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              onEvent(JSON.parse(line.slice(6)));
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (e) {
      if (signal?.aborted) return; // cancelled by user
      throw e;
    }
  };

  const handleCancelSync = async () => {
    const ok = await confirm({ title: 'ต้องการยกเลิกการ sync?' }); if (!ok) return;
    syncAbortRef.current?.abort();
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังเชื่อมต่อ...');
    const controller = new AbortController();
    syncAbortRef.current = controller;

    const days = syncRange[accountId] || 1;
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - days * 24 * 60 * 60;
    try {
      const res = await apiFetch('/api/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId, time_from: timeFrom, time_to: now }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }

      let result: Record<string, unknown> = {};

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          const phase = event.phase as string;
          const current = event.current as number;
          const total = event.total as number | null;
          const label = event.label as string;
          setSyncPhaseLabel(label);

          if (phase === 'collecting') {
            setSyncProgress(Math.min(5 + (current % 10), 15));
          } else if (phase === 'processing' && total) {
            setSyncProgress(Math.round((current / total) * 80) + 15);
          }
        } else if (event.type === 'done') {
          result = event;
          setSyncProgress(100);
          setSyncPhaseLabel('เสร็จสิ้น');
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'Sync ไม่สำเร็จ', 'error');
        }
      }, controller.signal);

      if (controller.signal.aborted) {
        showToast('ยกเลิกการ sync แล้ว', 'error');
        return;
      }

      // Brief pause to show 100%
      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.orders_created as number) > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
        if ((result.orders_updated as number) > 0) parts.push(`อัพเดทคำสั่งซื้อ ${result.orders_updated}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
        showToast(`Sync สำเร็จ: ${summary}`, 'success');
        refetch();
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast('เกิดข้อผิดพลาดในการ sync', 'error');
      }
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  // ดึงยอดสต็อกจาก Shopee ลงคลัง default — ตั้งยอดตั้งต้น (เติมเฉพาะช่องที่ยอด 0)
  const handlePullStock = async (accountId: string, shopName: string) => {
    const ok = await confirm({
      title: `ดึงสต็อกจาก Shopee — ${shopName}?`,
      description: 'ระบบจะอ่านยอดคงเหลือทุกสินค้าที่ผูกกับร้านนี้จาก Shopee มาใส่คลังหลัก โดยเติมเฉพาะรายการที่คลังเรายังเป็น 0 — ยอดที่ตั้ง/นับไว้แล้วจะไม่ถูกทับ (ใช้ ~30 API calls ต่อร้าน)',
      confirmLabel: 'ดึงสต็อก',
    });
    if (!ok) return;

    setSyncingId(accountId);
    try {
      const res = await apiFetch('/api/shopee/products/pull-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || data.errors?.[0] || 'ดึงสต็อกไม่สำเร็จ', 'error');
        return;
      }
      showToast(`ดึงสต็อกสำเร็จ — เติมให้ ${data.filled} รายการ (ข้าม ${data.skipped_nonzero} รายการที่มียอดอยู่แล้ว)`, 'success');
    } catch {
      showToast('ดึงสต็อกไม่สำเร็จ', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncIncomplete = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังค้นหาออเดอร์ที่ยังไม่สมบูรณ์...');
    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      const res = await apiFetch('/api/shopee/sync-incomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }

      let result: Record<string, unknown> = {};

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          const phase = event.phase as string;
          const current = event.current as number;
          const total = event.total as number | null;
          const label = event.label as string;
          setSyncPhaseLabel(label);

          if (phase === 'collecting') {
            setSyncProgress(Math.min(5 + (current % 10), 15));
          } else if (phase === 'processing' && total) {
            setSyncProgress(Math.round((current / total) * 80) + 15);
          }
        } else if (event.type === 'done') {
          result = event;
          setSyncProgress(100);
          setSyncPhaseLabel('เสร็จสิ้น');
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'Sync ไม่สำเร็จ', 'error');
        }
      }, controller.signal);

      if (controller.signal.aborted) {
        showToast('ยกเลิกการ sync แล้ว', 'error');
        return;
      }

      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.orders_created as number) > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
        if ((result.orders_updated as number) > 0) parts.push(`อัพเดทสถานะ ${result.orders_updated}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีการเปลี่ยนแปลง';
        showToast(`Sync สถานะค้างสำเร็จ: ${summary}`, 'success');
        refetch();
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast('เกิดข้อผิดพลาดในการ sync', 'error');
      }
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  // Sync แบบ POST ธรรมดา (TikTok/Lazada) — เดิมเป็นสองฟังก์ชัน byte-identical ต่างกัน 3 token
  const SIMPLE_SYNC = {
    tiktok: { url: '/api/tiktok/sync', label: 'กำลัง Sync TikTok Shop...' },
    lazada: { url: '/api/lazada/sync', label: 'กำลัง Sync Lazada...' },
  } as const;

  const handleSimpleSync = async (platform: 'tiktok' | 'lazada', accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(10);
    setSyncPhaseLabel(SIMPLE_SYNC[platform].label);
    const controller = new AbortController();
    syncAbortRef.current = controller;
    const days = syncRange[accountId] || 1;
    try {
      const res = await apiFetch(SIMPLE_SYNC[platform].url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, days_back: days }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }
      const result = await res.json();
      setSyncProgress(100);
      setSyncPhaseLabel('เสร็จสิ้น');
      await new Promise(r => setTimeout(r, 500));
      const parts: string[] = [];
      if (result.orders_created > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
      if (result.orders_updated > 0) parts.push(`อัพเดทคำสั่งซื้อ ${result.orders_updated}`);
      const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
      showToast(`Sync สำเร็จ: ${summary}`, 'success');
      refetch();
    } catch {
      showToast(controller.signal.aborted ? 'ยกเลิกการ sync แล้ว' : 'เกิดข้อผิดพลาดในการ sync', 'error');
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  const handleDisconnect = async (accountId: string) => {
    const ok = await confirm({ title: 'ต้องการยกเลิกการเชื่อมต่อร้านนี้?', variant: 'danger' }); if (!ok) return;
    setDisconnectingId(accountId);
    try {
      const res = await apiFetch(`/api/shopee/accounts?id=${accountId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('ยกเลิกการเชื่อมต่อสำเร็จ', 'success');
        refetch();
      } else {
        showToast('ไม่สามารถยกเลิกได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleRefreshLogo = async (accountId: string) => {
    setRefreshingLogoId(accountId);
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId }),
      });
      if (res.ok) {
        showToast('อัพเดทข้อมูลร้านสำเร็จ', 'success');
        refetch();
      } else {
        showToast('ไม่สามารถอัพเดทได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setRefreshingLogoId(null);
    }
  };

  const handleSaveLogoUrl = async () => {
    if (!logoModal) return;
    setSavingLogo(true);
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: logoModal.id, shop_logo: logoModal.url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(logoModal.url.trim() ? 'บันทึกโลโก้ร้านแล้ว' : 'ล้างโลโก้ร้านแล้ว', 'success');
        setLogoModal(null);
        refetch();
      } else {
        showToast(typeof data.error === 'string' ? data.error : 'บันทึกโลโก้ไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  // คลังของบริษัท — ใช้ทำตัวเลือก "ร้านนี้ตัดสต็อกจากคลังไหน"
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  useEffect(() => {
    apiFetch('/api/warehouses')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.warehouses || []);
        setWarehouses(list.filter((w: { is_active?: boolean }) => w.is_active !== false));
      })
      .catch(() => { /* ไม่มีคลัง = ไม่ต้องโชว์ตัวเลือก */ });
  }, []);
  const defaultWarehouseName = warehouses.find(w => w.is_default)?.name || '';

  /**
   * ตัวเลือก "ร้านนี้ตัด/ซิงค์สต็อกจากคลังไหน" — ใช้ร่วมทั้ง Shopee / TikTok / Lazada
   * โชว์เมื่อบริษัทมีมากกว่า 1 คลังเท่านั้น (คลังเดียวไม่มีอะไรให้เลือก ไม่ต้องรก)
   */
  const warehousePicker = (account: MarketplaceAccount) => {
    if (warehouses.length <= 1) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-gray-700 dark:text-slate-300 flex items-center gap-1">
          <Warehouse className="w-3.5 h-3.5" />
          คลังที่ตัด/ซิงค์สต็อก
        </span>
        <div className="w-64">
          <FormSelect
            size="sm"
            value={account.warehouse_id || ''}
            onChange={v => handleSelectWarehouse(account.id, v)}
            options={[
              { id: '', label: defaultWarehouseName ? `ใช้คลังหลัก (${defaultWarehouseName})` : 'ใช้คลังหลัก' },
              ...warehouses.map(w => ({ id: w.id, label: w.name })),
            ]}
          />
        </div>
        {!account.warehouse_id && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ยังไม่ได้เลือก — ออเดอร์ร้านนี้ตัดสต็อกจากคลังหลัก
          </span>
        )}
      </div>
    );
  };

  const handleSelectWarehouse = async (accountId: string, warehouseId: string) => {
    const all = [...shopeeAccounts, ...tiktokAccounts, ...lazadaAccounts];
    const prev = all.find(a => a.id === accountId)?.warehouse_id ?? null;
    const next = warehouseId || null;
    patchAccount(accountId, { warehouse_id: next });
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, warehouse_id: next }),
      });
      if (!res.ok) {
        patchAccount(accountId, { warehouse_id: prev });
        showToast('เปลี่ยนคลังไม่สำเร็จ', 'error');
      } else {
        showToast('บันทึกคลังของร้านนี้แล้ว');
      }
    } catch {
      patchAccount(accountId, { warehouse_id: prev });
      showToast('เปลี่ยนคลังไม่สำเร็จ', 'error');
    }
  };

  const handleToggleSync = async (accountId: string, field: 'auto_sync_stock' | 'auto_sync_product_info', value: boolean) => {
    // Optimistic update
    patchAccount(accountId, { [field]: value });
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, [field]: value }),
      });
      if (!res.ok) {
        patchAccount(accountId, { [field]: !value });
        showToast('ไม่สามารถอัพเดทได้', 'error');
      }
    } catch {
      patchAccount(accountId, { [field]: !value });
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const platformChip = (
    id: 'shopee' | 'tiktok' | 'lazada',
    label: string,
    count: number,
    activeClass: string,
  ) => (
    <button
      type="button"
      onClick={() => onPlatformChange(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        activePlatform === id
          ? activeClass
          : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
      }`}
    >
      <PlatformIcon id={id} size={16} />
      {label}
      {count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{count}</span>
      )}
    </button>
  );

  return (
    <div>
      {/* Platform badge tabs — เลือกดูทีละแพลตฟอร์ม
          (ปุ่ม "เชื่อมต่อร้าน X" อยู่บน PageHeader ของ parent) */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {platformChip('shopee', 'Shopee', shopeeAccounts.length, 'border-shopee text-shopee bg-shopee/10')}
        {platformChip('tiktok', 'TikTok Shop', tiktokAccounts.length, 'border-gray-900 text-gray-900 bg-gray-900/5 dark:border-white dark:text-white dark:bg-white/10')}
        {platformChip('lazada', 'Lazada', lazadaAccounts.length, 'border-[#0F146E] text-[#0F146E] bg-[#0F146E]/10 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-400/10')}
      </div>

      {/* Quota paused banner — ทุก platform ที่ breaker เปิด */}
      <div className="mb-4 empty:mb-0 space-y-3">
        <MarketplaceQuotaPausedAlert note="ปุ่ม Sync ของ platform ที่โดนพักจะใช้ไม่ได้จนกว่าโควตาจะ reset" />
      </div>

      {/* ===== SHOPEE ===== */}
      {activePlatform === 'shopee' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          {shopeeAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            const isRefreshingLogo = refreshingLogoId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Shop #${account.shop_id}`}
                showProductCount
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <button
                    onClick={() => handleRefreshLogo(account.id)}
                    disabled={isRefreshingLogo}
                    className="relative flex-shrink-0 group"
                    title="กดเพื่ออัพเดทรูปร้าน"
                  >
                    {/* icon รองพื้น + img ทับ + onError ซ่อนตัวเอง — URL ตายไม่โชว์รูปแตก */}
                    <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-shopee" />
                    </div>
                    {(account.metadata?.shop_logo as string) && (
                      <img
                        src={account.metadata.shop_logo as string}
                        alt={account.shop_name || 'Shop'}
                        className="absolute inset-0 w-10 h-10 rounded-lg object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    {/* ระหว่าง refresh spinner ต้องค้างให้เห็น ไม่ใช่รอ hover */}
                    <div className={`absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center transition-opacity ${isRefreshingLogo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <RefreshCw className={`w-4 h-4 text-white ${isRefreshingLogo ? 'animate-spin' : ''}`} />
                    </div>
                  </button>
                }
              >
                {/* Details */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                  <span>Shop ID: {account.shop_id}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Sync ล่าสุด: {formatThaiDateTime(account.last_sync_at)}
                  </span>
                  <span>เชื่อมต่อเมื่อ: {formatThaiDateTime(account.created_at)}</span>
                </div>

                {warehousePicker(account)}

                {/* Auto-Sync Toggles */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={account.auto_sync_stock !== false}
                      onChange={v => handleToggleSync(account.id, 'auto_sync_stock', v)}
                      aria-label="Sync Stock อัตโนมัติ"
                    />
                    <span className="text-xs text-gray-700 dark:text-slate-300">Sync Stock อัตโนมัติ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={account.auto_sync_product_info !== false}
                      onChange={v => handleToggleSync(account.id, 'auto_sync_product_info', v)}
                      aria-label="Sync ชื่อ/ราคา อัตโนมัติ"
                    />
                    <span className="text-xs text-gray-700 dark:text-slate-300">Sync ชื่อ/ราคา อัตโนมัติ</span>
                  </div>
                </div>

                {/* Sync Controls */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSync(account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSyncIncomplete(account.id)}
                  >
                    Sync สถานะค้าง
                  </Button>
                  <ImportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/shopee/import?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    นำเข้าสินค้าจาก Shopee
                  </ImportButton>
                  <Button
                    variant="secondary"
                    icon={<PackageSearch className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handlePullStock(account.id, account.shop_name || `Shop #${account.shop_id}`)}
                  >
                    ดึงสต็อกจาก Shopee
                  </Button>
                  <ExportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/shopee/export?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    ส่งสินค้าไป Shopee
                  </ExportButton>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* ===== TIKTOK ===== */}
      {activePlatform === 'tiktok' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          {tiktokAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            const region = (account.metadata?.region as string) || '';
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `TikTok Shop #${account.shop_id}`}
                titleExtra={region ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 uppercase">
                    {region}
                  </span>
                ) : undefined}
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  /* โลโก้มาจาก chat sync (participants role=SHOP) — ยังไม่เชื่อมแชท = icon */
                  <div className="relative w-10 h-10 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="w-5 h-5 text-white" />
                    {(account.metadata?.shop_logo as string) && (
                      <img
                        src={account.metadata.shop_logo as string}
                        alt={account.shop_name || 'TikTok Shop'}
                        className="absolute inset-0 w-10 h-10 rounded-lg object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                  </div>
                }
              >
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                  <span>Shop ID: {account.shop_id}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Sync ล่าสุด: {formatThaiDateTime(account.last_sync_at)}
                  </span>
                  <span>เชื่อมต่อเมื่อ: {formatThaiDateTime(account.created_at)}</span>
                </div>

                {warehousePicker(account)}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSimpleSync('tiktok', account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                  <ImportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/tiktok/import?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    นำเข้าสินค้าจาก TikTok
                  </ImportButton>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* ===== LAZADA ===== */}
      {activePlatform === 'lazada' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          <Alert tone="info">
            เชื่อมร้านแล้วเปิดรับ<b>แชท</b>ได้ที่{' '}
            <a href="/settings/chat-channels#lazada" className="underline font-medium">ตั้งค่า &gt; ช่องทาง Chat</a>
            {' '}— ออเดอร์เข้าอัตโนมัติผ่าน webhook + sync ทุก 15 นาที
          </Alert>
          {lazadaAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            const isRefreshingLogo = refreshingLogoId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Lazada #${account.shop_id}`}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <button
                    onClick={() => handleRefreshLogo(account.id)}
                    disabled={isRefreshingLogo}
                    className="relative flex-shrink-0 group"
                    title="กดเพื่ออัพเดทรูปร้าน"
                  >
                    {/* icon รองพื้น + img ทับ + onError ซ่อนตัวเอง — URL ตายไม่โชว์รูปแตก */}
                    <div className="w-10 h-10 rounded-lg bg-[#0F146E] flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-white" />
                    </div>
                    {(account.metadata?.shop_logo as string) && (
                      <img
                        src={account.metadata.shop_logo as string}
                        alt={account.shop_name || 'Lazada'}
                        className="absolute inset-0 w-10 h-10 rounded-lg object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    {/* ระหว่าง refresh spinner ต้องค้างให้เห็น ไม่ใช่รอ hover */}
                    <div className={`absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center transition-opacity ${isRefreshingLogo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <RefreshCw className={`w-4 h-4 text-white ${isRefreshingLogo ? 'animate-spin' : ''}`} />
                    </div>
                  </button>
                }
              >
                {warehousePicker(account)}

                <div className="flex flex-wrap items-center gap-2">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSimpleSync('lazada', account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                  <ImportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/lazada/import?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    นำเข้าสินค้าจาก Lazada
                  </ImportButton>
                  <Button
                    variant="ghost"
                    onClick={() => setLogoModal({
                      id: account.id,
                      name: account.shop_name || `Lazada #${account.shop_id}`,
                      url: (account.metadata?.shop_logo as string) || '',
                    })}
                  >
                    ตั้งโลโก้เอง
                  </Button>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* Loading Overlay for sync operations */}
      <LoadingOverlay
        isOpen={!!syncingId}
        title="กำลัง Sync คำสั่งซื้อ..."
        message={syncPhaseLabel}
        progress={syncProgress}
        onCancel={handleCancelSync}
      />
      <Modal
        open={!!logoModal}
        onClose={() => setLogoModal(null)}
        title="ตั้งโลโก้ร้านเอง"
        size="md"
        footer={
          <div className="modal-footer px-6 py-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogoModal(null)}>ยกเลิก</Button>
            <SaveButton loading={savingLogo} onClick={handleSaveLogoUrl} />
          </div>
        }
      >
        <div className="px-6 py-5 space-y-3">
          <p className="subtitle-text text-gray-500">
            ใช้เมื่อ marketplace ไม่ส่งโลโก้มาทาง API — คัดลอกลิงก์รูปโลโก้จากหน้าตั้งค่าร้าน
            (Seller Center) มาวางที่นี่ · เว้นว่างเพื่อล้างรูป
          </p>
          <FormInput
            label={`โลโก้ของ ${logoModal?.name || ''}`}
            placeholder="https://..."
            value={logoModal?.url || ''}
            onChange={e => setLogoModal(prev => (prev ? { ...prev, url: e.target.value } : prev))}
          />
          {logoModal?.url?.trim() && (
            <img
              src={logoModal.url.trim()}
              alt="ตัวอย่างโลโก้"
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-slate-700"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
