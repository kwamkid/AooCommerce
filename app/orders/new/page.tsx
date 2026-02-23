'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import OrderForm from '@/components/orders/OrderForm';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2, Copy } from 'lucide-react';

interface InitialOrderData {
  customer_id: string;
  delivery_date?: string;
  notes?: string;
  internal_notes?: string;
  discount_amount?: number;
  branches: {
    shipping_address_id: string;
    address_name: string;
    delivery_notes: string;
    shipping_fee: number;
    products: {
      variation_id: string;
      product_id: string;
      product_code: string;
      product_name: string;
      variation_label?: string;
      quantity: number;
      unit_price: number;
      discount_value: number;
      discount_type: 'percent' | 'amount';
    }[];
  }[];
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <NewOrderContent />
    </Suspense>
  );
}

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get('duplicate');
  const warehouseRef = useRef<HTMLDivElement>(null);

  const [initialData, setInitialData] = useState<InitialOrderData | undefined>(undefined);
  const [loadingDuplicate, setLoadingDuplicate] = useState(!!duplicateId);
  const [duplicateError, setDuplicateError] = useState('');
  const [sourceOrderNumber, setSourceOrderNumber] = useState('');

  useEffect(() => {
    if (!duplicateId) return;

    const fetchSourceOrder = async () => {
      try {
        setLoadingDuplicate(true);
        const res = await apiFetch(`/api/orders/${duplicateId}`);
        if (!res.ok) throw new Error('ไม่พบคำสั่งซื้อต้นทาง');

        const { order } = await res.json();
        setSourceOrderNumber(order.order_number);

        // Convert order items + shipments → branch-first structure
        const branchMap = new Map<string, InitialOrderData['branches'][0]>();
        const DEFAULT_KEY = '__default__';

        for (const item of order.items || []) {
          const shipments = item.shipments || [];

          if (shipments.length === 0) {
            // No shipments — put into default branch
            if (!branchMap.has(DEFAULT_KEY)) {
              branchMap.set(DEFAULT_KEY, {
                shipping_address_id: '',
                address_name: 'รายการสินค้า',
                delivery_notes: '',
                shipping_fee: 0,
                products: [],
              });
            }
            const branch = branchMap.get(DEFAULT_KEY)!;
            branch.products.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: item.product_code,
              product_name: item.product_name,
              variation_label: item.variation_label,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_value: item.discount_percent || 0,
              discount_type: 'percent',
            });
          } else {
            for (const shipment of shipments) {
              const addrId = shipment.shipping_address_id;
              if (!branchMap.has(addrId)) {
                branchMap.set(addrId, {
                  shipping_address_id: addrId,
                  address_name: shipment.shipping_address?.address_name || '',
                  delivery_notes: shipment.delivery_notes || '',
                  shipping_fee: shipment.shipping_fee || 0,
                  products: [],
                });
              }

              const branch = branchMap.get(addrId)!;
              const existing = branch.products.find(p => p.variation_id === item.variation_id);
              if (existing) {
                existing.quantity += shipment.quantity;
              } else {
                branch.products.push({
                  variation_id: item.variation_id,
                  product_id: item.product_id,
                  product_code: item.product_code,
                  product_name: item.product_name,
                  variation_label: item.variation_label,
                  quantity: shipment.quantity,
                  unit_price: item.unit_price,
                  discount_value: item.discount_percent || 0,
                  discount_type: 'percent',
                });
              }
            }
          }
        }

        setInitialData({
          customer_id: order.customer?.id || order.customer_id,
          notes: order.notes || undefined,
          internal_notes: order.internal_notes || undefined,
          discount_amount: order.discount_amount || undefined,
          branches: Array.from(branchMap.values()),
        });
      } catch (err) {
        console.error('Error fetching source order:', err);
        setDuplicateError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setLoadingDuplicate(false);
      }
    };

    fetchSourceOrder();
  }, [duplicateId]);

  if (loadingDuplicate) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (duplicateError) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สั่งซ้ำ</h1>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {duplicateError}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {duplicateId ? 'สั่งซ้ำ' : 'สร้างคำสั่งซื้อใหม่'}
              </h1>
              {sourceOrderNumber && (
                <p className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />
                  คัดลอกจาก #{sourceOrderNumber}
                </p>
              )}
            </div>
          </div>
          <div ref={warehouseRef} />
        </div>

        {/* Order Form */}
        <OrderForm
          warehousePortalRef={warehouseRef}
          initialOrderData={initialData}
        />
      </div>
    </Layout>
  );
}
