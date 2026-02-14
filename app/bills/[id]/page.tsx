'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';
import { useToast } from '@/lib/toast-context';
import { Loader2, Printer, FileText, MapPin, Package, Camera, Upload, Clock, CheckCircle2, CreditCard, Banknote, Globe } from 'lucide-react';
import { getBankByCode } from '@/lib/constants/banks';
import { BEAM_CHANNELS } from '@/lib/constants/payment-gateway';

interface BillItem {
  product_code?: string;
  product_name: string;
  bottle_size?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  subtotal: number;
  total: number;
  image?: string | null;
}

interface BillBranch {
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postal_code?: string;
  shipping_fee: number;
  items: BillItem[];
}

interface PaymentRecord {
  id: string;
  payment_method: string;
  amount: number;
  transfer_date?: string;
  transfer_time?: string;
  slip_image_url?: string;
  status: string;
  notes?: string;
  payment_date: string;
}

interface PaymentChannelData {
  type: 'cash' | 'bank_transfer' | 'payment_gateway';
  name: string;
  config?: {
    bank_code?: string;
    account_number?: string;
    account_name?: string;
    description?: string;
  };
  available_channels?: Array<{ code: string; fee_payer: string }>;
}

interface BillData {
  id: string;
  order_number: string;
  order_date: string;
  delivery_date?: string;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  shipping_fee: number;
  total_amount: number;
  order_status: string;
  payment_status: string;
  notes?: string;
  payment_record?: PaymentRecord | null;
  payment_channels?: PaymentChannelData[];
  customer_type?: string;
  customer: {
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    district?: string;
    amphoe?: string;
    province?: string;
    postal_code?: string;
    tax_company_name?: string;
    tax_id?: string;
    tax_branch?: string;
  };
  items: BillItem[];
  branches: BillBranch[];
}

