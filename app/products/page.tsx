// Path: app/products/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { getImageUrl } from '@/lib/utils/image';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  Search,
  X,
  Check,
  Package2,
  Wine,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Product interface (from API view)
interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: 'simple' | 'variation';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  simple_bottle_size?: string;
  simple_sku?: string;
  simple_barcode?: string;
  simple_default_price?: number;
  simple_discount_price?: number;
  variations: {
    variation_id?: string;
    bottle_size: string;
    sku?: string;
    barcode?: string;
    default_price: number;
    discount_price: number;
    is_active: boolean;
  }[];
}

// Column toggle system
type ColumnKey = 'image' | 'nameCode' | 'type' | 'price' | 'sku' | 'barcode' | 'status' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'image', label: 'รูปภาพ', defaultVisible: true },
  { key: 'nameCode', label: 'ชื่อ/รหัส', defaultVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'price', label: 'ราคา', defaultVisible: true },
  { key: 'sku', label: 'SKU', defaultVisible: false },
  { key: 'barcode', label: 'Barcode', defaultVisible: false },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'products-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="flex items-center text-green-600">
      <Check className="w-4 h-4 mr-1" />
      <span className="text-sm">ใช้งาน</span>
    </span>
  ) : (
    <span className="flex items-center text-gray-600 dark:text-slate-400">
      <X className="w-4 h-4 mr-1" />
      <span className="text-sm">ปิดใช้งาน</span>
    </span>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'simple' | 'variation'>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return new Set(JSON.parse(stored) as ColumnKey[]);
        } catch { /* use defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });
  // Load time
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Close lightbox on ESC
  useEffect(() => {
    if (!lightboxImage) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  const toggleColumn = (key: ColumnKey) => {
    const config = COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  // Fetch products
  const fetchData = async () => {
    const t0 = Date.now();
    try {
      const response = await apiFetch('/api/products');
      const data = await response.json();
      setProductsList(data.products || []);
      setDataFetched(true);
      setLoadTime((Date.now() - t0) / 1000);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
      setLoadTime(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !userProfile || dataFetched) return;
    fetchData();
  }, [authLoading, userProfile, dataFetched]);

  // Handle delete
  const handleDelete = async (product: ProductItem) => {
    if (!confirm(`คุณต้องการลบ ${product.name} หรือไม่?`)) return;
    try {
      const response = await apiFetch(`/api/products?id=${product.product_id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถลบได้');
      setSuccess('ลบสินค้าสำเร็จ');
      setDataFetched(false);
      fetchData();
    } catch (err) {
      console.error('Error deleting:', err);
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบได้');
    }
  };

  // Filter
  const filteredProducts = productsList.filter(product => {
    // Type filter
    if (typeFilter !== 'all' && product.product_type !== typeFilter) return false;

    // Search filter — name, code, SKU, barcode
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = product.name.toLowerCase().includes(term);
      const matchCode = product.code.toLowerCase().includes(term);
      const matchSimpleSku = (product.simple_sku || '').toLowerCase().includes(term);
      const matchSimpleBarcode = (product.simple_barcode || '').toLowerCase().includes(term);
      const matchVariationSku = product.variations?.some(v => (v.sku || '').toLowerCase().includes(term));
      const matchVariationBarcode = product.variations?.some(v => (v.barcode || '').toLowerCase().includes(term));
      if (!matchName && !matchCode && !matchSimpleSku && !matchSimpleBarcode && !matchVariationSku && !matchVariationBarcode) return false;
    }

    return true;
  });

  // Pagination
  const totalFiltered = filteredProducts.length;
  const totalPages = Math.ceil(totalFiltered / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, typeFilter]);

  // Clear alerts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(''); setSuccess(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (!userProfile) return null;

  const thClass = "data-th";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">สินค้า</h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการสินค้า (สินค้าปกติ หรือ สินค้าย่อย)</p>
          </div>
          <button
            onClick={() => router.push('/products/new')}
            className="flex items-center space-x-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>เพิ่มสินค้า</span>
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}><X className="w-5 h-5" /></button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')}><X className="w-5 h-5" /></button>
          </div>
        )}

        {/* Search + Type Filter + Column Settings */}
        <div className="data-filter-card">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, SKU, Barcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'simple' | 'variation')}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
            >
              <option value="all">ทั้งหมด</option>
              <option value="simple">สินค้าปกติ</option>
              <option value="variation">สินค้าย่อย</option>
            </select>
          </div>
        </div>

        {/* Products Table */}
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
          <table className="data-table-fixed">
            <thead className="data-thead">
              <tr>
                {isCol('image') && <th className={`${thClass} w-[88px]`}>รูปภาพ</th>}
                {isCol('nameCode') && <th className={thClass}>ชื่อ/รหัส</th>}
                {isCol('type') && <th className={thClass}>ประเภท</th>}
                {isCol('price') && <th className={thClass}>ราคา</th>}
                {isCol('status') && <th className={thClass}>สถานะ</th>}
                {isCol('actions') && <th className={`${thClass} text-right`}>จัดการ</th>}
              </tr>
            </thead>
            <tbody className="data-tbody">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.size} className="px-6 py-8 text-center text-gray-500 dark:text-slate-400">ไม่พบข้อมูลสินค้า</td>
                </tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product.product_id} className="data-tr">
                    {/* Image */}
                    {isCol('image') && (
                      <td className="px-3 py-3 whitespace-nowrap w-[88px]">
                        {(product.main_image_url || product.image) ? (
                          <img
                            src={product.main_image_url || getImageUrl(product.image)}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setLightboxImage(product.main_image_url || getImageUrl(product.image))}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center">
                            <Package2 className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </td>
                    )}

                    {/* Name / Code */}
                    {isCol('nameCode') && (
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500">{product.code}</div>
                      </td>
                    )}

                    {/* Type */}
                    {isCol('type') && (
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          product.product_type === 'simple'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {product.product_type === 'simple' ? 'สินค้าปกติ' : 'สินค้าย่อย'}
                        </span>
                      </td>
                    )}

                    {/* Price (+ inline SKU/Barcode) */}
                    {isCol('price') && (
                      <td className="px-6 py-4">
                        {product.product_type === 'simple' ? (
                          <div>
                            <div className="text-sm flex items-center space-x-1">
                              <span className="text-gray-400 font-medium">฿</span>
                              <span>{product.simple_default_price}</span>
                              {product.simple_discount_price && product.simple_discount_price > 0 && (
                                <span className="text-red-600 dark:text-red-400">(฿{product.simple_discount_price})</span>
                              )}
                            </div>
                            {(isCol('sku') || isCol('barcode')) && (product.simple_sku || product.simple_barcode) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {isCol('sku') && product.simple_sku && (
                                  <span className="text-xs text-gray-400 dark:text-slate-500">SKU: {product.simple_sku}</span>
                                )}
                                {isCol('barcode') && product.simple_barcode && (
                                  <span className="text-xs text-gray-400 dark:text-slate-500">BC: {product.simple_barcode}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {product.variations && product.variations.length > 0 ? (
                              product.variations.map((v) => (
                                <div key={v.variation_id || `${product.product_id}-${v.bottle_size}`}>
                                  <div className="text-sm flex items-center space-x-1">
                                    <Wine className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-gray-500 dark:text-slate-400">{v.bottle_size}</span>
                                    <span className="text-gray-400 font-medium ml-1">฿</span>
                                    <span>{v.default_price}</span>
                                    {v.discount_price > 0 && (
                                      <span className="text-red-600 dark:text-red-400">(฿{v.discount_price})</span>
                                    )}
                                  </div>
                                  {(isCol('sku') || isCol('barcode')) && (v.sku || v.barcode) && (
                                    <div className="flex items-center gap-2 ml-5">
                                      {isCol('sku') && v.sku && (
                                        <span className="text-xs text-gray-400 dark:text-slate-500">SKU: {v.sku}</span>
                                      )}
                                      {isCol('barcode') && v.barcode && (
                                        <span className="text-xs text-gray-400 dark:text-slate-500">BC: {v.barcode}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-slate-500">ไม่มีสินค้าย่อย</span>
                            )}
                          </div>
                        )}
                      </td>
                    )}

                    {/* Status */}
                    {isCol('status') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <ActiveBadge isActive={product.is_active} />
                      </td>
                    )}

                    {/* Actions */}
                    {isCol('actions') && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => router.push(`/products/${product.product_id}/edit`)}
                          className="text-[#F4511E] hover:text-[#D63B0E] inline-flex items-center"
                          title="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/products/new?duplicate=${product.product_id}`)}
                          className="text-blue-500 hover:text-blue-600 inline-flex items-center"
                          title="คัดลอกสินค้า"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="text-red-600 hover:text-red-700 inline-flex items-center"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalFiltered}
            startIdx={startIndex}
            endIdx={Math.min(startIndex + rowsPerPage, totalFiltered)}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={setRowsPerPage}
            setPage={setCurrentPage}
            loadTime={loadTime}
          >
            <ColumnSettingsDropdown
              configs={COLUMN_CONFIGS}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxImage(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}
