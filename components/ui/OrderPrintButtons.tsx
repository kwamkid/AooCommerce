'use client';

import { useState } from 'react';
import { Printer, FileText, ClipboardList, Package, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { showPdfPreview } from '@/lib/print-pdf';
import { type MarketplacePlatform } from '@/lib/marketplace/types';

// ── Types ──────────────────────────────────────────────────

export type PrintType = 'tax' | 'dn' | 'packing' | 'label' | 'marketplace_label' | 'all' | 'abbreviated';

/** Platform-specific label API routes — extensible for new platforms */
const MARKETPLACE_LABEL_ROUTES: Record<string, string> = {
  shopee: '/api/shopee/orders/shipping-document',
  // tiktok: '/api/tiktok/orders/shipping-label',
  // lazada: '/api/lazada/orders/shipping-label',
  // line_shopping: '/api/line-shopping/orders/shipping-label',
  // shippop: '/api/shippop/orders/shipping-label',
};

const PLATFORM_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
  line_shopping: 'LINE Shopping',
  shippop: 'Shippop',
};

interface Props {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderData?: Record<string, unknown>;
  flowType?: string;
  /** Order source — determines marketplace label route */
  source?: string;
  className?: string;
}

// ── Core Print Function ────────────────────────────────────

/**
 * Universal print dispatcher — handles all document types + marketplace labels
 *
 * For marketplace labels: calls platform-specific API route
 * For internal documents: lazy-imports PDF generator + shows preview
 */
export async function printOrder(
  orderId: string,
  type: PrintType,
  opts?: {
    preloadedData?: Record<string, unknown>;
    source?: string;        // order source (shopee, tiktok, etc.)
    onProgress?: (msg: string) => void;
  },
): Promise<void> {
  const { preloadedData, source, onProgress } = opts || {};

  // Marketplace label — dispatch to platform API
  if (type === 'marketplace_label') {
    const platform = source || '';
    const route = MARKETPLACE_LABEL_ROUTES[platform];
    if (!route) {
      throw new Error(`ยังไม่รองรับใบปะหน้า ${PLATFORM_LABELS[platform] || platform} — กรุณาพิมพ์จาก Seller Center`);
    }
    onProgress?.(`กำลังสร้างใบปะหน้า ${PLATFORM_LABELS[platform]}...`);
    const res = await apiFetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `ไม่สามารถพิมพ์ใบปะหน้า ${PLATFORM_LABELS[platform]} ได้`);
    }
    const blob = await res.blob();
    showPdfPreview(blob, `ใบปะหน้า ${PLATFORM_LABELS[platform]}`);
    return;
  }

  // Internal documents — fetch order data if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderData: any = preloadedData;
  if (!orderData) {
    onProgress?.('กำลังโหลดข้อมูล...');
    const res = await apiFetch(`/api/orders/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    const data = await res.json();
    orderData = data.order || data;
  }

  const orderNumber = orderData.order_number || '';

  if (type === 'tax') {
    onProgress?.('กำลังสร้างใบกำกับภาษี...');
    const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
    const blob = await generateFullInvoicePdf(orderData);
    showPdfPreview(blob, `ใบกำกับภาษี ${orderNumber}`);
  } else if (type === 'dn') {
    onProgress?.('กำลังสร้างใบส่งสินค้า...');
    const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
    const blob = await generateFullInvoicePdf({ ...orderData, tax_invoice_doc_type: 'dn' });
    showPdfPreview(blob, `ใบส่งสินค้า ${orderNumber}`);
  } else if (type === 'packing') {
    onProgress?.('กำลังสร้างใบจัดของ...');
    const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
    const blob = await generatePackingPdf([orderData]);
    showPdfPreview(blob, `ใบจัดของ ${orderNumber}`);
  } else if (type === 'label') {
    onProgress?.('กำลังสร้างใบปะหน้า...');
    const { generateShippingLabelPdf } = await import('@/lib/order-shipping-label-pdf');
    const blob = await generateShippingLabelPdf({ data: orderData });
    showPdfPreview(blob, `ใบปะหน้า ${orderNumber}`);
  } else if (type === 'abbreviated') {
    onProgress?.('กำลังสร้างใบเสร็จ...');
    const { generateOrderInvoicePdf } = await import('@/lib/order-invoice-pdf');
    const blob = await generateOrderInvoicePdf({ data: orderData });
    showPdfPreview(blob, `ใบเสร็จ ${orderNumber}`);
  } else if (type === 'all') {
    onProgress?.('กำลังสร้างเอกสารทั้งหมด...');
    const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
    const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
    const { generateShippingLabelPdf } = await import('@/lib/order-shipping-label-pdf');
    const { mergePdfBlobs } = await import('@/lib/print-pdf');
    const blobs = await Promise.all([
      generateFullInvoicePdf(orderData),
      generateFullInvoicePdf({ ...orderData, tax_invoice_doc_type: 'dn' }),
      generatePackingPdf([orderData]),
      generateShippingLabelPdf({ data: orderData }),
    ]);
    const merged = await mergePdfBlobs(blobs);
    showPdfPreview(merged, `เอกสารทั้งหมด ${orderNumber}`);
  }
}

// ── Print + Track Helper ───────────────────────────────────

/**
 * Print and mark as printed — for use in list pages
 * Calls printOrder() then markOrdersPrinted() (fire-and-forget)
 */
export async function printAndTrack(
  orderId: string,
  type: PrintType,
  opts?: {
    preloadedData?: Record<string, unknown>;
    source?: string;
    onProgress?: (msg: string) => void;
  },
): Promise<void> {
  await printOrder(orderId, type, opts);

  // Fire-and-forget print tracking
  const trackType = type === 'marketplace_label' ? 'label'
    : type === 'abbreviated' ? 'invoice'
    : type === 'tax' || type === 'dn' ? 'invoice'
    : type === 'all' ? 'invoice'
    : type; // 'packing' | 'label'

  if (['invoice', 'packing', 'label'].includes(trackType)) {
    import('@/lib/print-tracking').then(({ markOrdersPrinted }) => {
      markOrdersPrinted([orderId], trackType as 'invoice' | 'packing' | 'label');
    }).catch(() => {});
  }
}

// ── Marketplace Label Helper ───────────────────────────────

/**
 * Get platform display label for shipping document
 */
export function getMarketplaceLabelName(source?: string): string {
  return PLATFORM_LABELS[source || ''] || source || '';
}

/**
 * Check if a marketplace platform supports label printing via API
 */
export function hasMarketplaceLabelSupport(source?: string): boolean {
  return !!(source && MARKETPLACE_LABEL_ROUTES[source]);
}

// ── Component ──────────────────────────────────────────────

export default function OrderPrintButtons({
  orderId,
  orderNumber,
  orderStatus,
  orderData,
  flowType,
  source,
  className = '',
}: Props) {
  const { showToast } = useToast();
  const [printing, setPrinting] = useState<PrintType | null>(null);

  const hasProcessed = ['processing', 'shipping', 'completed'].includes(orderStatus);
  if (!hasProcessed) return null;

  const isRetail = flowType === 'r_retail';

  const visibleTypes: { key: PrintType; label: string; icon: typeof FileText; color?: string }[] = [];

  if (isRetail) {
    visibleTypes.push({ key: 'abbreviated', label: 'ใบเสร็จ/ใบกำกับอย่างย่อ', icon: FileText });
  } else {
    visibleTypes.push({ key: 'tax', label: 'ใบกำกับภาษี', icon: FileText });
    visibleTypes.push({ key: 'dn', label: 'ใบส่งสินค้า', icon: FileText });
  }

  visibleTypes.push({ key: 'packing', label: 'ใบจัดของ', icon: ClipboardList });
  visibleTypes.push({ key: 'label', label: 'ใบปะหน้า', icon: Package });

  if (!isRetail) {
    visibleTypes.push({ key: 'all', label: 'พิมพ์ทั้งหมด', icon: Printer, color: 'text-primary font-medium' });
  }

  const handlePrint = async (type: PrintType) => {
    try {
      setPrinting(type);
      await printOrder(orderId, type, { preloadedData: orderData, source });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถพิมพ์เอกสารได้', 'error');
      console.error('Print error:', err);
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {visibleTypes.map(t => (
        <button
          key={t.key}
          onClick={() => handlePrint(t.key)}
          disabled={printing !== null}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600
            hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50
            ${t.color || 'text-gray-700 dark:text-slate-300'}`}
        >
          {printing === t.key ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <t.icon className="w-4 h-4" />
          )}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Menu Items Helper ──────────────────────────────────────

