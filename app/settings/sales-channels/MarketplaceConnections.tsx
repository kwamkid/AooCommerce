'use client';

// แท็บ "เชื่อมต่อ Marketplace" ของหน้า /settings/sales-channels
// (ย้ายมาจาก /settings/integrations เดิม — path เก่า redirect มาที่นี่)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import Tooltip from '@/components/ui/Tooltip';
import { ChevronDown, Clock, ImagePlus, Link2, Loader2, PackageSearch, RefreshCw, RotateCw, ShoppingBag, Trash2, Warehouse } from 'lucide-react';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import { ExportButton, ImportButton } from '@/components/ui/ExportImportButton';
import Alert from '@/components/ui/Alert';
import MarketplaceQuotaPausedAlert from '@/components/ui/MarketplaceQuotaPausedAlert';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import SaveButton from '@/components/ui/SaveButton';
import ImageDropzone from '@/components/ui/ImageDropzone';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PlatformIcon from '@/components/ui/PlatformIcon';
import FilterChips from '@/components/ui/FilterChips';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import MarketplaceAccountCard, { SyncRangeSelect } from './MarketplaceAccountCard';
import { useMarketplaceAccounts, type MarketplaceAccount, type MarketplacePlatform } from './useMarketplaceAccounts';

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
  // แพ็กเกจที่ไม่มีระบบคลัง = ไม่ต้องโชว์อะไรที่เกี่ยวกับสต็อกเลย (server ก็ปฏิเสธอยู่แล้ว)
  const { gates } = useFeatures();
  const stockEnabled = gates.stockEnabled;
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
  // ตั้งโลโก้เองด้วย URL — สำหรับร้านที่ API ของ marketplace ไม่คืนโลโก้มาให้เลย
  const [logoModal, setLogoModal] = useState<
    {
      id: string; name: string; currentUrl: string;
      platform: MarketplacePlatform | null;
      canLinkProfile?: boolean;
      /** choose = หน้าเลือกวิธี · upload = หน้าลากไฟล์ */
      step: 'choose' | 'upload';
    } | null
  >(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [linkingProfile, setLinkingProfile] = useState(false);
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
      // ขาแชทต่อให้เองใน callback แล้ว (ไม่มี dialog ถามคั่น) — มาถึงตรงนี้ได้
      // แปลว่าไม่ต้องต่อแชท เหลือแค่ชวนดึงโลโก้จากบัญชี TikTok
      const logoAccount = params.get('logo') === 'prompt' ? params.get('logo_account') : null;
      window.history.replaceState({}, '', cleanUrl);
      if (logoAccount) promptProfileConnect(logoAccount);
    } else if (params.get('success') === 'lazada_connected') {
      showToast('เชื่อมต่อ Lazada สำเร็จ', 'success');
      refetch();
      onPlatformChange('lazada');
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('tiktok_profile')) {
      // กลับจาก Login Kit (ขาดึงรูปโปรไฟล์) — คนละขากับการเชื่อมร้าน
      const r = params.get('tiktok_profile') || '';
      const profileMessages: Record<string, string> = {
        connected: 'ดึงรูปจากบัญชี TikTok มาเป็นโลโก้ร้านแล้ว',
        cancelled: 'ยกเลิกการเชื่อมบัญชี TikTok',
        error_no_avatar: 'บัญชี TikTok นี้ยังไม่ได้ตั้งรูปโปรไฟล์ — ตั้งรูปในแอป TikTok แล้วลองใหม่',
        error_bad_avatar: 'รูปโปรไฟล์ที่ TikTok ส่งมาเปิดไม่ได้ — คงรูปเดิมไว้',
        error_expired: 'ลิงก์หมดอายุ (เกิน 10 นาที) — กดเชื่อมใหม่อีกครั้ง',
        error_no_account: 'ไม่พบร้านที่จะแปะรูป',
        error_failed: 'เชื่อมบัญชี TikTok ไม่สำเร็จ',
      };
      const okResult = r === 'connected';
      // บอกชื่อบัญชีที่ดึงมาเสมอ — ถ้าเบราว์เซอร์ค้างบัญชีอื่นไว้ จะได้เห็นตั้งแต่วินาทีแรก
      // ว่าเป็นคนละร้าน แทนที่จะไปเจอเองตอนโลโก้ผิดขึ้นบนการ์ด
      const who = params.get('profile_name');
      showToast(
        okResult && who
          ? `ใช้รูปจากบัญชี "${who}" เป็นโลโก้ร้านแล้ว — ถ้าไม่ใช่บัญชีของร้านนี้ กดที่โลโก้เพื่อแก้`
          : profileMessages[r] || (r.startsWith('error_auth_') ? 'เซสชันหลุดระหว่างเชื่อมต่อ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง' : `เชื่อมบัญชีไม่สำเร็จ (${r})`),
        okResult ? 'success' : 'error'
      );
      if (okResult) refetch();
      onPlatformChange('tiktok');
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('error')) {
      const err = params.get('error');
      const messages: Record<string, string> = {
        shopee_auth_failed: 'เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่',
        shopee_save_failed: 'เชื่อมต่อ Shopee ผ่าน แต่บันทึกร้านไม่สำเร็จ — กรุณาแจ้งผู้ดูแลระบบ',
        tiktok_auth_failed: 'เชื่อมต่อ TikTok Shop ไม่สำเร็จ กรุณาลองใหม่',
        missing_params: 'ข้อมูลไม่ครบ กรุณาลองใหม่',
        no_shops: 'ไม่พบร้านค้าในบัญชีนี้',
        lazada_token_exchange: 'เชื่อมต่อ Lazada ไม่สำเร็จ กรุณาลองใหม่',

        // ล้มตั้งแต่ตรวจสิทธิ์ ยังไม่ทันคุยกับแพลตฟอร์ม — ต้องบอกว่าให้ทำอะไรต่อ
        // ไม่งั้นผู้ใช้เห็นแค่ "เกิดข้อผิดพลาด" แล้วเข้าใจว่าเชื่อมต่อสำเร็จไปแล้ว
        auth_invalid_state: 'ลิงก์เชื่อมต่อหมดอายุ (เกิน 10 นาที) — กดเชื่อมต่อใหม่อีกครั้ง',
        auth_not_authenticated: 'เซสชันหลุดระหว่างเชื่อมต่อ — เข้าสู่ระบบใหม่แล้วกดเชื่อมต่ออีกครั้ง',
        auth_user_mismatch: 'เริ่มเชื่อมต่อด้วยบัญชีหนึ่งแต่จบด้วยอีกบัญชี — ใช้บัญชีเดิมตลอดขั้นตอน',
        auth_not_member: 'บัญชีนี้ไม่มีสิทธิ์เชื่อมต่อร้านของบริษัทนี้',
      };
      // reason ใหม่จากฝั่ง callback จะได้ไม่กลายเป็นข้อความเปล่า ๆ อีก
      showToast(messages[err || ''] || `เชื่อมต่อไม่สำเร็จ (${err})`, 'error');
      window.history.replaceState({}, '', cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  /** ขาที่สาม — โลโก้ร้าน · ถามต่อจากขาแชทเพื่อให้การเพิ่มร้านจบในลำดับเดียว */
  const promptProfileConnect = async (accountId: string) => {
    const ok = await confirm({
      title: 'ดึงโลโก้ร้านจากบัญชี TikTok ต่อเลยหรือไม่?',
      description:
        'TikTok Shop ไม่เปิด API โลโก้ร้าน ต้องกดอนุญาตอีกครั้งเพื่อใช้รูปโปรไฟล์ของบัญชีเจ้าของร้านแทน — ข้ามไปก่อนได้ แล้วมากดที่รูปโลโก้ในการ์ดร้านทีหลัง\n\nTikTok จะใช้บัญชีที่ล็อกอินค้างอยู่ในเบราว์เซอร์ทันทีโดยไม่ให้เลือก — ถ้าดูแลหลายร้าน ให้ออกจากระบบ tiktok.com ก่อน',
      confirmLabel: 'ดึงโลโก้',
      cancelLabel: 'ไว้ทีหลัง',
    });
    if (!ok) return;
    setConnecting(true);
    await handleLinkTikTokProfile(accountId);
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

  // เชื่อมต่อใหม่ — พาไป OAuth ของร้านนั้น · ใช้ตอนเปิด scope เพิ่มหรือ token ตาย
  // (scope ของแพลตฟอร์มผูกกับ token ตอน authorize เปิด scope เฉย ๆ ไม่พอ ต้องขอ token ใหม่)
  const handleReconnect = async (platform: 'shopee' | 'tiktok' | 'lazada') => {
    setConnecting(true);
    try {
      const res = await apiFetch(`/api/${platform}/oauth/auth-url`);
      if (!res.ok) { showToast('สร้างลิงก์เชื่อมต่อไม่ได้', 'error'); setConnecting(false); return; }
      const { url } = await res.json();
      window.location.href = url;   // สำเร็จแล้วเด้งออกไปเลย ไม่ต้อง reset loading
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
      setConnecting(false);
    }
  };

  // ดึงชื่อร้าน+โลโก้ใหม่จากแพลตฟอร์ม โดยไม่ต้องผ่าน OAuth และไม่แตะ token
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  // พาไปหน้าอนุญาตของ TikTok — กลับมาที่ /api/tiktok/profile/callback ซึ่งจะเก็บรูปให้เอง
  const handleLinkTikTokProfile = async (accountId: string) => {
    setLinkingProfile(true);
    try {
      const res = await apiFetch(`/api/tiktok/profile/auth-url?account_id=${accountId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        showToast(data.error || 'สร้างลิงก์เชื่อมต่อไม่ได้', 'error');
        setLinkingProfile(false);
        return;
      }
      window.location.href = data.url;   // ออกจากหน้าไปเลย ไม่ต้อง reset loading
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
      setLinkingProfile(false);
    }
  };

  /** กดที่รูปโลโก้ = เปิดตัวเลือก (ดึงจากแพลตฟอร์ม / ดึงจากบัญชี TikTok / อัปโหลดเอง)
   *  เดิมกดแล้วยิง resync ทันที ซึ่งแปลว่าร้านที่มีโลโก้อยู่แล้วจะแก้อะไรไม่ได้เลย */
  const openLogoModal = (account: MarketplaceAccount) => {
    setLogoFile(null);
    setLogoModal({
      id: account.id,
      name: account.shop_name || 'ร้าน',
      currentUrl: (account.metadata?.shop_logo as string) || '',
      platform: account.platform,
      canLinkProfile: account.profile_link_available,
      step: 'choose',
    });
  };


  /** ทางเลือกในหน้าแรกของโมดัลโลโก้ — คำอธิบายต้องตรงกับความจริงของแต่ละแพลตฟอร์ม */
  const logoOptions = (m: NonNullable<typeof logoModal>) => {
    // ⚠️ "ดึงจากแพลตฟอร์ม" ได้ผลไม่เท่ากัน — เขียนป้ายรวม ๆ ว่าได้โลโก้ด้วยคือโกหก
    //    Shopee (/shop/get_profile) คืนโลโก้จริง · Lazada (/seller/get) คืนบางร้าน
    //    TikTok ไม่คืนเลย เหลือแค่ชื่อร้าน (ยืนยันแล้ว — ดู lib/marketplace/shop-info.ts)
    const fetchDesc = m.platform === 'tiktok'
      ? 'ได้เฉพาะชื่อร้าน — TikTok ไม่เปิด API โลโก้'
      : m.platform === 'lazada'
        ? 'อัปเดตชื่อร้าน + โลโก้ (Lazada บางร้านไม่ส่งโลโก้มา)'
        : 'อัปเดตชื่อร้าน + โลโก้ล่าสุดจาก Shopee';

    const opts: {
      key: string; label: string; description: string; icon: React.ReactNode;
      onClick: () => void; danger?: boolean; busy?: boolean;
    }[] = [
      {
        key: 'resync',
        label: 'ดึงจากแพลตฟอร์ม',
        description: fetchDesc,
        icon: <RefreshCw className="w-5 h-5" />,
        busy: resyncingId === m.id,
        onClick: () => handleResyncInfo(m.id),
      },
    ];
    if (m.canLinkProfile) {
      opts.push({
        key: 'tiktok-profile',
        label: 'ดึงรูปจากบัญชี TikTok',
        description: 'ใช้รูปโปรไฟล์ของบัญชีเจ้าของร้าน — ต้องกดอนุญาตที่ TikTok',
        icon: <PlatformIcon id="tiktok" size={20} />,
        busy: linkingProfile,
        onClick: () => promptProfileConnect(m.id),
      });
    }
    opts.push({
      key: 'upload',
      label: 'อัปโหลดรูปเอง',
      description: 'ลากไฟล์มาวางหรือเลือกจากเครื่อง — ได้รูปตรงที่สุด',
      icon: <ImagePlus className="w-5 h-5" />,
      onClick: () => setLogoModal(prev => (prev ? { ...prev, step: 'upload' } : prev)),
    });
    if (m.currentUrl) {
      opts.push({
        key: 'clear',
        label: 'ลบรูปโลโก้',
        description: 'กลับไปใช้ไอคอนแพลตฟอร์มแทน',
        icon: <Trash2 className="w-5 h-5" />,
        danger: true,
        onClick: () => handleClearLogo(m.id),
      });
    }
    return opts;
  };

  /** รูปโลโก้ — เนื้อในของปุ่มที่เปิดโมดัล (ห้ามใส่ <button> ซ้อนอีกชั้น)
   *
   *  ร้านที่ยังไม่มีโลโก้ (Lazada บางร้าน /seller/get ไม่ส่ง logo_url มาเลย)
   *  ต้อง **เห็นได้เลยว่ากดใส่เองได้** — ของเดิมเป็นเงาจาง ๆ ตอน hover เท่านั้น
   *  บนมือถือไม่มี hover ด้วยซ้ำ ผู้ใช้จึงไม่มีทางรู้ว่ากดได้ */
  const shopAvatar = (account: MarketplaceAccount, tile: string, iconCls: string, fallbackAlt: string) => {
    const logo = (account.metadata?.shop_logo as string) || '';
    return (
      <span className="relative block w-10 h-10 flex-shrink-0 group">
        {/* icon รองพื้น + img ทับ + onError ซ่อนตัวเอง — URL ตายไม่โชว์รูปแตก */}
        <span className={`w-10 h-10 rounded-lg ${tile} flex items-center justify-center ${logo ? '' : 'border border-dashed border-gray-300 dark:border-slate-600'}`}>
          <ShoppingBag className={iconCls} />
        </span>
        {logo && (
          <img
            src={logo}
            alt={account.shop_name || fallbackAlt}
            className="absolute inset-0 w-10 h-10 rounded-lg object-cover"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {/* ยังไม่มีโลโก้ → ป้าย + มุมขวาล่าง เห็นตลอดเวลา ไม่ต้อง hover */}
        {!logo && resyncingId !== account.id && (
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
            <ImagePlus className="w-2.5 h-2.5" />
          </span>
        )}
        {/* ระหว่างดึงข้อมูล spinner ต้องค้างให้เห็น ไม่ใช่รอ hover */}
        <span className={`absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center transition-opacity ${resyncingId === account.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <ChevronDown className={`w-4 h-4 text-white ${resyncingId === account.id ? 'animate-pulse' : ''}`} />
        </span>
      </span>
    );
  };

  const handleClearLogo = async (accountId: string) => {
    try {
      const res = await apiFetch('/api/marketplace/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, shop_logo: '' }),
      });
      if (res.ok) {
        showToast('ลบโลโก้ร้านแล้ว', 'success');
        closeLogoModal();
        refetch();
      }
      else showToast('ลบไม่สำเร็จ', 'error');
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
  };

  const handleResyncInfo = async (accountId: string) => {
    setResyncingId(accountId);
    try {
      const res = await apiFetch('/api/marketplace/accounts/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'อัปเดตข้อมูลร้านไม่สำเร็จ', 'error'); return; }
      refetch();
      // งานจบแล้วก็ปิดโมดัลไป — toast บอกผลอยู่แล้ว ค้างไว้เฉย ๆ ให้ต้องกดปิดเองอีกที
      // คือให้ผู้ใช้ทำงานซ้ำโดยไม่ได้อะไรเพิ่ม
      closeLogoModal();
      showToast(
        data.shop_logo
          ? 'ดึงข้อมูลร้านจากแพลตฟอร์มแล้ว'
          : data.note || 'อัปเดตชื่อร้านแล้ว — แพลตฟอร์มไม่ได้ส่งโลโก้มา',
        'success'
      );
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setResyncingId(null);
    }
  };

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
      const res = await apiFetch(`/api/marketplace/accounts?id=${accountId}`, {
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

  const closeLogoModal = () => { setLogoModal(null); setLogoFile(null); };

  const handleSaveLogo = async () => {
    if (!logoModal) return;
    setSavingLogo(true);
    try {
      let res: Response;
      if (logoFile) {
        // multipart — ห้ามตั้ง Content-Type เอง ต้องให้เบราว์เซอร์ใส่ boundary ให้
        const fd = new FormData();
        fd.append('file', logoFile);
        fd.append('account_id', logoModal.id);
        res = await apiFetch('/api/marketplace/accounts/logo', { method: 'POST', body: fd });
      } else {
        // ไม่ได้เลือกไฟล์ = ต้องการล้างรูปที่มีอยู่
        res = await apiFetch('/api/marketplace/accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: logoModal.id, shop_logo: '' }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(logoFile ? 'บันทึกโลโก้ร้านแล้ว' : 'ล้างโลโก้ร้านแล้ว', 'success');
        closeLogoModal();
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
    if (!stockEnabled || warehouses.length <= 1) return null;
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
    const account = all.find(a => a.id === accountId);
    const prev = account?.warehouse_id ?? null;
    const next = warehouseId || null;
    if (prev === next) return;

    // ย้ายคลังของร้านที่ผูกสินค้าไว้แล้ว = ยอดที่ส่งขึ้นร้านจะเปลี่ยนชุดทันที
    // ต้องบอกให้ครบว่าอะไรเปลี่ยนและอะไรไม่เปลี่ยน ก่อนให้กดยืนยัน
    // มีแต่ Shopee ที่ส่งสต็อกขึ้นร้านได้ตอนนี้ — TikTok/Lazada ยังไม่มี push stock
    // อย่าสัญญาในข้อความสิ่งที่ทำไม่ได้ และอย่ายิง route ของ Shopee ด้วย account ของ platform อื่น
    const canPushStock = !account?.platform || account.platform === 'shopee';
    const linked = canPushStock ? (account?.linked_product_count || 0) : 0;
    if ((account?.linked_product_count || 0) > 0) {
      const nameOf = (id: string | null) =>
        id ? (warehouses.find(w => w.id === id)?.name || 'คลังที่เลือก') : `คลังหลัก${defaultWarehouseName ? ` (${defaultWarehouseName})` : ''}`;
      const ok = await confirm({
        title: `ย้ายคลังของ ${account?.shop_name || 'ร้านนี้'} จาก ${nameOf(prev)} ไป ${nameOf(next)}?`,
        description:
          `• ออเดอร์ที่รับมาแล้วยังตัดสต็อกจากคลังเดิม — ระบบจำคลังไว้กับออเดอร์ตั้งแต่ตอนสร้าง จึงไม่กระทบของที่ยังไม่ได้ส่ง\n` +
          `• ออเดอร์ใหม่จะตัดจาก ${nameOf(next)} แทน\n` +
          (canPushStock
            ? `• ยอดที่ส่งขึ้นร้านจะกลายเป็นยอดของ ${nameOf(next)} — ถ้าของจริงยังอยู่ที่ ${nameOf(prev)} ต้องโอนย้ายเองที่เมนูคลังสินค้า\n` +
              `• หลังยืนยัน ระบบจะส่งยอดของคลังใหม่ขึ้นร้านให้ทันที (${linked} สินค้า ใช้โควตา Shopee ${linked} ครั้ง)`
            : `• ${account?.platform === 'tiktok' ? 'TikTok' : 'Lazada'} ยังไม่รองรับการส่งสต็อกขึ้นร้านจากระบบ — ยอดบนร้านต้องแก้เองที่ Seller Center`),
        confirmLabel: 'ย้ายคลัง',
        cancelLabel: 'ยกเลิก',
      });
      if (!ok) return;
    }

    patchAccount(accountId, { warehouse_id: next });
    try {
      const res = await apiFetch('/api/marketplace/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, warehouse_id: next }),
      });
      if (!res.ok) {
        patchAccount(accountId, { warehouse_id: prev });
        showToast('เปลี่ยนคลังไม่สำเร็จ', 'error');
      } else if (linked > 0) {
        // ส่งยอดของคลังใหม่ขึ้นร้านทันที ไม่งั้นร้านจะโชว์ยอดของคลังเดิมค้างไว้
        showToast(`บันทึกคลังแล้ว — กำลังส่งยอดของคลังใหม่ขึ้นร้าน (${linked} สินค้า)`);
        // ร้านใหญ่ยิงไม่จบใน request เดียว — route คืน next_cursor มาให้ทำต่อ
        let cursor: number | undefined;
        let pushedModels = 0;
        let failed = false;
        for (let round = 0; round < 20; round++) {
          const pushRes = await apiFetch('/api/shopee/products/push-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplace_account_id: accountId, cursor }),
          });
          const pushData = await pushRes.json().catch(() => ({}));
          if (!pushRes.ok) { failed = true; break; }
          pushedModels += pushData.updated_models || 0;
          if (!pushData.partial) { failed = !pushData.success; break; }
          cursor = pushData.next_cursor;
          showToast(pushData.message || `กำลังส่ง... (${pushData.done}/${pushData.total})`);
        }
        showToast(
          failed
            ? 'บันทึกคลังแล้ว แต่ส่งยอดขึ้นร้านไม่ครบ — กดซิงค์ซ้ำได้ที่หน้าสินค้า'
            : `ส่งยอดขึ้นร้านครบแล้ว (${pushedModels} รายการ)`,
          failed ? 'error' : 'success'
        );
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
      const res = await apiFetch('/api/marketplace/accounts', {
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

  return (
    <div>
      {/* Platform badge tabs — เลือกดูทีละแพลตฟอร์ม
          (ปุ่ม "เชื่อมต่อร้าน X" อยู่บน PageHeader ของ parent) */}
      <FilterChips
        className="mb-5"
        value={activePlatform}
        onChange={onPlatformChange}
        chips={[
          { id: 'shopee' as const, label: 'Shopee', count: shopeeAccounts.length, icon: <PlatformIcon id="shopee" size={16} />, activeClass: 'border-shopee text-shopee bg-shopee/10' },
          { id: 'tiktok' as const, label: 'TikTok Shop', count: tiktokAccounts.length, icon: <PlatformIcon id="tiktok" size={16} />, activeClass: 'border-gray-900 text-gray-900 bg-gray-900/5 dark:border-white dark:text-white dark:bg-white/10' },
          { id: 'lazada' as const, label: 'Lazada', count: lazadaAccounts.length, icon: <PlatformIcon id="lazada" size={16} />, activeClass: 'border-[#0F146E] text-[#0F146E] bg-[#0F146E]/10 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-400/10' },
        ]}
      />

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
            const isRefreshingLogo = resyncingId === account.id;
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
                  <Tooltip
                    text={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                    box="inline-flex"
                  >
                  <button
                    type="button"
                    onClick={() => openLogoModal(account)}
                    className="relative flex-shrink-0 rounded-lg"
                    aria-label={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                  >
                    {shopAvatar(account, 'bg-transparent', 'w-5 h-5 text-shopee', 'Shop')}
                  </button>
                </Tooltip>
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
                  {stockEnabled && (
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={account.auto_sync_stock !== false}
                        onChange={v => handleToggleSync(account.id, 'auto_sync_stock', v)}
                        aria-label="Sync Stock อัตโนมัติ"
                      />
                      <span className="text-xs text-gray-700 dark:text-slate-300">Sync Stock อัตโนมัติ</span>
                    </div>
                  )}
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
                    variant="ghost"
                    icon={<Link2 className="w-4 h-4" />}
                    onClick={() => handleReconnect('shopee')}
                    title="ขอสิทธิ์ใหม่จากแพลตฟอร์ม — ใช้เมื่อเปิด scope เพิ่มหรือ token หมดอายุ"
                  >
                    เชื่อมต่อใหม่
                  </Button>
                  {stockEnabled && (
                    <Button
                      variant="secondary"
                      icon={<PackageSearch className="w-4 h-4" />}
                      loading={isSyncing}
                      disabled={account.connection_status === 'expired'}
                      onClick={() => handlePullStock(account.id, account.shop_name || `Shop #${account.shop_id}`)}
                    >
                      ดึงสต็อกจาก Shopee
                    </Button>
                  )}
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
                  <Tooltip
                    text={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                    box="inline-flex"
                  >
                  <button
                    type="button"
                    onClick={() => openLogoModal(account)}
                    className="relative flex-shrink-0 rounded-lg"
                    aria-label={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                  >
                    {shopAvatar(account, 'bg-black', 'w-5 h-5 text-white', 'TikTok Shop')}
                  </button>
                </Tooltip>
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
                  <Button
                    variant="ghost"
                    icon={<Link2 className="w-4 h-4" />}
                    onClick={() => handleReconnect('tiktok')}
                    title="ขอสิทธิ์ใหม่จากแพลตฟอร์ม — ใช้เมื่อเปิด scope เพิ่มหรือ token หมดอายุ"
                  >
                    เชื่อมต่อใหม่
                  </Button>
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
            const isRefreshingLogo = resyncingId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Lazada #${account.shop_id}`}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <Tooltip
                    text={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                    box="inline-flex"
                  >
                  <button
                    type="button"
                    onClick={() => openLogoModal(account)}
                    className="relative flex-shrink-0 rounded-lg"
                    aria-label={(account.metadata?.shop_logo as string) ? 'เปลี่ยนโลโก้ร้าน' : 'ใส่โลโก้ร้าน'}
                  >
                    {shopAvatar(account, 'bg-[#0F146E]', 'w-5 h-5 text-white', 'Lazada')}
                  </button>
                </Tooltip>
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
                    icon={<Link2 className="w-4 h-4" />}
                    onClick={() => handleReconnect('lazada')}
                    title="ขอสิทธิ์ใหม่จากแพลตฟอร์ม — ใช้เมื่อเปิด scope เพิ่มหรือ token หมดอายุ"
                  >
                    เชื่อมต่อใหม่
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
        onClose={closeLogoModal}
        title={logoModal?.step === 'upload'
          ? `อัปโหลดโลโก้ — ${logoModal?.name || 'ร้าน'}`
          : `โลโก้ร้าน — ${logoModal?.name || 'ร้าน'}`}
        size="md"
        footer={logoModal?.step === 'upload' ? (
          <div className="modal-footer px-6 py-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setLogoFile(null); setLogoModal(prev => (prev ? { ...prev, step: 'choose' } : prev)); }}
            >
              ย้อนกลับ
            </Button>
            <SaveButton loading={savingLogo} onClick={handleSaveLogo} disabled={!logoFile} />
          </div>
        ) : (
          <div className="modal-footer px-6 py-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeLogoModal}>ปิด</Button>
          </div>
        )}
      >
        {logoModal?.step === 'upload' ? (
          <div className="px-6 py-5 space-y-3">
            <p className="subtitle-text text-gray-500">
              ใช้รูปเดียวกับที่ตั้งไว้ในหน้าร้าน (Seller Center) จะตรงที่สุด — ระบบย่อให้เหลือ 300px อัตโนมัติ
            </p>
            <ImageDropzone
              value={logoFile}
              onChange={setLogoFile}
              alt="โลโก้ร้าน"
              label="เลือกรูปโลโก้"
              hint="ลากรูปมาวาง หรือวางจากคลิปบอร์ดก็ได้"
              // ไม่ส่งรูปเดิมมาโชว์ตรงนี้ — ขั้นแรกโชว์ให้ดูแล้ว ถ้าเอามาบังอีก
              // กล่องลากไฟล์จะไม่ขึ้นเลย ผู้ใช้เลือกรูปใหม่ไม่ได้
              // โลโก้โชว์จริงแค่ 40px — 300px พอเผื่อจอ retina แล้ว ไม่ต้องเก็บใหญ่กว่านี้
              maxWidthOrHeight={300}
              maxSizeMB={0.1}
              classNames={{ preview: 'relative inline-block [&_img]:w-24 [&_img]:h-24 [&_img]:rounded-lg [&_img]:object-cover [&_img]:border [&_img]:border-gray-200' }}
            />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* รูปปัจจุบัน — ให้เห็นก่อนว่ากำลังจะเปลี่ยนอะไร */}
            <div className="flex items-center gap-3">
              {logoModal?.currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoModal.currentUrl}
                  alt="โลโก้ปัจจุบัน"
                  className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-400">
                  <ShoppingBag className="w-6 h-6" />
                </div>
              )}
              <p className="subtitle-text text-gray-500">
                {logoModal?.currentUrl ? 'โลโก้ที่ใช้อยู่' : 'ยังไม่มีโลโก้'}
              </p>
            </div>

            <div className="border-t border-gray-100 dark:border-slate-700" />

            {logoModal && logoOptions(logoModal).map(opt => (
              <button
                key={opt.key}
                type="button"
                disabled={opt.busy}
                onClick={opt.onClick}
                className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 transition-colors disabled:opacity-60 ${
                  opt.danger
                    ? 'border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10'
                    : 'border-gray-200 hover:border-primary hover:bg-primary/5 dark:border-slate-700'
                }`}
              >
                <span className={`mt-0.5 ${opt.danger ? 'text-red-600' : 'text-gray-500'}`}>
                  {opt.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : opt.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block body-text font-medium ${opt.danger ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {opt.label}
                  </span>
                  <span className="block subtitle-text text-gray-500">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {confirmDialog}
    </div>
  );
}
