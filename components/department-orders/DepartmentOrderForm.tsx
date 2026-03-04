'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Loader2, X, UserPlus, Package, Save } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import ProductSearchInput, { ProductSearchItem } from '@/components/ui/ProductSearchInput';

interface Customer {
  id: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
}

interface DeptOrderItem {
  product_id: string;
  variation_id: string | null;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  image: string | null;
  quantity: number;
  unit_price: number;
}

interface Props {
  warehouseId?: string;
}

export default function DepartmentOrderForm({ warehouseId }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DeptOrderItem[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/customers?active=true&type=department_store')
      .then(r => r.json())
      .then(d => setCustomers(d.data || d.customers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingProducts(true);
    apiFetch('/api/products?limit=999&active=true')
      .then(r => r.json())
      .then(result => {
        const flat: ProductSearchItem[] = [];
        for (const p of result.products || []) {
          if (p.product_type === 'simple') {
            const v = p.variations?.[0];
            flat.push({
              id: v?.variation_id || p.product_id,
              product_id: p.product_id,
              code: p.code,
              name: p.name,
              image: p.main_image_url || p.image || null,
              variation_label: p.simple_variation_label || null,
              sku: p.simple_sku || null,
              default_price: p.simple_default_price || 0,
            });
          } else {
            for (const v of p.variations || []) {
              flat.push({
                id: v.variation_id,
                product_id: p.product_id,
                code: p.code ? `${p.code}-${v.variation_label}` : p.code,
                name: p.name,
                image: v.image_url || p.main_image_url || null,
                variation_label: v.variation_label || null,
                sku: v.sku || null,
                default_price: v.price || 0,
              });
            }
          }
        }
        setProducts(flat);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const handleAddProduct = (p: ProductSearchItem) => {
    const exists = items.findIndex(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id));
    if (exists >= 0) {
      setItems(prev => prev.map((item, idx) => idx === exists ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setItems(prev => [...prev, {
        product_id: p.product_id,
        variation_id: p.id !== p.product_id ? p.id : null,
        product_name: p.name,
        variation_label: p.variation_label || null,
        sku: p.sku || null,
        image: p.image || null,
        quantity: 1,
        unit_price: p.default_price || 0,
      }]);
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const updateItem = (idx: number, field: 'quantity' | 'unit_price', value: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast('กรุณาเลือกห้างสรรพสินค้า', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/department-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selectedCustomerId, warehouse_id: warehouseId || null, notes, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(`สร้างใบส่งห้าง ${data.department_order_number} สำเร็จ`, 'success');
      router.push(`/department-orders/${data.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const customerOptions = customers.map(c => ({
    id: c.id,
    label: c.name,
    subtitle: c.customer_code || c.phone || undefined,
  }));

  return (
    <div className="space-y-4">
      {/* Product Search + Items Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Search Input */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <ProductSearchInput
            products={products}
            onSelect={handleAddProduct}
            placeholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
            loading={loadingProducts}
            inputRef={searchInputRef}
            isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id))}
          />
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500">
            <Package className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="data-table">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">สินค้า</th>
                    <th className="data-th text-center w-24">จำนวน</th>
                    <th className="data-th text-right w-32">ราคา/ชิ้น</th>
                    <th className="data-th text-right w-32">รวม</th>
                    <th className="data-th w-10"></th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="data-td">
                        <div className="flex items-center gap-2.5">
                          {item.image ? (
                            <img src={item.image} alt={item.product_name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="data-primary text-gray-900 dark:text-white truncate">
                              {item.product_name}{item.variation_label ? ` - ${item.variation_label}` : ''}
                            </p>
                            {item.sku && <p className="data-secondary text-gray-400">{item.sku}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="data-td text-center">
                        <input
                          type="number" min={1} value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        />
                      </td>
                      <td className="data-td text-right">
                        <div className="relative inline-block">
                          <input
                            type="number" min={0} step={0.01} value={item.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-28 px-2 pr-5 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">฿</span>
                        </div>
                      </td>
                      <td className="data-td text-right">
                        <span className="data-number text-gray-900 dark:text-white">
                          ฿{(item.quantity * item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="data-td text-center">
                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item, idx) => (
                <div key={idx} className="p-4 relative">
                  <button type="button" onClick={() => removeItem(idx)} className="absolute top-3 right-3 text-gray-400 hover:text-red-600 p-0.5 rounded transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-start gap-2.5 pr-6">
                    {item.image ? (
                      <img src={item.image} alt={item.product_name} className="w-12 h-12 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="data-primary text-gray-900 dark:text-white">
                        {item.product_name}{item.variation_label ? ` - ${item.variation_label}` : ''}
                      </p>
                      {item.sku && <p className="data-secondary text-gray-400">{item.sku}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number" min={1} value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 px-1 py-1 border border-gray-300 dark:border-slate-600 rounded text-center bg-white dark:bg-slate-700"
                        />
                        <span className="text-gray-400 text-xs">×</span>
                        <div className="relative">
                          <input
                            type="number" min={0} step={0.01} value={item.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 pr-4 py-1 border border-gray-300 dark:border-slate-600 rounded text-right bg-white dark:bg-slate-700"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">฿</span>
                        </div>
                        <span className="ml-auto data-number text-gray-900 dark:text-white">
                          ฿{(item.quantity * item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 flex justify-end">
              <div className="text-right">
                <span className="data-text text-gray-500 dark:text-slate-400">รวมทั้งหมด </span>
                <span className="data-number text-gray-900 dark:text-white text-base">
                  ฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Customer */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-1">
          <label className="label">ห้างสรรพสินค้า</label>
          <button
            type="button"
            onClick={() => router.push('/customers/new?type=department_store')}
            className="flex items-center gap-1.5 text-sm text-[#F4511E] hover:underline"
          >
            <UserPlus className="w-4 h-4" /> เพิ่มลูกค้าห้าง
          </button>
        </div>
        <FormSelect
          value={selectedCustomerId}
          onChange={setSelectedCustomerId}
          options={customerOptions}
          placeholder="เลือกห้างสรรพสินค้า (department store)"
        />
        {!selectedCustomerId && customers.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            ไม่พบลูกค้าประเภท department store — กรุณาสร้างลูกค้าก่อน
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <label className="label">หมายเหตุ</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="หมายเหตุ (ไม่บังคับ)"
          rows={3}
          className="input w-full resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/department-orders')}
          disabled={submitting}
          className="btn-secondary"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !selectedCustomerId || items.length === 0}
          className="btn-primary"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          สร้างใบส่งห้าง
        </button>
      </div>
    </div>
  );
}
