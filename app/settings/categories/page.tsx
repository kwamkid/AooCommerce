'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CornerDownRight, Edit2, Folder, FolderTree, Plus, Tag, Trash2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import SaveButton from '@/components/ui/SaveButton';
import SearchInput from '@/components/ui/SearchInput';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';

interface CategoryItem {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children?: CategoryItem[];
}

interface CategoryRow extends CategoryItem {
  level: 0 | 1;
  parentName: string | null;
  childCount: number;
}

export default function CategoriesPageWrapper() {
  return <Suspense fallback={<Layout><LoadingCard /></Layout>}><CategoriesPage /></Suspense>;
}

function CategoriesPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCategories(data.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(fetchCategories, can(userProfile, 'masterdata.categories'));
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

  const rows = useMemo<CategoryRow[]>(() => categories.flatMap(parent => [
    { ...parent, level: 0, parentName: null, childCount: parent.children?.length || 0 },
    ...(parent.children || []).map(child => ({
      ...child, level: 1 as const, parentName: parent.name, childCount: 0,
    })),
  ]), [categories]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => row.name.toLowerCase().includes(query)
      || row.parentName?.toLowerCase().includes(query));
  }, [rows, searchQuery]);

  const parentCount = categories.length;
  const childCount = rows.length - parentCount;

  const openAddModal = (parentId: string | null = null) => {
    setAddName('');
    setAddParentId(parentId);
    setAddModalOpen(true);
  };
  const closeAddModal = () => {
    if (saving) return;
    setAddModalOpen(false);
    setAddName('');
    setAddParentId(null);
  };
  const openEditModal = (category: CategoryRow) => {
    setEditingCategory(category);
    setEditingName(category.name);
  };
  const closeEditModal = () => {
    if (saving) return;
    setEditingCategory(null);
    setEditingName('');
  };

  const handleAdd = async () => {
    if (!addName.trim()) return showToast('กรุณากรอกชื่อหมวดหมู่', 'error');
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), parent_id: addParentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast(addParentId ? 'เพิ่มหมวดย่อยสำเร็จ' : 'เพิ่มหมวดหมู่สำเร็จ');
      setAddModalOpen(false);
      setAddName('');
      setAddParentId(null);
      await fetchCategories();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ', 'error');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || !editingName.trim()) return showToast('กรุณากรอกชื่อหมวดหมู่', 'error');
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingCategory.id, name: editingName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      showToast('อัปเดตหมวดหมู่สำเร็จ');
      setEditingCategory(null);
      setEditingName('');
      await fetchCategories();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (category: CategoryRow) => {
    const source = category.level === 0 ? categories.find(item => item.id === category.id) : category;
    const children = source?.children || [];
    const title = children.length
      ? `หมวดหมู่ “${category.name}” มีหมวดย่อย ${children.length} รายการ หมวดย่อยจะถูกลบด้วย`
      : `ต้องการลบ${category.level === 1 ? 'หมวดย่อย' : 'หมวดหมู่'} “${category.name}” หรือไม่`;
    if (!await confirm({ title, variant: 'danger' })) return;
    setDeletingId(category.id);
    try {
      for (const child of children) {
        const childRes = await apiFetch(`/api/categories?id=${child.id}`, { method: 'DELETE' });
        if (!childRes.ok) throw new Error(`ลบหมวดย่อย “${child.name}” ไม่สำเร็จ`);
      }
      const res = await apiFetch(`/api/categories?id=${category.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'ลบไม่สำเร็จ');
      }
      showToast('ลบหมวดหมู่สำเร็จ');
      await fetchCategories();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'ลบไม่สำเร็จ', 'error');
    } finally { setDeletingId(null); }
  };

  const actionItems = (row: CategoryRow): ActionItem[] => [
    ...(row.level === 0 ? [{
      key: 'add-child', label: 'เพิ่มหมวดย่อย', icon: <Plus className="w-4 h-4" />,
      onClick: () => openAddModal(row.id), primary: true,
    }] : []),
    { key: 'edit', label: 'แก้ไขชื่อ', icon: <Edit2 className="w-4 h-4" />, onClick: () => openEditModal(row) },
    {
      key: 'delete', label: 'ลบ', icon: <Trash2 className="w-4 h-4" />,
      onClick: () => void handleDelete(row), danger: true, disabled: deletingId === row.id, dividerBefore: true,
    },
  ];
  const renderActions = (row: CategoryRow) => <ActionMenu items={actionItems(row)} />;

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: 'name', label: 'หมวดหมู่', alwaysVisible: true, grow: true,
      render: row => (
        <div className={`flex items-center gap-3 ${row.level === 1 ? 'pl-7' : ''}`}>
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${row.level === 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300'}`}>
            {row.level === 0 ? <Folder className="w-4 h-4" /> : <CornerDownRight className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <p className="data-primary truncate">{row.name}</p>
            {row.parentName && <p className="page-subtitle truncate">อยู่ใน {row.parentName}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'type', label: 'ประเภท', defaultWidth: 150,
      render: row => <Badge tone={row.level === 0 ? 'orange' : 'gray'}>{row.level === 0 ? 'หมวดหลัก' : 'หมวดย่อย'}</Badge>,
    },
    {
      key: 'children', label: 'หมวดย่อย', align: 'center', defaultWidth: 120,
      render: row => row.level === 0 ? `${row.childCount} รายการ` : '—',
    },
    {
      key: 'actions', label: '', alwaysVisible: true, stopPropagation: true, align: 'right', defaultWidth: 64,
      render: renderActions,
    },
  ];

  if (userProfile && !can(userProfile, 'masterdata.categories')) return <Layout><NoPermissionCard /></Layout>;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<FolderTree />}
          title="หมวดหมู่สินค้า"
          subtitle={`จัดโครงสร้างสินค้า ${parentCount} หมวดหลัก และ ${childCount} หมวดย่อย`}
          actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => openAddModal()}>เพิ่มหมวดหมู่</Button>}
        />
        <div className="data-filter-card">
          <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาหมวดหมู่หรือหมวดย่อย..." className="w-full md:w-96" />
          <div className="flex items-center gap-2">
            <Badge tone="orange">{parentCount} หมวดหลัก</Badge>
            <Badge tone="gray">{childCount} หมวดย่อย</Badge>
          </div>
        </div>
        <DataTable
          storageKey="settings-categories" columns={columns} data={filteredRows} loading={loading}
          getRowId={row => row.id} emptyMessage={searchQuery ? 'ไม่พบหมวดหมู่ที่ค้นหา' : 'ยังไม่มีหมวดหมู่สินค้า'}
          emptyIcon={<FolderTree className="w-10 h-10" />} currentPage={1} totalPages={1}
          totalRecords={filteredRows.length} recordsPerPage={Math.max(filteredRows.length, 1)}
          onPageChange={() => undefined} onRecordsPerPageChange={() => undefined} hidePagination
          mobileCardRender={row => (
            <div className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${row.level === 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300'}`}>
                {row.level === 0 ? <Folder className="w-5 h-5" /> : <CornerDownRight className="w-5 h-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="data-primary truncate">{row.name}</p>
                <p className="page-subtitle">{row.level === 0 ? `${row.childCount} หมวดย่อย` : `หมวดย่อยของ ${row.parentName}`}</p>
              </div>
              {renderActions(row)}
            </div>
          )}
        />
      </Container>

      <Modal open={addModalOpen} onClose={closeAddModal} title={addParentId ? 'เพิ่มหมวดย่อย' : 'เพิ่มหมวดหมู่'}
        icon={<Tag className="w-5 h-5 text-primary" />} size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={closeAddModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleAdd} loading={saving} /></div>}
      >
        <div className="space-y-4">
          <FormInput label="ชื่อหมวดหมู่" required value={addName} onChange={event => setAddName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleAdd(); }} placeholder="เช่น เครื่องดื่ม, อาหาร" autoFocus />
          <div>
            <label className="form-label">หมวดหมู่หลัก</label>
            <FormSelect value={addParentId || ''} onChange={value => setAddParentId(value || null)}
              options={categories.map(category => ({ id: category.id, label: category.name }))}
              clearLabel="ไม่มี — สร้างเป็นหมวดหลัก" searchThreshold={8} />
            <p className="page-subtitle mt-1">เลือกหมวดหลักเมื่อต้องการสร้างหมวดย่อย</p>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(editingCategory)} onClose={closeEditModal} title="แก้ไขชื่อหมวดหมู่"
        icon={<Edit2 className="w-5 h-5 text-primary" />} size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={closeEditModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleSaveEdit} loading={saving} /></div>}
      >
        <FormInput label="ชื่อหมวดหมู่" required value={editingName} onChange={event => setEditingName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void handleSaveEdit(); }} autoFocus />
      </Modal>
      {confirmDialog}
    </Layout>
  );
}
