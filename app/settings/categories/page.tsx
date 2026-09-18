'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CornerDownRight, Folder } from 'lucide-react';
import { AddIcon, CategoryIcon, DeleteIcon, EditIcon } from '@/lib/icons';
import Layout from '@/components/layout/Layout';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import FormField from '@/components/ui/FormField';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import ListFilterBar from '@/components/ui/ListFilterBar';
import { MasterDataGrid, MasterDataGridCard } from '@/components/ui/MasterDataGrid';
import Modal, { ModalFormBody, ModalFormFooter } from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import SaveButton from '@/components/ui/SaveButton';
import SlugField from '@/components/ui/SlugField';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { masterSlugErrorMessage, validateMasterSlug } from '@/lib/master-slug';
import { can } from '@/lib/permissions';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useStorefrontLinks } from '@/lib/useStorefrontLinks';
import { useToast } from '@/lib/toast-context';

interface CategoryItem {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  /** ลิงก์หน้าร้าน (`?cat=<slug>`) — DB เติมให้ตอนสร้าง แก้ได้ในโมดัลแก้ไข */
  slug?: string | null;
  children?: CategoryItem[];
}

export default function CategoriesPageWrapper() {
  return <Suspense fallback={<Layout><LoadingCard /></Layout>}><CategoriesPage /></Suspense>;
}

function CategoriesPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const storefront = useStorefrontLinks();
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
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [editingName, setEditingName] = useState('');
  /** ลิงก์หน้าร้านของหมวดที่กำลังแก้ */
  const [editingSlug, setEditingSlug] = useState('');
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

  /** ค้นแล้วต้องไม่ทำให้หมวดหลักหาย — เจอที่หมวดย่อยก็ยังโชว์การ์ดแม่ (เหลือเฉพาะลูกที่ตรง)
   *  ไม่งั้นพิมพ์ชื่อหมวดย่อยแล้วจอว่าง ทั้งที่ของอยู่ในนั้น */
  const visibleCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return categories;
    return categories.reduce<CategoryItem[]>((acc, parent) => {
      const parentHit = parent.name.toLowerCase().includes(query);
      const children = (parent.children || []).filter(child => child.name.toLowerCase().includes(query));
      if (parentHit) acc.push(parent);
      else if (children.length) acc.push({ ...parent, children });
      return acc;
    }, []);
  }, [categories, searchQuery]);

  const parentCount = categories.length;
  const childCount = categories.reduce((sum, parent) => sum + (parent.children?.length || 0), 0);

  /** ลิงก์ของหมวดอื่นทั้งหมด (หลัก+ย่อย) ยกเว้นตัวที่กำลังแก้ — unique ต่อร้าน ไม่ใช่ต่อชั้น */
  const takenSlugs = useCallback((exceptId: string) => categories
    .flatMap(parent => [parent, ...(parent.children || [])])
    .filter(item => item.id !== exceptId)
    .map(item => item.slug || '')
    .filter(Boolean), [categories]);

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
  const openEditModal = (category: CategoryItem) => {
    setEditingCategory(category);
    setEditingName(category.name);
    setEditingSlug(category.slug || '');
  };
  const closeEditModal = () => {
    if (saving) return;
    setEditingCategory(null);
    setEditingName('');
    setEditingSlug('');
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
    // ส่ง slug เฉพาะตอนที่เปลี่ยนจริง — ไม่แตะ = DB คงค่าเดิมที่ trigger เติมไว้
    const slugChanged = editingSlug && editingSlug !== (editingCategory.slug || '');
    if (slugChanged) {
      const slugError = validateMasterSlug(editingSlug, takenSlugs(editingCategory.id));
      if (slugError) return showToast(masterSlugErrorMessage(slugError), 'error');
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCategory.id,
          name: editingName.trim(),
          ...(slugChanged ? { slug: editingSlug } : {}),
        }),
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

  /** ลบหมวดหลัก = ลบลูกก่อนทีละใบ แล้วค่อยลบตัวแม่ (API ไม่ลบเป็นชุดให้) */
  const handleDelete = async (category: CategoryItem, isChild: boolean) => {
    const children = isChild ? [] : (categories.find(item => item.id === category.id)?.children || []);
    const title = children.length
      ? `หมวดหมู่ “${category.name}” มีหมวดย่อย ${children.length} รายการ หมวดย่อยจะถูกลบด้วย`
      : `ต้องการลบ${isChild ? 'หมวดย่อย' : 'หมวดหมู่'} “${category.name}” หรือไม่`;
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

  const parentActions = (category: CategoryItem): ActionItem[] => [
    {
      key: 'add-child', label: 'เพิ่มหมวดย่อย', icon: <AddIcon />,
      onClick: () => openAddModal(category.id), primary: true,
    },
    { key: 'edit', label: 'แก้ไข', icon: <EditIcon />, onClick: () => openEditModal(category) },
    {
      key: 'delete', label: 'ลบ', icon: <DeleteIcon />,
      onClick: () => void handleDelete(category, false), danger: true, disabled: deletingId === category.id, dividerBefore: true,
    },
  ];

  const childActions = (child: CategoryItem): ActionItem[] => [
    { key: 'edit', label: 'แก้ไข', icon: <EditIcon />, onClick: () => openEditModal(child) },
    {
      key: 'delete', label: 'ลบ', icon: <DeleteIcon />,
      onClick: () => void handleDelete(child, true), danger: true, disabled: deletingId === child.id, dividerBefore: true,
    },
  ];

  if (userProfile && !can(userProfile, 'masterdata.categories')) return <Layout><NoPermissionCard /></Layout>;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<CategoryIcon />}
          title="หมวดหมู่สินค้า"
          subtitle={`จัดโครงสร้างสินค้า ${parentCount} หมวดหลัก และ ${childCount} หมวดย่อย`}
          actions={<Button variant="primary" icon={<AddIcon />} onClick={() => openAddModal()}>เพิ่มหมวดหมู่</Button>}
        />
        <ListFilterBar
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="ค้นหาหมวดหมู่หรือหมวดย่อย..."
          summary={
            <>
              <Badge tone="orange">{parentCount} หมวดหลัก</Badge>
              <Badge tone="gray">{childCount} หมวดย่อย</Badge>
            </>
          }
        />

        {loading ? <LoadingCard /> : visibleCategories.length === 0 ? (
          <EmptyCard
            icon={<CategoryIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title={searchQuery ? 'ไม่พบหมวดหมู่ที่ค้นหา' : 'ยังไม่มีหมวดหมู่สินค้า'}
            subtitle={searchQuery ? 'ลองเปลี่ยนคำค้น' : 'เพิ่มหมวดหมู่แรกเพื่อจัดกลุ่มสินค้าให้หาง่ายขึ้น'}
            actions={searchQuery ? undefined : <Button variant="primary" icon={<AddIcon />} onClick={() => openAddModal()}>เพิ่มหมวดหมู่</Button>}
          />
        ) : (
          <MasterDataGrid>
            {visibleCategories.map(parent => {
              const children = parent.children || [];
              return (
                <MasterDataGridCard
                  key={parent.id}
                  title={parent.name}
                  icon={<Folder />}
                  subtitle={children.length ? `${children.length} หมวดย่อย` : 'ไม่มีหมวดย่อย'}
                  actions={<ActionMenu items={parentActions(parent)} />}
                >
                  {children.length > 0 ? children.map(child => (
                    <div key={child.id} className="master-card-row">
                      <CornerDownRight />
                      <span className="master-card-row-name">{child.name}</span>
                      <ActionMenu items={childActions(child)} />
                    </div>
                  )) : (
                    <Button variant="ghost" size="sm" icon={<AddIcon />} onClick={() => openAddModal(parent.id)}>
                      เพิ่มหมวดย่อย
                    </Button>
                  )}
                </MasterDataGridCard>
              );
            })}
          </MasterDataGrid>
        )}
      </Container>

      <Modal open={addModalOpen} onClose={closeAddModal} title={addParentId ? 'เพิ่มหมวดย่อย' : 'เพิ่มหมวดหมู่'}
        icon={<CategoryIcon />} size="md"
        footer={<ModalFormFooter><Button variant="secondary" onClick={closeAddModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleAdd} loading={saving} /></ModalFormFooter>}
      >
        <ModalFormBody stacked>
          <FormInput label="ชื่อหมวดหมู่" required value={addName} onChange={event => setAddName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleAdd(); }} placeholder="เช่น เครื่องดื่ม, อาหาร" autoFocus />
          <FormField label="หมวดหมู่หลัก" hint="เลือกหมวดหลักเมื่อต้องการสร้างหมวดย่อย">
            <FormSelect value={addParentId || ''} onChange={value => setAddParentId(value || null)}
              options={categories.map(category => ({ id: category.id, label: category.name }))}
              clearLabel="ไม่มี — สร้างเป็นหมวดหลัก" searchThreshold={8} portal />
          </FormField>
        </ModalFormBody>
      </Modal>

      <Modal open={Boolean(editingCategory)} onClose={closeEditModal} title="แก้ไขหมวดหมู่"
        icon={<EditIcon />} size="md"
        footer={<ModalFormFooter><Button variant="secondary" onClick={closeEditModal} disabled={saving}>ยกเลิก</Button><SaveButton onClick={handleSaveEdit} loading={saving} /></ModalFormFooter>}
      >
        <ModalFormBody stacked>
          <FormInput label="ชื่อหมวดหมู่" required value={editingName} onChange={event => setEditingName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleSaveEdit(); }} autoFocus />
          {/* ลิงก์หน้าร้าน — ขึ้นเฉพาะร้านที่เปิดหน้าร้านแล้ว (เจ้าของกำหนด 17 ก.ย. 2569) */}
          {editingCategory && storefront.enabled && (
            <SlugField
              value={editingSlug}
              onChange={setEditingSlug}
              originalValue={editingCategory.slug || ''}
              takenSlugs={takenSlugs(editingCategory.id)}
              previewPrefix={storefront.category('')}
            />
          )}
        </ModalFormBody>
      </Modal>
      {confirmDialog}
    </Layout>
  );
}
