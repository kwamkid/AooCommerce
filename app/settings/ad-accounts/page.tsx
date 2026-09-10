// Path: app/settings/ad-accounts/page.tsx
// บัญชีโฆษณา Meta — เชื่อม token ที่ใช้ยิง event การซื้อกลับไปหา Meta และ sync กลุ่มเป้าหมาย
//
// ⚠️ **ต้องมีทางเข้า 2 ทางเสมอ** (Login Facebook + กรอกเอง) และห้ามซ่อนทางที่สอง:
// Login เห็นเฉพาะบัญชีที่ผู้ใช้เป็นแอดมินใน Business ของตัวเอง — บัญชีที่อยู่ใน Business
// ของเอเจนซี หรือช่วงที่แอปยังไม่ผ่าน App Review จะไม่โผล่มาเลย โดย Facebook ไม่บอกเหตุผล
// ⇒ ทุก error ของขา OAuth ต้องจบด้วยปุ่ม "กรอกเอง" ไม่ใช่ปล่อยให้ผู้ใช้ตัน
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Megaphone } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useFacebookSdk } from '@/lib/useFacebookSdk';
import { useToast } from '@/lib/toast-context';
import {
  META_ADS_SCOPES,
  type AdAccountProbe,
  type AdAccountView,
  type MetaOauthAccount,
} from '@/lib/ads/meta-ui';
import AdAccountCard from './components/AdAccountCard';
import AdEventsModal from './components/AdEventsModal';
import ManualConnectForm, { type ManualConnectErrors, type ManualConnectValues } from './components/ManualConnectForm';
import MetaAccountPickerModal from './components/MetaAccountPickerModal';

const ACCOUNTS_URL = '/api/ads/accounts';

interface PickerState {
  accounts: MetaOauthAccount[];
  stage: 1 | 2;
  selectedAccountId: string | null;
  selectedDatasetId: string | null;
  /** ใบที่กด "เชื่อมต่อใหม่" — ติ๊กให้อัตโนมัติถ้า Facebook คืนบัญชีนี้มาด้วย */
  reconnectExternalId?: string | null;
}

interface PageAlert {
  tone: 'warning' | 'danger';
  title?: string;
  text: string;
  /** เสนอทางกรอกเองต่อท้าย — ทุก error ของขา OAuth ควรมี */
  offerManual?: boolean;
}

/** ข้อความเดียวกันใช้ทั้งกรณี API ตอบ no_ad_accounts และกรณีรายการว่างเปล่า */
const NO_AD_ACCOUNTS_ALERT = {
  title: 'ไม่พบบัญชีโฆษณาที่บัญชี Facebook นี้มีสิทธิ์',
  text: 'ต้องเป็นแอดมินของ Business Manager ที่ถือบัญชีโฆษณา หรือบัญชีอยู่ใน Business ของคนอื่น (ต้องรอ App Review) · เชื่อมด้วยการกรอก token เองได้',
  offerManual: true,
} as const;