// Status pill component
function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${color} print:border print:border-gray-400 print:bg-transparent print:text-black`}>
      {label}
    </span>
  );
}

export default function BillOnlinePage() {
  const params = useParams();
  const { showToast } = useToast();
  const orderId = params.id as string;
  const [bill, setBill] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'payment_gateway'>('bank_transfer');
  const [transferDate, setTransferDate] = useState('');
  const [transferTime, setTransferTime] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: get Beam channel info
  const getBeamChannelName = (code: string) => {
    return BEAM_CHANNELS.find(ch => ch.code === code)?.name_th || code;
  };
  const getBeamChannelLogo = (code: string) => {
    return BEAM_CHANNELS.find(ch => ch.code === code)?.logo;
  };

  useEffect(() => {
    if (orderId) {
      fetchBill();
    }
    // Clean up Beam redirect query param (no longer used for status display)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      window.history.replaceState({}, '', `/bills/${orderId}`);
    }
  }, [orderId]);

  const fetchBill = async () => {
    try {
      const response = await fetch(`/api/bills?id=${orderId}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่พบบิล');
      }
      const result = await response.json();
      setBill(result.bill);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดบิลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSlipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      setSlipFile(compressed);
      setSlipPreview(URL.createObjectURL(compressed));
    } catch {
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitPayment = async () => {
    if (!bill) return;

    if (paymentMethod === 'bank_transfer' && !transferDate) {
      showToast('กรุณาระบุวันที่โอนเงิน', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append('order_id', bill.id);
      formData.append('payment_method', paymentMethod);
      if (paymentMethod === 'bank_transfer') {
        if (transferDate) formData.append('transfer_date', transferDate);
        if (transferTime) formData.append('transfer_time', transferTime);
      }
      if (paymentNotes) formData.append('notes', paymentNotes);
      if (slipFile) formData.append('slip_image', slipFile);

      const response = await fetch('/api/bills', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่สามารถแจ้งชำระเงินได้');
      }

      setSubmitSuccess(true);
      await fetchBill();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayPayment = async () => {
    if (!bill) return;
    setGatewayLoading(true);
    try {
      const response = await fetch('/api/beam/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: bill.id }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่สามารถสร้างลิงก์ชำระเงินได้');
      }

      const { payment_url } = await response.json();
      window.location.href = payment_url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
      setGatewayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-700 mb-2">ไม่พบบิล</h1>
          <p className="text-gray-500 dark:text-slate-400">{error || 'บิลนี้ไม่มีอยู่หรือถูกยกเลิกแล้ว'}</p>
        </div>
      </div>
    );
  }

  const billTitle = 'ใบสั่งซื้อ / Purchase Order';

  const orderStatusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'รอดำเนินการ', color: 'bg-blue-100 text-blue-700' },
    shipping: { label: 'กำลังจัดส่ง', color: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'จัดส่งแล้ว', color: 'bg-green-100 text-green-700' },
  };

  const paymentStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'รอชำระ', color: 'bg-orange-100 text-orange-700' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 text-purple-700' },
    paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700' },
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const hasMultipleBranches = bill.branches && bill.branches.length > 1;

  const orderStatusInfo = orderStatusConfig[bill.order_status];
  const paymentStatusInfo = paymentStatusConfig[bill.payment_status];

  // Render items — mobile card layout + desktop table (screen only)
  const renderItems = (items: BillItem[], startIndex: number = 0) => (
    <>
      {/* Desktop table */}
      <table className="w-full hidden md:table print:hidden">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-2.5 font-medium text-gray-500 text-sm">#</th>
            <th className="text-left py-2.5 font-medium text-gray-500 text-sm pl-3">สินค้า</th>
            <th className="text-right py-2.5 font-medium text-gray-500 text-sm">จำนวน</th>
            <th className="text-right py-2.5 font-medium text-gray-500 text-sm">ราคา/หน่วย</th>
            <th className="text-right py-2.5 font-medium text-gray-500 text-sm">ส่วนลด</th>
            <th className="text-right py-2.5 font-medium text-gray-500 text-sm">รวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-100">
              <td className="py-3 text-gray-400 align-top">{startIndex + idx + 1}</td>
              <td className="py-3 text-gray-900 pl-3">
                <div className="flex items-center gap-3">
                  {item.image ? (
                    <img src={item.image} alt={item.product_name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-base">{item.product_name}</div>
                    {item.product_code && <div className="text-gray-400 text-sm">SKU: {item.product_code}</div>}
                  </div>
                </div>
              </td>
              <td className="py-3 text-right text-gray-700 align-top text-base">{item.quantity}</td>
              <td className="py-3 text-right text-gray-700 align-top text-base">{formatNumber(item.unit_price)}</td>
              <td className="py-3 text-right text-gray-400 align-top text-base">
                {item.discount_amount > 0 ? `-${formatNumber(item.discount_amount)}` : '-'}
              </td>
              <td className="py-3 text-right font-semibold text-gray-900 dark:text-white align-top text-base">{formatNumber(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card layout */}
      <div className="md:hidden print:hidden space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
            {item.image ? (
              <img src={item.image} alt={item.product_name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-base text-gray-900 truncate">{item.product_name}</div>
              {item.product_code && <div className="text-gray-400 text-sm">SKU: {item.product_code}</div>}
              <div className="text-sm text-gray-500 mt-0.5">
                {item.quantity} x ฿{formatNumber(item.unit_price)}
                {item.discount_amount > 0 && <span className="text-red-400 ml-1">-฿{formatNumber(item.discount_amount)}</span>}
              </div>
            </div>
            <div className="text-base font-bold text-gray-900 dark:text-white flex-shrink-0">฿{formatNumber(item.total)}</div>
          </div>
        ))}
      </div>
    </>
  );

  // Print-only table — clean, no bg colors, with product images, bigger font
  const renderPrintTable = (items: BillItem[], startIndex: number = 0) => (
    <table className="w-full hidden print:table">
      <thead>
        <tr className="border-b-2 border-gray-400">
          <th className="text-left py-1.5 font-semibold text-sm">#</th>
          <th className="text-left py-1.5 font-semibold text-sm pl-2">สินค้า</th>
          <th className="text-right py-1.5 font-semibold text-sm">จำนวน</th>
          <th className="text-right py-1.5 font-semibold text-sm">ราคา</th>
          <th className="text-right py-1.5 font-semibold text-sm">ส่วนลด</th>
          <th className="text-right py-1.5 font-semibold text-sm">รวม</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={idx} className="border-b border-gray-200 dark:border-slate-700">
            <td className="py-1.5 text-sm align-top">{startIndex + idx + 1}</td>
            <td className="py-1.5 pl-2 text-sm align-top">
              <div className="flex items-center gap-2">
                {item.image && (
                  <img src={item.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                )}
                <div>
                  <span className="font-medium">{item.product_name}</span>
                  {item.product_code && <span className="text-gray-500 ml-1 text-xs">[{item.product_code}]</span>}
                </div>
              </div>
            </td>
            <td className="py-1.5 text-right text-sm align-top">{item.quantity}</td>
            <td className="py-1.5 text-right text-sm align-top">{formatNumber(item.unit_price)}</td>
            <td className="py-1.5 text-right text-sm align-top">{item.discount_amount > 0 ? `-${formatNumber(item.discount_amount)}` : '-'}</td>
            <td className="py-1.5 text-right font-medium text-sm align-top">{formatNumber(item.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Top bar — hidden in print */}
      <div className="print:hidden sticky top-0 bg-[#1A1A2E] px-4 py-3 flex items-center justify-between z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="JoolzJuice" width={80} height={52} className="h-8 w-auto" priority />
          <span className="font-medium text-white/80 text-sm ml-2">#{bill.order_number}</span>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[#F4511E] text-white px-3 py-1.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-1.5 text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          พิมพ์
        </button>
      </div>

      {/* Bill Content */}
      <div className="max-w-2xl mx-auto my-4 md:my-6 print:my-0 print:max-w-none px-3 md:px-0">
        <div className="bg-white rounded-xl shadow-sm print:shadow-none print:rounded-none p-5 md:p-8">

          {/* Header — Logo left + Order details right */}
          <div className="flex items-start justify-between mb-5 print:mb-4">
            <div>
              <Image src="/logo.svg" alt="JoolzJuice" width={120} height={78} className="h-12 w-auto print:h-14" priority />
              <p className="text-sm text-gray-400 mt-1">{billTitle}</p>
            </div>
            <div className="text-right space-y-0.5">
              <div>
                <span className="text-sm text-gray-400 dark:text-slate-500">เลขที่ </span>
                <span className="font-bold text-lg text-gray-900 dark:text-white">{bill.order_number}</span>
              </div>
              <div className="text-base text-gray-600 dark:text-slate-400">{formatDate(bill.order_date)}</div>
              <div className="flex items-center justify-end gap-2 mt-1 print:hidden">
                {orderStatusInfo && (
                  <StatusPill label={orderStatusInfo.label} color={orderStatusInfo.color} />
                )}
                {paymentStatusInfo && (
                  <StatusPill label={paymentStatusInfo.label} color={paymentStatusInfo.color} />
                )}
              </div>
            </div>
          </div>

          {/* Customer Info + Delivery/Notes — 2 column */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 print:grid-cols-2 print:gap-4">
            {/* Left: Customer */}
            <div className="bg-gray-50 print:bg-transparent rounded-lg p-4 print:p-0">
              <div className="text-sm font-medium text-gray-400 mb-1">ลูกค้า</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{bill.customer.name}</div>
              <div className="text-sm text-gray-500 space-y-0.5 mt-1">
                {bill.customer.contact_person && <div>ผู้ติดต่อ: {bill.customer.contact_person}</div>}
                {bill.customer.phone && <div>โทร: {bill.customer.phone}</div>}
                {bill.customer.tax_id && (
                  <div>
                    เลขผู้เสียภาษี: {bill.customer.tax_id}
                    {bill.customer.tax_branch && ` สาขา: ${bill.customer.tax_branch}`}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Delivery date + Notes */}
            <div className="bg-gray-50 print:bg-transparent rounded-lg p-4 print:p-0">
              {bill.delivery_date && (
                <div className="mb-2">
                  <div className="text-sm font-medium text-gray-400 mb-1">วันจัดส่ง</div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">{formatDate(bill.delivery_date)}</div>
                </div>
              )}
              {bill.notes && (
                <div>
                  <div className="text-sm font-medium text-gray-400 mb-1">หมายเหตุ</div>
                  <div className="text-base text-gray-700 dark:text-slate-300">{bill.notes}</div>
                </div>
              )}
              {!bill.delivery_date && !bill.notes && (
                <div className="text-sm text-gray-300 italic">ไม่มีข้อมูลเพิ่มเติม</div>
              )}
            </div>
          </div>

          {/* Items — Branch-grouped or flat */}
          {hasMultipleBranches ? (
            <div className="space-y-4 mb-5">
              {bill.branches.map((branch, branchIdx) => {
                const branchTotal = branch.items.reduce((sum, i) => sum + i.total, 0);
                const itemStartIdx = bill.branches
                  .slice(0, branchIdx)
                  .reduce((sum, b) => sum + b.items.length, 0);

                return (
                  <div key={branchIdx} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden print:border-gray-300 print:rounded-none">
                    {/* Branch header */}
                    <div className="bg-gray-50 print:bg-transparent px-4 py-3 border-b border-gray-200 print:border-gray-300">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-[#F4511E] print:text-black flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-gray-500 dark:text-slate-400">
                          <span className="font-bold text-base text-gray-800 dark:text-slate-200">{branch.address_name}</span>
                          {' — '}
                          {[branch.address_line1, branch.district, branch.amphoe, branch.province].filter(Boolean).join(', ')}
                          {branch.contact_person && (
                            <span className="text-gray-400 dark:text-slate-500"> (ผู้รับ: {branch.contact_person}{branch.phone && `, ${branch.phone}`})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="px-4 py-1">
                      {renderItems(branch.items, itemStartIdx)}
                      {renderPrintTable(branch.items, itemStartIdx)}
                    </div>

                    {/* Branch subtotal */}
                    <div className="px-4 py-2.5 bg-gray-50 print:bg-transparent border-t border-gray-200 dark:border-slate-700 print:border-gray-300 flex justify-between items-center">
                      <span className="text-gray-500 text-sm">
                        รวมสาขา {branch.address_name}
                        {branch.shipping_fee > 0 && (
                          <span className="text-gray-300 ml-1">(ค่าส่ง ฿{formatNumber(branch.shipping_fee)})</span>
                        )}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white text-base">
                        ฿{formatNumber(branchTotal + (branch.shipping_fee || 0))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mb-5">
              {/* Single branch address */}
              {bill.branches && bill.branches.length === 1 && (
                <div className="bg-gray-50 print:bg-transparent rounded-lg p-4 mb-4 print:p-0 print:mb-2">
                  <div className="flex items-center gap-2 text-base font-medium text-gray-700 mb-0.5">
                    <MapPin className="w-4 h-4 text-[#F4511E] print:text-black" />
                    ที่อยู่จัดส่ง
                  </div>
                  <div className="text-sm text-gray-500 ml-6">
                    <span className="font-medium text-gray-700 dark:text-slate-300">{bill.branches[0].address_name}</span>
                    {' — '}
                    {[bill.branches[0].address_line1, bill.branches[0].district, bill.branches[0].amphoe, bill.branches[0].province].filter(Boolean).join(', ')}
                    {bill.branches[0].contact_person && (
                      <span className="text-gray-400 dark:text-slate-500"> (ผู้รับ: {bill.branches[0].contact_person}{bill.branches[0].phone && `, ${bill.branches[0].phone}`})</span>
                    )}
                  </div>
                </div>
              )}
              {renderItems(bill.items)}
              {renderPrintTable(bill.items)}
            </div>
          )}

          {/* Totals — right-aligned for print */}
          <div className="border-t-2 border-gray-200 pt-3">
            <div className="md:ml-auto md:w-80 print:ml-auto print:w-72 space-y-2">
              <div className="flex justify-between text-base text-gray-500 dark:text-slate-400">
                <span>ยอดรวมสินค้า</span>
                <span>{formatNumber(bill.items.reduce((sum, i) => sum + i.total, 0))}</span>
              </div>
              {bill.shipping_fee > 0 && (
                <div className="flex justify-between text-base text-gray-500 dark:text-slate-400">
                  <span>ค่าจัดส่ง</span>
                  <span>{formatNumber(bill.shipping_fee)}</span>
                </div>
              )}
              {bill.discount_amount > 0 && (
                <div className="flex justify-between text-base text-gray-500 dark:text-slate-400">
                  <span>ส่วนลดรวม</span>
                  <span>-{formatNumber(bill.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base text-gray-500 pt-2 border-t border-gray-100">
                <span>ยอดก่อน VAT</span>
                <span>{formatNumber(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between text-base text-gray-500 dark:text-slate-400">
                <span>VAT 7%</span>
                <span>{formatNumber(bill.vat_amount)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t-2 border-gray-200">
                <span className="text-gray-900 dark:text-white">ยอดรวมสุทธิ</span>
                <span className="text-[#F4511E] print:text-black">฿{formatNumber(bill.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Status Section — hidden in print */}
          <div className="print:hidden mt-5">
            {/* Status: pending → show CTA or form */}
            {bill.payment_status === 'pending' && !submitSuccess && (
              <>
                {!showPaymentForm ? (
                  <button
                    onClick={() => {
                      // Set default payment method to first available channel type
                      if (bill.payment_channels && bill.payment_channels.length > 0) {
                        setPaymentMethod(bill.payment_channels[0].type);
                      }
                      setShowPaymentForm(true);
                    }}
                    className="w-full bg-[#F4511E] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#D63B0E] transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <Upload className="w-6 h-6" />
                    ชำระเงิน
                  </button>
                ) : (
                  <div className="border-2 border-[#F4511E] rounded-xl p-5 space-y-4">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2">
                      <Upload className="w-5 h-5 text-[#F4511E]" />
                      ชำระเงิน
                    </h3>

                    {/* Payment Method — dynamic from payment_channels */}
                    <div>
                      <label className="block text-base font-medium text-gray-600 mb-2">วิธีชำระ</label>
                      {bill.payment_channels && bill.payment_channels.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                          {/* Render buttons in sort_order — deduplicate by type */}
                          {bill.payment_channels
                            .filter((ch, i, arr) => arr.findIndex(c => c.type === ch.type) === i)
                            .map(ch => {
                              const iconMap = {
                                bank_transfer: <CreditCard className="w-5 h-5" />,
                                payment_gateway: <Globe className="w-5 h-5" />,
                                cash: <Banknote className="w-5 h-5" />,
                              };
                              const labelMap = {
                                bank_transfer: 'โอนธนาคาร',
                                payment_gateway: 'ชำระออนไลน์',
                                cash: 'เงินสด',
                              };
                              return (
                                <button
                                  key={ch.type}
                                  type="button"
                                  onClick={() => setPaymentMethod(ch.type)}
                                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-base font-medium transition-colors ${
                                    paymentMethod === ch.type
                                      ? 'border-[#F4511E] bg-[#F4511E]/10 text-[#F4511E]'
                                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {iconMap[ch.type]}
                                  {labelMap[ch.type]}
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        /* Fallback: original 2 buttons if no channels configured */
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setPaymentMethod('bank_transfer')}
                            className={`px-3 py-3 rounded-lg border-2 text-base font-medium transition-colors ${paymentMethod === 'bank_transfer' ? 'border-[#F4511E] bg-[#F4511E]/10 text-[#F4511E]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            โอนเงิน
                          </button>
                          <button type="button" onClick={() => setPaymentMethod('cash')}
                            className={`px-3 py-3 rounded-lg border-2 text-base font-medium transition-colors ${paymentMethod === 'cash' ? 'border-[#F4511E] bg-[#F4511E]/10 text-[#F4511E]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            เงินสด
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bank Transfer section */}
                    {paymentMethod === 'bank_transfer' && (
                      <>
                        {/* Bank accounts from settings */}
                        {bill.payment_channels && bill.payment_channels.filter(ch => ch.type === 'bank_transfer').length > 0 && (
                          <div className="space-y-2">
                            <label className="block text-base font-medium text-gray-600 dark:text-slate-400">โอนเข้าบัญชี</label>
                            {bill.payment_channels
                              .filter(ch => ch.type === 'bank_transfer')
                              .map((ch, idx) => {
                                const bank = getBankByCode(ch.config?.bank_code || '');
                                return (
                                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    {bank?.logo ? (
                                      <img
                                        src={bank.logo}
                                        alt={bank.name_th}
                                        className="w-10 h-10 rounded-full flex-shrink-0 object-contain"
                                      />
                                    ) : (
                                      <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                                        style={{ backgroundColor: bank?.color || '#999' }}
                                      >
                                        {bank?.code?.slice(0, 2) || '?'}
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-gray-900 dark:text-white text-base">{bank?.name_th || ch.config?.bank_code}</div>
                                      <div className="text-sm text-gray-600 font-mono">{ch.config?.account_number}</div>
                                      <div className="text-sm text-gray-500 dark:text-slate-400">{ch.config?.account_name}</div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-base font-medium text-gray-600 mb-1">
                              วันที่โอน <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="date"
                              value={transferDate}
                              onChange={(e) => setTransferDate(e.target.value)}
                              className="w-full px-3 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-base font-medium text-gray-600 mb-1">เวลาโอน</label>
                            <input
                              type="time"
                              value={transferTime}
                              onChange={(e) => setTransferTime(e.target.value)}
                              className="w-full px-3 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                            />
                          </div>
                        </div>

                        {/* Slip Upload */}
                        <div>
                          <label className="block text-base font-medium text-gray-600 mb-1">อัพโหลดสลิป</label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleSlipSelect}
                            className="hidden"
                          />
                          {slipPreview ? (
                            <div className="relative">
                              <img src={slipPreview} alt="สลิป" className="w-full max-h-64 object-contain rounded-lg border border-gray-200" />
                              <button
                                type="button"
                                onClick={() => { setSlipFile(null); setSlipPreview(null); }}
                                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors"
                            >
                              <Camera className="w-10 h-10" />
                              <span className="text-base">เลือกรูป / ถ่ายรูปสลิป</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Payment Gateway section */}
                    {paymentMethod === 'payment_gateway' && (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-700 mb-2">
                            คุณจะถูกนำไปยังหน้าชำระเงินออนไลน์ รองรับช่องทาง:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {bill.payment_channels
                              ?.find(ch => ch.type === 'payment_gateway')
                              ?.available_channels?.map(ac => (
                                <span key={ac.code} className="px-2 py-1 bg-white rounded text-sm text-gray-700 border border-blue-100 inline-flex items-center gap-1.5">
                                  {getBeamChannelLogo(ac.code) && (
                                    <img src={getBeamChannelLogo(ac.code)} alt="" className="w-5 h-5 object-contain" />
                                  )}
                                  {getBeamChannelName(ac.code)}
                                </span>
                              ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleGatewayPayment}
                          disabled={gatewayLoading}
                          className="w-full bg-[#F4511E] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {gatewayLoading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              กำลังเตรียมหน้าชำระเงิน...
                            </>
                          ) : (
                            <>
                              <Globe className="w-5 h-5" />
                              ชำระเงินออนไลน์
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Notes — show for cash and bank_transfer */}
                    {paymentMethod !== 'payment_gateway' && (
                      <div>
                        <label className="block text-base font-medium text-gray-600 mb-1">หมายเหตุ</label>
                        <textarea
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                          rows={2}
                          className="w-full px-3 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Submit + Cancel — show for cash and bank_transfer */}
                    {paymentMethod !== 'payment_gateway' && (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowPaymentForm(false)}
                          className="flex-1 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitPayment}
                          disabled={submitting}
                          className="flex-1 bg-[#F4511E] text-white py-3 rounded-lg font-bold text-base hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              กำลังส่ง...
                            </>
                          ) : (
                            'แจ้งชำระเงิน'
                          )}
                        </button>
                      </div>
                    )}

                    {/* Cancel only — for gateway */}
                    {paymentMethod === 'payment_gateway' && (
                      <button
                        type="button"
                        onClick={() => setShowPaymentForm(false)}
                        className="w-full py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Status: verifying (from bank transfer / cash submission) */}
            {(bill.payment_status === 'verifying' || submitSuccess) && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5 text-center">
                <Clock className="w-10 h-10 text-purple-500 mx-auto mb-2" />
                <div className="font-bold text-purple-700 text-lg">อยู่ระหว่างตรวจสอบการชำระเงิน</div>
                <p className="text-purple-500 text-base mt-1">กรุณารอการยืนยันจากทางร้าน</p>
              </div>
            )}

            {/* Status: paid */}
            {bill.payment_status === 'paid' && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <div className="font-bold text-green-700 text-lg">ชำระเงินเรียบร้อยแล้ว</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
