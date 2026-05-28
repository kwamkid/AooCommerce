'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Award, Factory, ChevronRight, Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import EntitySearchInput, { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';

interface SupplierRef {
  id: string;
  name: string;
  supplier_type: string;
}

interface BrandItem {
  id: string;
  name: string;
  sort_order: number;
  supplier_id?: string | null;
  supplier?: SupplierRef | null;
  default_gp_rate?: number | null;
  gp_base_price?: 'retail' | 'discounted' | null;
}

export default function BrandsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <LoadingCard />
      </Layout>
    }>
      <BrandsPageInner />
    </Suspense>
  );
}

function BrandsPageInner() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { features, fetched: featuresFetched } = useFeatures();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [editingGpRate, setEditingGpRate] = useState('');
  const [editingGpBase, setEditingGpBase] = useState<'retail' | 'discounted'>('retail');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');

  // Search
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(initialQ);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set('q', value.trim());
      } else {
        params.delete('q');
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname);
    }, 300);
  }, [router, searchParams]);

  const searchQuery = (searchParams.get('q') || '').toLowerCase();
  const filteredBrands = searchQuery
    ? brands.filter(b => {
        const nameMatch = b.name.toLowerCase().includes(searchQuery);
        const supplierMatch = b.supplier?.name?.toLowerCase().includes(searchQuery);
        return nameMatch || supplierMatch;
      })
    : brands;

  useEffect(() => {
    if (can(userProfile?.roles, 'masterdata.brands')) {
      fetchBrands();
      if (features.supplier) fetchSuppliers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, features.supplier]);

  const fetchBrands = async () => {
    try {
      const res = await apiFetch('/api/brands');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBrands(data.data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.data || []);
      }
    } catch { /* ignore */ }
  };


  const resetAddForm = () => {
    setShowAddForm(false);
    setAddName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingSupplierId('');
    setEditingGpRate('');
    setEditingGpBase('retail');
  };

  const startEdit = (brand: BrandItem) => {
    setEditingId(brand.id);
    setEditingName(brand.name);
    setEditingSupplierId(brand.supplier_id || '');
    setEditingGpRate(brand.default_gp_rate != null ? String(brand.default_gp_rate) : '');
    setEditingGpBase(brand.gp_base_price || 'retail');
    resetAddForm();
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      showToast('กรุณากรอกชื่อแบรนด์', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: editingName.trim(),
          supplier_id: editingSupplierId || null,
          default_gp_rate: editingGpRate !== '' ? parseFloat(editingGpRate) : null,
          gp_base_price: editingGpBase,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      showToast('อัปเดตแบรนด์สำเร็จ');
      cancelEdit();
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addName.trim()) {
      showToast('กรุณากรอกชื่อแบรนด์', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast('เพิ่มแบรนด์สำเร็จ');
      resetAddForm();
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: BrandItem) => {
    const ok = await confirm({ title: `ต้องการลบแบรนด์ "${brand.name}"?`, variant: 'danger' }); if (!ok) return;
    setDeletingId(brand.id);
    try {
      const res = await apiFetch(`/api/brands?id=${brand.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบแบรนด์สำเร็จ');
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Admin guard
  if (userProfile && !can(userProfile.roles, 'masterdata.brands')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  // Feature gate
  if (featuresFetched && !features.product_brand) {
    return (
      <Layout>
        <Container size="full">
          <div>
            <h1 className="heading-1">แบรนด์</h1>
            <p className="page-subtitle">จัดการแบรนด์สินค้า</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
            <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">ฟีเจอร์แบรนด์ยังไม่ได้เปิดใช้งาน</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">กรุณาเปิดฟีเจอร์แบรนด์ในการตั้งค่าเพื่อใช้งาน</p>
            </div>
          </div>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <div>
          <h1 className="heading-1">แบรนด์</h1>
          <p className="page-subtitle">จัดการแบรนด์สินค้า กำหนด supplier และ GP rate</p>
        </div>
        {loading ? (
          <LoadingCard />
        ) : (
          <div className="space-y-4">
            {/* Brand count */}
            <p className="data-text text-gray-500 dark:text-slate-400">
              {brands.length} แบรนด์
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="ค้นหาแบรนด์..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            {/* Brand Cards */}
            {filteredBrands.map(brand => (
              <Card key={brand.id} padding="none" className="overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Award className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === brand.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            placeholder="ชื่อแบรนด์"
                            className="w-40 pl-3 pr-2 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            autoFocus
                          />
                          {features.supplier && (
                            <div className="w-48 min-w-0">
                              <EntitySearchInput
                                value={editingSupplierId}
                                onChange={(id) => setEditingSupplierId(id)}
                                onClear={() => setEditingSupplierId('')}
                                options={suppliers.map(s => ({ id: s.id, label: s.name, subtitle: s.supplier_type }))}
                                placeholder="ค้นหา Supplier..."
                                selectedDisplay={
                                  editingSupplierId ? (
                                    <div className="flex items-center gap-2 px-3 py-2.5 border border-primary/30 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-base">
                                      <Factory className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="truncate text-gray-900 dark:text-slate-200">{suppliers.find(s => s.id === editingSupplierId)?.name}</span>
                                    </div>
                                  ) : undefined
                                }
                              />
                            </div>
                          )}
                          <button onClick={handleSaveEdit} disabled={saving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50 flex-shrink-0">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {/* GP Settings row */}
                        {features.consignment && (
                          <div className="flex items-center gap-3 pl-1 flex-wrap">
                            <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">GP default:</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min={0} max={100} step={0.1}
                                value={editingGpRate}
                                onChange={e => setEditingGpRate(e.target.value)}
                                placeholder="เช่น 30"
                                className="w-20 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">คิดจากราคา:</span>
                            <div className="flex items-center gap-2 text-sm">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" name={`gpbase_${brand.id}`} checked={editingGpBase === 'retail'} onChange={() => setEditingGpBase('retail')} className="accent-primary" />
                                <span className="text-gray-700 dark:text-slate-300 text-xs">ราคาปลีก</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" name={`gpbase_${brand.id}`} checked={editingGpBase === 'discounted'} onChange={() => setEditingGpBase('discounted')} className="accent-primary" />
                                <span className="text-gray-700 dark:text-slate-300 text-xs">ราคาลด</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Link href={`/settings/brands/${brand.id}`} className="font-medium text-gray-900 dark:text-white hover:text-primary dark:hover:text-primary transition-colors">
                          {brand.name}
                        </Link>
                        {features.supplier && brand.supplier && (
                          <div className="flex items-center gap-1.5">
                            <Factory className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="data-secondary text-gray-500 dark:text-slate-400">{brand.supplier.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {editingId !== brand.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(brand)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(brand)}
                        disabled={deletingId === brand.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="ลบ"
                      >
                        {deletingId === brand.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                      <Link
                        href={`/settings/brands/${brand.id}`}
                        className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                        title="ดูรายละเอียด"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            {/* Add brand form */}
            {showAddForm ? (
              <Card padding="md" className="space-y-3">
                <div className="data-primary text-gray-700 dark:text-slate-300 flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  เพิ่มแบรนด์
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">ชื่อแบรนด์ *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') resetAddForm(); }}
                    placeholder="เช่น Nike, Samsung"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="primary"
                    onClick={handleAdd}
                    loading={saving}
                    icon={<Check className="w-4 h-4" />}
                  >
                    บันทึก
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={resetAddForm}
                    icon={<X className="w-4 h-4" />}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => { cancelEdit(); setShowAddForm(true); }}
                className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                เพิ่ม<span className="hidden md:inline">แบรนด์</span>
              </button>
            )}
          </div>
        )}
      </Container>
      {confirmDialog}
    </Layout>
  );
}
