// Path: app/pc/page.tsx
// PC counter page — in-store staff record daily sales at a department-store branch.
// Wraps the shared PosSaleScreen; recording goes to counter_sales (informational
// overlay) — no orders, no documents, no real stock movement. Money is collected by
// the store's cashier, so there is no payment/receipt step.
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import {
  LogOut, Store, ShoppingBag, ListChecks, Boxes, CalendarRange, Trash2, PackagePlus,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import PosSaleScreen, { type PosSaleScreenHandle, type CheckoutPayload } from '@/components/pos/PosSaleScreen';
import { type CartItem } from '@/components/pos/CartPanel';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import { FullPageLoading } from '@/components/ui/Loading';

interface Counter {
  id: string;
  name: string;
  warehouse_id: string;
  customer?: { id: string; name: string } | null;
  /** This user's own assignment — a rover (หน่วยแทน) sees every counter but is_assigned marks their home branch */
  is_assigned?: boolean;
}

interface TodaySale {
  id: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  amount: number;
  recorded_by: string | null;
  created_at: string;
  variation?: { variation_label?: string | null; sku?: string | null; product?: { name?: string } | null } | null;
}

interface PcSummary {
  stock: Array<{
    variation_id: string; product_name: string; variation_label: string; sku: string | null;
    on_hand: number; unsettled_qty: number; remaining: number;
  }>;
  replenishments_month: Array<{ id: string; number: string; received_at: string | null; total_qty: number; type: string }>;
  month: { year: number; month: number; total_qty: number; total_amount: number; days: Array<{ date: string; qty: number; amount: number }> };
}

type PcView = 'sale' | 'today' | 'stock' | 'month';

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const VIEW_TABS: { key: PcView; label: string; icon: React.ElementType }[] = [
  { key: 'sale', label: 'ขาย', icon: ShoppingBag },
  { key: 'today', label: 'วันนี้', icon: ListChecks },
  { key: 'stock', label: 'สต็อก', icon: Boxes },
  { key: 'month', label: 'เดือนนี้', icon: CalendarRange },
];

export default function PcPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('counter.record');
  const { userProfile, signOut } = useAuth();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const saleRef = useRef<PosSaleScreenHandle>(null);

  const [counters, setCounters] = useState<Counter[]>([]);
  const [loadingCounters, setLoadingCounters] = useState(true);
  const [counterId, setCounterId] = useState('');
  const [view, setView] = useState<PcView>('sale');

  const [checkout, setCheckout] = useState<CheckoutPayload | null>(null);
  const [saving, setSaving] = useState(false);

  const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [summary, setSummary] = useState<PcSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const counter = counters.find(c => c.id === counterId) || null;

  // Load assigned counters
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const res = await apiFetch('/api/counters');
        const data = await res.json();
        const list: Counter[] = data.counters || [];
        setCounters(list);
        setCounterId(prev => prev && list.some(c => c.id === prev)
          ? prev
          : (list.find(c => c.is_assigned)?.id || list[0]?.id || ''));
      } catch {
        setCounters([]);
      } finally {
        setLoadingCounters(false);
      }
    })();
  }, [allowed]);

  const fetchToday = useCallback(async () => {
    if (!counterId) return;
    setLoadingToday(true);
    try {
      const res = await apiFetch(`/api/counter-sales?counter_id=${counterId}&date=${bangkokToday()}&limit=500`);
      const data = await res.json();
      setTodaySales(data.sales || []);
    } catch {
      setTodaySales([]);
    } finally {
      setLoadingToday(false);
    }
  }, [counterId]);

  const fetchSummary = useCallback(async () => {
    if (!counterId) return;
    setLoadingSummary(true);
    try {
      const res = await apiFetch(`/api/pc/summary?counter_id=${counterId}`);
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [counterId]);

  useEffect(() => {
    if (view === 'today') fetchToday();
    if (view === 'stock' || view === 'month') fetchSummary();
  }, [view, fetchToday, fetchSummary]);

  // Build counter_sales rows from the cart snapshot: per-line net (after item discount),
  // then allocate any order-level discount proportionally so sum(amount) === totalAmount.
  const buildSaleRows = (p: CheckoutPayload) => {
    const lineNet = (i: CartItem) => {
      const sub = i.quantity * i.unit_price;
      return i.discount_type === 'amount' ? sub - (i.discount_value || 0) : sub - sub * ((i.discount_value || 0) / 100);
    };
    const subtotal = p.items.reduce((s, i) => s + lineNet(i), 0);
    const factor = subtotal > 0 ? p.totalAmount / subtotal : 1;
    let allocated = 0;
    return p.items.map((i, idx) => {
      const isLast = idx === p.items.length - 1;
      const raw = lineNet(i) * factor;
      const amount = isLast
        ? Math.round((p.totalAmount - allocated) * 100) / 100
        : Math.round(raw * 100) / 100;
      allocated += amount;
      return {
        variation_id: i.variation_id,
        quantity: i.quantity,
        unit_price: i.quantity > 0 ? Math.round((amount / i.quantity) * 100) / 100 : 0,
        amount,
      };
    });
  };

  const handleSave = async () => {
    if (!checkout || !counterId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/counter-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter_id: counterId, items: buildSaleRows(checkout) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      showToast(`บันทึกยอดขาย ${formatPrice(checkout.totalAmount)} บาท สำเร็จ`, 'success');
      setCheckout(null);
      saleRef.current?.clearCart();
      saleRef.current?.refreshProducts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSale = async (sale: TodaySale) => {
    const ok = await confirm({
      title: 'ลบรายการขาย',
      description: `ลบรายการ ${sale.variation?.product?.name || ''} จำนวน ${formatNumber(sale.quantity)} ชิ้น?`,
      confirmLabel: 'ลบรายการ',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/counter-sales?id=${sale.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      showToast('ลบรายการแล้ว', 'success');
      fetchToday();
      saleRef.current?.refreshProducts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  if (guardLoading || loadingCounters) {
    return (
      <FullPageLoading />
    );
  }
  if (!allowed) return null;

  if (counters.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0F172A] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-4">
          <EmptyCard icon={<Store className="w-10 h-10 text-gray-300" />} title="ยังไม่ได้รับมอบหมายสาขา" subtitle="ติดต่อแอดมินร้านเพื่อมอบหมายจุดขายให้คุณ" />
          <Button variant="secondary" onClick={() => signOut()}>ออกจากระบบ</Button>
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex-shrink-0 bg-white dark:bg-[#1E293B] border-b border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between px-4 py-2.5 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {currentCompany?.logo_url && (
            <img
              src={currentCompany.logo_url}
              alt={currentCompany.name}
              className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-gray-900 dark:text-white font-bold text-lg leading-tight truncate">
              {counter?.customer?.name ? `${counter.customer.name} — ${counter.name}` : counter?.name || 'PC'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
              {userProfile?.name || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {counters.length > 1 && (
            <div className="w-40 hidden sm:block">
              <FormSelect
                size="sm"
                value={counterId}
                onChange={(v) => { setCounterId(v); setSummary(null); setTodaySales([]); saleRef.current?.clearCart(); }}
                options={counters.map(c => ({ id: c.id, label: c.name }))}
                searchThreshold={99}
              />
            </div>
          )}
          <ThemeToggle iconClassName="w-3.5 h-3.5" className="hidden sm:block" />
          <button
            onClick={() => signOut()}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
            title="ออกจากระบบ"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {counters.length > 1 && (
        <div className="px-4 pb-2 sm:hidden">
          <FormSelect
            size="sm"
            value={counterId}
            onChange={(v) => { setCounterId(v); setSummary(null); setTodaySales([]); saleRef.current?.clearCart(); }}
            options={counters.map(c => ({ id: c.id, label: c.name }))}
            searchThreshold={99}
          />
        </div>
      )}
      {/* View tabs */}
      <div className="flex">
        {VIEW_TABS.map(t => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                active ? 'text-primary border-primary' : 'text-gray-500 dark:text-gray-400 border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const todayTotal = todaySales.reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayQty = todaySales.reduce((s, r) => s + Number(r.quantity || 0), 0);

  return (
    <>
      {view === 'sale' && counter && (
        <PosSaleScreen
          key={counter.id}
          ref={saleRef}
          warehouseId={counter.warehouse_id}
          topBar={header}
          customerName={null}
          onOpenCustomerSearch={() => {}}
          onCheckout={setCheckout}
          vatRegistered={false}
          enablePromotions={false}
          extraProductParams={{ counter_id: counter.id }}
        />
      )}

      {view !== 'sale' && (
        <div className="flex flex-col h-screen bg-gray-100 dark:bg-[#0F172A] overflow-hidden">
          {header}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── วันนี้ ── */}
            {view === 'today' && (
              loadingToday ? <LoadingCard /> : (
                <>
                  <div className="bg-white dark:bg-[#1E293B] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="subtitle-text text-gray-500">ยอดขายวันนี้</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">฿{formatPrice(todayTotal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="subtitle-text text-gray-500">จำนวน</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(todayQty)} <span className="text-sm font-normal">ชิ้น</span></p>
                    </div>
                  </div>
                  {todaySales.length === 0 ? (
                    <EmptyCard title="ยังไม่มีรายการขายวันนี้" subtitle="ไปที่แท็บ ขาย เพื่อบันทึกยอด" />
                  ) : (
                    <div className="bg-white dark:bg-[#1E293B] rounded-xl divide-y divide-gray-100 dark:divide-gray-700/50">
                      {todaySales.map(sale => {
                        const canDelete = sale.recorded_by === userProfile?.id && sale.sale_date === bangkokToday();
                        return (
                          <div key={sale.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 dark:text-white truncate">
                                {sale.variation?.product?.name || 'สินค้า'}
                                {sale.variation?.variation_label ? ` — ${sale.variation.variation_label}` : ''}
                              </p>
                              <p className="helper-text text-gray-500">
                                {new Date(sale.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                {' · '}{formatNumber(sale.quantity)} × ฿{formatPrice(sale.unit_price)}
                              </p>
                            </div>
                            <p className="font-semibold text-gray-900 dark:text-white">฿{formatPrice(sale.amount)}</p>
                            {canDelete && (
                              <button onClick={() => handleDeleteSale(sale)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )
            )}

            {/* ── สต็อก ── */}
            {view === 'stock' && (
              loadingSummary || !summary ? <LoadingCard /> : (
                <>
                  {summary.stock.length === 0 ? (
                    <EmptyCard title="ยังไม่มีสต็อกในสาขานี้" />
                  ) : (
                    <div className="bg-white dark:bg-[#1E293B] rounded-xl divide-y divide-gray-100 dark:divide-gray-700/50">
                      <div className="flex items-center px-4 py-2.5 text-sm text-gray-500">
                        <span className="flex-1">สินค้า</span>
                        <span className="w-20 text-right">คงเหลือ</span>
                      </div>
                      {summary.stock.map(s => (
                        <div key={s.variation_id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 dark:text-white truncate">
                              {s.product_name}{s.variation_label ? ` — ${s.variation_label}` : ''}
                            </p>
                            {s.unsettled_qty > 0 && (
                              <p className="helper-text text-amber-600">ขายแล้วรอตัดตาม report ห้าง {formatNumber(s.unsettled_qty)} ชิ้น</p>
                            )}
                          </div>
                          <p className={`w-20 text-right font-bold ${s.remaining <= 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                            {formatNumber(s.remaining)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-white dark:bg-[#1E293B] rounded-xl">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                      <PackagePlus className="w-4 h-4 text-gray-500" />
                      <h3 className="heading-4 text-gray-900 dark:text-white">เติมของเดือนนี้</h3>
                    </div>
                    {summary.replenishments_month.length === 0 ? (
                      <p className="px-4 py-4 subtitle-text text-gray-500">ยังไม่มีการเติมของในเดือนนี้</p>
                    ) : (
                      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {summary.replenishments_month.map(r => (
                          <div key={`${r.type}-${r.id}`} className="flex items-center px-4 py-3">
                            <div className="flex-1">
                              <p className="text-gray-900 dark:text-white">{r.number}</p>
                              <p className="helper-text text-gray-500">
                                {r.received_at ? new Date(r.received_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                              </p>
                            </div>
                            <p className="font-semibold text-gray-900 dark:text-white">{formatNumber(r.total_qty)} ชิ้น</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )
            )}

            {/* ── เดือนนี้ ── */}
            {view === 'month' && (
              loadingSummary || !summary ? <LoadingCard /> : (
                <>
                  <div className="bg-white dark:bg-[#1E293B] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="subtitle-text text-gray-500">ยอดขายเดือน {summary.month.month}/{summary.month.year + 543}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">฿{formatPrice(summary.month.total_amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="subtitle-text text-gray-500">จำนวน</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(summary.month.total_qty)} <span className="text-sm font-normal">ชิ้น</span></p>
                    </div>
                  </div>
                  {summary.month.days.length === 0 ? (
                    <EmptyCard title="ยังไม่มียอดขายในเดือนนี้" />
                  ) : (
                    <div className="bg-white dark:bg-[#1E293B] rounded-xl divide-y divide-gray-100 dark:divide-gray-700/50">
                      {summary.month.days.map(d => (
                        <div key={d.date} className="flex items-center px-4 py-3">
                          <p className="flex-1 text-gray-900 dark:text-white">
                            {new Date(`${d.date}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </p>
                          <p className="w-20 text-right text-gray-500">{formatNumber(d.qty)} ชิ้น</p>
                          <p className="w-28 text-right font-semibold text-gray-900 dark:text-white">฿{formatPrice(d.amount)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Confirm-save modal (replaces POS PaymentModal — PC never handles money) */}
      {checkout && (
        <Modal open onClose={() => setCheckout(null)} size="sm" title="บันทึกยอดขาย">
          <div className="px-6 py-5 space-y-3">
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {checkout.items.map(i => (
                <div key={i.variation_id} className="flex items-center py-2 gap-2">
                  <p className="flex-1 min-w-0 truncate text-gray-900 dark:text-white">
                    {i.product_name}{i.variation_label ? ` — ${i.variation_label}` : ''}
                  </p>
                  <p className="text-gray-500 text-sm">×{formatNumber(i.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-300">ยอดที่ลูกค้าจ่ายจริง</p>
              <p className="text-2xl font-bold text-primary">฿{formatPrice(checkout.totalAmount)}</p>
            </div>
            <p className="helper-text text-gray-500">
              ยอดนี้เป็นข้อมูลติดตามการขายของสาขา — ใบเสร็จออกโดยแคชเชียร์ของห้าง
            </p>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCheckout(null)}>ยกเลิก</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>บันทึกยอดขาย</Button>
          </div>
        </Modal>
      )}

      {confirmDialog}
    </>
  );
}
