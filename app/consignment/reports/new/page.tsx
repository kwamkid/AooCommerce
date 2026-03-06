'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Loader2, ArrowLeft, ClipboardList, Save, Users, UserPlus,
  CheckCircle, MapPin, FileText, Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/lib/company-context';
import { formatNumber } from '@/lib/utils/format';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import { type GpResolverContext, resolveGp, fetchGpContext } from '@/lib/gp-resolver';
import MonthYearPicker from '@/components/ui/MonthYearPicker';

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
  customer_type: string | null;
  consignment_mode: string | null;
  tax_id: string | null;
  tax_branch: string | null;
  billing_address: string | null;
  billing_district: string | null;
  billing_amphoe: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
}

interface ReportItem {
  product_id: string;
  variation_id: string | null;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  image: string | null;
  qty_sold: number;
  selling_price: number;
  gp_rate: number;
  brand_id: string | null;
  default_price: number;
  discount_price: number;
  gp_base_price: 'retail' | 'discounted';
  gp_level: number;
}

function NewReportPageContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Period
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());

  // Items
  const [items, setItems] = useState<ReportItem[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Stock — dealer's consignment warehouse
  const [dealerStockMap, setDealerStockMap] = useState<Record<string, number>>({});

  // GP
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGpData, setLoadingGpData] = useState(false);
  const latestCustomerIdRef = useRef('');

  // Notes & submit
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load customers
  useEffect(() => {
    apiFetch('/api/customers?active=true&type=consignment_dealer')
      .then(r => r.json())
      .then(d => setCustomers(d.data || d.customers || []))
      .catch(() => {});
  }, []);

  // Load products
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
              barcode: v?.barcode || null,
              default_price: p.simple_default_price || 0,
              discount_price: p.simple_discount_price || 0,
              brand_id: p.brand_id || null,
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
                barcode: v.barcode || null,
                default_price: v.default_price || 0,
                discount_price: v.discount_price || 0,
                brand_id: p.brand_id || null,
              });
            }
          }
        }
        setProducts(flat);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // Load dealer inventory when customer changes
  useEffect(() => {
    if (!selectedCustomerId) { setDealerStockMap({}); return; }
    apiFetch(`/api/inventory?dealer_id=${selectedCustomerId}&limit=9999`)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {};
        for (const i of d.items || []) {
          const b = i.consign_breakdown?.find((x: { customer_id: string }) => x.customer_id === selectedCustomerId);
          if (b && b.qty > 0) {
            map[i.variation_id] = b.qty;
          }
        }
        setDealerStockMap(map);
      })
      .catch(() => setDealerStockMap({}));
  }, [selectedCustomerId]);

  // Customer change: fetch GP context
  const handleCustomerChange = async (id: string) => {
    setSelectedCustomerId(id);
    setSelectedCustomer(customers.find(c => c.id === id) || null);
    latestCustomerIdRef.current = id;

    if (!id) { setGpContext(null); return; }

    setLoadingGpData(true);
    try {
      const ctx = await fetchGpContext(id);
      if (latestCustomerIdRef.current !== id) return;
      setGpContext(ctx);

      // Recalculate prices for existing items
      if (items.length > 0) {
        setItems(prev => prev.map(item => {
          const resolution = resolveGp(ctx, {
            brand_id: item.brand_id,
            default_price: item.default_price,
            discount_price: item.discount_price,
          });
          return { ...item, selling_price: resolution.unit_price, gp_rate: resolution.gp_rate, gp_base_price: resolution.gp_base_price, gp_level: resolution.gp_level };
        }));
      }
    } catch {
      showToast('ไม่สามารถโหลดข้อมูล GP ได้', 'error');
    } finally {
      if (latestCustomerIdRef.current === id) setLoadingGpData(false);
    }
  };

  const handleCustomerClear = () => {
    setSelectedCustomerId('');
    setSelectedCustomer(null);
    setGpContext(null);
    latestCustomerIdRef.current = '';
  };

  // Add product
  const handleAddProduct = (p: ProductSearchItem) => {
    if (!gpContext) return;

    const exists = items.findIndex(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id));
    if (exists >= 0) {
      setItems(prev => prev.map((item, idx) => idx === exists ? { ...item, qty_sold: item.qty_sold + 1 } : item));
    } else {
      const resolution = resolveGp(gpContext, {
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
      });

      setItems(prev => [...prev, {
        product_id: p.product_id,
        variation_id: p.id !== p.product_id ? p.id : null,
        product_name: p.name,
        variation_label: p.variation_label || null,
        sku: p.sku || null,
        image: p.image || null,
        qty_sold: 1,
        selling_price: resolution.unit_price,
        gp_rate: resolution.gp_rate,
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
        gp_base_price: resolution.gp_base_price,
        gp_level: resolution.gp_level,
      }]);
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const updateItem = (idx: number, field: 'qty_sold' | 'selling_price', value: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const gpInfoText = (item: ReportItem): string => {
    const basePriceLabel = item.gp_base_price === 'discounted' ? 'ลด' : 'ปลีก';
    const basePrice = item.gp_base_price === 'discounted' && item.discount_price > 0 ? item.discount_price : item.default_price;
    return `฿${formatNumber(basePrice)}(${basePriceLabel}) - GP${formatNumber(item.gp_rate)}% = ฿${formatNumber(item.selling_price)}`;
  };

  // Filter products to only those with stock at dealer's store
  const availableProducts = selectedCustomerId
    ? products.filter(p => (dealerStockMap[p.id] ?? 0) > 0)
    : products;

  // Calculations — selling_price is already net (after per-item GP deduction)
  const totalQty = items.reduce((s, i) => s + i.qty_sold, 0);
  const totalOurAmount = items.reduce((sum, i) => sum + i.qty_sold * i.selling_price, 0);
  const hasItems = items.length > 0;

  // Submit
  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast('กรุณาเลือกตัวแทน', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/consignment/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          period_year: periodYear,
          period_month: periodMonth,
          source: 'admin',
          notes,
          items: items.map(i => ({
            variation_id: i.variation_id ?? i.product_id,
            qty_sold: i.qty_sold,
            qty_returned: 0,
            unit_price: i.selling_price,
            gp_rate: i.gp_rate,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.statement_number) {
        showToast(`สร้างรายงาน ${data.report_number} + ใบวางบิล ${data.statement_number} สำเร็จ`, 'success');
      } else {
        showToast(`สร้างรายงาน ${data.report_number} สำเร็จ`, 'success');
      }
      router.push('/consignment/reports');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/consignment/reports" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#F4511E]" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">คีย์ยอดตัวแทน</h1>
          </div>
        </div>

        {/* Period Picker — inline row */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500 dark:text-slate-400">งวด:</span>
          <div className="w-56">
            <MonthYearPicker
              month={periodMonth}
              year={periodYear}
              onChange={(m, y) => { setPeriodMonth(m); setPeriodYear(y); }}
            />
          </div>
        </div>

        {/* Customer Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <label className="label">ตัวแทน <span className="text-red-500">*</span></label>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <EntitySearchInput
                value={selectedCustomerId}
                onChange={handleCustomerChange}
                onClear={handleCustomerClear}
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
          {selectedCustomer && (() => {
            const c = selectedCustomer;
            const mode = c.consignment_mode || 'dn';
            const modeIsDN = mode === 'dn';
            const modeLabel = modeIsDN ? 'ใบส่งสินค้า (DN)' : 'ใบแจ้งหนี้ (Invoice)';
            const modeColor = modeIsDN ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
            const billingParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean);
            const shippingParts = [c.address_line1, c.district, c.amphoe, c.province, c.postal_code].filter(Boolean);
            const addressParts = billingParts.length > 0 ? billingParts : shippingParts;
            const addressLabel = billingParts.length > 0 ? 'ที่อยู่ออกบิล' : shippingParts.length > 0 ? 'ที่อยู่จัดส่ง' : null;

            return (
              <div className="mt-3 flex gap-3 items-stretch">
                <div className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
                  {loadingGpData
                    ? <Loader2 className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5 animate-spin" />
                    : <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
                  }
                  <div className="flex-1 min-w-0 space-y-0.5 text-sm">
                    {c.contact_person && <div className="text-gray-600 dark:text-slate-300">ติดต่อ: <span className="font-medium">{c.contact_person}</span></div>}
                    {c.phone && <div className="text-gray-500 dark:text-slate-400">โทร: {c.phone}</div>}
                    {c.email && <div className="text-gray-500 dark:text-slate-400">อีเมล: {c.email}</div>}
                    {c.tax_id && (
                      <div className="text-gray-500 dark:text-slate-400">
                        เลขผู้เสียภาษี: {c.tax_id}{c.tax_branch ? ` (${c.tax_branch})` : ''}
                      </div>
                    )}
                    {addressParts.length > 0 && (
                      <div className="text-gray-500 dark:text-slate-400 flex items-start gap-1 pt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>
                          <span className="text-gray-600 dark:text-slate-300 font-medium">{addressLabel}: </span>
                          {addressParts.join(', ')}
                        </span>
                      </div>
                    )}
                    {!c.contact_person && !c.phone && !c.email && addressParts.length === 0 && (
                      <div className="text-gray-400 dark:text-slate-500 italic">ยังไม่มีข้อมูลเพิ่มเติม</div>
                    )}
                  </div>
                </div>
                <div className={`flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-lg border ${modeColor}`}>
                  {modeIsDN ? <FileText className="w-6 h-6 mb-1" /> : <Receipt className="w-6 h-6 mb-1" />}
                  <span className="text-xs font-bold whitespace-nowrap">{modeLabel}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 2-Column Layout */}
        <div className="flex flex-wrap gap-4 items-start">
          {/* Left Column */}
          <div className="flex-1 basis-[400px] min-w-0 space-y-4">
            <ItemsTable
              items={items.map((i): TableItem => ({
                variation_id: i.variation_id ?? i.product_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                image: i.image,
                quantity: i.qty_sold,
                unit_price: i.selling_price,
                gpInfo: gpInfoText(i),
                stock_dest: dealerStockMap[i.variation_id ?? i.product_id] ?? 0,
              }))}
              columns={['stock_dest', 'qty', 'unit_price', 'total']}
              stockMap={dealerStockMap}
              showStockInSearch={true}
              disableOutOfStock={true}
              products={availableProducts}
              loadingProducts={loadingProducts}
              inputRef={searchInputRef}
              onAdd={selectedCustomerId && gpContext ? handleAddProduct : undefined}
              searchDisabledMessage={!selectedCustomerId ? 'กรุณาเลือกตัวแทนก่อนเพิ่มสินค้า' : loadingGpData ? 'กำลังโหลดข้อมูลราคา...' : undefined}
              onUpdateField={(idx, field, value) => {
                if (field === 'quantity') updateItem(idx, 'qty_sold', value as number);
                if (field === 'unit_price') updateItem(idx, 'selling_price', value as number);
              }}
              onRemove={removeItem}
              showSummary={false}
              emptyMessage="เพิ่มสินค้าที่ขายได้ในงวดนี้"
            />

            {/* Notes */}
            {hasItems && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="หมายเหตุเพิ่มเติม..."
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-base"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Summary */}
          {hasItems && (
            <div className="w-full sm:w-[300px] flex-shrink-0 sm:sticky sm:top-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">สรุปยอดขาย</h3>
                  <div className="space-y-2 text-base">
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>จำนวนรายการ</span>
                      <span>{items.length} รายการ</span>
                    </div>
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>จำนวนชิ้น</span>
                      <span>{totalQty} ชิ้น</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
                      <span>ยอดที่ต้องชำระ</span>
                      <span className="text-[#F4511E]">฿{formatNumber(totalOurAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/consignment/reports')} disabled={submitting} className="btn-secondary">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedCustomerId || items.length === 0}
            className="btn-primary"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            บันทึกรายงาน
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default function NewConsignmentReportPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    }>
      <NewReportPageContent />
    </Suspense>
  );
}
