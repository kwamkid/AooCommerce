'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ImportButton } from '@/components/ui/ExportImportButton';
import Checkbox from '@/components/ui/Checkbox';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { ProgressBar } from '@/components/ui/Chart';
import { LoadingCard, EmptyCard, DoneCard } from '@/components/ui/StateCard';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session-manager';
import { useMarketplaceGuard } from '@/lib/useMarketplaceGuard';
import { formatPrice } from '@/lib/utils/format';
import { ShoppingBag, Package, Link2 } from 'lucide-react';

interface TikTokImportItem {
  product_id: string;
  title: string;
  status: string;
  image: string | null;
  sku_count: number;
  price: number;
  has_variation: boolean;
  linked_product_id: string | null;
  linked_product_name: string | null;
  detail_error?: boolean;
}

interface ImportSummary {
  products_created: number;
  products_updated: number;
  products_skipped: number;
  links_created: number;
  errors: string[];
}

function TikTokImportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { allowed, checking } = useMarketplaceGuard();

  const accountId = searchParams.get('account_id') || '';
  const accountName = searchParams.get('account_name') || 'TikTok Shop';

  const [items, setItems] = useState<TikTokImportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [copySkuToBarcode, setCopySkuToBarcode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number | null; label: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const loadPreview = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`/api/tiktok/products/import?account_id=${accountId}&page_size=20`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดรายการสินค้าไม่สำเร็จ');
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'โหลดรายการสินค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (allowed) loadPreview();
  }, [allowed, loadPreview]);

  const runImport = async () => {
    if (!accountId) return;
    setImporting(true);
    setSummary(null);
    setProgress({ current: 0, total: null, label: 'กำลังเริ่ม...' });

    try {
      // SSE — apiFetch อ่าน body เป็น json ไม่ได้ ต้องยิง fetch ตรงพร้อมแนบ token เอง
      const token = await getAccessToken();
      const res = await fetch('/api/tiktok/products/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          marketplace_account_id: accountId,
          copy_sku_to_barcode: copySkuToBarcode,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'เริ่มนำเข้าไม่สำเร็จ');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));

          if (evt.type === 'progress') {
            setProgress({ current: evt.current, total: evt.total, label: evt.label });
          } else if (evt.type === 'done') {
            setSummary({
              products_created: evt.products_created,
              products_updated: evt.products_updated,
              products_skipped: evt.products_skipped,
              links_created: evt.links_created,
              errors: evt.errors || [],
            });
            setProgress(null);
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'นำเข้าไม่สำเร็จ');
          }
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ', 'error');
      setProgress(null);
    } finally {
      setImporting(false);
    }
  };

  if (checking) return <LoadingCard />;
  if (!allowed) return null;

  if (!accountId) {
    return (
      <Container size="4xl">
        <PageHeader
          title="นำเข้าสินค้าจาก TikTok"
          backHref="/settings/sales-channels?tab=marketplace"
        />
        <Alert tone="danger" title="ไม่ได้ระบุร้าน">
          เปิดหน้านี้จาก ตั้งค่า &gt; ช่องทางขาย &gt; เชื่อมต่อ Marketplace แล้วกดปุ่มนำเข้าที่การ์ดร้าน
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="4xl">
      <PageHeader
        title="นำเข้าสินค้าจาก TikTok"
        subtitle={accountName}
        backHref="/settings/sales-channels?tab=marketplace"
      />

      {summary ? (
        <DoneCard
          hasErrors={summary.errors.length > 0}
          title="นำเข้าสินค้าเสร็จแล้ว"
          summary={
            <div className="flex flex-wrap justify-center gap-2">
              <Badge tone="emerald">{summary.products_created} สร้างใหม่</Badge>
              <Badge tone="blue">{summary.products_updated} อัปเดต</Badge>
              <Badge tone="indigo">{summary.links_created} ผูกกับ TikTok</Badge>
              {summary.products_skipped > 0 && (
                <Badge tone="amber">{summary.products_skipped} ข้าม</Badge>
              )}
              {summary.errors.length > 0 && (
                <Badge tone="red">{summary.errors.length} ผิดพลาด</Badge>
              )}
            </div>
          }
          actions={
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => { setSummary(null); loadPreview(); }}>
                นำเข้าอีกครั้ง
              </Button>
              <Button variant="primary" onClick={() => router.push('/products')}>
                ดูสินค้าในระบบ
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Alert tone="info" title="นำเข้าทั้งร้าน">
            ระบบจะดูดสินค้าทุกตัวในร้านนี้เข้าคลัง · ตัวที่ <b>SKU ตรงกับสินค้าที่มีอยู่แล้ว จะผูกให้อัตโนมัติ
            ไม่สร้างซ้ำ</b> · สินค้าที่คุณแก้เองในระบบ (ชื่อ/รายละเอียด) จะไม่ถูกเขียนทับ
            <div className="mt-2">
              ควรนำเข้าก่อนเปิดรับออเดอร์จริง — ถ้าสินค้ายังไม่มีในระบบ ออเดอร์ที่เข้ามาจะสร้างสินค้าใหม่ตาม SKU ที่ได้รับ
            </div>
          </Alert>

          <Card>
            <div className="space-y-4">
              <Checkbox
                checked={copySkuToBarcode}
                onChange={setCopySkuToBarcode}
                label="คัดลอก SKU ไปเป็นบาร์โค้ดด้วย (สำหรับร้านที่ยิงบาร์โค้ดด้วย SKU)"
                disabled={importing}
              />

              {progress && (
                <div className="space-y-2">
                  <ProgressBar
                    value={progress.current}
                    max={progress.total || Math.max(progress.current, 1)}
                    label={progress.label}
                  />
                  {progress.total === null && (
                    <p className="helper-text text-gray-500">ยังไม่ทราบจำนวนทั้งหมด กำลังไล่รายการอยู่</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" disabled={importing} onClick={() => router.back()}>
                  ยกเลิก
                </Button>
                <ImportButton loading={importing} onClick={runImport}>
                  นำเข้าสินค้าทั้งหมด
                </ImportButton>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="heading-3">ตัวอย่างสินค้าในร้าน</h2>
              {total > 0 && (
                <span className="subtitle-text text-gray-500">
                  แสดง {items.length} จาก {total} รายการ
                </span>
              )}
            </div>

            {loading ? (
              <LoadingCard />
            ) : loadError ? (
              <Alert tone="danger" title="โหลดรายการไม่สำเร็จ">
                {loadError}
                <div className="mt-3">
                  <Button variant="secondary" onClick={loadPreview}>ลองใหม่</Button>
                </div>
              </Alert>
            ) : items.length === 0 ? (
              <EmptyCard
                icon={<Package className="w-8 h-8" />}
                title="ไม่พบสินค้าในร้านนี้"
                subtitle="ร้าน TikTok นี้ยังไม่มีสินค้าที่เผยแพร่อยู่"
              />
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div
                    key={item.product_id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700"
                  >
                    <ProductImageThumb
                      src={item.image}
                      alt={item.title}
                      size="sm"
                      fallbackIcon={<ShoppingBag className="w-5 h-5" />}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate body-text">{item.title}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="helper-text text-gray-500">
                          {item.has_variation ? `${item.sku_count} ตัวเลือก` : 'สินค้าเดี่ยว'}
                        </span>
                        {item.price > 0 && (
                          <span className="helper-text text-gray-500">{formatPrice(item.price)}</span>
                        )}
                        {item.detail_error && (
                          <Badge tone="amber" size="sm">อ่านรายละเอียดไม่ได้</Badge>
                        )}
                      </div>
                    </div>
                    {item.linked_product_id ? (
                      <Badge tone="emerald" size="sm">
                        <Link2 className="w-3 h-3 inline mr-1" />
                        ผูกแล้ว
                      </Badge>
                    ) : (
                      <Badge tone="gray" size="sm">ยังไม่ผูก</Badge>
                    )}
                  </div>
                ))}
                {total > items.length && (
                  <p className="helper-text text-gray-500 text-center pt-2">
                    ตัวอย่างแสดงแค่หน้าแรก — กดนำเข้าจะดูดครบทั้ง {total} รายการ
                  </p>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </Container>
  );
}

export default function TikTokImportPage() {
  return (
    <Layout>
      <Suspense fallback={<LoadingCard />}>
        <TikTokImportContent />
      </Suspense>
    </Layout>
  );
}
