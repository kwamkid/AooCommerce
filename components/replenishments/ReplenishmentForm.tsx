'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Loader2, X, UserPlus, Package, Save, Users, Settings, ChevronDown, Clock, CheckCircle, MapPin
} from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import ProductSearchInput, { ProductSearchItem } from '@/components/ui/ProductSearchInput';

interface Customer {
  id: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  address_line1: string | null;
  district: string | null;
  amphoe: string | null;
  province: string | null;
  postal_code: string | null;
}

interface ReplenishmentItem {
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

export default function ReplenishmentForm({ warehouseId }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<ReplenishmentItem[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [expiryMode, setExpiryMode] = useState<'default' | 'custom' | 'none'>('default');
  const [customExpiryDays, setCustomExpiryDays] = useState(7);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('percent');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/customers?active=true&type=consignment_dealer')
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

  // ESC key closes lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lightboxImage]);

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

  const subtotalBeforeDiscount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const discountAmount = orderDiscountType === 'percent'
    ? subtotalBeforeDiscount * orderDiscount / 100
    : orderDiscount;
  const totalAmount = Math.max(0, subtotalBeforeDiscount - discountAmount);
  const hasItems = items.length > 0;

  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast('กรุณาเลือกตัวแทน', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/replenishments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          warehouse_id: warehouseId || null,
          notes,
          internal_notes: internalNotes,
          items,
          discount_amount: discountAmount,
          discount_type: orderDiscountType,
          discount_value: orderDiscount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(`สร้างใบเติมสินค้า ${data.replenishment_number} สำเร็จ`, 'success');
      router.push(`/replenishments/${data.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 2-Column Layout: Left (products+notes) + Right (summary) */}
      <div className="flex flex-wrap gap-4 items-start">

        {/* Left Column */}
        <div className="flex-1 basis-[400px] min-w-0 space-y-4">

          {/* Product Search + Items Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">

            {/* Items */}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-slate-500">
                <Package className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านล่าง</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <table className="data-table">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th">สินค้า</th>
                        <th className="data-th text-center w-20">จำนวน</th>
                        <th className="data-th text-right w-28">ราคา/ชิ้น</th>
                        <th className="data-th text-right w-24">รวม</th>
                        <th className="data-th w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="data-td">
                            <div className="flex items-center gap-2.5">
                              {item.image ? (
                                <button type="button" onClick={() => setLightboxImage(item.image!)} className="flex-shrink-0 focus:outline-none">
                                  <img src={item.image} alt={item.product_name} className="w-[42px] h-[42px] object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" />
                                </button>
                              ) : (
                                <div className="w-[42px] h-[42px] bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                                  <Package className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="data-primary text-gray-900 dark:text-white line-clamp-2">
                                  {item.product_name}{item.variation_label ? ` - ${item.variation_label}` : ''}
                                </p>
                                {item.sku && <p className="data-secondary text-gray-400 truncate">{item.sku}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="data-td text-center">
                            <input
                              type="number" min={1} value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 px-1.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </td>
                          <td className="data-td text-right">
                            <div className="relative inline-block">
                              <input
                                type="number" min={0} step={0.01} value={item.unit_price}
                                onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 pr-4 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">฿</span>
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
                          <button type="button" onClick={() => setLightboxImage(item.image!)} className="flex-shrink-0">
                            <img src={item.image} alt={item.product_name} className="w-[42px] h-[42px] object-cover rounded" />
                          </button>
                        ) : (
                          <div className="w-[42px] h-[42px] bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
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
              </>
            )}

            {/* Search Input — always at bottom */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
              <ProductSearchInput
                products={products}
                onSelect={handleAddProduct}
                placeholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
                loading={loadingProducts}
                inputRef={searchInputRef}
                isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id))}
              />
            </div>
          </div>

          {/* Notes + Advanced Settings — shown only when items exist */}
          {hasItems && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                  หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="หมายเหตุสำหรับตัวแทน, การจัดส่ง..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-base"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-orange-700 dark:text-orange-400 mb-1">
                  หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                </label>
                <textarea
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="หมายเหตุภายใน..."
                  className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-base bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200"
                />
              </div>

              {/* Advanced Settings Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors mt-1"
              >
                <Settings className="w-3.5 h-3.5" />
                ตั้งค่าขั้นสูง
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
              </button>

              {showAdvancedSettings && (
                <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-slate-700/30">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-300">
                    <Clock className="w-4 h-4" />
                    วันหมดอายุบิล
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="replenExpiry" checked={expiryMode === 'default'} onChange={() => setExpiryMode('default')} className="accent-[#F4511E]" />
                      <span className="text-gray-700 dark:text-slate-300">ใช้ที่ตั้งค่าไว้ <span className="text-gray-400 dark:text-slate-500">(7 วัน)</span></span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="replenExpiry" checked={expiryMode === 'custom'} onChange={() => setExpiryMode('custom')} className="accent-[#F4511E]" />
                      <span className="text-gray-700 dark:text-slate-300">กำหนดเอง</span>
                      {expiryMode === 'custom' && (
                        <span className="flex items-center gap-1 ml-1">
                          <input
                            type="number" min={1} max={90} value={customExpiryDays}
                            onChange={e => setCustomExpiryDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                            className="w-14 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                          />
                          <span className="text-gray-500 dark:text-slate-400 text-xs">วัน</span>
                        </span>
                      )}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="replenExpiry" checked={expiryMode === 'none'} onChange={() => setExpiryMode('none')} className="accent-[#F4511E]" />
                      <span className="text-gray-700 dark:text-slate-300">ไม่หมดอายุ</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column — Summary (sticky, shown only when items exist) */}
        {hasItems && (
          <div className="w-full sm:w-[300px] flex-shrink-0 sm:sticky sm:top-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">สรุปใบเติมสินค้า</h3>
                <div className="space-y-2 text-base">
                  <div className="flex justify-between text-gray-500 dark:text-slate-400">
                    <span>ยอดรวมสินค้า</span>
                    <span>฿{subtotalBeforeDiscount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-slate-400">ส่วนลดรวม</span>
                    <div className="flex items-stretch w-[108px]">
                      <input
                        type="number" min={0} max={orderDiscountType === 'percent' ? 100 : undefined} step={0.01}
                        value={orderDiscount}
                        onChange={e => setOrderDiscount(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-l-lg border-r-0 text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:z-10"
                      />
                      <button
                        type="button"
                        onClick={() => { setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent'); setOrderDiscount(0); }}
                        className="px-2 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[28px] flex items-center justify-center"
                      >
                        {orderDiscountType === 'percent' ? '%' : '฿'}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
                    <span>ยอดรวมสุทธิ</span>
                    <span className="text-[#F4511E]">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <label className="label">ตัวแทน <span className="text-red-500">*</span></label>
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <EntitySearchInput
              value={selectedCustomerId}
              onChange={(id) => {
                setSelectedCustomerId(id);
                setSelectedCustomer(customers.find(c => c.id === id) || null);
              }}
              onClear={() => { setSelectedCustomerId(''); setSelectedCustomer(null); }}
              options={customers.map(c => ({
                id: c.id,
                label: c.name,
                subtitle: c.phone || undefined,
                icon: <Users className="w-4 h-4 text-gray-400" />,
              }))}
              placeholder="ค้นหาชื่อหรือรหัสตัวแทน..."
              emptyMessage="ไม่พบตัวแทน — กรุณาสร้างลูกค้าก่อน"
            />
          </div>
          {!selectedCustomerId && (
            <button
              type="button"
              onClick={() => window.open('/customers/new?type=consignment_dealer', '_blank')}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 h-[42px] rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" /> เพิ่มตัวแทน
            </button>
          )}
        </div>

        {/* Customer Info */}
        {selectedCustomer && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
            <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5 text-sm">
              <div className="font-medium text-gray-900 dark:text-slate-200">{selectedCustomer.name}</div>
              {selectedCustomer.contact_person && (
                <div className="text-gray-500 dark:text-slate-400">ติดต่อ: {selectedCustomer.contact_person}</div>
              )}
              {selectedCustomer.phone && (
                <div className="text-gray-500 dark:text-slate-400">โทร: {selectedCustomer.phone}</div>
              )}
              {selectedCustomer.email && (
                <div className="text-gray-500 dark:text-slate-400">อีเมล: {selectedCustomer.email}</div>
              )}
              {(selectedCustomer.address_line1 || selectedCustomer.province) && (
                <div className="text-gray-500 dark:text-slate-400 flex items-start gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>
                    {[selectedCustomer.address_line1, selectedCustomer.district, selectedCustomer.amphoe, selectedCustomer.province, selectedCustomer.postal_code].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.push('/replenishments')} disabled={submitting} className="btn-secondary">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !selectedCustomerId || items.length === 0}
          className="btn-primary"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          สร้างใบเติมสินค้า
        </button>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={lightboxImage}
            alt="Product"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
