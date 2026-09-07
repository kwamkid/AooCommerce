// Path: app/settings/members/page.tsx
// จัดการสมาชิก — ตำแหน่งหลัก 1 ค่า/คน + สิทธิ์รายกลุ่มงานสำหรับพนักงาน
//
// UI ทั้งหมดของ "ตำแหน่ง/สิทธิ์" อยู่ที่ components/members/* เท่านั้น
// (PermissionEditor = ตัวตั้งค่า · AreaBadges/AreaCell = ตัวแสดงผล)
// ห้ามประกอบ checkbox ตำแหน่ง หรือ badge สิทธิ์ขึ้นมาใหม่ในหน้านี้อีก
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useCopy } from '@/lib/useCopy';
import { withExternalBrowserFlag } from '@/lib/in-app-browser';
import CopyField from '@/components/ui/CopyField';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import {
  AREAS, ROLE_LEVELS, can, isAdminTierRole,
  type Permissions, type RoleLevel,
} from '@/lib/permissions';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  Users, Mail, UserPlus, Trash2, Edit2, CheckCircle, Clock, Phone,
  Plus, Link2, Loader2, DollarSign, Table2,
} from 'lucide-react';
import Checkbox from '@/components/ui/Checkbox';
import Modal from '@/components/ui/Modal';
import UserAvatar from '@/components/ui/UserAvatar';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import PermissionEditor, {
  DEFAULT_STAFF_PERMISSIONS, type MemberPermissionValue,
} from '@/components/members/PermissionEditor';
import { AreaBadges, AreaCell, AreaLegend, RoleBadge } from '@/components/members/AreaSummary';

interface Member {
  id: string;
  /** ตำแหน่งหลักค่าเดียว — API แปลงมาให้แล้วแม้แถวนั้นยังเก็บค่าเก่าหลายตัว */
  role: RoleLevel;
  permissions: Permissions | null;
  is_active: boolean;
  can_view_cost?: boolean;
  pc_all_counters?: boolean;
  joined_at: string;
  created_at: string;
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    avatar: string | null;
  };
}

interface Invitation {
  id: string;
  email: string | null;
  role: RoleLevel;
  permissions: Permissions | null;
  can_view_cost?: boolean;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface EditMemberForm {
  memberId: string;
  userId: string;
  name: string;
  phone: string;
  is_active: boolean;
  /** ค่าตอนเปิดโมดัล — ใช้ดูว่าธง "หน่วยแทน" ถูกแก้จริงไหม (คนละ endpoint กับที่เหลือ) */
  initialPcRover: boolean;
  perm: MemberPermissionValue;
}

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
}

interface TerminalItem {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string | null;
}

/** มีกลุ่มงานที่เปิดให้อย่างน้อย 1 กลุ่มไหม (none/undefined ไม่นับ) */
const hasAnyArea = (perms: Permissions): boolean =>
  Object.values(perms).some(level => level === 'view' || level === 'manage');

/** ค่าตั้งต้นของคนที่เพิ่งถูกเชิญ — พนักงาน + แม่แบบ "แอดมินออนไลน์" */
const newInviteValue = (): MemberPermissionValue => ({
  role: 'staff',
  permissions: { ...DEFAULT_STAFF_PERMISSIONS },
  can_view_cost: false,
  pc_all_counters: false,
  warehouse_ids: [],
  terminal_ids: [],
});

