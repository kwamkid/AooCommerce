// Path: app/products/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
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
  Columns3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

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
    <span className="flex items-center text-gray-600">
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
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  // Close column settings on click outside
  useEffect(() => {
    if (!showColumnSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(e.target as Node)) {
        setShowColumnSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnSettings]);

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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';

      const response = await fetch('/api/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setProductsList(data.products || []);
      setDataFetched(true);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`/api/products?id=${product.product_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
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

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // Clear alerts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(''); setSuccess(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#00231F]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#E9B308] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
            <h1 className="text-3xl font-bold text-gray-900">สินค้า</h1>
            <p className="text-gray-600 mt-1">จัดการสินค้า (สินค้าปกติ หรือ สินค้าย่อย)</p>
          </div>
          <button
            onClick={() => router.push('/products/new')}
            className="flex items-center space-x-2 px-4 py-2 bg-[#E9B308] hover:bg-[#d4a307] text-[#00231F] rounded-lg font-semibold transition-colors"
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'simple' | 'variation')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
            >
              <option value="all">ทั้งหมด</option>
              <option value="simple">สินค้าปกติ</option>
              <option value="variation">สินค้าย่อย</option>
            </select>
            <div className="relative" ref={columnSettingsRef}>
              <button
                onClick={() => setShowColumnSettings(!showColumnSettings)}
                className="btn-filter-icon"
                title="ตั้งค่าคอลัมน์"
              >
                <Columns3 className="w-5 h-5 text-gray-500" />
              </button>
              {showColumnSettings && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-100">
                    แสดงคอลัมน์
                  </div>
                  {COLUMN_CONFIGS.filter(c => !c.alwaysVisible).map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="w-3.5 h-3.5 text-[#E9B308] border-gray-300 rounded focus:ring-[#E9B308]"
                      />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="data-table-wrap-shadow overflow-x-auto">
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
                  <td colSpan={visibleColumns.size} className="px-6 py-8 text-center text-gray-500">ไม่พบข้อมูลสินค้า</td>
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
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                            <Package2 className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </td>
                    )}

                    {/* Name / Code */}
                    {isCol('nameCode') && (
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-400">{product.code}</div>
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
                                <span className="text-red-600">(฿{product.simple_discount_price})</span>
                              )}
                            </div>
                            {(isCol('sku') || isCol('barcode')) && (product.simple_sku || product.simple_barcode) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {isCol('sku') && product.simple_sku && (
                                  <span className="text-xs text-gray-400">SKU: {product.simple_sku}</span>
                                )}
                                {isCol('barcode') && product.simple_barcode && (
                                  <span className="text-xs text-gray-400">BC: {product.simple_barcode}</span>
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
                                    <span className="text-gray-500">{v.bottle_size}</span>
                                    <span className="text-gray-400 font-medium ml-1">฿</span>
                                    <span>{v.default_price}</span>
                                    {v.discount_price > 0 && (
                                      <span className="text-red-600">(฿{v.discount_price})</span>
                                    )}
                                  </div>
                                  {(isCol('sku') || isCol('barcode')) && (v.sku || v.barcode) && (
                                    <div className="flex items-center gap-2 ml-5">
                                      {isCol('sku') && v.sku && (
                                        <span className="text-xs text-gray-400">SKU: {v.sku}</span>
                                      )}
                                      {isCol('barcode') && v.barcode && (
                                        <span className="text-xs text-gray-400">BC: {v.barcode}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400">ไม่มีสินค้าย่อย</span>
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
                          className="text-[#E9B308] hover:text-[#d4a307] inline-flex items-center"
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

          {/* Pagination */}
          {totalFiltered > 0 && (
            <div className="data-pagination">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{startIndex + 1} - {Math.min(startIndex + rowsPerPage, totalFiltered)} จาก {totalFiltered} รายการ</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="mx-1 px-1 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>/หน้า</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => goToPage(1)} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าแรก">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าก่อน">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages: (number | string)[] = [];
                    if (totalPages <= 3) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      const start = Math.max(1, currentPage - 1);
                      const end = Math.min(totalPages, currentPage + 1);
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (end < totalPages - 1) pages.push('...');
                      if (end < totalPages) pages.push(totalPages);
                      if (start > 2) pages.unshift('...');
                      if (start > 1) pages.unshift(1);
                    }
                    return pages.map((page, idx) =>
                      page === '...' ? (
                        <span key={`dots-${idx}`} className="px-1 text-gray-400">...</span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => goToPage(page as number)}
                          className={`w-8 h-8 rounded text-sm font-medium ${
                            currentPage === page ? 'bg-[#E9B308] text-[#00231F]' : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    );
                  })()}
                </div>
                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าถัดไป">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าสุดท้าย">
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
