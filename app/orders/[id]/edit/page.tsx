'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Alert from '@/components/ui/Alert';
import { LoadingCard } from '@/components/ui/StateCard';
import OrderForm from '@/components/orders/OrderForm';
import { apiFetch } from '@/lib/api-client';

export default function EditOrderPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <EditOrderContent />
    </Suspense>
  );
}

function EditOrderContent() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const warehouseRef = useRef<HTMLDivElement>(null);
  const salesChannelRef = useRef<HTMLDivElement>(null);

  // Pre-fetch order so PageHeader can show order_number/date.
  // OrderForm reuses this via preloadedOrder — no duplicate fetch.
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/orders?id=${orderId}`);
        if (!res.ok) throw new Error('ไม่พบคำสั่งซื้อ');
        const data = await res.json();
        if (!cancelled) setOrder(data.order);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) {
    return (
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <Container size="full" gap="sm">
          <PageHeader title="แก้ไขคำสั่งซื้อ" backHref={`/orders/${orderId}`} />
          <Alert tone="danger">{error || 'ไม่พบคำสั่งซื้อ'}</Alert>
        </Container>
      </Layout>
    );
  }

  const subtitle = order.order_date
    ? `สร้างเมื่อ: ${new Date(order.order_date).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })}`
    : undefined;

  return (
    <Layout>
      <Container size="full" gap="sm">
        <PageHeader
          title={`แก้ไขคำสั่งซื้อ #${order.order_number}`}
          subtitle={subtitle}
          backHref={`/orders/${orderId}`}
          actions={
            <div className="flex items-center gap-2">
              <div ref={warehouseRef} />
              <div ref={salesChannelRef} />
            </div>
          }
        />

        <OrderForm
          editOrderId={orderId}
          preloadedOrder={order}
          warehousePortalRef={warehouseRef}
          salesChannelPortalRef={salesChannelRef}
          onSuccess={() => router.push(`/orders/${orderId}`)}
        />
      </Container>
    </Layout>
  );
}
