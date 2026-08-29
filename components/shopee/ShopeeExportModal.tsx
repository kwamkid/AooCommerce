'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Loader2, X, Upload, CheckCircle2, ShoppingBag, AlertTriangle } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ShopeeCategoryPicker from './ShopeeCategoryPicker';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';

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

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `marketplace/covers/${productId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from('product-images')
        .upload(path, compressed, { contentType: compressed.type || 'image/jpeg' });
      if (error) { showToast('อัปโหลดรูปไม่สำเร็จ', 'error'); return; }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setCoverImageUrl(data.publicUrl);
      showToast('ตั้งรูปหน้าปกสำหรับร้านนี้แล้ว');
    } catch {
      showToast('อัปโหลดรูปไม่สำเร็จ', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [weight, setWeight] = useState<string>('0.5');
  // รูปหน้าปกเฉพาะร้านนี้ — Shopee ไม่ยอมให้ประกาศต่างร้านใช้รูปหน้าปกเดียวกัน
  // (ร้านแบรนด์ + ร้านรวมแบรนด์ที่ขายสินค้าตัวเดียวกันจึงต้องใช้คนละรูป)
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState(false);
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
      // Pre-fill from existing marketplace link data
      prefillFromExistingLink();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const prefillFromExistingLink = async () => {
    if (!productId) return;
    try {
      const res = await apiFetch(`/api/marketplace/links?product_id=${productId}&platform=shopee`);
      if (!res.ok) return;
      const data = await res.json();
      const links = data.links || [];
      // Find the best link with category info
      const linkWithCategory = links.find((l: { shopee_category_id?: string | number }) => l.shopee_category_id);
      if (linkWithCategory) {
        if (linkWithCategory.shopee_category_id) {
          setSelectedCategoryId(Number(linkWithCategory.shopee_category_id));
          setSelectedCategoryName(linkWithCategory.shopee_category_name || '');
        }
        if (linkWithCategory.weight) {
          setWeight(String(linkWithCategory.weight));
        }
      }
    } catch {
      // ignore - prefill is best-effort
    }
  };

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
          marketplace_account_id: selectedAccountId,
          shopee_category_id: selectedCategoryId,
          shopee_category_name: selectedCategoryName,
          weight: parseFloat(weight) || 0.5,
          cover_image_url: coverImageUrl || undefined,
          mode: 'json',
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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={
        <div className="w-8 h-8 rounded-lg bg-shopee/10 flex items-center justify-center">
          <Upload className="w-4 h-4 text-shopee" />
        </div>
      }
      title="ส่งสินค้าไป Shopee"
      footer={
        <div className="flex justify-end gap-2 p-4">
          <Button variant="secondary" onClick={onClose}>
            {exportResult?.success ? 'ปิด' : 'ยกเลิก'}
          </Button>
          {!exportResult?.success && (
            <Button
              variant="primary"
              onClick={handleExport}
              loading={exporting}
              disabled={!selectedAccountId || !selectedCategoryId || !!linkedItemId}
              icon={<ShoppingBag className="w-4 h-4" />}
            >
              ส่งไป Shopee
            </Button>
          )}
        </div>
      }
    >
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
              <FormSelect
                value={selectedAccountId}
                onChange={val => {
                  setSelectedAccountId(val);
                  // Don't reset category if pre-filled from existing link
                }}
                options={accounts.map(acc => ({ id: acc.id, label: acc.shop_name || `Shop #${acc.shop_id}` }))}
                placeholder="-- เลือกร้าน --"
                icon={<ShoppingBag className="w-4 h-4" />}
                searchThreshold={99}
              />
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
                categoryName={selectedCategoryName}
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-shopee/50"
            />
          </div>

          {/* รูปหน้าปกเฉพาะร้านนี้ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              รูปหน้าปกสำหรับร้านนี้
            </label>
            <div className="flex items-start gap-3">
              {coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImageUrl} alt="รูปหน้าปกที่เลือก" className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-slate-600" />
              ) : (
                <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-400">
                  <ShoppingBag className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                  {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {coverImageUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCover}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = ''; }}
                  />
                </label>
                {coverImageUrl && (
                  <button type="button" onClick={() => setCoverImageUrl('')} className="ml-2 text-sm text-gray-500 hover:text-red-500">
                    เอาออก
                  </button>
                )}
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                  Shopee ไม่ยอมให้ประกาศต่างร้านใช้รูปหน้าปกเดียวกัน — ถ้าสินค้านี้ลงร้านอื่นอยู่แล้วให้ใช้คนละรูป · ไม่เลือก = ใช้รูปหลักของสินค้า
                </p>
              </div>
            </div>
          </div>
        </div>

    </Modal>
  );
}
