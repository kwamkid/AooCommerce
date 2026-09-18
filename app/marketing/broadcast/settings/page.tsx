// Path: app/marketing/broadcast/settings/page.tsx
//
// รายการเพจ Facebook + สถานะว่าตั้งค่าครบหรือยัง — ตั้งค่าจริงอยู่ที่ `[id]/page.tsx` ทีละเพจ
// (ร้านมีได้หลายเพจ ยัดทุกเพจทุกหัวข้อไว้หน้าเดียวแล้วหาไม่เจอว่าอันไหนตั้งแล้ว)
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { BroadcastIcon, ConfirmIcon, InfoIcon, SettingsIcon } from '@/lib/icons';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import ChannelBadge from '@/components/ui/ChannelBadge';
import { LoadingCard, NoPermissionCard, EmptyCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { BROADCAST_PLATFORMS, BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';
import { readOptinConfig, OPTIN_TRIGGERS, type OptinTrigger } from '@/lib/broadcast/optin';

interface PageAccount {
  id: string;
  account_name: string;
  picture_url: string | null;
  platform: string;
  is_active: boolean;
  broadcast_ready?: boolean;
  credentials?: Record<string, unknown>;
}

export default function BroadcastSettingsPage() {
  const { allowed, loading: permLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });
  const { showToast } = useToast();

  const [pages, setPages] = useState<PageAccount[]>([]);
  const [hasAdAccount, setHasAdAccount] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chatRes, adRes] = await Promise.all([
        apiFetch('/api/chat-accounts'),
        apiFetch('/api/ads/accounts?lite=1'),
      ]);
      const chatData = chatRes.ok ? await chatRes.json() : { accounts: [] };
      setPages((chatData.accounts || []).filter((a: PageAccount) => a.platform === 'facebook' && a.is_active));

      const adData = adRes.ok ? await adRes.json() : null;
      setHasAdAccount(((adData?.accounts || adData || []) as { external_id?: string }[]).some(a => a.external_id));
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(load, allowed && !permLoading);

  if (permLoading || loading) {
    return <Layout><Container size="4xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="4xl"><NoPermissionCard /></Container></Layout>;
  }

  const info = BROADCAST_PLATFORMS.facebook;

  return (
    <Layout>
      <Container size="4xl">
        <PageHeader
          icon={<BroadcastIcon />}
          title="ตั้งค่าบรอดแคสต์"
          subtitle="เพจ Facebook ต้องผูกบัญชีโฆษณาและตั้งงบก่อน จึงจะเลือกเป็นช่องทางบรอดแคสต์ได้"
          backHref="/marketing/broadcast"
        />

        <Alert tone="info" title="ข้อความการตลาดบน Messenger คิดเงินต่อข้อความ">
          ส่งถึง<strong>คนที่กดรับข่าวสาร</strong>ได้ตลอด ไม่ติดกรอบ 24 ชั่วโมงเหมือนแชทปกติ
          — แต่ส่งผ่านบัญชีโฆษณาและ Meta หักเงินตามจำนวนข้อความที่ถึงเครื่องลูกค้าจริง
          จึงต้องตั้งงบเป็นเพดานไว้ก่อน · ส่งได้ 1 ข้อความ ต่อคน ต่อ 12 ชั่วโมง
        </Alert>

        {!hasAdAccount && (
          <Alert tone="warning" title="ยังไม่มีบัญชีโฆษณา">
            ต้องเชื่อมบัญชีโฆษณาที่ผูกบัตรแล้วก่อน — ไปที่ ตั้งค่า › บัญชีโฆษณา
          </Alert>
        )}

        {pages.length === 0 ? (
          <EmptyCard
            title="ยังไม่มีเพจ Facebook"
            subtitle="เชื่อมเพจที่ ตั้งค่า › ช่องทาง Chat ก่อน แล้วกลับมาตั้งค่าบรอดแคสต์ที่นี่"
          />
        ) : (
          <div className="space-y-3">
            {pages.map(page => {
              const c = page.credentials || {};
              const satang = Number(c[BROADCAST_SETUP_KEYS.dailyBudget] ?? 0);
              const optin = readOptinConfig(c, page.account_name);
              const autoOn = (['after_sale', 'quiet'] as OptinTrigger[]).filter(t => optin[t].enabled);

              return (
                <Card key={page.id} padding="md">
                  <div className="flex items-center gap-3">
                    <ChannelBadge channel={{ platform: 'facebook', picture_url: page.picture_url }} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="heading-4 truncate">{page.account_name}</p>
                        {page.broadcast_ready
                          ? <Badge tone="emerald" size="sm">พร้อมบรอดแคสต์</Badge>
                          : <Badge tone="amber" size="sm">ยังตั้งค่าไม่ครบ</Badge>}
                      </div>
                      {/* สรุปว่าตั้งอะไรไว้แล้วบ้าง — จะได้ไม่ต้องกดเข้าไปดูทีละเพจ */}
                      <p className="subtitle-text mt-0.5">
                        {page.broadcast_ready
                          ? `งบ ${formatPrice(satang / 100)} บาท/วัน`
                          : 'ยังไม่ได้ผูกบัญชีโฆษณาหรือยังไม่ได้ตั้งงบ'}
                        {' · '}
                        {autoOn.length
                          ? `ชวนรับข่าวสารอัตโนมัติ: ${autoOn.map(t => OPTIN_TRIGGERS[t].label).join(' · ')}`
                          : 'ชวนรับข่าวสารเฉพาะตอนแอดมินกดเอง'}
                      </p>
                    </div>
                    <Link href={`/marketing/broadcast/settings/${page.id}`} className="flex-shrink-0">
                      <Button
                        variant={page.broadcast_ready ? 'secondary' : 'primary'}
                        size="sm"
                        icon={page.broadcast_ready ? <ConfirmIcon className="w-4 h-4" /> : <SettingsIcon className="w-4 h-4" />}
                      >
                        {page.broadcast_ready ? 'แก้ไข' : 'ตั้งค่า'}
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <p className="helper-text flex items-start gap-1.5 mt-4">
          <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{info.setupHint}</span>
        </p>
      </Container>
    </Layout>
  );
}
