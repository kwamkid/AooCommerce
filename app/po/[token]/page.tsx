'use client';

import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { DarkThemeIcon, DocumentIcon, ErrorIcon, LightThemeIcon, PrintIcon, SupplierIcon } from '@/lib/icons';
import { FullPageLoading } from '@/components/ui/Loading';
import StatusBadge from '@/components/ui/StatusBadge';
import { getImageUrl } from '@/lib/utils/image';
import { cleanVariationLabel } from '@/lib/product-display';
import { useStandaloneTheme } from '@/lib/use-standalone-theme';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';

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


export default function PublicPOPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<POData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(true);
  const [printing, setPrinting] = useState(false);
  // ธีมที่หน้านี้แสดง = ธีมที่ component กลางต้องใช้ (ดู lib/use-standalone-theme.ts)
  useStandaloneTheme(dark);

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

  /**
   * พิมพ์เป็น **เอกสาร PDF ตัวเดียวกับฝั่งแอดมิน** ไม่ใช่ `window.print()` ของหน้าเว็บ
   * (เดิมพิมพ์แล้วได้หน้าเว็บโหมดมืด ตัดหน้ามั่ว ไม่ใช่รูปเอกสาร)
   */
  const printPdf = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const blob = await generatePOPdf(
        {
          po_number: data.po.po_number,
          status: data.po.status,
          order_date: data.po.order_date,
          expected_date: data.po.expected_date,
          total_amount: data.po.total_amount,
          notes: data.po.notes,
          supplier: data.supplier
            ? { name: data.supplier.name, contact_name: data.supplier.contact_name, phone: data.supplier.phone }
            : null,
          warehouse: data.warehouse ? { name: data.warehouse } : null,
          created_by_user: null,
          items: data.items.map((item, i) => ({
            variation_id: String(i),
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            notes: item.notes,
            variation: {
              id: String(i),
              variation_label: item.variation_label,
              sku: item.sku,
              product: { id: String(i), code: '', name: item.product_name, image: item.image },
            },
          })),
        },
        // ข้อมูลบริษัทมากับ API แล้ว — ห้ามให้ตัวสร้างไปดึงเอง (ต้องล็อกอิน ซัพพลายเออร์ไม่มีบัญชี)
        data.company
          ? {
              name: data.company.name,
              address: data.company.address || undefined,
              phone: data.company.phone || undefined,
              tax_id: data.company.tax_id || undefined,
              logo_url: data.company.logo,
            }
          : undefined,
      );
      showPdfPreview(blob, `ใบสั่งซื้อ ${data.po.po_number}`);
    } catch (e) {
      console.error('print PO failed:', e);
    } finally {
      setPrinting(false);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <FullPageLoading />
    );
  }

  if (error || !data) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#1A1A2E]`}>
        <div className="text-center">
          <DocumentIcon className={`w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-slate-600`} />
          <p className={`text-xl mb-2 text-gray-700 dark:text-white`}>ไม่พบใบสั่งซื้อ</p>
          <p className={`text-sm text-gray-500 dark:text-gray-400`}>{error || 'ลิงก์ไม่ถูกต้องหรือหมดอายุ'}</p>
        </div>
      </div>
    );
  }

  const { po, company, supplier, items } = data;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className={`min-h-screen transition-colors bg-gray-100 text-gray-900 dark:bg-[#1A1A2E] dark:text-white print:bg-white print:text-black`}>
      {/* Top Bar */}
      <div className={`print:hidden sticky top-0 z-30 border-b bg-white border-gray-200 dark:bg-[#1A1A2E]/95 dark:border-white/10 dark:backdrop-blur-md`}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company?.logo && (
              <Image src={company.logo} alt="" width={32} height={32} className="rounded-lg object-cover" />
            )}
            <span className={`text-sm font-medium text-gray-700 dark:text-white/80`}>ใบสั่งซื้อ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={printPdf}
              disabled={printing}
              className={`p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600 dark:hover:bg-white/10 dark:text-white/70`}
              title="พิมพ์"
            >
              <PrintIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDark(!dark)}
              className={`p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600 dark:hover:bg-white/10 dark:text-white/70`}
            >
              {dark ? <LightThemeIcon className="w-4 h-4" /> : <DarkThemeIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 print:py-2 print:space-y-4">

        {/* Cancelled banner */}
        {po.status === 'cancelled' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg p-4 flex items-center gap-3">
            <ErrorIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">ใบสั่งซื้อนี้ถูกยกเลิกแล้ว</p>
          </div>
        )}

        {/* Header: Company + PO Info */}
        <div className={`rounded-xl border p-5 bg-white border-gray-200 dark:bg-white/5 dark:border-white/10`}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Company */}
            <div className="flex items-start gap-3">
              {company?.logo ? (
                <Image src={company.logo} alt="" width={48} height={48} className="rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-white/10`}>
                  <DocumentIcon className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div>
                <h2 className={`text-lg font-bold text-gray-900 dark:text-white`}>{company?.name || '-'}</h2>
                {company?.address && <p className={`text-xs mt-0.5 text-gray-500 dark:text-white/50`}>{company.address}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {company?.phone && <p className={`text-xs text-gray-500 dark:text-white/50`}>โทร: {company.phone}</p>}
                  {company?.tax_id && <p className={`text-xs text-gray-500 dark:text-white/50`}>เลขประจำตัวผู้เสียภาษี: {company.tax_id}</p>}
                </div>
              </div>
            </div>

            {/* PO Info */}
            <div className={`sm:text-right flex-shrink-0 `}>
              <h1 className="text-xl font-bold text-primary">ใบสั่งซื้อ</h1>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-gray-500 dark:text-white/50">เลขที่:</span>
                  <span className="font-medium">{po.po_number}</span>
                </div>
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-gray-500 dark:text-white/50">วันที่:</span>
                  <span>{formatDate(po.order_date)}</span>
                </div>
                {po.expected_date && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <span className="text-gray-500 dark:text-white/50">คาดว่าจะได้รับ:</span>
                    <span>{formatDate(po.expected_date)}</span>
                  </div>
                )}
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-gray-500 dark:text-white/50">สถานะ:</span>
                  <StatusBadge domain="purchaseOrderSupplier" status={po.status} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Info */}
        {supplier && (
          <div className={`rounded-xl border p-4 bg-white border-gray-200 dark:bg-white/5 dark:border-white/10`}>
            <div className="flex items-center gap-2 mb-3">
              <SupplierIcon className="w-4 h-4 text-primary" />
              <h3 className={`text-sm font-semibold text-gray-900 dark:text-white`}>ข้อมูล Supplier</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-white/50">ชื่อ: </span>
                <span className="font-medium">{supplier.name}</span>
              </div>
              {supplier.contact_name && (
                <div>
                  <span className="text-gray-500 dark:text-white/50">ผู้ติดต่อ: </span>
                  <span>{supplier.contact_name}</span>
                </div>
              )}
              {supplier.phone && (
                <div>
                  <span className="text-gray-500 dark:text-white/50">โทร: </span>
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div>
                  <span className="text-gray-500 dark:text-white/50">อีเมล: </span>
                  <span>{supplier.email}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className={`rounded-xl border overflow-hidden bg-white border-gray-200 dark:bg-white/5 dark:border-white/10`}>
          <div className={`px-4 py-3 border-b border-gray-200 dark:border-white/10`}>
            <h3 className={`text-sm font-semibold text-gray-900 dark:text-white`}>
              รายการสินค้า ({items.length} รายการ)
            </h3>
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-xs font-medium text-gray-500 border-b border-gray-200 dark:text-white/50 dark:border-b dark:border-white/10`}>
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
                  <tr key={idx} className={`border-b border-gray-100 dark:border-white/5`}>
                    <td className="text-center px-3 py-3 text-sm text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImageThumb src={item.image ? getImageUrl(item.image) : null} alt={item.product_name} size="sm" />
                        <div className="min-w-0">
                          <div className={`text-sm font-medium truncate text-gray-900 dark:text-white`}>
                            {item.product_name}
                          </div>
                          {cleanVariationLabel(item) && (
                            <div className={`text-xs text-gray-500 dark:text-white/40`}>{cleanVariationLabel(item)}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-xs text-gray-500 dark:text-white/50`}>{item.sku || '-'}</td>
                    <td className="text-center px-3 py-3 text-sm font-medium">{item.quantity}</td>
                    <td className={`text-right px-3 py-3 text-sm text-gray-700 dark:text-white/70`}>฿{formatCurrency(item.unit_cost)}</td>
                    <td className="text-right px-3 py-3 text-sm font-medium">฿{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className={`sm:hidden divide-y divide-gray-100 dark:divide-white/5`}>
            {items.map((item, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-start gap-3 mb-2">
                  <ProductImageThumb src={getImageUrl(item.image)} alt="" size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate text-gray-900 dark:text-white`}>
                      {item.product_name}
                    </div>
                    {cleanVariationLabel(item) && (
                      <div className={`text-xs text-gray-500 dark:text-white/40`}>{cleanVariationLabel(item)}</div>
                    )}
                    {item.sku && <div className={`text-xs text-gray-500 dark:text-white/40`}>SKU: {item.sku}</div>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-white/50">
                    {item.quantity} x ฿{formatCurrency(item.unit_cost)}
                  </span>
                  <span className="font-medium">฿{formatCurrency(item.total)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className={`px-4 py-3 border-t border-gray-200 dark:border-white/10`}>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500 dark:text-white/50">จำนวนรายการ</span>
                <span className="font-medium">{items.length} รายการ ({totalQty} ชิ้น)</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm text-gray-500 dark:text-white/50`}>มูลค่ารวม</span>
                <span className="text-xl font-bold text-primary">฿{formatCurrency(po.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className={`rounded-xl border p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/20`}>
            <p className={`text-sm text-amber-800 dark:text-amber-300`}>
              <span className="font-medium">หมายเหตุ: </span>{po.notes}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className={`text-center text-xs py-4 text-gray-400 dark:text-white/30`}>
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
