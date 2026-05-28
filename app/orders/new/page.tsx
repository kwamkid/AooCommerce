'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard } from '@/components/ui/StateCard';
import OrderForm from '@/components/orders/OrderForm';
import { apiFetch } from '@/lib/api-client';
import { Copy, Repeat, Package, CornerDownRight } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';

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
      image?: string;
      quantity: number;
      unit_price: number;
      discount_value: number;
      discount_type: 'percent' | 'amount';
    }[];
  }[];
}

export interface ExchangeData {
  from_order_id: string;
  items: { order_item_id: string; quantity: number }[];
  reason: string;
}

interface ExchangeReturnItem {
  product_name: string;
  variation_label?: string;
  image?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  line_total: number;
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
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
  const exchangeDataParam = searchParams.get('exchange_data');
  const fromOrderId = searchParams.get('from_order');
  const warehouseRef = useRef<HTMLDivElement>(null);
  const salesChannelRef = useRef<HTMLDivElement>(null);

  const isExchange = !!exchangeDataParam && !!fromOrderId;

  const [initialData, setInitialData] = useState<InitialOrderData | undefined>(undefined);
  const [loadingDuplicate, setLoadingDuplicate] = useState(!!duplicateId || !!fromOrderId);
  const [duplicateError, setDuplicateError] = useState('');
  const [sourceOrderNumber, setSourceOrderNumber] = useState('');
  const [exchangeData, setExchangeData] = useState<ExchangeData | undefined>(undefined);
  const [exchangeCreditAmount, setExchangeCreditAmount] = useState(0);
  const [exchangeReturnItems, setExchangeReturnItems] = useState<ExchangeReturnItem[]>([]);

  // Exchange: decode exchange_data, fetch original order for customer + calculate credit amount
  useEffect(() => {
    if (!isExchange || !fromOrderId || !exchangeDataParam) return;

    const fetchExchangeSource = async () => {
      try {
        setLoadingDuplicate(true);

        // Decode exchange data from URL
        const decoded = JSON.parse(decodeURIComponent(atob(exchangeDataParam))) as {
          items: { order_item_id: string; quantity: number }[];
          reason: string;
        };

        setExchangeData({
          from_order_id: fromOrderId,
          items: decoded.items,
          reason: decoded.reason,
        });

        // Fetch original order for customer info + items to calculate credit
        const res = await apiFetch(`/api/orders/${fromOrderId}`);
        if (!res.ok) throw new Error('ไม่พบคำสั่งซื้อต้นทาง');

        const { order } = await res.json();
        setSourceOrderNumber(order.order_number);

        // Calculate credit amount + collect return item details
        const orderItems = order.items || [];
        let creditAmount = 0;
        const returnItems: ExchangeReturnItem[] = [];
        for (const exchangeItem of decoded.items) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oi = orderItems.find((i: any) => i.id === exchangeItem.order_item_id);
          if (oi) {
            const lineTotal = Number(oi.unit_price || 0) * exchangeItem.quantity;
            const lineDiscount = oi.discount_percent
              ? lineTotal * Number(oi.discount_percent) / 100
              : 0;
            const net = lineTotal - lineDiscount;
            creditAmount += net;
            returnItems.push({
              product_name: oi.product_name,
              variation_label: oi.variation_label,
              image: oi.image,
              quantity: exchangeItem.quantity,
              unit_price: Number(oi.unit_price || 0),
              discount_percent: oi.discount_percent ? Number(oi.discount_percent) : undefined,
              line_total: net,
            });
          }
        }
        setExchangeCreditAmount(creditAmount);
        setExchangeReturnItems(returnItems);

        // Only fill customer (no products — user picks new items)
        setInitialData({
          customer_id: order.customer?.id || order.customer_id,
          branches: [],
        });
      } catch (err) {
        console.error('Error fetching exchange source:', err);
        setDuplicateError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setLoadingDuplicate(false);
      }
    };

    fetchExchangeSource();
  }, [fromOrderId, exchangeDataParam, isExchange]);

  // Duplicate: fetch source order for full copy
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
              image: item.image || undefined,
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
                  image: item.image || undefined,
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
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  if (duplicateError) {
    return (
      <Layout>
        <Container size="full" gap="sm">
          <PageHeader title="สั่งซ้ำ" backHref="-1" />
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {duplicateError}
          </div>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full" gap="sm">
        {/* Header */}
        <PageHeader
          title={isExchange ? 'เปลี่ยนสินค้า' : duplicateId ? 'สั่งซ้ำ' : 'สร้างคำสั่งซื้อใหม่'}
          subtitle={
            isExchange && sourceOrderNumber ? (
              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5" />
                เปลี่ยนสินค้าจากบิล #{sourceOrderNumber}
              </span>
            ) : !isExchange && sourceOrderNumber ? (
              <span className="flex items-center gap-1">
                <Copy className="w-3.5 h-3.5" />
                คัดลอกจาก #{sourceOrderNumber}
              </span>
            ) : undefined
          }
          backHref="-1"
          actions={
            <div className="flex items-center gap-2">
              <div ref={warehouseRef} />
              <div ref={salesChannelRef} />
            </div>
          }
        />

        {/* Exchange: Return Items Summary */}
        {isExchange && exchangeReturnItems.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-200 dark:border-orange-800/30 flex items-center gap-2">
              <CornerDownRight className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">สินค้าที่คืน</h3>
              <span className="text-xs text-orange-500 dark:text-orange-500">({exchangeReturnItems.length} รายการ)</span>
            </div>
            <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
              {exchangeReturnItems.map((item, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-center gap-3">
                  {item.image ? (
                    <img src={item.image} alt={item.product_name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-orange-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 dark:text-white truncate">{item.product_name}</div>
                    {item.variation_label && (
                      <div className="text-xs text-gray-500 dark:text-slate-400">{item.variation_label}</div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    x{item.quantity}
                  </div>
                  <div className="text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap w-24 text-right">
                    {formatPrice(item.line_total)}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-orange-200 dark:border-orange-800/30 flex items-center justify-between">
              <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">เครดิตจากบิลเดิม</span>
              <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{formatPrice(exchangeCreditAmount)}</span>
            </div>
          </div>
        )}

        {/* Order Form */}
        <OrderForm
          warehousePortalRef={warehouseRef}
          salesChannelPortalRef={salesChannelRef}
          initialOrderData={initialData}
          exchangeData={exchangeData}
          exchangeCreditAmount={exchangeCreditAmount}
        />
      </Container>
    </Layout>
  );
}
