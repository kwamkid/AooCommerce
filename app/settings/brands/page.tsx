'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PackageSearch } from 'lucide-react';
import { AddIcon, BrandIcon, DeleteIcon, EditIcon, SupplierIcon } from '@/lib/icons';
import Layout from '@/components/layout/Layout';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import BrandFormModal from '@/components/brands/BrandFormModal';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import ListFilterBar from '@/components/ui/ListFilterBar';
import { MasterDataGrid, MasterDataGridCard } from '@/components/ui/MasterDataGrid';
import PageHeader from '@/components/ui/PageHeader';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { can } from '@/lib/permissions';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';

interface SupplierRef {
  id: string;
  name: string;
  supplier_type: string;
}

// ⛔ ไม่มี GP ที่แบรนด์ — GP ระดับแบรนด์อยู่ที่ `companies.settings.brand_gp_overrides`
//    (ตั้งค่า › ลูกค้าธุรกิจ) ซึ่ง lib/gp-resolver.ts อ่านตัวนั้น · ห้ามเพิ่มกลับมาที่นี่
interface BrandItem {
  id: string;
  name: string;
  logo_url?: string | null;
  sort_order: number;
  supplier_id?: string | null;
  supplier?: SupplierRef | null;
  /** ลิงก์หน้าร้าน (`?brand=<slug>`) — แก้ได้ในฟอร์มแก้ไขแบรนด์ */
  slug?: string | null;
}

export default function BrandsPage() {
  return <Suspense fallback={<Layout><LoadingCard /></Layout>}><BrandsPageInner /></Suspense>;
}

function BrandsPageInner() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { features, fetched: featuresFetched } = useFeatures();
  const { confirmDialog, confirm } = useConfirmDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  /** ฟอร์มแบรนด์เป็นของกลาง (components/brands/BrandFormModal) — หน้า Supplier ใช้ใบเดียวกัน
   *  `formOpen` + `editingBrand` (null = เพิ่มใหม่) ⛔ ห้ามเขียนฟอร์มแบรนด์ซ้ำในหน้านี้อีก */
  const [formOpen, setFormOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await apiFetch('/api/brands');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBrands(data.data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.data || []);
      }
    } catch { /* Supplier is optional on this page. */ }
  }, []);

  useEffect(() => {
    if (!featuresFetched || !can(userProfile, 'masterdata.brands')) return;
    void fetchBrands();
    if (features.supplier) void fetchSuppliers();
  }, [features.supplier, featuresFetched, fetchBrands, fetchSuppliers, userProfile]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      const queryString = params.toString();
      router.replace(queryString ? `?${queryString}` : window.location.pathname);
    }, 300);
  }, [router, searchParams]);

  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter(brand => brand.name.toLowerCase().includes(query)
      || brand.supplier?.name?.toLowerCase().includes(query));
  }, [brands, searchQuery]);

  /** `brand` ว่าง = เพิ่มใหม่ · มีค่า = แก้ไข */
  const openForm = (brand?: BrandItem) => {
    setEditingBrand(brand || null);
    setFormOpen(true);
  };

  const handleDelete = async (brand: BrandItem) => {
    if (!await confirm({ title: `ต้องการลบแบรนด์ “${brand.name}” หรือไม่`, variant: 'danger' })) return;
    setDeletingId(brand.id);
    try {
      const res = await apiFetch(`/api/brands?id=${brand.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'ลบไม่สำเร็จ');
      }
      showToast('ลบแบรนด์สำเร็จ');
      await fetchBrands();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'ลบไม่สำเร็จ', 'error');
    } finally { setDeletingId(null); }
  };

  const actionItems = (brand: BrandItem): ActionItem[] => [
    {
      key: 'products', label: 'สินค้าในแบรนด์', description: 'เพิ่มหรือนำสินค้าออกจากแบรนด์', icon: <PackageSearch />,
      onClick: () => router.push(`/settings/brands/${brand.id}`), primary: true,
    },
    { key: 'edit', label: 'แก้ไขแบรนด์', icon: <EditIcon />, onClick: () => openForm(brand) },
    {
      key: 'delete', label: 'ลบ', icon: <DeleteIcon />,
      onClick: () => void handleDelete(brand), danger: true, disabled: deletingId === brand.id, dividerBefore: true,
    },
  ];

  if (userProfile && !can(userProfile, 'masterdata.brands')) return <Layout><NoPermissionCard /></Layout>;
  if (!featuresFetched) return <Layout><LoadingCard /></Layout>;
  if (featuresFetched && !features.product_brand) {
    return (
      <Layout><Container size="full">
        <PageHeader icon={<BrandIcon />} title="แบรนด์" subtitle="จัดการแบรนด์สินค้า" />
        <Alert tone="warning" title="ฟีเจอร์แบรนด์ยังไม่ได้เปิดใช้งาน">กรุณาเปิดฟีเจอร์แบรนด์ในการตั้งค่าเพื่อใช้งาน</Alert>
      </Container></Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader icon={<BrandIcon />} title="แบรนด์" subtitle={`แบรนด์สินค้าทั้งหมด ${brands.length} แบรนด์`}
          actions={<Button variant="primary" icon={<AddIcon />} onClick={() => openForm()}>เพิ่มแบรนด์</Button>} />
        <ListFilterBar value={searchInput} onChange={handleSearchChange}
          placeholder={features.supplier ? 'ค้นหาแบรนด์หรือ Supplier...' : 'ค้นหาแบรนด์...'}
          summary={<Badge tone="orange">{brands.length} แบรนด์</Badge>} />

        {loading ? <LoadingCard /> : filteredBrands.length === 0 ? (
          <EmptyCard
            icon={<BrandIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title={searchQuery ? 'ไม่พบแบรนด์ที่ค้นหา' : 'ยังไม่มีแบรนด์สินค้า'}
            subtitle={searchQuery ? 'ลองเปลี่ยนคำค้น' : 'เพิ่มแบรนด์แรกเพื่อจัดกลุ่มสินค้าให้ลูกค้าหาง่ายขึ้น'}
            actions={searchQuery ? undefined : <Button variant="primary" icon={<AddIcon />} onClick={() => openForm()}>เพิ่มแบรนด์</Button>}
          />
        ) : (
          <MasterDataGrid>
            {filteredBrands.map(brand => (
              <MasterDataGridCard
                key={brand.id}
                title={brand.name}
                imageUrl={brand.logo_url}
                href={`/settings/brands/${brand.id}`}
                subtitle={features.supplier ? (
                  brand.supplier
                    ? <span className="table-meta"><SupplierIcon />{brand.supplier.name}</span>
                    : 'ยังไม่ผูก Supplier'
                ) : undefined}
                actions={<ActionMenu items={actionItems(brand)} />}
              />
            ))}
          </MasterDataGrid>
        )}
      </Container>

      <BrandFormModal
        open={formOpen}
        brand={editingBrand}
        suppliers={suppliers}
        // ลิงก์ของแบรนด์อื่น (ไม่รวมตัวที่กำลังแก้) — เตือนซ้ำตั้งแต่ตอนพิมพ์ ไม่ต้องรอ DB ตีกลับ
        takenSlugs={brands.filter(item => item.id !== editingBrand?.id).map(item => item.slug || '').filter(Boolean)}
        onClose={() => setFormOpen(false)}
        onSaved={() => void fetchBrands()}
      />
      {confirmDialog}
    </Layout>
  );
}