export default function MembersPage() {
  const { currentCompany, companyRoles, permissions } = useCompany();
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const copy = useCopy();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockEnabled, setStockEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'matrix'>('members');

  // Add member modal (ลิงก์เชิญ)
  const [showAddModal, setShowAddModal] = useState(false);
  const [inviteValue, setInviteValue] = useState<MemberPermissionValue>(newInviteValue);
  const [generatedLink, setGeneratedLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Edit member state
  const [editingMember, setEditingMember] = useState<EditMemberForm | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Warehouses & terminals (for permission assignment)
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [terminals, setTerminals] = useState<TerminalItem[]>([]);

  const isOwnerOrAdmin = can({ roles: companyRoles, permissions }, 'members.view');
  // members.grant_admin = มอบ/แก้ตำแหน่งผู้ดูแลระบบกับเจ้าของได้ (ผู้จัดการทำไม่ได้ — API บังคับซ้ำ)
  const canGrantAdmin = can({ roles: companyRoles, permissions }, 'members.grant_admin');

  // สิทธิ์คลัง/POS ไม่มีความหมายเลยเมื่อร้านปิดทั้งสต๊อกและ POS → ซ่อนทั้งบล็อก
  // (PermissionEditor ซ่อนเองเมื่อไม่มีคลังให้เลือก)
  const warehouseOptions = stockEnabled || features.pos ? warehouses : [];

  // Fetch members and invitations
  const fetchMembers = useCallback(async () => {
    if (!currentCompany?.id) return;

    try {
      const response = await apiFetch('/api/companies/members');
      const data = await response.json();

      if (response.ok) {
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      } else {
        showToast(data.error || 'ไม่สามารถโหลดข้อมูลสมาชิกได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentCompany?.id]);

  useFetchOnce(() => {
    fetchMembers();
    // Fetch warehouses for permission assignment
    const fetchWarehouses = async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          setWarehouses(data.warehouses || []);
          setStockEnabled(data.stockConfig?.stockEnabled !== false);
        }
      } catch { /* silent */ }
    };
    // Fetch terminals for POS permission assignment
    const fetchTerminals = async () => {
      try {
        const res = await apiFetch('/api/pos/terminals');
        if (res.ok) {
          const data = await res.json();
          setTerminals(data.terminals || []);
        }
      } catch { /* silent */ }
    };
    fetchWarehouses();
    fetchTerminals();
  }, !!currentCompany?.id);

  /**
   * แปลงค่าจากตัวตั้งสิทธิ์เป็นขอบเขตคลังที่ API เข้าใจ
   * null = ทุกคลัง · [] = ไม่ให้เข้าถึง · [ids] = เฉพาะที่เลือก
   * ผู้บริหาร = ทุกคลังเสมอ · พนักงานที่ไม่ได้เปิดกลุ่มงานคลัง/แคชเชียร์ = ไม่ให้เข้าถึง
   */
  const scopeOf = (perm: MemberPermissionValue): { warehouse_ids: string[] | null; terminal_ids: string[] | null } => {
    if (isAdminTierRole(perm.role)) return { warehouse_ids: null, terminal_ids: null };
    const needsScope = (perm.permissions.inventory ?? 'none') !== 'none'
      || (perm.permissions.pos ?? 'none') !== 'none';
    if (!needsScope) return { warehouse_ids: [], terminal_ids: [] };
    return {
      warehouse_ids: perm.warehouse_ids.length > 0 ? perm.warehouse_ids : null,
      terminal_ids: perm.terminal_ids.length > 0 ? perm.terminal_ids : null,
    };
  };

  const openAddModal = () => {
    setInviteValue(newInviteValue());
    setGeneratedLink('');
    setShowAddModal(true);
  };

  // Handle create invite link
  const handleCreateLink = async () => {
    // พนักงานที่ไม่ได้เปิดกลุ่มงานเลย = ล็อกอินเข้ามาแล้วไม่เห็นเมนูอะไรเลย (ดูเหมือนระบบพัง)
    if (inviteValue.role === 'staff' && !hasAnyArea(inviteValue.permissions)) {
      showToast('เลือกกลุ่มงานให้พนักงานอย่างน้อย 1 กลุ่ม', 'error');
      return;
    }
    setIsGeneratingLink(true);

    try {
      const scope = scopeOf(inviteValue);
      const response = await apiFetch('/api/companies/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: inviteValue.role,
          permissions: inviteValue.permissions,
          can_view_cost: inviteValue.can_view_cost,
          // คำเชิญไม่มี "null" ให้ส่ง — ไม่ส่ง field เลย = ทุกคลัง (ตาม convention เดิม)
          ...(scope.warehouse_ids ? { warehouse_ids: scope.warehouse_ids } : {}),
          ...(scope.terminal_ids ? { terminal_ids: scope.terminal_ids } : {}),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // ต่อ openExternalBrowser=1 ไว้เสมอ — ลิงก์เชิญมักถูกส่งทาง LINE แล้วเปิดใน
        // เบราว์เซอร์ของแอป ซึ่ง Google ไม่ยอมให้ล็อกอิน (พารามิเตอร์นี้ที่อื่นไม่มีผล)
        setGeneratedLink(withExternalBrowserFlag(`${window.location.origin}/invite/${data.invitation.token}`));
        await fetchMembers();
      } else {
        showToast(data.error || 'ไม่สามารถสร้างลิงก์ได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการสร้างลิงก์', 'error');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Handle edit member (full edit modal)
  const handleOpenEditModal = async (member: Member) => {
    setEditingMember({
      memberId: member.id,
      userId: member.user.id,
      name: member.user.name || '',
      phone: member.user.phone || '',
      is_active: member.is_active,
      initialPcRover: member.pc_all_counters === true,
      perm: {
        role: member.role,
        permissions: member.permissions ?? {},
        can_view_cost: member.can_view_cost === true,
        pc_all_counters: member.pc_all_counters === true,
        warehouse_ids: [],
        terminal_ids: [],
      },
    });
    setShowEditModal(true);

    // Fetch warehouse + terminal permissions
    try {
      const res = await apiFetch(`/api/users/warehouse-permissions?user_id=${member.user.id}`);
      if (res.ok) {
        const data = await res.json();
        const whIds = data.warehouse_ids;
        // null = ทุกคลัง → [] ในตัวตั้งค่า
        // [] = สมาชิกรุ่นเก่าที่ถูกตั้ง "ไม่ให้เข้าถึงคลัง" — โมเดลใหม่แสดงเรื่องนี้ด้วย
        //      "กลุ่มงานคลัง = ไม่เห็น" แทน จึงไม่มีตัวเลือกนั้นในลิสต์แล้ว ตกลงมาที่คลังหลัก
        //      (แคบสุดที่เลือกได้) แทนที่จะเด้งเป็น "ทุกคลัง" ซึ่งเป็นการขยายสิทธิ์เงียบ ๆ
        const fallbackWh = warehouses.find(w => w.is_default) || warehouses[0];
        const resolved: string[] = Array.isArray(whIds)
          ? (whIds.length > 0 ? whIds : (fallbackWh ? [fallbackWh.id] : []))
          : [];
        setEditingMember(prev => prev ? {
          ...prev,
          perm: {
            ...prev.perm,
            warehouse_ids: resolved,
            terminal_ids: terminals
              .filter(t => t.warehouse_id && resolved.includes(t.warehouse_id))
              .map(t => t.id),
          },
        } : prev);
      }
    } catch { /* silent */ }
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editingMember || isSaving) return;
    // ปุ่มบันทึกเรียกตรงไม่ผ่าน form submit → native required ไม่ทำงาน ต้องเช็คเอง
    // (name เขียนลง user_profiles ที่เป็น global — ปล่อยว่างไม่ได้)
    if (!editingMember.name.trim()) {
      showToast('กรุณากรอกชื่อ-นามสกุล', 'error');
      return;
    }
    const { perm } = editingMember;
    if (perm.role === 'staff' && !hasAnyArea(perm.permissions)) {
      showToast('เลือกกลุ่มงานให้พนักงานอย่างน้อย 1 กลุ่ม', 'error');
      return;
    }
    setIsSaving(true);

    try {
      // 1) ตำแหน่ง + สิทธิ์รายกลุ่มงาน + สิทธิ์ดูต้นทุน (endpoint เดียวที่รับ permissions)
      const roleRes = await apiFetch('/api/companies/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: editingMember.memberId,
          role: perm.role,
          permissions: perm.permissions,
          can_view_cost: perm.can_view_cost,
        }),
      });
      if (!roleRes.ok) {
        const r = await roleRes.json().catch(() => ({}));
        throw new Error(r.error || 'ไม่สามารถบันทึกตำแหน่งได้');
      }

      // 2) ข้อมูลส่วนตัว + เปิด/ปิดการใช้งาน (ไม่ส่ง roles — ไม่งั้น API จะคำนวณ
      //    permissions ใหม่จาก roles แล้วลบสิทธิ์รายกลุ่มงานที่เพิ่งบันทึกไปทิ้ง)
      const profileRes = await apiFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMember.userId,
          name: editingMember.name,
          phone: editingMember.phone || null,
          is_active: editingMember.is_active,
        }),
      });
      if (!profileRes.ok) {
        const r = await profileRes.json().catch(() => ({}));
        throw new Error(r.error || 'บันทึกตำแหน่งแล้ว แต่บันทึกข้อมูลส่วนตัวไม่สำเร็จ');
      }

      // 3) ขอบเขตคลัง / เครื่อง POS
      const scope = scopeOf(perm);
      const whRes = await apiFetch('/api/users/warehouse-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingMember.userId,
          warehouse_ids: scope.warehouse_ids,
          terminal_ids: scope.terminal_ids,
        }),
      });
      if (!whRes.ok) {
        const whResult = await whRes.json().catch(() => ({}));
        // ตำแหน่งถูก save ไปแล้ว — บอกตรงๆ ว่าส่วนสิทธิ์คลังไม่สำเร็จ อย่าโกหกว่าเรียบร้อย
        throw new Error(whResult.error || 'บันทึกตำแหน่งแล้ว แต่บันทึกสิทธิ์คลังไม่สำเร็จ');
      }

      // 4) ธง "PC หน่วยแทน" อยู่คนละ endpoint (ตัวเดียวกับหน้าลูกค้าฝากขาย) — ยิงเมื่อเปลี่ยนจริง
      const nextRover = perm.role === 'staff' && perm.permissions.pc === 'manage' && perm.pc_all_counters;
      if (nextRover !== editingMember.initialPcRover) {
        const roverRes = await apiFetch('/api/counters/assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: editingMember.userId, pc_all_counters: nextRover }),
        });
        if (!roverRes.ok) {
          const r = await roverRes.json().catch(() => ({}));
          throw new Error(r.error || 'บันทึกสิทธิ์แล้ว แต่ตั้งค่าหน่วยแทนไม่สำเร็จ');
        }
      }

      showToast('อัพเดทข้อมูลสมาชิกสำเร็จ');
      setShowEditModal(false);
      setEditingMember(null);
      await fetchMembers();
    } catch (err) {
      if (err instanceof Error) {
        showToast(err.message, 'error');
      } else {
        showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle remove member
  const handleRemoveMember = async (memberId: string) => {
    if (deletingId) return;
    const ok = await confirm({ title: 'ต้องการลบสมาชิกคนนี้?', variant: 'danger' }); if (!ok) return;

    setDeletingId(memberId);
    try {
      const response = await apiFetch(`/api/companies/members?id=${memberId}&type=member`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        showToast('ลบสมาชิกสำเร็จ');
        await fetchMembers();
      } else {
        showToast(data.error || 'ไม่สามารถลบสมาชิกได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการลบสมาชิก', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    if (deletingId) return;
    const ok = await confirm({ title: 'ต้องการยกเลิกคำเชิญนี้?' }); if (!ok) return;

    setDeletingId(invitationId);
    try {
      const response = await apiFetch(`/api/companies/members?id=${invitationId}&type=invitation`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        showToast('ยกเลิกคำเชิญสำเร็จ');
        await fetchMembers();
      } else {
        showToast(data.error || 'ไม่สามารถยกเลิกคำเชิญได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการยกเลิกคำเชิญ', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Copy invite link
  const copyInviteLink = (token: string) => {
    const link = withExternalBrowserFlag(`${window.location.origin}/invite/${token}`);
    copy(link, 'ลิงก์คำเชิญ')
  };

  // Filter members
  const activeMembers = members.filter(m => m.is_active);
  const filteredMembers = activeMembers.filter(m =>
    (m.user?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.user?.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  /** ป้ายสิทธิ์ + ป้ายต้นทุน (ต้นทุนเป็นสวิตช์แยก ไม่ใช่กลุ่มงาน จึงอยู่นอก AreaBadges) */
  const PermissionBadges = ({ role, perms, canViewCost }: {
    role: RoleLevel; perms?: Permissions | null; canViewCost?: boolean;
  }) => (
    <div className="flex flex-wrap items-center gap-1">
      <AreaBadges role={role} permissions={perms} />
      {canViewCost && !isAdminTierRole(role) && (
        <Badge tone="emerald" size="sm" icon={<DollarSign className="w-3 h-3" />} title="ดูต้นทุนได้">
          ต้นทุน
        </Badge>
      )}
    </div>
  );

  // ── ตาราง "ใครเห็นอะไร" ────────────────────────────────────────────
  const matrixColumns = useMemo<DataTableColumn<Member>[]>(() => [
    {
      key: 'member',
      label: 'สมาชิก',
      alwaysVisible: true,
      defaultWidth: 240,
      render: (m) => (
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar src={m.user?.avatar} name={m.user?.name} email={m.user?.email} size="sm" />
          <div className="min-w-0">
            <p className="data-primary text-gray-900 dark:text-white truncate">{m.user?.name || 'ไม่ระบุชื่อ'}</p>
            <p className="data-secondary text-gray-500 dark:text-slate-400 truncate">{m.user?.email}</p>
          </div>
          <RoleBadge role={m.role} />
        </div>
      ),
    },
    ...AREAS.map<DataTableColumn<Member>>(area => ({
      key: area.key,
      label: area.label,
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (m) => (
        <AreaCell level={isAdminTierRole(m.role) ? 'manage' : m.permissions?.[area.key]} />
      ),
    })),
    {
      key: 'admin',
      label: 'ตั้งค่า/สมาชิก',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (m) => <AreaCell level={isAdminTierRole(m.role) ? 'manage' : 'none'} />,
    },
  ], []);

  return (
    <Layout>
      <Container size="full">
        <PageHeader title="จัดการสมาชิก" subtitle="เชิญสมาชิกเข้าร่วมบริษัทและกำหนดสิทธิ์การใช้งาน" />
      {isLoading ? (
        <LoadingCard />
      ) : (
        <>
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k as 'members' | 'matrix')}
            tabs={[
              { key: 'members', label: 'สมาชิก', icon: <Users className="w-4 h-4" />, count: activeMembers.length },
              { key: 'matrix', label: 'ใครเห็นอะไร', icon: <Table2 className="w-4 h-4" /> },
            ]}
          />

          {activeTab === 'members' ? (
          <>
          {/* Members List */}
          <Card padding="none">
            <div className="p-5 sm:p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="heading-3 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-primary" />
                  สมาชิกปัจจุบัน ({activeMembers.length})
                </h3>
                <div className="flex items-center gap-3">
                  {activeMembers.length > 5 && (
                    <div className="flex-1 sm:w-64">
                      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อหรืออีเมล..." className="py-2" />
                    </div>
                  )}
                  {isOwnerOrAdmin && (
                    <Button
                      onClick={openAddModal}
                      icon={<Plus className="w-5 h-5" />}
                      className="whitespace-nowrap"
                    >
                      เพิ่ม<span className="hidden md:inline">สมาชิก</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Member rows */}
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredMembers.map((member) => (
                <div key={member.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                      <UserAvatar
                        src={member.user?.avatar}
                        name={member.user?.name}
                        email={member.user?.email}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <p className="data-primary text-gray-900 dark:text-white truncate">
                          {member.user?.name || 'ไม่ระบุชื่อ'}
                          {member.user?.id === userProfile?.id && (
                            <span className="ml-2 data-secondary text-gray-500 dark:text-slate-400">(คุณ)</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 data-secondary text-gray-500 dark:text-slate-400">
                          <span className="flex items-center truncate">
                            <Mail className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                            {member.user?.email}
                          </span>
                          {member.user?.phone && (
                            <span className="flex items-center">
                              <Phone className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                              {member.user.phone}
                            </span>
                          )}
                        </div>
                        {/* Role badges on mobile (below name) */}
                        <div className="mt-1.5 sm:hidden">
                          <PermissionBadges role={member.role} perms={member.permissions} canViewCost={member.can_view_cost} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0">
                      {/* Role badges on desktop */}
                      <div className="hidden sm:block max-w-md">
                        <PermissionBadges role={member.role} perms={member.permissions} canViewCost={member.can_view_cost} />
                      </div>
                      {isOwnerOrAdmin && member.role !== 'owner' && (canGrantAdmin || member.role !== 'admin') && member.user?.id !== userProfile?.id && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleOpenEditModal(member)}
                            className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="แก้ไขข้อมูลและสิทธิ์"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={deletingId !== null}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50"
                            title="ลบสมาชิก"
                          >
                            {deletingId === member.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">{searchTerm ? 'ไม่พบสมาชิกที่ค้นหา' : 'ยังไม่มีสมาชิก'}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <Card padding="none">
              <div className="p-5 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <h3 className="heading-3 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-primary" />
                  คำเชิญที่รอการตอบรับ ({invitations.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3 sm:space-x-4">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-gray-500 dark:text-slate-400">
                          {invitation.email ? <Mail className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="data-primary text-gray-900 dark:text-white">
                            {invitation.email || 'ลิงก์เชิญ'}
                          </p>
                          <p className="data-secondary text-gray-500 dark:text-slate-400">
                            หมดอายุ: {new Date(invitation.expires_at).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                          {/* Role badges on mobile */}
                          <div className="mt-1.5 sm:hidden flex flex-wrap items-center gap-1">
                            <PermissionBadges role={invitation.role} perms={invitation.permissions} canViewCost={invitation.can_view_cost} />
                            <StatusBadge status="pending" size="md" className="border" colors="bg-yellow-100 text-yellow-800 border-yellow-200">รอตอบรับ</StatusBadge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 flex-shrink-0">
                        {/* Role badges + status on desktop */}
                        <div className="hidden sm:flex items-center gap-2 max-w-md">
                          <PermissionBadges role={invitation.role} perms={invitation.permissions} canViewCost={invitation.can_view_cost} />
                          <StatusBadge status="pending" size="md" className="border" colors="bg-yellow-100 text-yellow-800 border-yellow-200">รอตอบรับ</StatusBadge>
                        </div>
                        {isOwnerOrAdmin && (canGrantAdmin || (invitation.role !== 'admin' && invitation.role !== 'owner')) && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => copyInviteLink(invitation.token)}
                              className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              title="คัดลอกลิงก์คำเชิญ"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelInvitation(invitation.id)}
                              disabled={deletingId !== null}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50"
                              title="ยกเลิกคำเชิญ"
                            >
                              {deletingId === invitation.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          </>
          ) : (
          /* ── แท็บ "ใครเห็นอะไร" ─────────────────────────────────── */
          <>
            <Card padding="md" className="space-y-3">
              <AreaLegend />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {ROLE_LEVELS.map(r => (
                  <p key={r.key} className="subtitle-text text-gray-500 dark:text-slate-400">
                    <span className="font-medium text-gray-700 dark:text-slate-300">{r.label}</span> — {r.desc}
                  </p>
                ))}
              </div>
            </Card>
            <DataTable
              storageKey="members-matrix"
              columns={matrixColumns}
              data={activeMembers}
              getRowId={(m) => m.id}
              emptyMessage="ยังไม่มีสมาชิก"
              hidePagination
              currentPage={1}
              totalPages={1}
              totalRecords={activeMembers.length}
              recordsPerPage={Math.max(activeMembers.length, 1)}
              onPageChange={() => {}}
              onRecordsPerPageChange={() => {}}
            />
          </>
          )}
        </>
      )}
      </Container>

      {/* Add Member Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="เพิ่มสมาชิก"
        icon={<UserPlus className="w-5 h-5 text-primary" />}
        size="2xl"
        footer={!generatedLink ? (
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={isGeneratingLink}
              icon={<Link2 className="w-4 h-4" />}
              onClick={handleCreateLink}
            >
              สร้างลิงก์
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              ปิด
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setGeneratedLink('');
                setInviteValue(newInviteValue());
              }}
            >
              สร้างลิงก์ใหม่
            </Button>
          </div>
        )}
      >
        {!generatedLink ? (
          <div className="px-6 py-5 space-y-4">
            <p className="subtitle-text text-gray-500 dark:text-slate-400">
              สร้างลิงก์เชิญเพื่อให้ผู้ใช้สมัครและเข้าร่วมบริษัท — สิทธิ์ด้านล่างจะถูกมอบให้ตอนกดรับคำเชิญ
            </p>
            <PermissionEditor
              value={inviteValue}
              onChange={setInviteValue}
              canGrantAdmin={canGrantAdmin}
              warehouses={warehouseOptions}
              terminals={terminals}
              disabled={isGeneratingLink}
              showPcRover={false}
            />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="text-center py-2">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">สร้างลิงก์เชิญสำเร็จ</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">คัดลอกลิงก์ด้านล่างเพื่อส่งให้สมาชิก</p>
            </div>

            <CopyField value={generatedLink} />
          </div>
        )}
      </Modal>

      {/* Edit Member Modal */}
      <Modal
        open={showEditModal && editingMember !== null}
        onClose={() => { setShowEditModal(false); setEditingMember(null); }}
        title="แก้ไขข้อมูลสมาชิก"
        size="2xl"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditingMember(null); }}>
              ยกเลิก
            </Button>
            {/* Direct onClick — the cross-DOM `form` attribute association silently
                failed to submit in production, so never rely on it here again. */}
            <SaveButton
              loading={isSaving}
              onClick={() => handleSaveEdit()}
            />
          </div>
        }
      >
        {editingMember && (
          <form onSubmit={handleSaveEdit}>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">ชื่อ-นามสกุล</label>
                  <input
                    type="text"
                    value={editingMember.name}
                    onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-700"
                    required
                  />
                </div>
                <div>
                  <label className="field-label">
                    <Phone className="w-4 h-4 inline mr-1 -mt-0.5" />
                    เบอร์โทร
                  </label>
                  <input
                    type="tel"
                    value={editingMember.phone}
                    onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-700"
                    placeholder="0812345678"
                  />
                </div>
              </div>

              <Checkbox
                checked={editingMember.is_active}
                onChange={(v) => setEditingMember({ ...editingMember, is_active: v })}
                label="เปิดใช้งาน"
              />

              <PermissionEditor
                value={editingMember.perm}
                onChange={(perm) => setEditingMember({ ...editingMember, perm })}
                canGrantAdmin={canGrantAdmin}
                warehouses={warehouseOptions}
                terminals={terminals}
                isOwnerTarget={editingMember.perm.role === 'owner'}
                disabled={isSaving}
              />
            </div>
          </form>
        )}
      </Modal>
      {confirmDialog}
    </Layout>
  );
}
