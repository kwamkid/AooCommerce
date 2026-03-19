'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useRouter } from 'next/navigation';
import {
  Loader2, Save, Users, UserPlus, Plus, Trash2,
  Search, Package, CheckCircle, MapPin,
} from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import { resolveGp, fetchGpContext, type GpResolverContext, type GpResolution } from '@/lib/gp-resolver';

// ── Types ──────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  customer_type: string;
  sale_type: string | null;
  billing_address: string | null;
  billing_district: string | null;
  billing_amphoe: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
}

interface ProductSearchItem {
  variation_id: string;
  product_id: string;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  default_price: number;
  discount_price: number;
  brand_id: string | null;
  image: string | null;
}

interface OrderItem {
  variation_id: string;
  product_id: string;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  quantity: number;
  original_price: number;  // ราคาปลีก
  discount_rate: number;   // % ส่วนลด
  unit_price: number;      // ราคาหลังลด
  gp_level: number;        // 1-4
  brand_id: string | null;
  image: string | null;
}

interface Props {
  /** customer_type filter: 'wholesale_dealer' | 'wholesale_department' | 'corporate' */
  customerTypeFilter: string;
  /** Flow type: 'w_cash' | 'w_credit' — auto or let user choose */
  defaultFlowType?: 'w_cash' | 'w_credit';
  /** Page title */
  title: string;
  /** Back URL */
  backUrl: string;
}

// ── Component ──────────────────────────────────────────────

export default function WholesaleOrderForm({ customerTypeFilter, defaultFlowType, title, backUrl }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGp, setLoadingGp] = useState(false);

  // Flow type (auto from customer sale_type or override)
  const [flowType, setFlowType] = useState<'w_cash' | 'w_credit'>(defaultFlowType || 'w_cash');

  // Products
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState('');

  // Submit
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
    apiFetch('/api/products?limit=999&active=true')
      .then(r => r.json())
      .then(result => {
        const flat: ProductSearchItem[] = [];
        for (const p of result.products || []) {
          for (const v of p.variations || []) {
            flat.push({
              variation_id: v.id,
              product_id: p.id,
              product_name: p.name,
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
      .catch(() => {});
  }, []);

  // Fetch GP context when customer changes
  const handleCustomerChange = useCallback(async (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find(c => c.id === custId) || null;
    setSelectedCustomer(cust);
    setItems([]); // Reset items

    // Set flow type from sale_type
    if (cust?.sale_type === 'wholesale_credit') setFlowType('w_credit');
    else if (cust?.sale_type === 'wholesale_cash') setFlowType('w_cash');
    else if (defaultFlowType) setFlowType(defaultFlowType);

    if (custId) {
      setLoadingGp(true);
      try {
        const ctx = await fetchGpContext(custId);
        setGpContext(ctx);
      } catch { setGpContext(null); }
      finally { setLoadingGp(false); }
    } else {
      setGpContext(null);
    }
  }, [customers, defaultFlowType]);

  // Add product to order
  const addProduct = (product: ProductSearchItem) => {
    if (items.find(i => i.variation_id === product.variation_id)) {
      // Increment qty
      setItems(prev => prev.map(i =>
        i.variation_id === product.variation_id ? { ...i, quantity: i.quantity + 1 } : i
      ));
      return;
    }

    // Calculate discount
    let resolution: GpResolution | null = null;
    if (gpContext) {
      resolution = resolveGp(gpContext, {
        brand_id: product.brand_id,
        default_price: product.default_price,
        discount_price: product.discount_price,
      });
    }

    setItems(prev => [...prev, {
      variation_id: product.variation_id,
      product_id: product.product_id,
      product_name: product.product_name,
      variation_label: product.variation_label,
      sku: product.sku,
      quantity: 1,
      original_price: resolution?.base_price || product.default_price,
      discount_rate: resolution?.gp_rate || 0,
      unit_price: resolution?.unit_price || product.default_price,
      gp_level: resolution?.gp_level || 4,
      brand_id: product.brand_id,
      image: product.image,
    }]);
  };

  const removeItem = (variationId: string) => {
    setItems(prev => prev.filter(i => i.variation_id !== variationId));
  };

  const updateItem = (variationId: string, patch: Partial<OrderItem>) => {
    setItems(prev => prev.map(i => i.variation_id === variationId ? { ...i, ...patch } : i));
  };

  // Totals
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

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
            original_price: i.original_price,
            discount_rate: i.discount_rate,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }

      const data = await res.json();
      showToast(`สร้างคำสั่งซื้อ ${data.order_number} สำเร็จ`, 'success');
      router.push(backUrl);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const filteredProducts = products.filter(p => {
    if (!productSearch) return false;
    const q = productSearch.toLowerCase();
    return p.product_name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.variation_label && p.variation_label.toLowerCase().includes(q));
  }).slice(0, 10);

  const formatMoney = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Customer selection */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-[#F4511E]/30 p-6">
        <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-2">
          ลูกค้า <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2 items-start">
          <div className="flex-1">
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
          </div>
        </div>

        {/* Customer info */}
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

      {/* Product search + items */}
      {selectedCustomerId && gpContext && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
              className="w-full h-[42px] pl-9 pr-3 border border-green-300 dark:border-green-700 rounded-lg text-sm bg-green-50/50 dark:bg-green-900/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          {/* Search results */}
          {filteredProducts.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-600 rounded-lg max-h-60 overflow-y-auto">
              {filteredProducts.map(p => (
                <button
                  key={p.variation_id}
                  type="button"
                  onClick={() => { addProduct(p); setProductSearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left border-b last:border-0 border-gray-100 dark:border-slate-700"
                >
                  {p.image ? (
                    <img src={p.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.product_name}</p>
                    <p className="text-xs text-gray-400">{p.variation_label || ''} {p.sku ? `· ${p.sku}` : ''}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">฿{formatMoney(p.default_price)}</span>
                  <Plus className="w-4 h-4 text-green-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Items table */}
          {items.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-500 dark:text-slate-400">สินค้า</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">ราคาเดิม</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">ส่วนลด%</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">ราคาขาย</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-500 dark:text-slate-400">จำนวน</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-slate-400">รวม</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.variation_id} className="border-b border-gray-100 dark:border-slate-700/50">
                      <td className="py-2 px-2">
                        <p className="font-medium text-gray-900 dark:text-white">{item.product_name}</p>
                        {item.variation_label && <p className="text-xs text-gray-400">{item.variation_label}</p>}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-400 line-through whitespace-nowrap">฿{formatMoney(item.original_price)}</td>
                      <td className="py-2 px-2 text-right text-[#F4511E] font-medium whitespace-nowrap">{item.discount_rate}%</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={e => updateItem(item.variation_id, { unit_price: parseFloat(e.target.value) || 0 })}
                          className="w-20 text-right px-1 py-0.5 border border-gray-200 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          step="0.01"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(item.variation_id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-14 text-center px-1 py-0.5 border border-gray-200 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          min={1}
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        ฿{formatMoney(item.unit_price * item.quantity)}
                      </td>
                      <td className="py-2 px-2">
                        <button type="button" onClick={() => removeItem(item.variation_id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-slate-700">
              <div className="text-right">
                <span className="text-gray-500 dark:text-slate-400 mr-4">ยอดรวม</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">฿{formatMoney(subtotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {selectedCustomerId && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            placeholder="หมายเหตุเพิ่มเติม..."
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
