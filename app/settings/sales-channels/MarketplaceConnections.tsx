'use client';

// แท็บ "เชื่อมต่อ Marketplace" ของหน้า /settings/sales-channels
// (ย้ายมาจาก /settings/integrations เดิม — path เก่า redirect มาที่นี่)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import Tooltip from '@/components/ui/Tooltip';
import HelpHint from '@/components/ui/HelpHint';
import Popover from '@/components/ui/Popover';
import { AlertTriangle, ChevronDown, Clock, ImagePlus, Link2, Loader2, RefreshCw, RotateCw, Settings2, ShoppingBag, Trash2, Warehouse } from 'lucide-react';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import MarketplaceQuotaPausedAlert from '@/components/ui/MarketplaceQuotaPausedAlert';
import Toggle from '@/components/ui/Toggle';
import Modal, { ModalFormFooter } from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import SaveButton from '@/components/ui/SaveButton';
import ImageDropzone from '@/components/ui/ImageDropzone';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import type { ActionItem } from '@/components/ui/ActionMenu';
import { marketplaceOnboardingSteps, nextOnboardingStep, onboardingIncomplete } from '@/lib/marketplace/onboarding';
import type { OnboardingStep } from '@/lib/marketplace/onboarding';
import MarketplaceAccountCard from './MarketplaceAccountCard';
import MarketplaceOnboardingModal from './MarketplaceOnboardingModal';
import { pushStockAllRequest } from '@/lib/marketplace/stock-actions';
import type { MarketplaceAccountsState, MarketplaceAccount, MarketplacePlatform } from './useMarketplaceAccounts';

/**
 * ไอคอนเตือนบนหัวการ์ดร้าน — บอกแค่ว่า "ร้านนี้มีเรื่องค้าง" แล้วค่อยอธิบายตอนกด
 * (เดิมเป็นแถบเหลืองเต็มแถวในเนื้อการ์ด กินที่ทุกใบทั้งที่คนอ่านครั้งเดียวก็พอ)
 * ⛔ ตั้งครบแล้วต้องไม่มีไอคอนนี้เลย — การ์ดที่เรียบร้อยแล้วไม่ต้องมีเสียงรบกวน
 */
