'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import ImageDropzone from '@/components/ui/ImageDropzone';
import { CameraIcon, DarkThemeIcon, ErrorIcon, LightThemeIcon, LoadingIcon, ProductIcon, ShippingIcon, SuccessIcon, TimeIcon, WarningIcon } from '@/lib/icons';
import { productDisplayName } from '@/lib/product-display';
import NumberInput from '@/components/ui/NumberInput';
import { FullPageLoading } from '@/components/ui/Loading';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { useStandaloneTheme } from '@/lib/use-standalone-theme';

interface DeptOrderItem {
  id: string;
  product_id: string | null;
  variation_id: string | null;
  product_name: string;
  variation_label: string | null;
  quantity: number;
  received_quantity: number;
  unit_price: number;
  image: string | null;
  sku: string | null;
}

interface DeptOrderData {
  id: string;
  department_order_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  receive_token: string;
  receiver_name: string | null;
  receive_photo_url: string | null;
  receive_notes: string | null;
  shipping_method: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  total_amount: number;
  customer: { id: string; name: string; customer_code: string | null; phone: string | null };
  items: DeptOrderItem[];
  company: { id: string; name: string; logo_url: string | null };
}

const formatNumber = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function DeptOrderReceivePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<DeptOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dark mode
  const [dark, setDark] = useState(true);
  // ธีมที่หน้านี้แสดง = ธีมที่ component กลางต้องใช้ (ดู lib/use-standalone-theme.ts)
  useStandaloneTheme(dark);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('dept-order-receive-theme');
    if (stored === 'light') setDark(false);
    setMounted(true);
  }, []);
  const toggleDark = () => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('dept-order-receive-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Form state
  const [receiverName, setReceiverName] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  /** ImageDropzone บอกมาว่ากำลังย่อรูป — ปิดปุ่มบันทึกไว้ก่อน ไม่งั้นได้ใบที่ไม่มีรูป */
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Shipping edit state

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/department-orders/receive?token=${token}`);
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่พบใบส่งห้าง');
      }
      const { order: replenishment } = await res.json();
      setData(replenishment);
      const initQty: Record<string, number> = {};
      for (const item of replenishment.items) {
        initQty[item.id] = item.received_quantity > 0 ? item.received_quantity : item.quantity;
      }
      setQuantities(initQty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async () => {
    if (!data) return;
    if (!receiverName.trim()) {
      setError('กรุณาระบุชื่อผู้รับสินค้า');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('receiver_name', receiverName.trim());
      const itemsPayload = data.items.map(item => ({
        item_id: item.id,
        received_quantity: quantities[item.id] ?? item.quantity,
      }));
      formData.append('items', JSON.stringify(itemsPayload));
      if (receiveNotes.trim()) formData.append('receive_notes', receiveNotes.trim());
      if (photo) formData.append('photo', photo);

      const res = await fetch('/api/department-orders/receive', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'ไม่สามารถรับสินค้าได้');
      }

      setSubmitSuccess(true);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const SHIPPING_LABELS: Record<string, string> = {
    own_vehicle: 'รถเราเอง',
    courier: 'ส่งพัสดุ',
    lalamove: 'Lalamove',
  };


  if (loading || !mounted) {
    return (
      <FullPageLoading />
    );
  }

  if (!data) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#1A1A2E]`}>
        <div className="text-center">
          <ProductIcon className={`w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-slate-600`} />
          <h1 className={`text-xl font-semibold mb-2 text-gray-700 dark:text-slate-300`}>ไม่พบใบส่งห้าง</h1>
          <p className="text-gray-500 dark:text-slate-500">{error || 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว'}</p>
        </div>
      </div>
    );
  }

  const totalSent = data.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalReceived = data.items.reduce((sum, i) => sum + (quantities[i.id] ?? i.quantity), 0);
  const totalAmount = data.items.reduce((sum, i) => sum + (quantities[i.id] ?? i.quantity) * i.unit_price, 0);

  // Override global .dark CSS on inputs/labels when page is in light mode
  const lightInputStyle = !dark ? { backgroundColor: '#ffffff', borderColor: '#d1d5db', color: '#111827', colorScheme: 'light' } as React.CSSProperties : undefined;
  const lightTextareaStyle = lightInputStyle;
  const lightLabelStyle = !dark ? { color: '#374151' } as React.CSSProperties : undefined;

  return (
    <div className={`min-h-screen transition-colors bg-gray-100 dark:bg-[#1A1A2E]`}>
      {/* Top bar */}
      <div className="sticky top-0 bg-[#1A1A2E] px-4 py-3 flex items-center justify-between z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Logo" width={80} height={52} className="h-8 w-auto" priority />
          <span className="font-medium text-white/80 text-sm ml-2">#{data.department_order_number}</span>
        </div>
        <button
          onClick={toggleDark}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {dark ? <LightThemeIcon className="w-4 h-4" /> : <DarkThemeIcon className="w-4 h-4" />}
        </button>
      </div>

      <div className="max-w-lg mx-auto my-4 px-3">
        <div className={`rounded-xl shadow-sm p-5 md:p-6 transition-colors bg-white dark:bg-[#16213E] dark:shadow-black/20`}>

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              {data.company.logo_url ? (
                <img src={data.company.logo_url} alt={data.company.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-white`}>
                  {data.company.name.charAt(0)}
                </div>
              )}
              <div>
                <div className={`text-lg font-bold text-gray-900 dark:text-white`}>{data.company.name}</div>
                <p className={`text-sm text-gray-400 dark:text-slate-500`}>ใบส่งสินค้าห้าง</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-bold text-base text-gray-900 dark:text-white`}>{data.department_order_number}</div>
              {data.shipped_at && (
                <div className={`text-sm text-gray-500 dark:text-slate-400`} suppressHydrationWarning>{formatDate(data.shipped_at)}</div>
              )}
            </div>
          </div>

          {/* Route info */}
          <div className={`rounded-lg p-3 mb-5 bg-gray-50 dark:bg-[#1A1A2E]`}>
            <div className={`text-sm text-gray-500 dark:text-slate-400`}>
              <span className={`font-medium text-gray-700 dark:text-slate-300`}>{data.company.name}</span>
              <span className="mx-2">→</span>
              <span className={`font-medium text-amber-600 dark:text-amber-400`}>{data.customer.name}</span>
            </div>
          </div>

          {/* === STATUS: PENDING (ยังไม่จัดส่ง) === */}
          {data.status === 'pending' && (
            <div className={`border-2 rounded-xl p-5 text-center bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800`}>
              <TimeIcon className={`w-10 h-10 mx-auto mb-2 text-yellow-500 dark:text-yellow-400`} />
              <div className={`font-bold text-lg text-yellow-700 dark:text-yellow-400`}>ใบส่งห้างนี้ยังไม่ได้จัดส่ง</div>
              <p className={`text-sm mt-1 text-yellow-500 dark:text-yellow-500/70`}>กรุณารอจนกว่าจะมีการจัดส่งสินค้า</p>
            </div>
          )}

          {/* === STATUS: CANCELLED === */}
          {data.status === 'cancelled' && (
            <div className={`border-2 rounded-xl p-5 text-center bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800`}>
              <ErrorIcon className={`w-10 h-10 mx-auto mb-2 text-red-500 dark:text-red-400`} />
              <div className={`font-bold text-lg text-red-700 dark:text-red-400`}>ใบส่งห้างนี้ถูกยกเลิกแล้ว</div>
            </div>
          )}

          {/* === STATUS: RECEIVED / PARTIAL_RECEIVED / PENDING_CONFIRM (summary) === */}
          {['received', 'partial_received', 'pending_confirm'].includes(data.status) && (
            <>
              <div className={`border-2 rounded-xl p-5 text-center mb-5 ${
                data.status === 'pending_confirm'
                  ? dark ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'
                  : dark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'
              }`}>
                {data.status === 'pending_confirm' ? (
                  <>
                    <TimeIcon className={`w-10 h-10 mx-auto mb-2 text-blue-500 dark:text-blue-400`} />
                    <div className={`font-bold text-lg text-blue-700 dark:text-blue-400`}>รับสินค้าแล้ว รอยืนยันจากผู้ส่ง</div>
                  </>
                ) : (
                  <>
                    <SuccessIcon className={`w-10 h-10 mx-auto mb-2 text-green-500 dark:text-green-400`} />
                    <div className={`font-bold text-lg text-green-700 dark:text-green-400`}>
                      {data.status === 'partial_received' ? 'รับสินค้าไม่ครบ' : 'รับสินค้าเรียบร้อยแล้ว'}
                    </div>
                  </>
                )}
                {data.received_at && (
                  <p className={`text-sm mt-1 text-green-500 dark:text-green-500/70`} suppressHydrationWarning>{formatDate(data.received_at)}</p>
                )}
                {data.receiver_name && (
                  <p className={`text-sm mt-1 text-gray-500 dark:text-slate-400`}>ผู้รับ: {data.receiver_name}</p>
                )}
              </div>

              {/* Diff table */}
              <div className="space-y-2 mb-4">
                {data.items.map((item) => {
                  const sent = item.quantity;
                  const received = item.received_quantity;
                  const diff = sent - received;
                  return (
                    <div key={item.id} className={`flex items-center gap-3 py-3 border-b last:border-0 border-gray-100 dark:border-slate-700`}>
                      <ProductImageThumb src={item.image} alt={item.product_name} size="lg" />

                      <div className="flex-1 min-w-0">
                        <div className={`font-medium leading-snug text-gray-900 dark:text-white`}>{productDisplayName({ product_name: item.product_name, variation_label: item.variation_label, sku: item.sku })}</div>
                        {item.sku && <div className={`text-sm font-mono text-gray-400 dark:text-slate-500`}>SKU: {item.sku}</div>}
                        <div className={`text-xs text-gray-400 dark:text-slate-500`}>฿{formatNumber(item.unit_price)}/ชิ้น</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm text-gray-500 dark:text-slate-400`}>ส่ง {sent}</div>
                        <div className={`font-bold ${received === sent ? (dark ? 'text-green-400' : 'text-green-600') : received > sent ? (dark ? 'text-blue-400' : 'text-blue-600') : (dark ? 'text-amber-400' : 'text-amber-600')}`}>
                          รับ {received}
                        </div>
                        {diff > 0 && (
                          <div className={`text-xs text-red-500 dark:text-red-400`}>ขาด {diff}</div>
                        )}
                        {diff < 0 && (
                          <div className={`text-xs text-blue-500 dark:text-blue-400`}>เกิน {Math.abs(diff)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Receive photo */}
              {data.receive_photo_url && (
                <div className="mb-4">
                  <div className={`text-sm font-medium mb-2 text-gray-500 dark:text-slate-400`}>รูปถ่ายการรับสินค้า</div>
                  <img src={data.receive_photo_url} alt="รูปรับสินค้า" className={`w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-slate-600`} />
                </div>
              )}

              {data.receive_notes && (
                <div className={`rounded-lg p-3 bg-gray-50 dark:bg-[#1A1A2E]`}>
                  <div className={`text-sm font-medium mb-1 text-gray-500 dark:text-slate-400`}>หมายเหตุ</div>
                  <div className={`text-sm text-gray-700 dark:text-slate-300`}>{data.receive_notes}</div>
                </div>
              )}
            </>
          )}

          {/* === STATUS: SHIPPED (receive form) === */}
          {data.status === 'shipped' && !submitSuccess && (
            <>
              <div className={`flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-400`}>
                <ShippingIcon className="w-5 h-5" />
                <span className="font-bold text-lg">รับสินค้า</span>
              </div>

              {/* Items */}
              <div className="space-y-3 mb-5">
                {data.items.map((item) => {
                  const qty = quantities[item.id] ?? item.quantity;
                  return (
                    <div key={item.id} className={`rounded-lg p-3 bg-gray-50 dark:bg-[#1A1A2E]`}>
                      <div className="flex gap-3">
                        <ProductImageThumb src={item.image} alt={item.product_name} size="lg" />

                        <div className="flex-1 min-w-0">
                          <div className={`font-medium leading-snug text-gray-900 dark:text-white`}>{productDisplayName({ product_name: item.product_name, variation_label: item.variation_label, sku: item.sku })}</div>
                          {item.sku && <div className={`text-sm mt-0.5 font-mono text-gray-400 dark:text-slate-500`}>SKU: {item.sku}</div>}
                          <div className={`text-xs mt-0.5 text-amber-600 dark:text-amber-400/70`}>฿{formatNumber(item.unit_price)}/ชิ้น</div>
                        </div>
                      </div>
                      {/* Quantity controls */}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-sm text-gray-500 dark:text-slate-400`}>ส่ง <span className="font-medium">{item.quantity}</span> ชิ้น →</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium text-gray-600 dark:text-slate-300`}>รับ</span>
                          <button
                            type="button"
                            onClick={() => setQuantities(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? item.quantity) - 1) }))}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500`}
                          >
                            -
                          </button>
                          <NumberInput
                            min={0}
                            value={qty}
                            onChange={(n) => {
                              const v = Math.max(0, n);
                              setQuantities(prev => ({ ...prev, [item.id]: v }));
                            }}
                            style={!dark ? (
                              qty < item.quantity ? { backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#b45309', colorScheme: 'light' }
                              : qty > item.quantity ? { backgroundColor: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8', colorScheme: 'light' }
                              : { backgroundColor: '#ffffff', borderColor: '#d1d5db', color: '#111827', colorScheme: 'light' }
                            ) : undefined}
                            className={`w-16 h-9 text-center rounded-lg text-lg font-bold border focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                              qty < item.quantity
                                ? dark ? 'bg-amber-900/30 border-amber-700 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700'
                                : qty > item.quantity
                                  ? dark ? 'bg-blue-900/30 border-blue-700 text-blue-400' : 'bg-blue-50 border-blue-300 text-blue-700'
                                  : dark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantities(prev => ({ ...prev, [item.id]: (prev[item.id] ?? item.quantity) + 1 }))}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className={`rounded-lg p-3 mb-4 bg-gray-50 dark:bg-[#1A1A2E]`}>
                <div className="flex justify-between items-center">
                  <span className={`text-sm text-gray-500 dark:text-slate-400`}>ยอดรวม ({totalReceived} ชิ้น)</span>
                  <span className={`font-bold text-lg text-gray-900 dark:text-white`}>฿{formatNumber(totalAmount)}</span>
                </div>
              </div>

              {/* Shipping info */}
              {(data.shipping_method || data.shipping_carrier || data.tracking_number) && (
                <div className={`rounded-lg p-3 mb-4 bg-gray-50 dark:bg-[#1A1A2E]`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm font-medium flex items-center gap-1.5 text-gray-500 dark:text-slate-400`}>
                          <ShippingIcon className="w-3.5 h-3.5" /> ข้อมูลจัดส่ง
                        </span>
                      </div>
                      <div className={`text-sm space-y-0.5 text-gray-700 dark:text-slate-300`}>
                        {data.shipping_method && (
                          <div>วิธีจัดส่ง: <span className="font-medium">{SHIPPING_LABELS[data.shipping_method] || data.shipping_method}</span></div>
                        )}
                        {data.shipping_method === 'courier' && data.shipping_carrier && (
                          <div>ขนส่ง: <span className="font-medium">{data.shipping_carrier}</span></div>
                        )}
                        {data.shipping_method === 'courier' && data.tracking_number && (
                          <div>เลข Tracking: <span className="font-medium font-mono">{data.tracking_number}</span></div>
                        )}
                        {data.shipping_method === 'lalamove' && data.tracking_number && (
                          <div>เบอร์โทร: <span className="font-medium">{data.tracking_number}</span></div>
                        )}
                        {data.shipping_method === 'own_vehicle' && data.tracking_number && (
                          <div>หมายเหตุ: <span className="font-medium">{data.tracking_number}</span></div>
                        )}
                      </div>
                    </div>
                </div>
              )}

              {totalReceived < totalSent && (
                <div className={`rounded-lg p-3 flex items-center gap-2 mb-4 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border dark:border-amber-800`}>
                  <WarningIcon className={`w-4 h-4 flex-shrink-0 text-amber-500 dark:text-amber-400`} />
                  <span className={`text-sm text-amber-700 dark:text-amber-400`}>
                    รับไม่ครบ: {totalReceived}/{totalSent} ชิ้น (ขาด {totalSent - totalReceived} ชิ้น)
                  </span>
                </div>
              )}
              {totalReceived > totalSent && (
                <div className={`rounded-lg p-3 flex items-center gap-2 mb-4 bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border dark:border-blue-800`}>
                  <WarningIcon className={`w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400`} />
                  <span className={`text-sm text-blue-700 dark:text-blue-400`}>
                    รับเกิน: {totalReceived}/{totalSent} ชิ้น (เกิน {totalReceived - totalSent} ชิ้น)
                  </span>
                </div>
              )}
            </>
          )}

          {/* Success after submit */}
          {data.status === 'shipped' && submitSuccess && (
            <div className={`border-2 rounded-xl p-5 text-center bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800`}>
              <SuccessIcon className={`w-10 h-10 mx-auto mb-2 text-green-500 dark:text-green-400`} />
              <div className={`font-bold text-lg text-green-700 dark:text-green-400`}>บันทึกการรับสินค้าเรียบร้อย</div>
              <p className={`text-sm mt-1 text-green-500 dark:text-green-500/70`}>ขอบคุณที่ยืนยันการรับสินค้า</p>
            </div>
          )}

        </div>

        {/* === SHIPPED — Receiver card === */}
        {data.status === 'shipped' && !submitSuccess && (
          <div className={`rounded-xl shadow-sm p-5 md:p-6 mt-4 transition-colors bg-white dark:bg-[#16213E] dark:shadow-black/20`}>
            {error && (
              <div className={`rounded-lg p-3 mb-4 text-sm bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border dark:border-red-800`}>
                {error}
              </div>
            )}

            <div className="mb-4">
              <label style={lightLabelStyle} className={`block text-sm font-medium mb-1 text-gray-700 dark:text-slate-400`}>
                ชื่อผู้รับสินค้า <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="ระบุชื่อผู้รับ"
                style={lightInputStyle}
                className={`w-full px-3 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white border-gray-300 text-gray-900 dark:bg-[#1A1A2E] dark:border-slate-600 dark:text-white dark:placeholder-slate-600`}
              />
            </div>

            <div className="mb-4">
              <label style={lightLabelStyle} className={`block text-sm font-medium mb-1 text-gray-700 dark:text-slate-400`}>รูปถ่ายการรับสินค้า</label>
              {/* ถ่ายรูป/เลือกรูป + ย่อรูป + ลากวาง อยู่ใน ImageDropzone ตัวกลาง —
                  หน้านี้มีสวิตช์มืด/สว่างของตัวเอง (ไม่ได้ใช้ class .dark ของทั้งเว็บ) จึงต้องส่งคลาสเอง */}
              <ImageDropzone
                value={photo}
                onChange={setPhoto}
                onBusyChange={setCompressing}
                capture="environment"
                icon={<CameraIcon className="w-8 h-8" />}
                label="ถ่ายรูป / เลือกรูป"
                alt="รูปรับสินค้า"
                classNames={{
                  root: `w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-6 hover:border-amber-400 hover:text-amber-400 transition-colors border-gray-300 text-gray-400 dark:border-slate-600 dark:text-slate-500`,
                  rootDragging: 'border-amber-400 text-amber-400',
                  preview: 'relative block',
                  previewImg: `w-full max-h-48 object-contain rounded-lg border border-gray-200 dark:border-slate-600`,
                  clear: 'absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center',
                }}
              />
            </div>

            <div className="mb-5">
              <label style={lightLabelStyle} className={`block text-sm font-medium mb-1 text-gray-700 dark:text-slate-400`}>หมายเหตุ</label>
              <textarea
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                rows={2}
                style={lightTextareaStyle}
                className={`w-full px-3 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white border-gray-300 text-gray-900 dark:bg-[#1A1A2E] dark:border-slate-600 dark:text-white dark:placeholder-slate-600`}
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || compressing || !receiverName.trim()}
              className="w-full bg-amber-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <LoadingIcon className="w-5 h-5 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <SuccessIcon className="w-5 h-5" />
                  ยืนยันรับสินค้า
                </>
              )}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