/**
 * Get print-related ActionMenu items for list pages
 *
 * Handles marketplace vs manual labels automatically
 */
export function getPrintMenuItems(
  orderId: string,
  orderStatus: string,
  onPrint: (orderId: string, type: PrintType) => void,
  opts?: {
    flowType?: string;
    source?: string;
    isMarketplace?: boolean;
  },
): { key: string; label: string; icon: React.ReactNode; onClick: () => void; className?: string; dividerBefore?: boolean }[] {
  const hasProcessed = ['processing', 'shipping', 'completed'].includes(orderStatus);
  if (!hasProcessed) return [];

  const { flowType, source, isMarketplace } = opts || {};
  const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; className?: string; dividerBefore?: boolean }[] = [];
  const isRetail = flowType === 'r_retail';

  // Financial documents
  if (isRetail) {
    items.push({ key: 'print_receipt', label: 'ใบเสร็จ/ใบกำกับอย่างย่อ', icon: <FileText className="w-4 h-4" />, onClick: () => onPrint(orderId, 'abbreviated') });
  } else if (!isMarketplace) {
    items.push({ key: 'print_tax', label: 'ใบกำกับภาษี', icon: <FileText className="w-4 h-4" />, onClick: () => onPrint(orderId, 'tax') });
    items.push({ key: 'print_dn', label: 'ใบส่งสินค้า', icon: <FileText className="w-4 h-4" />, onClick: () => onPrint(orderId, 'dn') });
    items.push({
      key: 'print_all', label: 'พิมพ์ทั้งหมด', icon: <Printer className="w-4 h-4" />,
      className: 'text-primary font-medium',
      onClick: () => onPrint(orderId, 'all'),
    });
  }

  // Shipping documents
  items.push({ key: 'print_packing', label: 'ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />, dividerBefore: true, onClick: () => onPrint(orderId, 'packing') });

  if (isMarketplace && source) {
    const platformLabel = PLATFORM_LABELS[source] || source;
    items.push({
      key: 'print_marketplace_label',
      label: `ใบปะหน้า ${platformLabel}`,
      icon: <Package className="w-4 h-4" />,
      onClick: () => onPrint(orderId, 'marketplace_label'),
    });
  } else {
    items.push({ key: 'print_label', label: 'ใบปะหน้า', icon: <Package className="w-4 h-4" />, onClick: () => onPrint(orderId, 'label') });
  }

  return items;
}