function OnboardingWarningButton({ steps, onOpenSetup }: { steps: OnboardingStep[]; onOpenSetup: () => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const risky = steps.find(s => s.warning);
  const next = nextOnboardingStep(steps);
  const label = risky ? 'เสี่ยงส่งยอด 0 ไปทับของบนร้าน — กดดูรายละเอียด' : 'ร้านนี้ยังตั้งไม่ครบ — กดดูรายละเอียด';
  return (
    <>
      <Tooltip text={label} box="inline-flex">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={label}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            risky
              ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30'
              : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={300} estimatedHeight={170} ariaLabel="สิ่งที่ร้านนี้ยังตั้งไม่ครบ">
        <div className="space-y-3 p-3">
          <p className="subtitle-text text-gray-700 dark:text-slate-300">
            {risky ? risky.warning : `ร้านนี้ยังตั้งไม่ครบ — ขั้นต่อไป: ${next?.label}`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            icon={<Settings2 />}
            onClick={() => { setOpen(false); onOpenSetup(); }}
          >
            ตั้งค่าร้านนี้
          </Button>
        </div>
      </Popover>
    </>
  );
}

interface MarketplaceConnectionsProps {
  /** คลังที่ใช้งานได้ของบริษัท — หน้าแม่โหลดครั้งเดียวแล้วส่งต่อ */
  warehouses: { id: string; name: string; is_default: boolean }[];
  // Badge-tab เลือกดูทีละแพลตฟอร์ม — state อยู่ที่ parent เพราะปุ่ม
  // "เชื่อมต่อร้าน X" อยู่บน PageHeader ของหน้า (ตำแหน่งเดียวกับปุ่ม "+ เพิ่ม")
  activePlatform: 'shopee' | 'tiktok' | 'lazada';
  onPlatformChange: (platform: 'shopee' | 'tiktok' | 'lazada') => void;
  // flow เชื่อมแชท (promptChatConnect) ตั้ง loading ให้ปุ่มบน PageHeader
  setConnecting: (value: boolean) => void;
  // ร้านทุก platform เป็นของ parent (ดึงครั้งเดียว — ตัวเลขบนแท็บต้องรู้ก่อนเปิดแท็บนี้)
  accounts: MarketplaceAccountsState;
}

export default function MarketplaceConnections({
  activePlatform, onPlatformChange, setConnecting, accounts, warehouses,
}: MarketplaceConnectionsProps) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  // แพ็กเกจที่ไม่มีระบบคลัง = ไม่ต้องโชว์อะไรที่เกี่ยวกับสต็อกเลย (server ก็ปฏิเสธอยู่แล้ว)
  const { gates } = useFeatures();
  const stockEnabled = gates.stockEnabled;
  const { confirmDialog, confirm } = useConfirmDialog();
  // fetch เดียวได้ทุก platform (แทน 3 calls เดิม) — refetch() หลัง write ใดๆ ได้เลย
  const {
    shopee: shopeeAccounts, tiktok: tiktokAccounts, lazada: lazadaAccounts,
    loading, refetch, patchAccount,
  } = accounts;
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  // โมดัล "เริ่มใช้งานร้านนี้" — เปิดเองหลังเชื่อมต่อสำเร็จ และเปิดซ้ำได้จากปุ่มบนการ์ด
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  // เพิ่งกลับจาก OAuth ของ platform ไหน — รอ refetch เสร็จค่อยรู้ว่าจะชวนตั้งร้านใบไหน
  const [justConnected, setJustConnected] = useState<MarketplacePlatform | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [linkingProfile, setLinkingProfile] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0); // 0-100
  const [syncPhaseLabel, setSyncPhaseLabel] = useState('');
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // parent ตั้งแท็บจาก query เดียวกันนี้ตั้งแต่ก่อนเรา mount — activePlatform ตอนนี้จึงถูกแล้ว
    const cleanUrl = `/settings/sales-channels#${activePlatform}`;
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      refetch();
      setJustConnected('shopee');
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('tiktok') === 'connected') {
      showToast('เชื่อมต่อ TikTok Shop สำเร็จ', 'success');
      refetch();
      setJustConnected('tiktok');
      onPlatformChange('tiktok');
      // ขาแชทต่อให้เองใน callback แล้ว (ไม่มี dialog ถามคั่น) — มาถึงตรงนี้ได้
      // แปลว่าไม่ต้องต่อแชท เหลือแค่ชวนดึงโลโก้จากบัญชี TikTok
      const logoAccount = params.get('logo') === 'prompt' ? params.get('logo_account') : null;
      window.history.replaceState({}, '', cleanUrl);
      if (logoAccount) promptProfileConnect(logoAccount);
    } else if (params.get('success') === 'lazada_connected') {
      showToast('เชื่อมต่อ Lazada สำเร็จ', 'success');
      refetch();
      setJustConnected('lazada');
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

  const handleSync = async (accountId: string, days: number) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังเชื่อมต่อ...');
    const controller = new AbortController();
    syncAbortRef.current = controller;

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
        // ใบที่ของออกจากคลังไปแล้วก่อนระบบรู้จัก — บันทึกเป็นประวัติแต่ไม่แตะคลัง
        // ต้องบอกให้เห็น ไม่งั้นคนนึกว่าสต็อกถูกหักให้แล้ว
        if ((result.orders_stock_skipped as number) > 0) parts.push(`ไม่แตะสต็อก ${result.orders_stock_skipped} ใบ (ของออกไปแล้ว/ยกเลิกแล้ว)`);
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

  /**
   * เพิ่งเชื่อมร้านเสร็จ → ชวนตั้งค่าต่อทันที
   * เลือกร้านใบล่าสุดของแพลตฟอร์มนั้น**ที่ยังตั้งไม่ครบ** — เชื่อมใหม่ร้านเดิมที่ตั้งครบแล้ว
   * ไม่ต้องเด้งอะไรมากวน (รอ refetch ให้ข้อมูลมาถึงก่อน ไม่งั้นได้ร้านชุดเก่า)
   */
  useEffect(() => {
    if (!justConnected) return;
    const list =
      justConnected === 'shopee' ? shopeeAccounts
      : justConnected === 'tiktok' ? tiktokAccounts
      : lazadaAccounts;
    if (list.length === 0) return;
    const target = [...list]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .find(a => onboardingIncomplete(marketplaceOnboardingSteps(a, { stockEnabled })));
    setJustConnected(null);
    if (target) setOnboardingId(target.id);
  }, [justConnected, shopeeAccounts, tiktokAccounts, lazadaAccounts, stockEnabled]);

  const onboardingAccount =
    [...shopeeAccounts, ...tiktokAccounts, ...lazadaAccounts].find(a => a.id === onboardingId) || null;

  /** ไอคอนเตือนบนหัวการ์ด (ลำดับขั้นอยู่ที่ lib/marketplace/onboarding.ts) — ตั้งครบแล้วไม่โชว์อะไรเลย */
  const onboardingWarning = (account: MarketplaceAccount) => {
    const steps = marketplaceOnboardingSteps(account, { stockEnabled });
    if (!onboardingIncomplete(steps)) return null;
    return <OnboardingWarningButton steps={steps} onOpenSetup={() => setOnboardingId(account.id)} />;
  };

  /**
   * รายการในเมนู ⋮ ของการ์ด — **งานทุกอย่างของร้านอยู่ในนี้** การ์ดเหลือแต่สถานะกับสวิตช์
   * (ออเดอร์เข้าเองทาง webhook + cron ทุก 15 นาที · การดึงย้อนหลังเป็นงานนาน ๆ ทำที
   * ไม่ควรเป็นปุ่มลอยเด่นกว่าการตั้งค่า)
   */
  const cardMenuItems = (
    account: MarketplaceAccount,
    runOrderSync: (days: number) => void,
  ): ActionItem[] => {
    const platform = (account.platform || 'shopee') as MarketplacePlatform;
    const busy = syncingId === account.id || account.connection_status === 'expired';
    return [
      ...[1, 7, 30].map(days => ({
        key: `orders-${days}`,
        label: `ดึงออเดอร์ย้อนหลัง ${days} วัน`,
        icon: <Clock className="w-4 h-4" />,
        disabled: busy,
        onClick: () => runOrderSync(days),
      })),
      // ไล่ถามสถานะล่าสุดของออเดอร์ที่ยังไม่จบ — ปกติ cron ตามให้อยู่แล้ว
      // ใช้ตอนสงสัยว่าสถานะบนร้านกับในระบบไม่ตรง (Shopee เท่านั้นที่มี endpoint นี้)
      ...(platform === 'shopee' ? [{
        key: 'sync-incomplete',
        label: 'ตรวจสถานะออเดอร์ที่ยังไม่จบ',
        icon: <RotateCw className="w-4 h-4" />,
        disabled: busy,
        dividerBefore: true,
        onClick: () => handleSyncIncomplete(account.id),
      }] : []),
      {
        key: 'reconnect',
        label: 'เชื่อมต่อใหม่',
        description: 'ใช้เมื่อ token หมดอายุ หรือต้องขอสิทธิ์เพิ่ม',
        icon: <Link2 className="w-4 h-4" />,
        dividerBefore: platform !== 'shopee',
        onClick: () => handleReconnect(platform),
      },
    ];
  };

  /** ป้ายชื่อแพลตฟอร์มของร้าน — แถว legacy ที่ platform ยังว่าง = Shopee */
  const platformLabel = (account: MarketplaceAccount) =>
    MARKETPLACE_PLATFORMS[account.platform || 'shopee'].label;

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

  const handleSimpleSync = async (platform: 'tiktok' | 'lazada', accountId: string, days: number) => {
    setSyncingId(accountId);
    setSyncProgress(10);
    setSyncPhaseLabel(SIMPLE_SYNC[platform].label);
    const controller = new AbortController();
    syncAbortRef.current = controller;
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
      // ใบที่ของออกจากคลังไปแล้วก่อนระบบรู้จัก — บันทึกเป็นประวัติแต่ไม่แตะคลัง
      if (result.orders_stock_skipped > 0) parts.push(`ไม่แตะสต็อก ${result.orders_stock_skipped} ใบ (ของออกไปแล้ว/ยกเลิกแล้ว)`);
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

  // คลังของบริษัท — หน้าแม่โหลดไว้แล้ว รับต่อมาเป็น prop
  // (เดิมยิง /api/warehouses ซ้ำอีกใบจากตรงนี้ · แคช 60 วิของ apiFetch กันได้เฉพาะตอน
  //  เปิดใกล้กัน พอกลับมาหน้านี้หลังแคชหมดอายุก็ยิงสองใบเหมือนเดิม)
  const defaultWarehouseName = warehouses.find(w => w.is_default)?.name || '';

  /**
   * ตัวเลือก "ร้านนี้ตัด/ซิงค์สต็อกจากคลังไหน" — ใช้ร่วมทั้ง Shopee / TikTok / Lazada
   * อยู่ต่อจากสวิตช์ Sync Stock บรรทัดเดียวกัน (ของคู่กัน: เปิดซิงค์แล้วต้องรู้ว่าใช้คลังไหน)
   * โชว์เมื่อบริษัทมีมากกว่า 1 คลังเท่านั้น (คลังเดียวไม่มีอะไรให้เลือก ไม่ต้องรก)
   * ⛔ ห้ามเติมข้อความ "ยังไม่ได้เลือก — ตัดจากคลังหลัก" ต่อท้ายช่องอีก — ตัวเลือกแรกในช่อง
   *    บอกชื่อคลังหลักอยู่แล้ว พูดซ้ำเป็นสีส้มทำให้ดูเหมือนมีอะไรผิดทั้งที่ค่าเริ่มต้นถูกต้อง
   */
  const warehousePicker = (account: MarketplaceAccount) => {
    // โผล่เมื่อเปิดซิงค์สต็อกแล้วเท่านั้น — ปิดอยู่ก็ไม่มีอะไรให้เลือกคลังไปส่ง
    if (!stockEnabled || warehouses.length <= 1) return null;
    if (account.auto_sync_stock === false) return null;
    return (
      <div className="flex items-center gap-1.5">
        <Tooltip text="คลังที่ร้านนี้ใช้ตัด/ซิงค์สต็อก" box="inline-flex">
          <Warehouse className="w-3.5 h-3.5 text-gray-400" aria-label="คลังที่ตัด/ซิงค์สต็อก" />
        </Tooltip>
        <div className="w-48">
          <FormSelect
            size="sm"
            portal /* การ์ดร้านครอบด้วย overflow-hidden — ไม่ portal แล้วรายการคลังโดนตัดที่ขอบการ์ด */
            value={account.warehouse_id || ''}
            onChange={v => handleSelectWarehouse(account.id, v)}
            options={[
              { id: '', label: defaultWarehouseName ? `คลังหลัก (${defaultWarehouseName})` : 'คลังหลัก' },
              ...warehouses.map(w => ({ id: w.id, label: w.name })),
            ]}
          />
        </div>
      </div>
    );
  };

  /**
   * สวิตช์ auto-sync ของการ์ดร้าน — ใช้ร่วมทั้ง 3 แพลตฟอร์ม
   * `productInfo` = การ์ดนั้นมีสวิตช์ชื่อ/ราคาด้วย (ตอนนี้มีแต่ Shopee ที่ push ราคา/ชื่อได้)
   *
   * อยู่บนหัวการ์ด (บรรทัดเดียวกับชื่อร้าน) — เห็นและสลับได้โดยไม่ต้องกางการ์ดก่อน
   * จอแคบไม่พอวางข้างชื่อร้าน จึงตกไปอยู่ในเนื้อการ์ดแทน (`className` เป็นตัวสลับ)
   * ⛔ ห้ามเอาคำอธิบายความเสี่ยง "ยังไม่ได้ตั้งยอด = ส่ง 0 ไปทับร้าน" กลับมาไว้ใต้สวิตช์
   *    ไอคอนเตือนบนหัวการ์ด (onboardingWarning) พูดเรื่องนี้ให้แล้ว และพูดเฉพาะตอนที่เป็นจริง
   */
  const cardControls = (account: MarketplaceAccount, opts?: { productInfo?: boolean; className?: string }) => {
    const productInfo = opts?.productInfo === true;
    const warning = onboardingWarning(account);
    if (!stockEnabled && !productInfo && !warning) return null;
    return (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${opts?.className || ''}`}>
        {warning}
        {stockEnabled && (
          <div className="flex items-center gap-2">
            <Toggle
              checked={account.auto_sync_stock !== false}
              onChange={v => handleToggleSync(account.id, 'auto_sync_stock', v)}
              aria-label="Sync Stock อัตโนมัติ"
            />
            <span className="text-xs text-gray-700 dark:text-slate-300 whitespace-nowrap">Sync Stock</span>
            <HelpHint ariaLabel="Sync Stock คืออะไร">
              ทุกครั้งที่สต็อกในระบบขยับ (ขายของ · รับเข้า · ปรับยอด) ระบบส่งยอดของคลังที่ร้านนี้ใช้ ขึ้นไปทับยอดบนร้านให้เอง
              — ไม่ได้ดึงยอดจากร้านลงมา
            </HelpHint>
          </div>
        )}
        {productInfo && (
          <div className="flex items-center gap-2">
            <Toggle
              checked={account.auto_sync_product_info !== false}
              onChange={v => handleToggleSync(account.id, 'auto_sync_product_info', v)}
              aria-label="Sync ชื่อ/ราคา อัตโนมัติ"
            />
            <span className="text-xs text-gray-700 dark:text-slate-300 whitespace-nowrap">Sync ชื่อ/ราคา</span>
            <HelpHint ariaLabel="Sync ชื่อ/ราคา คืออะไร">
              แก้ <b>ชื่อหรือราคาสินค้าในระบบ</b> (หน้าสินค้าปกติ ไม่ใช่เฉพาะแท็บ marketplace) แล้วระบบส่งไปทับประกาศบนร้านนี้ให้เอง
              — ถ้าอยากให้ชื่อบนร้านต่างจากในระบบ ให้ตั้งชื่อเฉพาะร้านไว้ที่แท็บ marketplace ของสินค้านั้น
            </HelpHint>
          </div>
        )}
        {warehousePicker(account)}
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
    const label = account ? platformLabel(account) : MARKETPLACE_PLATFORMS.shopee.label;
    const linked = account?.linked_product_count || 0;
    if (linked > 0) {
      const nameOf = (id: string | null) =>
        id ? (warehouses.find(w => w.id === id)?.name || 'คลังที่เลือก') : `คลังหลัก${defaultWarehouseName ? ` (${defaultWarehouseName})` : ''}`;
      const ok = await confirm({
        title: `ย้ายคลังของ ${account?.shop_name || 'ร้านนี้'} จาก ${nameOf(prev)} ไป ${nameOf(next)}?`,
        description:
          `• ออเดอร์ที่รับมาแล้วยังตัดสต็อกจากคลังเดิม — ระบบจำคลังไว้กับออเดอร์ตั้งแต่ตอนสร้าง จึงไม่กระทบของที่ยังไม่ได้ส่ง\n` +
          `• ออเดอร์ใหม่จะตัดจาก ${nameOf(next)} แทน\n` +
          `• ยอดที่ส่งขึ้นร้านจะกลายเป็นยอดของ ${nameOf(next)} — ถ้าของจริงยังอยู่ที่ ${nameOf(prev)} ต้องโอนย้ายเองที่เมนูคลังสินค้า\n` +
          `• หลังยืนยัน ระบบจะส่งยอดของคลังใหม่ขึ้นร้านให้ทันที (${linked} สินค้า ใช้โควตา ${label} ${linked} ครั้ง)`,
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
        // (ลูป cursor ของร้านใหญ่อยู่ใน lib/marketplace/stock-actions.ts — ใช้ตัวเดียวกับหน้าซิงค์)
        // trigger บอกที่มาของรอบ — ประวัติจะได้แยกออกว่าไม่ใช่คนกดเองที่หน้าซิงค์
        showToast(`บันทึกคลังแล้ว — กำลังส่งยอดของคลังใหม่ขึ้นร้าน (${linked} สินค้า)`);
        const pushed = await pushStockAllRequest(accountId, msg => showToast(msg), { trigger: 'warehouse_change' });
        showToast(
          pushed.ok ? pushed.message : `บันทึกคลังแล้ว แต่${pushed.message}`,
          pushed.ok ? 'success' : 'error'
        );
        if (pushed.ok) refetch();
      } else {
        showToast('บันทึกคลังของร้านนี้แล้ว');
      }
    } catch {
      patchAccount(accountId, { warehouse_id: prev });
      showToast('เปลี่ยนคลังไม่สำเร็จ', 'error');
    }
  };

  /** สลับสวิตช์แล้วต้องรู้ทันทีว่าอะไรเปลี่ยน — เดิมเงียบสนิท ไม่รู้ว่าติดหรือยัง */
  const SYNC_TOGGLE_TOAST: Record<'auto_sync_stock' | 'auto_sync_product_info', [on: string, off: string]> = {
    auto_sync_stock: [
      'เปิดแล้ว — ทุกครั้งที่สต็อกในระบบขยับ ระบบจะส่งยอดขึ้นร้านนี้ให้เอง',
      'ปิดแล้ว — ยอดบนร้านนี้จะไม่ถูกแตะจนกว่าจะสั่งส่งเอง',
    ],
    auto_sync_product_info: [
      'เปิดแล้ว — แก้ชื่อ/ราคาสินค้าในระบบแล้วระบบจะส่งไปทับประกาศบนร้านนี้',
      'ปิดแล้ว — ชื่อ/ราคาบนร้านนี้จะไม่ถูกแตะ',
    ],
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
      } else {
        showToast(SYNC_TOGGLE_TOAST[field][value ? 0 : 1], 'success');
      }
    } catch {
      patchAccount(accountId, { [field]: !value });
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  return (
    <div>
      {/* แท็บเลือกแพลตฟอร์มอยู่ที่ parent (แท็บหลักของหน้า) — ที่นี่แสดงเฉพาะร้านของแท็บที่เปิดอยู่ */}
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
            const isRefreshingLogo = resyncingId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Shop #${account.shop_id}`}
                titleExtra={account.metadata?.shopee_app === 'seller' ? (
                  /* ร้านนี้ผูกกับ app ของร้านเอง — คนละ credentials (และอาจคนละ environment)
                     กับร้านที่เชื่อมผ่าน partner app ตามปกติ */
                  <Badge tone="indigo" size="sm">app ของร้าน</Badge>
                ) : undefined}
                showProductCount
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                menuItems={cardMenuItems(account, days => handleSync(account.id, days))}
                headerActions={cardControls(account, { className: 'hidden sm:flex mr-1' })}
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

                {/* จอแคบ: สวิตช์ + คลัง + ไอคอนเตือน ตกลงมาอยู่ในเนื้อการ์ดแทนหัวการ์ด */}
                {cardControls(account, { className: 'sm:hidden pt-1' })}

                {/* Sync Controls */}
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
                menuItems={cardMenuItems(account, days => handleSimpleSync('tiktok', account.id, days))}
                headerActions={cardControls(account, { className: 'hidden sm:flex mr-1' })}
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

                {/* จอแคบ: สวิตช์ + คลัง + ไอคอนเตือน ตกลงมาอยู่ในเนื้อการ์ดแทนหัวการ์ด */}
                {cardControls(account, { className: 'sm:hidden pt-1' })}

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
            const isRefreshingLogo = resyncingId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Lazada #${account.shop_id}`}
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                menuItems={cardMenuItems(account, days => handleSimpleSync('lazada', account.id, days))}
                headerActions={cardControls(account, { className: 'hidden sm:flex mr-1' })}
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
                {/* จอแคบ: สวิตช์ + คลัง + ไอคอนเตือน ตกลงมาอยู่ในเนื้อการ์ดแทนหัวการ์ด */}
                {cardControls(account, { className: 'sm:hidden pt-1' })}

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
          <ModalFormFooter>
            <Button
              variant="secondary"
              onClick={() => { setLogoFile(null); setLogoModal(prev => (prev ? { ...prev, step: 'choose' } : prev)); }}
            >
              ย้อนกลับ
            </Button>
            <SaveButton loading={savingLogo} onClick={handleSaveLogo} disabled={!logoFile} />
          </ModalFormFooter>
        ) : (
          <ModalFormFooter>
            <Button variant="secondary" onClick={closeLogoModal}>ปิด</Button>
          </ModalFormFooter>
        )}
      >
        {logoModal?.step === 'upload' ? (
          <div className="space-y-3">
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

      <MarketplaceOnboardingModal
        account={onboardingAccount}
        onClose={() => setOnboardingId(null)}
        onChanged={refetch}
      />
    </div>
  );
}
