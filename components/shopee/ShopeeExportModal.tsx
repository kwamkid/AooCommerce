'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Loader2, X, Upload, CheckCircle2, ShoppingBag, AlertTriangle } from 'lucide-react';
import ShopeeCategoryPicker from './ShopeeCategoryPicker';

interface ShopeeAccount {
  id: string;
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  connection_status: string;
}

interface ShopeeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  productCode: string;
}

export default function ShopeeExportModal({
  isOpen,
  onClose,
  productId,
  productName,
  productCode,
}: ShopeeExportModalProps) {
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [weight, setWeight] = useState<string>('0.5');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: boolean; error?: string; item_id?: number } | null>(null);
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [checkingLink, setCheckingLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setExportResult(null);
      setSelectedCategoryId(null);
      setSelectedCategoryName('');
      setWeight('0.5');
      setLinkedItemId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Check if product is already linked when account changes
  useEffect(() => {
    if (!selectedAccountId || !productId) {
      setLinkedItemId(null);
      return;
    }
    const checkLink = async () => {
      setCheckingLink(true);
      try {
        const res = await apiFetch(`/api/shopee/products/link?account_id=${selectedAccountId}`);
        if (res.ok) {
          const data = await res.json();
          const link = (data.links || []).find((l: { product_id: string }) => l.product_id === productId);
          setLinkedItemId(link?.external_item_id || null);
        }
      } catch {
        // ignore
      } finally {
        setCheckingLink(false);
      }
    };
    checkLink();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, productId]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await apiFetch('/api/shopee/accounts');
      if (res.ok) {
        const data = await res.json();
        const active = (data as ShopeeAccount[]).filter(a => a.is_active && a.connection_status === 'connected');
        setAccounts(active);
        if (active.length === 1) {
          setSelectedAccountId(active[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleExport = async () => {
    if (!selectedAccountId) {
      showToast('กรุณาเลือกร้าน Shopee', 'error');
      return;
    }
    if (!selectedCategoryId) {
      showToast('กรุณาเลือกหมวดหมู่ Shopee', 'error');
      return;
    }

    setExporting(true);
    setExportResult(null);

    try {
      const res = await apiFetch('/api/shopee/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ids: [productId],
          shopee_account_id: selectedAccountId,
          shopee_category_id: selectedCategoryId,
          shopee_category_name: selectedCategoryName,
          weight: parseFloat(weight) || 0.5,
        }),
      });

      const result = await res.json();
      setExportResult(result);

      if (result.success) {
        showToast(`ส่งสินค้าไป Shopee สำเร็จ (Item ID: ${result.item_id})`, 'success');
      } else {
        showToast(result.error || 'ส่งสินค้าไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-[#EE4D2D]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">ส่งสินค้าไป Shopee</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Product info */}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
            <p className="font-medium text-gray-900 dark:text-white">{productName}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{productCode}</p>
          </div>

          {/* Already linked warning */}
          {linkedItemId && !exportResult && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  สินค้านี้เชื่อมกับร้านนี้อยู่แล้ว (Shopee Item ID: {linkedItemId})
                </span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-6">
                การส่งซ้ำจะสร้างสินค้าใหม่บน Shopee ไม่แนะนำ
              </p>
            </div>
          )}

          {/* Result display */}
          {exportResult && (
            <div className={`rounded-lg p-3 ${exportResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2">
                {exportResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <X className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${exportResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {exportResult.success
                    ? `สำเร็จ! Shopee Item ID: ${exportResult.item_id}`
                    : exportResult.error
                  }
                </span>
              </div>
            </div>
          )}

          {/* Account selector */}
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลดร้าน...
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-amber-600 dark:text-amber-400">
              ไม่พบร้าน Shopee ที่เชื่อมต่ออยู่
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                เลือกร้าน Shopee
              </label>
              <select
                value={selectedAccountId}
                onChange={e => {
                  setSelectedAccountId(e.target.value);
                  setSelectedCategoryId(null);
                  setSelectedCategoryName('');
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
              >
                <option value="">-- เลือกร้าน --</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.shop_name || `Shop #${acc.shop_id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category picker */}
          {selectedAccountId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                หมวดหมู่ Shopee
              </label>
              <ShopeeCategoryPicker
                accountId={selectedAccountId}
                value={selectedCategoryId}
                onChange={(id, name) => {
                  setSelectedCategoryId(id);
                  setSelectedCategoryName(name);
                }}
              />
            </div>
          )}

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              น้ำหนัก (kg)
            </label>
            <input
              type="number"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              step="0.1"
              min="0.01"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            {exportResult?.success ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!exportResult?.success && (
            <button
              onClick={handleExport}
              disabled={exporting || !selectedAccountId || !selectedCategoryId || !!linkedItemId}
              className="px-4 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingBag className="w-4 h-4" />
              )}
              {exporting ? 'กำลังส่ง...' : 'ส่งไป Shopee'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
