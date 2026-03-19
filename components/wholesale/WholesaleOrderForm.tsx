'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useRouter } from 'next/navigation';
import {
  Loader2, Save, Users, CheckCircle,
} from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { resolveGp, fetchGpContext, type GpResolverContext } from '@/lib/gp-resolver';

// ── Types ──────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  customer_type: string;
  sale_type: string | null;
}

interface OrderItem {
  variation_id: string;
  product_id: string;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  quantity: number;
  original_price: number;
  discount_rate: number;
  unit_price: number;
  gp_level: number;
  brand_id: string | null;
  image: string | null;
}

interface Props {
  customerTypeFilter: string;
  defaultFlowType?: 'w_cash' | 'w_credit';
  title: string;
  backUrl: string;
}

// ── Component ──────────────────────────────────────────────

export default function WholesaleOrderForm({ customerTypeFilter, defaultFlowType, title, backUrl }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGp, setLoadingGp] = useState(false);
  const [flowType, setFlowType] = useState<'w_cash' | 'w_credit'>(defaultFlowType || 'w_cash');

  // Products
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch customers
  useEffect(() => {
    apiFetch(`/api/customers?active=true&type=${customerTypeFilter}`)
      .then(r => r.json())
      .then(d => setCustomers(d.data || d.customers || []))
      .catch(() => {});
  }, [customerTypeFilter]);

  // Fetch products
  useEffect(() => {
    setLoadingProducts(true);
    apiFetch('/api/products?limit=999&active=true')
      .then(r => r.json())
      .then(result => {
        const flat: ProductSearchItem[] = [];
        for (const p of result.products || []) {
          for (const v of p.variations || []) {
            if (!v.id) continue;
            flat.push({
              id: v.id,
              product_id: p.id,
              code: p.code || v.sku || '',
              name: p.name,
              variation_label: v.variation_label,
              sku: v.sku,
              default_price: v.default_price || 0,
              discount_price: v.discount_price || 0,
              brand_id: p.brand_id || null,
              image: v.image || p.image || null,
            });
          }
        }
        setProducts(flat);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // GP context when customer changes
  const handleCustomerChange = useCallback(async (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find(c => c.id === custId) || null;
    setSelectedCustomer(cust);
    setItems([]);

    if (cust?.sale_type === 'wholesale_credit') setFlowType('w_credit');
    else if (cust?.sale_type === 'wholesale_cash') setFlowType('w_cash');
    else if (defaultFlowType) setFlowType(defaultFlowType);

    if (custId) {
      setLoadingGp(true);
      try { setGpContext(await fetchGpContext(custId)); }
      catch { setGpContext(null); }
      finally { setLoadingGp(false); }
    } else {
      setGpContext(null);
    }
  }, [customers, defaultFlowType]);

  // Add product
  const handleAddProduct = (p: ProductSearchItem) => {
    if (!p.id) return;
    const existingIdx = items.findIndex(i => i.variation_id === p.id);
    if (existingIdx >= 0 && p.id) {
      setItems(prev => prev.map((i, idx) =>
        idx === existingIdx ? { ...i, quantity: i.quantity + 1 } : i
      ));
      return;
    }

    const resolution = gpContext ? resolveGp(gpContext, {
      brand_id: p.brand_id || null,
      default_price: p.default_price || 0,
      discount_price: p.discount_price || 0,
    }) : null;

    setItems(prev => [...prev, {
      variation_id: p.id,
      product_id: p.product_id,
      product_name: p.name,
      variation_label: p.variation_label || null,
      sku: p.sku || null,
      quantity: 1,
      original_price: resolution?.base_price || p.default_price || 0,
      discount_rate: resolution?.gp_rate || 0,
      unit_price: resolution?.unit_price || p.default_price || 0,
      gp_level: resolution?.gp_level || 4,
      brand_id: p.brand_id || null,
      image: p.image || null,
    }]);
  };

  const updateItem = (idx: number, field: string, value: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // GP info text for each item
  const gpInfoText = (item: OrderItem) => {
    if (!item.discount_rate) return null;
    const baseLabel = gpContext?.customerGpBasePrice === 'discounted' ? 'ลด' : 'ปลีก';
    return `฿${item.original_price.toLocaleString()}(${baseLabel}) - ${item.discount_rate}% = ฿${item.unit_price.toLocaleString()}`;
  };

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const formatMoney = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Submit
  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast('กรุณาเลือกลูกค้า', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          source: 'manual',
          notes,
          items: items.map(i => ({
            variation_id: i.variation_id,
            product_id: i.product_id,
            product_name: i.product_name,
            variation_label: i.variation_label,
            sku: i.sku,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const data = await res.json();
      showToast(`สร้างคำสั่งซื้อ ${data.order_number} สำเร็จ`, 'success');
      router.push(backUrl);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Customer selection */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-[#F4511E]/30 p-5">
        <label className="block text-base font-medium text-[#F4511E] mb-2">
          ลูกค้า <span className="text-red-500">*</span>
        </label>
        <EntitySearchInput
          value={selectedCustomerId}
          onChange={handleCustomerChange}
          onClear={() => { setSelectedCustomerId(''); setSelectedCustomer(null); setGpContext(null); setItems([]); }}
          options={customers.map(c => ({
            id: c.id,
            label: c.name,
            subtitle: c.phone || undefined,
            icon: <Users className="w-4 h-4 text-gray-400" />,
          }))}
          placeholder="ค้นหาชื่อลูกค้า..."
          emptyMessage="ไม่พบลูกค้า"
        />

        {selectedCustomer && (
          <div className="mt-3 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
            <div className="flex items-start gap-2">
              {loadingGp
                ? <Loader2 className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5 animate-spin" />
                : <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                {selectedCustomer.contact_person && <span className="text-gray-600 dark:text-slate-300">ติดต่อ: <span className="font-medium">{selectedCustomer.contact_person}</span></span>}
                {selectedCustomer.phone && <span className="text-gray-500 dark:text-slate-400">โทร: {selectedCustomer.phone}</span>}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${flowType === 'w_credit' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                  {flowType === 'w_credit' ? 'เครดิต' : 'เงินสด'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2-Column: Items + Summary */}
      {selectedCustomerId && gpContext && (
        <div className="flex flex-wrap gap-4 items-start">
          {/* Left: ItemsTable */}
          <div className="flex-1 basis-[400px] min-w-0 space-y-4">
            <ItemsTable
              items={items.map((i): TableItem => ({
                variation_id: i.variation_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                image: i.image,
                quantity: i.quantity,
                unit_price: i.unit_price,
                gpInfo: gpInfoText(i),
              }))}
              columns={['qty', 'unit_price', 'total']}
              products={products}
              loadingProducts={loadingProducts}
              inputRef={searchInputRef}
              onAdd={handleAddProduct}
              searchDisabledMessage={loadingGp ? 'กำลังโหลดข้อมูลราคา...' : undefined}
              onUpdateField={(idx, field, value) => {
                if (field === 'quantity') updateItem(idx, 'quantity', value as number);
                if (field === 'unit_price') updateItem(idx, 'unit_price', value as number);
              }}
              onRemove={removeItem}
              showSummary={false}
            />
          </div>

          {/* Right: Summary */}
          <div className="w-full lg:w-[280px] flex-shrink-0">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 lg:sticky lg:top-4 space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">สรุปคำสั่งซื้อ</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">ยอดรวมสินค้า (รวม VAT)</span>
                  <span className="text-gray-900 dark:text-white">฿{formatMoney(subtotal)}</span>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-slate-700 pt-3 flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-white">ยอดรวมสุทธิ</span>
                <span className="text-xl font-bold text-[#F4511E]">฿{formatMoney(subtotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {selectedCustomerId && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
            หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
          />
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push(backUrl)} className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !selectedCustomerId || items.length === 0}
          className="px-6 py-2 text-sm bg-[#F4511E] text-white rounded-lg hover:bg-[#E64A19] disabled:opacity-50 flex items-center gap-1.5 font-medium"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          สร้างคำสั่งซื้อ
        </button>
      </div>
    </div>
  );
}
