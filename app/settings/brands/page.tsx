'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Award, Edit2, Factory, PackageSearch, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_RECORDS_PER_PAGE, RECORDS_PER_PAGE_OPTIONS } from '@/app/components/Pagination';
import Layout from '@/components/layout/Layout';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import FormField from '@/components/ui/FormField';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import ListFilterBar from '@/components/ui/ListFilterBar';
import MasterDataCell from '@/components/ui/MasterDataCell';
import Modal, { ModalFormBody, ModalFormFooter } from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import SaveButton from '@/components/ui/SaveButton';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
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
  const requestedPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const requestedLimit = Number(searchParams.get('limit'));
  const recordsPerPage = RECORDS_PER_PAGE_OPTIONS.includes(requestedLimit as typeof RECORDS_PER_PAGE_OPTIONS[number])
    ? requestedLimit
    : DEFAULT_RECORDS_PER_PAGE;

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [editingBrand, setEditingBrand] = useState<BrandItem | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [editingGpRate, setEditingGpRate] = useState('');
  const [editingGpBase, setEditingGpBase] = useState<'retail' | 'discounted'>('retail');
  const [saving, setSaving] = useState(false);
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
      params.delete('page');
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

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / recordsPerPage));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedBrands = filteredBrands.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage,
  );

  const setPagination = (page: number, limit: number = recordsPerPage) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    if (limit !== DEFAULT_RECORDS_PER_PAGE) params.set('limit', String(limit));
    else params.delete('limit');
    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : window.location.pathname);
  };

  const closeAddModal = () => {
    if (saving) return;
    setAddModalOpen(false);
    setAddName('');
  };

  const openEditModal = (brand: BrandItem) => {
    setEditingBrand(brand);
    setEditingName(brand.name);
    setEditingSupplierId(brand.supplier_id || '');
    setEditingGpRate(brand.default_gp_rate == null ? '' : String(brand.default_gp_rate));
    setEditingGpBase(brand.gp_base_price || 'retail');
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditingBrand(null);
    setEditingName('');
    setEditingSupplierId('');
    setEditingGpRate('');
    setEditingGpBase('retail');
  };

  const handleAdd = async () => {
    if (!addName.trim()) return showToast('กรุณากรอกชื่อแบรนด์', 'error');
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast('เพิ่มแบรนด์สำเร็จ');
      setAddModalOpen(false);
      setAddName('');
      await fetchBrands();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ', 'error');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingBrand || !editingName.trim()) return showToast('กรุณากรอกชื่อแบรนด์', 'error');
    const parsedGpRate = editingGpRate === '' ? null : Number(editingGpRate);
    if (parsedGpRate != null && (!Number.isFinite(parsedGpRate) || parsedGpRate < 0 || parsedGpRate > 100)) {
      return showToast('GP ต้องอยู่ระหว่าง 0–100%', 'error');
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingBrand.id,
          name: editingName.trim(),
          supplier_id: editingSupplierId || null,
          default_gp_rate: parsedGpRate,
          gp_base_price: editingGpBase,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      showToast('อัปเดตแบรนด์สำเร็จ');
      closeEditModalAfterSave();
      await fetchBrands();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally { setSaving(false); }
  };

  const closeEditModalAfterSave = () => {
    setEditingBrand(null);
    setEditingName('');
    setEditingSupplierId('');
    setEditingGpRate('');
    setEditingGpBase('retail');
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
    { key: 'edit', label: 'แก้ไขแบรนด์', icon: <Edit2 />, onClick: () => openEditModal(brand) },
    {
      key: 'delete', label: 'ลบ', icon: <Trash2 />,
      onClick: () => void handleDelete(brand), danger: true, disabled: deletingId === brand.id, dividerBefore: true,
    },
  ];
  const renderActions = (brand: BrandItem) => <ActionMenu items={actionItems(brand)} />;

  const columns: DataTableColumn<BrandItem>[] = [
    {
      key: 'name', label: 'แบรนด์', alwaysVisible: true, grow: true, defaultWidth: 260,
      render: brand => <MasterDataCell icon={<Award />} title={brand.name} href={`/settings/brands/${brand.id}`} />,
    },
    ...(features.supplier ? [{
      key: 'supplier', label: 'Supplier', defaultWidth: 320,
      render: (brand: BrandItem) => brand.supplier ? (
        <div className="table-meta"><Factory /><span>{brand.supplier.name}</span></div>
      ) : <span className="table-muted">ยังไม่ผูก Supplier</span>,
    }] : []),
    ...(features.consignment ? [{
      key: 'gp', label: 'GP ฝากขาย', defaultWidth: 180,
      render: (brand: BrandItem) => brand.default_gp_rate == null
        ? <Badge tone="gray" title="ใช้ค่า GP ฝากขายกลางที่ตั้งไว้ในบริษัท">ใช้ GP กลาง</Badge>
        : <Badge tone="blue">{brand.default_gp_rate}%</Badge>,
    }, {
      key: 'gp-base', label: 'คิด GP จาก', defaultWidth: 150,
      render: (brand: BrandItem) => brand.gp_base_price === 'discounted' ? 'ราคาลด' : 'ราคาปลีก',
    }] : []),
    {
      key: 'actions', label: '', alwaysVisible: true, stopPropagation: true, align: 'right', defaultWidth: 64,
      render: renderActions,
    },
  ];

  if (userProfile && !can(userProfile, 'masterdata.brands')) return <Layout><NoPermissionCard /></Layout>;
  if (!featuresFetched) return <Layout><LoadingCard /></Layout>;
  if (featuresFetched && !features.product_brand) {
    return (
      <Layout><Container size="full">
        <PageHeader icon={<Award />} title="แบรนด์" subtitle="จัดการแบรนด์สินค้า" />
        <Alert tone="warning" title="ฟีเจอร์แบรนด์ยังไม่ได้เปิดใช้งาน">กรุณาเปิดฟีเจอร์แบรนด์ในการตั้งค่าเพื่อใช้งาน</Alert>
      </Container></Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader icon={<Award />} title="แบรนด์" subtitle={`กำหนด Supplier และ GP ฝากขายของแต่ละแบรนด์ รวม ${brands.length} แบรนด์`}
          actions={<Button variant="primary" icon={<Plus />} onClick={() => setAddModalOpen(true)}>เพิ่มแบรนด์</Button>} />
        <ListFilterBar value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาแบรนด์หรือ Supplier..." summary={<Badge tone="orange">{brands.length} แบรนด์</Badge>} />
        <DataTable
          storageKey="settings-brands" columns={columns} data={paginatedBrands} loading={loading}
          getRowId={brand => brand.id} emptyMessage={searchQuery ? 'ไม่พบแบรนด์ที่ค้นหา' : 'ยังไม่มีแบรนด์สินค้า'}
          emptyIcon={<Award className="data-empty-icon" />} currentPage={currentPage} totalPages={totalPages}
          totalRecords={filteredBrands.length} recordsPerPage={recordsPerPage}
          onPageChange={page => setPagination(page)}
          onRecordsPerPageChange={limit => setPagination(1, limit)}
          onLimitChange={(limit, page) => setPagination(page, limit)}
          mobileCardRender={brand => (
            <div className="master-data-mobile-row">
              <MasterDataCell
                icon={<Award />}
                title={brand.name}
                href={`/settings/brands/${brand.id}`}
                subtitle={features.supplier ? brand.supplier?.name || 'ยังไม่ผูก Supplier' : undefined}
              />
              {features.consignment && brand.default_gp_rate != null && <Badge tone="blue">GP {brand.default_gp_rate}%</Badge>}
              {renderActions(brand)}
            </div>
          )}
        />
      </Container>

      <Modal open={addModalOpen} onClose={closeAddModal} title="เพิ่มแบรนด์" icon={<Award />} size="md"
        footer={<ModalFormFooter><Button variant="secondary" onClick={closeAddModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleAdd} loading={saving} /></ModalFormFooter>}
      >
        <ModalFormBody>
          <FormInput label="ชื่อแบรนด์" required value={addName} onChange={event => setAddName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleAdd(); }} placeholder="เช่น Nike, Samsung" autoFocus />
        </ModalFormBody>
      </Modal>

      <Modal open={Boolean(editingBrand)} onClose={closeEditModal} title="แก้ไขแบรนด์" icon={<Edit2 />} size="lg"
        footer={<ModalFormFooter><Button variant="secondary" onClick={closeEditModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleSaveEdit} loading={saving} /></ModalFormFooter>}
      >
        <ModalFormBody stacked>
          <FormInput label="ชื่อแบรนด์" required value={editingName} onChange={event => setEditingName(event.target.value)} autoFocus />
          {features.supplier && (
            <FormField label="Supplier">
              <EntitySearchInput value={editingSupplierId} onChange={setEditingSupplierId} onClear={() => setEditingSupplierId('')}
                options={suppliers.map(supplier => ({ id: supplier.id, label: supplier.name, subtitle: supplier.supplier_type }))}
                placeholder="ค้นหา Supplier..."
                selectedDisplay={editingSupplierId ? (
                  <div className="entity-selected-value"><Factory /><span className="entity-selected-value-text">{suppliers.find(supplier => supplier.id === editingSupplierId)?.name}</span></div>
                ) : undefined} />
            </FormField>
          )}
          {features.consignment && (
            <div className="form-grid-2">
              <FormInput label="GP ฝากขายของแบรนด์" type="number" min={0} max={100} postfix="%" value={editingGpRate}
                onChange={event => setEditingGpRate(event.target.value)} hint="เว้นว่างเพื่อใช้ GP ฝากขายกลางของบริษัท" />
              <FormField label="คิด GP จากราคา">
                <FormSelect value={editingGpBase} onChange={value => setEditingGpBase(value as 'retail' | 'discounted')}
                  options={[{ id: 'retail', label: 'ราคาปลีก' }, { id: 'discounted', label: 'ราคาลด' }]} searchThreshold={99} />
              </FormField>
            </div>
          )}
        </ModalFormBody>
      </Modal>
      {confirmDialog}
    </Layout>
  );
}