export default function AdAccountsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('masterdata.ad_accounts', { noRedirect: true });
  const fb = useFacebookSdk(true);

  const [accounts, setAccounts] = useState<AdAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'idle' | 'manual'>('idle');
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [pageAlert, setPageAlert] = useState<PageAlert | null>(null);

  const [fbLoading, setFbLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [probeById, setProbeById] = useState<Record<string, AdAccountProbe>>({});
  const [eventsModalId, setEventsModalId] = useState<string | null>(null);
  const [manualErrors, setManualErrors] = useState<ManualConnectErrors>({});

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  /** external_id ของใบที่กด "เชื่อมต่อใหม่" — อ่านแล้วล้างทันทีเหมือนหน้าช่องทางแชท */
  const reconnectRef = useRef<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch(ACCOUNTS_URL);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'โหลดข้อมูลไม่สำเร็จ');
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    }
    setLoading(false);
  }, [showToast]);

  const reload = useCallback(async () => {
    invalidateApiCache(ACCOUNTS_URL);
    await fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (allowed) fetchAccounts();
  }, [allowed, fetchAccounts]);

  // ─── เชื่อมด้วย Facebook ────────────────────────────────────────────

  const startOauth = useCallback(async () => {
    setPageAlert(null);
    setFbLoading(true);
    const reconnectExternalId = reconnectRef.current;
    reconnectRef.current = null;
    try {
      const shortLivedToken = await fb.login(META_ADS_SCOPES);
      const res = await apiFetch('/api/ads/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLivedToken }),
      });
      const data = await res.json().catch(() => ({}));
      const list: MetaOauthAccount[] = Array.isArray(data.accounts) ? data.accounts : [];

      if (!res.ok) {
        const code = data.code as string | undefined;
        if (code === 'permissions_missing') {
          showToast('Facebook ไม่ได้ให้สิทธิ์ ads_management/business_management — กด "เชื่อมด้วย Facebook" อีกครั้งแล้วยอมรับทุกสิทธิ์', 'error');
        } else if (code === 'app_review_required') {
          setPageAlert({
            tone: 'warning',
            title: 'แอปยังไม่ผ่าน App Review สำหรับสิทธิ์โฆษณา',
            text: 'ใช้ได้เฉพาะ Business ที่เป็นเจ้าของแอป · บัญชีอื่นให้กรอก System User token เอง',
            offerManual: true,
          });
        } else if (code === 'no_ad_accounts') {
          setPageAlert({ tone: 'warning', ...NO_AD_ACCOUNTS_ALERT });
        } else {
          showToast(typeof data.error === 'string' ? data.error : 'เชื่อมต่อ Facebook ไม่สำเร็จ', 'error');
        }
        return;
      }

      if (list.length === 0) {
        setPageAlert({ tone: 'warning', ...NO_AD_ACCOUNTS_ALERT });
        return;
      }

      let preselect: string | null = null;
      if (reconnectExternalId) {
        if (list.some(a => a.account_id === reconnectExternalId)) {
          preselect = reconnectExternalId;
        } else {
          const name = accounts.find(a => a.external_id === reconnectExternalId)?.name || `act_${reconnectExternalId}`;
          showToast(`Facebook ไม่ได้ให้สิทธิ์บัญชี "${name}" ในรอบนี้ — เลือกบัญชีนี้ในหน้าต่างของ Facebook`, 'error');
        }
      }

      setPicker({
        accounts: list,
        stage: 1,
        selectedAccountId: preselect,
        selectedDatasetId: null,
        reconnectExternalId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'not_ready') showToast('Facebook SDK ยังไม่พร้อม กรุณารอสักครู่', 'error');
      else if (message === 'denied') showToast('ไม่ได้รับสิทธิ์จาก Facebook', 'error');
      else showToast('เชื่อมต่อ Facebook ไม่สำเร็จ', 'error');
    } finally {
      setFbLoading(false);
    }
  }, [accounts, fb, showToast]);

  // เข้าหน้ามาพร้อม ?connect=1 (มาจากที่อื่นที่ชวนให้เชื่อม) — เปิดหน้าต่าง Facebook ให้เลย
  const autoConnectRef = useRef(false);
  const [wantsAutoConnect, setWantsAutoConnect] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('connect') !== '1') return;
    setWantsAutoConnect(true);
    router.replace('/settings/ad-accounts');
  }, [router]);
  useEffect(() => {
    if (!wantsAutoConnect || autoConnectRef.current) return;
    if (!allowed || loading || !fb.ready) return;
    autoConnectRef.current = true;
    setWantsAutoConnect(false);
    startOauth();
  }, [wantsAutoConnect, allowed, loading, fb.ready, startOauth]);

  const handlePickerSave = async () => {
    if (!picker) return;
    if (picker.stage === 1) {
      setPicker({ ...picker, stage: 2, selectedDatasetId: null });
      return;
    }
    if (!picker.selectedAccountId || !picker.selectedDatasetId) return;

    setSaving(true);
    try {
      const res = await apiFetch('/api/ads/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: picker.selectedAccountId, dataset_id: picker.selectedDatasetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.code as string | undefined;
        if (code === 'stash_expired') {
          setPicker(null);
          showToast('หมดเวลาเลือกบัญชี — กดเชื่อมด้วย Facebook อีกครั้ง', 'error');
        } else if (code === 'duplicate') {
          showToast('บัญชีโฆษณานี้เชื่อมอยู่แล้ว', 'error');
        } else {
          showToast(typeof data.error === 'string' ? data.error : 'เชื่อมบัญชีโฆษณาไม่สำเร็จ', 'error');
        }
        return;
      }
      applyProbe(data.account, data.probe);
      setPicker(null);
      showToast('เชื่อมบัญชีโฆษณาแล้ว', 'success');
      await reload();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── กรอกเอง ────────────────────────────────────────────────────────

  const handleManualSubmit = async (values: ManualConnectValues) => {
    setManualErrors({});
    setSaving(true);
    try {
      const res = await apiFetch(ACCOUNTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: values.external_id,
          dataset_id: values.dataset_id,
          access_token: values.access_token,
          ...(values.name ? { name: values.name } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : 'เชื่อมบัญชีโฆษณาไม่สำเร็จ';
        switch (data.code as string | undefined) {
          case 'duplicate':
            setManualErrors({ form: 'บัญชีโฆษณานี้เชื่อมอยู่แล้ว' });
            break;
          case 'token_invalid':
            setManualErrors({ access_token: 'token ใช้ไม่ได้ — ตรวจว่าคัดลอกครบ' });
            break;
          case 'dataset_not_in_account':
            setManualErrors({ dataset_id: 'Dataset นี้ไม่ได้อยู่ในบัญชีโฆษณานี้' });
            break;
          case 'permissions_missing':
            setManualErrors({ form: 'token นี้ไม่มีสิทธิ์ที่ต้องใช้' });
            break;
          case 'invalid_input':
            setManualErrors({ form: message });
            break;
          default:
            showToast(message, 'error');
        }
        return;
      }
      applyProbe(data.account, data.probe);
      setMode('idle');
      showToast('เชื่อมบัญชีโฆษณาแล้ว', 'success');
      await reload();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── การกระทำบนการ์ด ────────────────────────────────────────────────

  function applyProbe(account: AdAccountView | undefined, probe: AdAccountProbe | undefined) {
    if (account?.id && probe) setProbeById(prev => ({ ...prev, [account.id]: probe }));
  }

  const handleTest = async (account: AdAccountView) => {
    setTestingId(account.id);
    try {
      const res = await apiFetch(`/api/ads/accounts/${account.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'ทดสอบไม่สำเร็จ', 'error');
        return;
      }
      const probe: AdAccountProbe | undefined = data.probe;
      applyProbe(data.account || account, probe);
      if (probe?.token_ok && probe.capi_ok && probe.audiences_ok) showToast('ทดสอบผ่านทุกข้อ', 'success');
      else showToast('ทดสอบไม่ผ่าน — ดูรายละเอียดบนการ์ด', 'error');
      await reload();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleRenameSave = async (account: AdAccountView) => {
    setRenameSaving(true);
    try {
      const res = await apiFetch(`/api/ads/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'บันทึกไม่สำเร็จ', 'error');
        return;
      }
      applyProbe(data.account || account, data.probe);
      setRenameId(null);
      showToast('บันทึกแล้ว', 'success');
      await reload();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async (account: AdAccountView) => {
    const ok = await confirm({
      title: 'ยกเลิกการเชื่อมต่อบัญชีโฆษณานี้?',
      description: 'ระบบจะหยุดส่ง Purchase/QualifiedLead และหยุด sync กลุ่มเป้าหมายไปบัญชีนี้ · Custom Audience ที่สร้างไว้ใน Meta จะยังอยู่ ลบเองได้ใน Ads Manager',
      variant: 'danger',
      confirmLabel: 'ยกเลิกการเชื่อมต่อ',
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/ads/accounts/${account.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ', 'error');
        return;
      }
      showToast('ยกเลิกการเชื่อมต่อแล้ว', 'success');
      await reload();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleReconnect = (account: AdAccountView) => {
    reconnectRef.current = account.external_id;
    startOauth();
  };

  // ─── Render ─────────────────────────────────────────────────────────

  if (authLoading) {
    return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="full"><NoPermissionCard /></Container></Layout>;
  }

  const hasAppId = !!fb.appId;
  const openManual = () => { setManualErrors({}); setPageAlert(null); setMode('manual'); };
  const testingAccount = accounts.find(a => a.id === testingId) || null;
  const eventsAccount = accounts.find(a => a.id === eventsModalId) || null;

  const headerAction = hasAppId ? (
    <Button
      variant="primary"
      icon={<PlatformIcon id="facebook" size={16} mono />}
      loading={fbLoading}
      disabled={!fb.ready}
      onClick={() => startOauth()}
    >
      เชื่อมบัญชีโฆษณา Meta
    </Button>
  ) : (
    <Button variant="primary" onClick={openManual}>กรอกเอง</Button>
  );

  return (
    <Layout>
      {confirmDialog}
      <Container size="full">
        <PageHeader
          icon={<Megaphone />}
          title="บัญชีโฆษณา"
          subtitle="เชื่อมบัญชีโฆษณา Meta เพื่อส่ง event การซื้อและ sync กลุ่มเป้าหมายไปยิงโฆษณา"
          actions={headerAction}
        />

        {!hasAppId && (
          <Alert tone="info">
            <span className="subtitle-text">
              ยังไม่ได้ตั้งค่า Facebook App — เชื่อมด้วยการกรอก token เองได้
            </span>
          </Alert>
        )}

        {pageAlert && (
          <Alert tone={pageAlert.tone} title={pageAlert.title} onClose={() => setPageAlert(null)}>
            <p className="subtitle-text">{pageAlert.text}</p>
            {pageAlert.offerManual && (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={openManual}>กรอกเอง (Manual)</Button>
              </div>
            )}
          </Alert>
        )}

        {loading ? (
          <LoadingCard />
        ) : accounts.length === 0 && mode !== 'manual' ? (
          <EmptyCard
            icon={<Megaphone className="w-10 h-10" />}
            title="ยังไม่ได้เชื่อมบัญชีโฆษณา"
            subtitle="เชื่อมแล้วระบบจะส่ง Purchase ให้ Meta อัตโนมัติ และ sync กลุ่มเป้าหมายไปใช้ยิงโฆษณาได้ · ต้องเป็นแอดมินของ Business ที่ถือบัญชีโฆษณานั้น"
            actions={
              <div className="flex flex-wrap justify-center gap-3">
                {hasAppId && (
                  <Button
                    variant="primary"
                    icon={<PlatformIcon id="facebook" size={16} mono />}
                    loading={fbLoading}
                    disabled={!fb.ready}
                    onClick={() => startOauth()}
                  >
                    เชื่อมด้วย Facebook
                  </Button>
                )}
                <Button variant="secondary" onClick={openManual}>กรอกเอง (Manual)</Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-4">
            {accounts.map(account => (
              <AdAccountCard
                key={account.id}
                account={account}
                probe={probeById[account.id]}
                testing={testingId === account.id}
                canReconnect={account.token_source === 'oauth' && hasAppId}
                renaming={renameId === account.id}
                renameValue={renameValue}
                renameSaving={renameSaving}
                onRenameStart={() => { setRenameId(account.id); setRenameValue(account.name || ''); }}
                onRenameChange={setRenameValue}
                onRenameCancel={() => setRenameId(null)}
                onRenameSave={() => handleRenameSave(account)}
                onTest={() => handleTest(account)}
                onReconnect={() => handleReconnect(account)}
                onDelete={() => handleDelete(account)}
                onShowEvents={() => setEventsModalId(account.id)}
              />
            ))}

            {mode === 'manual' ? (
              <ManualConnectForm
                saving={saving}
                errors={manualErrors}
                showBackToOauth={hasAppId}
                onBackToOauth={() => { setMode('idle'); startOauth(); }}
                onCancel={() => { setMode('idle'); setManualErrors({}); }}
                onSubmit={handleManualSubmit}
              />
            ) : accounts.length > 0 ? (
              <div className="flex justify-center">
                <Button variant="ghost" onClick={openManual}>เพิ่มบัญชีด้วยการกรอกเอง</Button>
              </div>
            ) : null}
          </div>
        )}
      </Container>

      {picker && (
        <MetaAccountPickerModal
          open
          accounts={picker.accounts}
          stage={picker.stage}
          selectedAccountId={picker.selectedAccountId}
          selectedDatasetId={picker.selectedDatasetId}
          saving={saving}
          onSelectAccount={id => setPicker(p => (p ? { ...p, selectedAccountId: id, selectedDatasetId: null } : p))}
          onSelectDataset={id => setPicker(p => (p ? { ...p, selectedDatasetId: id } : p))}
          onBack={() => setPicker(p => (p ? { ...p, stage: 1 } : p))}
          onCancel={() => setPicker(null)}
          onSave={handlePickerSave}
        />
      )}

      {/* mount ใหม่ทุกครั้งที่เปิด — ตัวกรอง/สถานะโหลดในโมดัลจึงเริ่มต้นใหม่เองเสมอ */}
      {eventsAccount && (
        <AdEventsModal
          key={eventsAccount.id}
          open
          account={eventsAccount}
          onClose={() => setEventsModalId(null)}
        />
      )}

      {/* กำลังทดสอบ — บังจอกันกดซ้ำ (การทดสอบคุยกับ Meta หลายรอบ ใช้เวลาหลายวินาที) */}
      <Modal
        open={!!testingId}
        onClose={() => { /* ปิดเองเมื่อ API ตอบ */ }}
        size="sm"
        hideCloseButton
        disableBackdropClose
      >
        <div className="p-6 flex flex-col items-center text-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div>
            <p className="body-text font-medium text-gray-900 dark:text-white">กำลังทดสอบการเชื่อมต่อ</p>
            {testingAccount && (
              <p className="subtitle-text text-gray-500 dark:text-slate-400 mt-1">
                {testingAccount.name || `act_${testingAccount.external_id}`}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
