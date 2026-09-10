// Path: app/dev/design/broadcast-editor/page.tsx
//
// ที่ลองตัวแก้ไขบรอดแคสต์แบบบล็อก — `BlocksEditor` + `BroadcastPreview` ตัวเดียวกับหน้าสร้างจริง
// (/marketing/broadcast/new ขั้น "ส่งอะไร") · ค้นสินค้า อ่านสถานะหน้าร้าน และบัญชี LINE ของบริษัทที่ล็อกอินอยู่จริง
// แต่ **ไม่อัปรูป ไม่บันทึก ไม่ส่ง** — ลองหน้าตาได้โดยไม่ต้องเดินขั้นเลือกกลุ่มผู้รับ
//
// เคยเป็นต้นแบบทั้งก้อน (10–11 ก.ย. 2026) · เจ้าของเคาะแล้วย้ายโค้ดไปเป็น BlocksEditor
// ⛔ หน้านี้ห้ามมีโค้ดตัวแก้ไขของตัวเองอีก — แก้ที่ BlocksEditor ที่เดียว ทั้งสองหน้าได้พร้อมกัน
'use client';

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import AccountPicker, { type PickerAccount } from '@/components/ui/AccountPicker';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import BroadcastPreview from '@/components/broadcast/BroadcastPreview';
import BlocksEditor from '@/app/marketing/broadcast/new/components/BlocksEditor';
import {
  draftImage, editorBlocksError, editorToContent, newBlock, previewImage, type EditorBlock,
} from '@/app/marketing/broadcast/new/components/blocks-model';
import { fetchProductPage, productSearchItemToCard } from '@/app/marketing/broadcast/new/components/product-search';
import { apiFetch } from '@/lib/api-client';
import { useServerSearch } from '@/lib/useServerSearch';
import { validateBroadcastContent } from '@/lib/broadcast/content';
import { BROADCAST_PLATFORMS } from '@/lib/broadcast/platforms';

export default function BroadcastEditorPlaygroundPage() {
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => [newBlock('text')]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const productSearch = useServerSearch<ProductSearchItem>({ fetch: fetchProductPage });
  /** ร้านเปิดหน้าร้านออนไลน์แล้วไหม — "ไปที่สินค้า" ใช้ได้เฉพาะตอนเปิดแล้ว */
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  /** บัญชี LINE ของบริษัทที่ล็อกอินอยู่ — ตัวอย่างใช้ชื่อ+รูปของบัญชีแรกที่เลือก */
  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storefront, chat] = await Promise.allSettled([
        apiFetch('/api/settings/storefront').then(r => (r.ok ? r.json() : null)),
        apiFetch('/api/chat-accounts').then(r => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;
      // ถามไม่ได้ = ถือว่ายังไม่เปิด (ชิปจะปิดพร้อมบอกเหตุผล)
      if (storefront.status === 'fulfilled') {
        setStorefrontOpen(!!storefront.value?.storefront?.enabled && !!storefront.value?.slug);
      }
      if (chat.status === 'fulfilled') {
        const list: PickerAccount[] = (chat.value?.accounts || [])
          .filter((a: { is_active?: boolean; platform?: string }) => a.is_active && a.platform === 'line')
          .map((a: { id: string; account_name?: string; picture_url?: string | null }) => ({
            id: a.id,
            platform: 'line',
            name: a.account_name || 'LINE OA',
            picture_url: a.picture_url ?? null,
          }));
        setAccounts(list);
        setAccountIds(list[0] ? [list[0].id] : []);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // เลือกหลายบัญชี = ตัวอย่างใช้บัญชีแรกตามลำดับรายการ (กติกาเดียวกับหน้าสร้างจริง)
  const previewAccount = accounts.find(a => accountIds.includes(a.id)) ?? null;
  const previewContent = useMemo(() => editorToContent(blocks, quickReplies, previewImage), [blocks, quickReplies]);
  const draftContent = useMemo(() => editorToContent(blocks, quickReplies, draftImage), [blocks, quickReplies]);
  const contentError = editorBlocksError(blocks) ?? validateBroadcastContent('line', draftContent);

  return (
    <Layout>
      <Container size="6xl">
        <PageHeader
          backHref="/dev/design"
          title="ลองตัวแก้ไขบรอดแคสต์"
          subtitle="ตัวเดียวกับหน้าสร้างบรอดแคสต์จริง · ค้นสินค้าจริงของร้านที่เปิดอยู่ · ไม่อัปรูป ไม่บันทึก ไม่ส่ง"
        />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_372px] gap-4 items-start">
          <BlocksEditor
            blocks={blocks}
            onBlocksChange={setBlocks}
            quickReplies={quickReplies}
            onQuickRepliesChange={setQuickReplies}
            quickReplyMax={BROADCAST_PLATFORMS.line.compose.quickReplyMax}
            showCreditNote
            picker={{
              storefrontOpen,
              productResults: productSearch.results,
              productLoading: productSearch.loading,
              onProductSearch: productSearch.search,
              productToCard: productSearchItemToCard,
            }}
          />

          <div className="xl:sticky xl:top-4">
            <Card padding="md">
              <p className="field-label mb-1">ส่งจากบัญชี</p>
              <AccountPicker
                accounts={accounts}
                value={accountIds}
                onChange={setAccountIds}
                placeholder="เลือกบัญชี LINE"
                emptyMessage="ยังไม่มีบัญชี LINE ที่เชื่อมต่อ"
              />
              {accountIds.length > 1 && previewAccount && (
                <p className="subtitle-text mt-1">เลือกหลายบัญชี — ตัวอย่างใช้ชื่อและรูปของ {previewAccount.name}</p>
              )}
              {contentError && (
                <p className="subtitle-text text-red-600 dark:text-red-400 mt-3">{contentError}</p>
              )}
              <p className="field-label mt-4 mb-2">ตัวอย่างในแชทของลูกค้า</p>
              <BroadcastPreview
                content={previewContent}
                platform="line"
                accountName={previewAccount?.name ?? null}
                accountPictureUrl={previewAccount?.picture_url ?? null}
              />
            </Card>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
