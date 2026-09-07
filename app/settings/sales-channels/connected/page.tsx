'use client';

// หน้าคั่นหลังเชื่อมร้าน marketplace สำเร็จ — "เชื่อมร้านแล้ว จะเชื่อมแชทด้วยไหม"
//
// ทำไมต้องมีหน้านี้: Lazada/TikTok ให้แชทเป็น app คนละตัวกับออเดอร์ จึงต้อง authorize
// สองรอบเลี่ยงไม่ได้ · ของเดิม (2026-09-02) callback ขาออเดอร์เด้งไปหน้า login ของ
// แพลตฟอร์มรอบสองทันที ผู้ใช้เห็นว่า "เพิ่ง login ไปแล้วทำไมให้ login อีก" และไม่รู้ว่ารอบสอง
// คือ "AooCommerce Chat" (เจ้าของแจ้ง 7 ก.ย. 2026) — หน้านี้บอกให้ชัดก่อนว่ารอบแรกจบแล้ว
// รอบสองคืออะไร แล้วให้เลือกเอง

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import { DoneCard, LoadingCard } from '@/components/ui/StateCard';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';

const PLATFORM_LABELS: Record<string, string> = { lazada: 'Lazada', tiktok: 'TikTok Shop' };

function ConnectedContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [connecting, setConnecting] = useState(false);

  const platform = params.get('platform') === 'tiktok' ? 'tiktok' : 'lazada';
  const label = PLATFORM_LABELS[platform];
  // ชื่อร้านที่เพิ่งเชื่อม (คั่นด้วย |) — callback ส่งมาให้เพื่อบอกว่ารอบแรกทำอะไรสำเร็จ
  const shops = (params.get('shops') || '').split('|').map(s => s.trim()).filter(Boolean);
  const backUrl = '/settings/sales-channels?tab=marketplace';

  const connectChat = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch(`/api/${platform}/oauth/auth-url?app=chat`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        showToast(typeof data.error === 'string' ? data.error : 'เริ่มเชื่อมต่อแชทไม่สำเร็จ', 'error');
        setConnecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
      setConnecting(false);
    }
  };

  return (
    <DoneCard
      hasErrors={false}
      title={`เชื่อมต่อร้าน ${label} เรียบร้อย`}
      summary={
        <div className="w-full space-y-3">
          {shops.length > 0 && (
            <p className="body-text text-gray-700 dark:text-gray-300">
              {shops.length === 1 ? 'ร้าน' : 'ร้านที่เชื่อม:'} <strong>{shops.join(' · ')}</strong> เริ่มรับออเดอร์และสินค้าเข้าระบบแล้ว
            </p>
          )}
          <div className="mx-auto max-w-lg rounded-lg bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-left">
            <p className="body-text font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" /> จะเชื่อมต่อแชทของ {label} ด้วยไหม
            </p>
            <p className="subtitle-text text-gray-600 dark:text-gray-400 mt-1">
              แชทของ {label} เป็นแอปแยกจากออเดอร์ (ชื่อ &ldquo;AooCommerce Chat&rdquo;) จึงต้องล็อกอิน {label} อีกครั้งเพื่ออนุญาตแอปนี้
              — ข้ามไปก่อนได้ แล้วมาเชื่อมทีหลังที่ ตั้งค่า › ช่องทางแชท
            </p>
          </div>
        </div>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => router.push(backUrl)} disabled={connecting}>
            ไว้ทีหลัง
          </Button>
          <Button
            variant="primary"
            loading={connecting}
            icon={<PlatformIcon id={platform} size={16} mono />}
            onClick={connectChat}
          >
            เชื่อมต่อแชทเลย
          </Button>
        </>
      }
    />
  );
}

export default function MarketplaceConnectedPage() {
  return (
    <Layout>
      <Container size="2xl">
        <Suspense fallback={<LoadingCard />}>
          <ConnectedContent />
        </Suspense>
      </Container>
    </Layout>
  );
}
