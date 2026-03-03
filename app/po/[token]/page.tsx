'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Printer, Sun, Moon, Package2, Factory, FileText, CalendarDays, Clock, CheckCircle2, XCircle, Send } from 'lucide-react';
import { getImageUrl } from '@/lib/utils/image';
import { formatPrice } from '@/lib/utils/format';

interface POItem {
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  total: number;
  image: string | null;
  notes: string | null;
}

interface POData {
  po: {
    po_number: string;
    status: string;
    order_date: string;
    expected_date: string | null;
    notes: string | null;
    total_amount: number;
    created_at: string;
  };
  company: {
    name: string;
    logo: string | null;
    address: string | null;
    phone: string | null;
    tax_id: string | null;
  } | null;
  supplier: {
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  warehouse: string | null;
  items: POItem[];
}

function statusBadge(status: string) {
  switch (status) {
    case 'sent':
      return { label: 'แจ้ง Sup แล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: <Send className="w-3.5 h-3.5" /> };
    case 'closed':
      return { label: 'ปิด', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    case 'cancelled':
      return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="w-3.5 h-3.5" /> };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-600', icon: null };
  }
}

export default function PublicPOPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<POData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/po?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (!res.ok) throw new Error('PO not found');
        return res.json();
      })
      .then(d => setData(d))
      .catch(() => setError('ไม่พบใบสั่งซื้อ หรือลิงก์ไม่ถูกต้อง'))
      .finally(() => setLoading(false));
  }, [token]);

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <p className="text-xl text-white mb-2">ไม่พบใบสั่งซื้อ</p>
          <p className="text-gray-400 text-sm">{error || 'ลิงก์ไม่ถูกต้องหรือหมดอายุ'}</p>
        </div>
      </div>
    );
  }

  const { po, company, supplier, items } = data;
  const badge = statusBadge(po.status);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className={`min-h-screen transition-colors ${dark ? 'bg-[#1A1A2E] text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Top Bar */}
      <div className={`sticky top-0 z-30 border-b ${dark ? 'bg-[#1A1A2E]/95 border-white/10 backdrop-blur-md' : 'bg-white border-gray-200'}`}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company?.logo && (
              <Image src={company.logo} alt="" width={32} height={32} className="rounded-lg object-cover" />
            )}
            <span className={`text-sm font-medium ${dark ? 'text-white/80' : 'text-gray-700'}`}>ใบสั่งซื้อ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className={`p-2 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-white/70' : 'hover:bg-gray-100 text-gray-600'}`}
              title="พิมพ์"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDark(!dark)}
              className={`p-2 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-white/70' : 'hover:bg-gray-100 text-gray-600'}`}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 print:py-2 print:space-y-4">

        {/* Cancelled banner */}
        {po.status === 'cancelled' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">ใบสั่งซื้อนี้ถูกยกเลิกแล้ว</p>
          </div>
        )}

        {/* Header: Company + PO Info */}
        <div className={`rounded-xl border p-5 ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Company */}
            <div className="flex items-start gap-3">
              {company?.logo ? (
                <Image src={company.logo} alt="" width={48} height={48} className="rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
                  <FileText className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div>
                <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{company?.name || '-'}</h2>
                {company?.address && <p className={`text-xs mt-0.5 ${dark ? 'text-white/50' : 'text-gray-500'}`}>{company.address}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {company?.phone && <p className={`text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>โทร: {company.phone}</p>}
                  {company?.tax_id && <p className={`text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>เลขประจำตัวผู้เสียภาษี: {company.tax_id}</p>}
                </div>
              </div>
            </div>

            {/* PO Info */}
            <div className={`sm:text-right flex-shrink-0 ${dark ? '' : ''}`}>
              <h1 className="text-xl font-bold text-[#F4511E]">ใบสั่งซื้อ</h1>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex sm:justify-end items-center gap-2">
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>เลขที่:</span>
                  <span className="font-medium">{po.po_number}</span>
                </div>
                <div className="flex sm:justify-end items-center gap-2">
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>วันที่:</span>
                  <span>{formatDate(po.order_date)}</span>
                </div>
                {po.expected_date && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <span className={dark ? 'text-white/50' : 'text-gray-500'}>คาดว่าจะได้รับ:</span>
                    <span>{formatDate(po.expected_date)}</span>
                  </div>
                )}
                <div className="flex sm:justify-end items-center gap-2">
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>สถานะ:</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                    {badge.icon}
                    {badge.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Info */}
        {supplier && (
          <div className={`rounded-xl border p-4 ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Factory className="w-4 h-4 text-[#F4511E]" />
              <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>ข้อมูล Supplier</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className={dark ? 'text-white/50' : 'text-gray-500'}>ชื่อ: </span>
                <span className="font-medium">{supplier.name}</span>
              </div>
              {supplier.contact_name && (
                <div>
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>ผู้ติดต่อ: </span>
                  <span>{supplier.contact_name}</span>
                </div>
              )}
              {supplier.phone && (
                <div>
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>โทร: </span>
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div>
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>อีเมล: </span>
                  <span>{supplier.email}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className={`rounded-xl border overflow-hidden ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className={`px-4 py-3 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
              รายการสินค้า ({items.length} รายการ)
            </h3>
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-xs font-medium ${dark ? 'text-white/50 border-b border-white/10' : 'text-gray-500 border-b border-gray-200'}`}>
                  <th className="text-center px-3 py-2.5 w-10">#</th>
                  <th className="text-left px-3 py-2.5">สินค้า</th>
                  <th className="text-left px-3 py-2.5 w-[100px]">SKU</th>
                  <th className="text-center px-3 py-2.5 w-[70px]">จำนวน</th>
                  <th className="text-right px-3 py-2.5 w-[100px]">ราคา/หน่วย</th>
                  <th className="text-right px-3 py-2.5 w-[100px]">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className={`border-b ${dark ? 'border-white/5' : 'border-gray-100'}`}>
                    <td className="text-center px-3 py-3 text-sm text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {item.image ? (
                          <img src={getImageUrl(item.image)} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
                            <Package2 className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                            {item.product_name}
                          </div>
                          {item.variation_label && item.variation_label !== 'default' && (
                            <div className={`text-xs ${dark ? 'text-white/40' : 'text-gray-500'}`}>{item.variation_label}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>{item.sku || '-'}</td>
                    <td className="text-center px-3 py-3 text-sm font-medium">{item.quantity}</td>
                    <td className={`text-right px-3 py-3 text-sm ${dark ? 'text-white/70' : 'text-gray-700'}`}>฿{formatCurrency(item.unit_cost)}</td>
                    <td className="text-right px-3 py-3 text-sm font-medium">฿{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className={`sm:hidden divide-y ${dark ? 'divide-white/5' : 'divide-gray-100'}`}>
            {items.map((item, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-start gap-3 mb-2">
                  {item.image ? (
                    <img src={getImageUrl(item.image)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
                      <Package2 className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                      {item.product_name}
                    </div>
                    {item.variation_label && item.variation_label !== 'default' && (
                      <div className={`text-xs ${dark ? 'text-white/40' : 'text-gray-500'}`}>{item.variation_label}</div>
                    )}
                    {item.sku && <div className={`text-xs ${dark ? 'text-white/40' : 'text-gray-500'}`}>SKU: {item.sku}</div>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={dark ? 'text-white/50' : 'text-gray-500'}>
                    {item.quantity} x ฿{formatCurrency(item.unit_cost)}
                  </span>
                  <span className="font-medium">฿{formatCurrency(item.total)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className={`px-4 py-3 border-t ${dark ? 'border-white/10' : 'border-gray-200'}`}>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-4 text-sm">
                <span className={dark ? 'text-white/50' : 'text-gray-500'}>จำนวนรายการ</span>
                <span className="font-medium">{items.length} รายการ ({totalQty} ชิ้น)</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm ${dark ? 'text-white/50' : 'text-gray-500'}`}>มูลค่ารวม</span>
                <span className="text-xl font-bold text-[#F4511E]">฿{formatCurrency(po.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className={`rounded-xl border p-4 ${dark ? 'bg-amber-900/10 border-amber-800/20' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-sm ${dark ? 'text-amber-300' : 'text-amber-800'}`}>
              <span className="font-medium">หมายเหตุ: </span>{po.notes}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className={`text-center text-xs py-4 ${dark ? 'text-white/30' : 'text-gray-400'}`}>
          Powered by AooCommerce
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          .sticky { position: static !important; }
        }
      `}</style>
    </div>
  );
}
