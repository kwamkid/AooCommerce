// Path: app/settings/members/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Users, Mail, UserPlus, Shield, Trash2, Edit2, X, Check,
  Loader2, CheckCircle, Clock, Copy, Phone,
  Plus, Link2, Monitor,
  Warehouse, ShieldCheck, Headset, CreditCard, Calculator, Package,
} from 'lucide-react';
import Checkbox from '@/components/ui/Checkbox';

interface Member {
  id: string;
  roles: string[];
  is_active: boolean;
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
  roles: string[];
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

const ROLE_OPTIONS: { value: string; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'admin', label: 'ผู้ดูแลระบบ', icon: ShieldCheck, desc: 'จัดการระบบทั้งหมด' },
  { value: 'sales', label: 'แอดมินออนไลน์', icon: Headset, desc: 'ออเดอร์ แชท CRM รายงาน' },
  { value: 'cashier', label: 'แคชเชียร์', icon: CreditCard, desc: 'POS + สต็อกสาขา' },
  { value: 'account', label: 'บัญชี', icon: Calculator, desc: 'บัญชี รายงาน ดูคำสั่งซื้อ' },
  { value: 'warehouse', label: 'คลังสินค้า', icon: Package, desc: 'จัดส่ง จัดการคลัง' },
];

// Roles that are exclusive (cannot combine with others)
const EXCLUSIVE_ROLES = ['owner', 'admin'];

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'แอดมินออนไลน์',
  cashier: 'แคชเชียร์',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-red-100 text-red-800 border-red-200',
  account: 'bg-green-100 text-green-800 border-green-200',
  warehouse: 'bg-orange-100 text-orange-800 border-orange-200',
  sales: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  cashier: 'bg-amber-100 text-amber-800 border-amber-200',
};

interface EditMemberForm {
  memberId: string;
  userId: string;
  name: string;
  roles: string[];
  phone: string;
  is_active: boolean;
  warehouseAccess: boolean;
  warehouse_ids: string[];
  terminal_ids: string[];
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

// Toggle a role in a roles array, enforcing exclusive rules
function toggleRole(currentRoles: string[], role: string): string[] {
  if (currentRoles.includes(role)) {
    // Remove role (but must keep at least one)
    const newRoles = currentRoles.filter(r => r !== role);
    return newRoles.length > 0 ? newRoles : currentRoles;
  }
  // Adding role
  if (EXCLUSIVE_ROLES.includes(role)) {
    // Exclusive role replaces all others
    return [role];
  }
  // Non-exclusive: remove any exclusive roles
  return [...currentRoles.filter(r => !EXCLUSIVE_ROLES.includes(r)), role];
}

export default function MembersPage() {
  const { currentCompany, companyRoles } = useCompany();
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockEnabled, setStockEnabled] = useState(false);

  // Add member modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Invite link state
  const [linkRoles, setLinkRoles] = useState<string[]>(['sales']);
  const [linkWarehouseAccess, setLinkWarehouseAccess] = useState(true);
  const [linkWarehouseIds, setLinkWarehouseIds] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Edit member state
  const [editingMember, setEditingMember] = useState<EditMemberForm | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Inline role edit
  const [editingRoleMemberId, setEditingRoleMemberId] = useState<string | null>(null);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);

  // Warehouses & terminals (for permission assignment)
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [terminals, setTerminals] = useState<TerminalItem[]>([]);

  const isOwnerOrAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');

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

  // Derive terminal_ids from warehouse_ids
  const deriveTerminalIds = (warehouseIds: string[]): string[] => {
    if (warehouseIds.length === 0) return [];
    return terminals
      .filter(t => t.warehouse_id && warehouseIds.includes(t.warehouse_id))
      .map(t => t.id);
  };

  // Reset add modal state
  // Role preset helper — auto-set warehouse permissions when role changes
  const getRolePreset = (roles: string[]): { warehouseAccess: boolean; warehouseIds: string[] } => {
    if (roles.includes('owner') || roles.includes('admin')) {
      return { warehouseAccess: true, warehouseIds: [] }; // all warehouses
    }
    if (roles.includes('sales')) {
      const defaultWh = warehouses.find(w => w.is_default);
      return { warehouseAccess: true, warehouseIds: defaultWh ? [defaultWh.id] : [] };
    }
    // cashier, account, warehouse = ON + choose
    return { warehouseAccess: true, warehouseIds: [] };
  };

  const isExclusiveRole = (roles: string[]) => roles.includes('owner') || roles.includes('admin');

  const openAddModal = () => {
    setLinkRoles(['sales']);
    const preset = getRolePreset(['sales']);
    setLinkWarehouseAccess(preset.warehouseAccess);
    setLinkWarehouseIds(preset.warehouseIds);
    setGeneratedLink('');
    setShowAddModal(true);
  };

  // Handle role change with preset
  const handleLinkRoleChange = (newRoles: string[]) => {
    setLinkRoles(newRoles);
    const preset = getRolePreset(newRoles);
    setLinkWarehouseAccess(preset.warehouseAccess);
    setLinkWarehouseIds(preset.warehouseIds);
  };

  const handleEditRoleChange = (newRoles: string[]) => {
    if (!editingMember) return;
    const preset = getRolePreset(newRoles);
    setEditingMember({
      ...editingMember,
      roles: newRoles,
      warehouseAccess: preset.warehouseAccess,
      warehouse_ids: preset.warehouseIds,
    });
  };

  // Handle create invite link
  const handleCreateLink = async () => {
    setIsGeneratingLink(true);

    try {
      // warehouseAccess=false → [] (no access), true + empty → undefined (all), specific → ['id']
      const warehouseIdsToSend = !linkWarehouseAccess
        ? []
        : linkWarehouseIds.length > 0
          ? linkWarehouseIds
          : undefined;
      const terminalIdsToSend = !linkWarehouseAccess
        ? []
        : deriveTerminalIds(linkWarehouseIds).length > 0
          ? deriveTerminalIds(linkWarehouseIds)
          : undefined;
      const response = await apiFetch('/api/companies/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: linkRoles,
          warehouse_ids: warehouseIdsToSend,
          terminal_ids: terminalIdsToSend,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setGeneratedLink(`${window.location.origin}/invite/${data.invitation.token}`);
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

  // Handle inline role change
  const handleChangeRole = async (memberId: string) => {

    try {
      const response = await apiFetch('/api/companies/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, roles: editingRoles }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast('เปลี่ยนตำแหน่งสำเร็จ');
        setEditingRoleMemberId(null);
        await fetchMembers();
      } else {
        showToast(data.error || 'ไม่สามารถเปลี่ยนตำแหน่งได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนตำแหน่ง', 'error');
    }
  };

  // Handle edit member (full edit modal)
  const handleOpenEditModal = async (member: Member) => {
    setEditingMember({
      memberId: member.id,
      userId: member.user.id,
      name: member.user.name || '',
      roles: member.roles,
      phone: member.user.phone || '',
      is_active: member.is_active,
      warehouseAccess: true,
      warehouse_ids: [],
      terminal_ids: [],
    });
    setShowEditModal(true);

    // Fetch warehouse + terminal permissions
    try {
      const res = await apiFetch(`/api/users/warehouse-permissions?user_id=${member.user.id}`);
      if (res.ok) {
        const data = await res.json();
        // null = all access (toggle on, no specific), [] = no access (toggle off), ['id'] = specific
        const whIds = data.warehouse_ids;
        setEditingMember(prev => prev ? {
          ...prev,
          warehouseAccess: whIds === null || (Array.isArray(whIds) && whIds.length > 0),
          warehouse_ids: Array.isArray(whIds) ? whIds : [],
          terminal_ids: Array.isArray(data.terminal_ids) ? data.terminal_ids : [],
        } : prev);
      }
    } catch { /* silent */ }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setIsSaving(true);

    try {
      // Update user profile + company_members roles via /api/users PUT
      const profileRes = await apiFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMember.userId,
          name: editingMember.name,
          roles: editingMember.roles,
          phone: editingMember.phone || null,
          is_active: editingMember.is_active,
        }),
      });

      const profileResult = await profileRes.json();

      if (!profileRes.ok) {
        throw new Error(profileResult.error || 'ไม่สามารถอัพเดทข้อมูลได้');
      }

      // Save warehouse + terminal permissions
      // warehouseAccess=false → [] (no access), warehouseAccess=true + empty → null (all), specific → ['id']
      const warehouseIdsToSave = !editingMember.warehouseAccess
        ? []
        : editingMember.warehouse_ids.length > 0
          ? editingMember.warehouse_ids
          : null;
      const terminalIdsToSave = !editingMember.warehouseAccess
        ? []
        : deriveTerminalIds(editingMember.warehouse_ids).length > 0
          ? deriveTerminalIds(editingMember.warehouse_ids)
          : null;
      await apiFetch('/api/users/warehouse-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingMember.userId,
          warehouse_ids: warehouseIdsToSave,
          terminal_ids: terminalIdsToSave,
        }),
      });

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
    if (!confirm('คุณต้องการลบสมาชิกคนนี้หรือไม่?')) return;

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
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('คุณต้องการยกเลิกคำเชิญนี้หรือไม่?')) return;

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
    }
  };

  // Copy invite link
  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    showToast('คัดลอกลิงก์คำเชิญแล้ว');
  };

  // Filter members
  const activeMembers = members.filter(m => m.is_active);
  const filteredMembers = activeMembers.filter(m =>
    (m.user?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.user?.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Role badges component (multiple)
  const RoleBadges = ({ roles }: { roles: string[] }) => (
    <div className="flex flex-wrap gap-1">
      {roles.map(role => (
        <span key={role} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium border ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
          {ROLE_LABELS[role] || role}
        </span>
      ))}
    </div>
  );

  // Role checkboxes component — vertical list with icons
  const RoleCheckboxes = ({ selectedRoles, onChange, disabled }: { selectedRoles: string[]; onChange: (roles: string[]) => void; disabled?: boolean }) => (
    <div className="space-y-1.5">
      {ROLE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = selectedRoles.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border ${
              isSelected
                ? 'bg-[#F4511E]/5 border-[#F4511E]/30 dark:bg-[#F4511E]/10 dark:border-[#F4511E]/40'
                : 'bg-gray-50 dark:bg-slate-700 border-transparent hover:bg-gray-100 dark:hover:bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => !disabled && onChange(toggleRole(selectedRoles, option.value))}
              className="sr-only"
              disabled={disabled}
            />
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isSelected
                ? 'bg-[#F4511E] text-white'
                : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400'
            }`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isSelected ? 'text-[#F4511E] dark:text-[#FF7043]' : 'text-gray-700 dark:text-slate-300'}`}>
                {option.label}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{option.desc}</p>
            </div>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              isSelected
                ? 'bg-[#F4511E] border-[#F4511E]'
                : 'border-gray-300 dark:border-slate-500'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </label>
        );
      })}
    </div>
  );

  // Build terminal lookup by warehouse_id
  const terminalsByWarehouse: Record<string, TerminalItem[]> = {};
  for (const t of terminals) {
    if (t.warehouse_id) {
      if (!terminalsByWarehouse[t.warehouse_id]) terminalsByWarehouse[t.warehouse_id] = [];
      terminalsByWarehouse[t.warehouse_id].push(t);
    }
  }

  // Warehouse permissions component (merged POS + warehouse)
  // accessEnabled: true = has warehouse access, false = no access at all
  // selectedIds: specific warehouse IDs (empty = all warehouses when accessEnabled is true)
  const WarehousePermissions = ({ accessEnabled, onAccessChange, selectedIds, onChange, disabled }: {
    accessEnabled: boolean;
    onAccessChange: (enabled: boolean) => void;
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    disabled?: boolean;
  }) => {
    if (warehouses.length === 0 || (!stockEnabled && !features.pos)) return null;
    return (
      <div>
        {/* Toggle switch */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 dark:text-slate-400">เปิดการเข้าถึง</span>
          <button
            type="button"
            role="switch"
            aria-checked={accessEnabled}
            onClick={() => !disabled && onAccessChange(!accessEnabled)}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 ${
              accessEnabled ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
              accessEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {accessEnabled && (
          <>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">ไม่เลือก = เข้าถึงทุกคลัง</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {warehouses.map(wh => {
                const whTerminals = terminalsByWarehouse[wh.id] || [];
                const isChecked = selectedIds.includes(wh.id);
                return (
                  <label
                    key={wh.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[#F4511E]/5 dark:bg-[#F4511E]/10'
                        : 'bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (disabled) return;
                        const ids = isChecked
                          ? selectedIds.filter(id => id !== wh.id)
                          : [...selectedIds, wh.id];
                        onChange(ids);
                      }}
                      className="sr-only"
                      disabled={disabled}
                    />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isChecked
                        ? 'bg-[#F4511E] border-[#F4511E]'
                        : 'border-gray-300 dark:border-slate-500'
                    }`}>
                      {isChecked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm text-gray-700 dark:text-slate-300">{wh.name}</span>
                      {whTerminals.length > 0 && (
                        <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">
                          ({whTerminals.map((t, i) => (
                            <span key={t.id}>
                              {i > 0 && ', '}
                              <Monitor className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                              {t.name}
                            </span>
                          ))})
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Layout
      title="จัดการสมาชิก"
      breadcrumbs={[
        { label: 'ตั้งค่า', href: '/settings' },
        { label: 'จัดการสมาชิก' },
      ]}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F4511E]" />
          <span className="ml-3 text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</span>
        </div>
      ) : (
        <div className="space-y-6 max-w-5xl">
          {/* Members List */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm">
            <div className="p-5 sm:p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Users className="w-5 h-5 mr-2 text-[#F4511E]" />
                  สมาชิกปัจจุบัน ({activeMembers.length})
                </h3>
                <div className="flex items-center gap-3">
                  {activeMembers.length > 5 && (
                    <div className="flex-1 sm:w-64">
                      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อหรืออีเมล..." className="py-2" />
                    </div>
                  )}
                  {isOwnerOrAdmin && (
                    <button
                      onClick={openAddModal}
                      className="flex items-center px-4 py-2 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-5 h-5 mr-1.5" />
                      เพิ่มสมาชิก
                    </button>
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
                      {/* Avatar */}
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                        {member.user?.name?.charAt(0)?.toUpperCase() || member.user?.email?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">
                          {member.user?.name || 'ไม่ระบุชื่อ'}
                          {member.user?.id === userProfile?.id && (
                            <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">(คุณ)</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 dark:text-slate-400">
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
                          <RoleBadges roles={member.roles} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0">
                      {editingRoleMemberId === member.id ? (
                        <div className="flex items-center space-x-2">
                          <div className="max-w-xs">
                            <RoleCheckboxes selectedRoles={editingRoles} onChange={setEditingRoles} />
                          </div>
                          <button
                            onClick={() => handleChangeRole(member.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="บันทึก"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingRoleMemberId(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="ยกเลิก"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Role badges on desktop */}
                          <div className="hidden sm:block">
                            <RoleBadges roles={member.roles} />
                          </div>
                          {isOwnerOrAdmin && !member.roles.includes('owner') && member.user?.id !== userProfile?.id && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleOpenEditModal(member)}
                                className="p-2 text-gray-400 hover:text-[#F4511E] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title="แก้ไขข้อมูล"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRoleMemberId(member.id);
                                  setEditingRoles([...member.roles]);
                                }}
                                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                title="เปลี่ยนตำแหน่ง"
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="ลบสมาชิก"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </>
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
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <div className="p-5 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-[#F4511E]" />
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
                          <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                            {invitation.email || 'ลิงก์เชิญ'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            หมดอายุ: {new Date(invitation.expires_at).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                          {/* Role badges on mobile */}
                          <div className="mt-1.5 sm:hidden flex flex-wrap gap-1">
                            <RoleBadges roles={invitation.roles} />
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                              รอตอบรับ
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 flex-shrink-0">
                        {/* Role badges + status on desktop */}
                        <div className="hidden sm:flex items-center space-x-2">
                          <RoleBadges roles={invitation.roles} />
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                            รอตอบรับ
                          </span>
                        </div>
                        {isOwnerOrAdmin && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => copyInviteLink(invitation.token)}
                              className="p-2 text-gray-400 hover:text-[#F4511E] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              title="คัดลอกลิงก์คำเชิญ"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelInvitation(invitation.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="ยกเลิกคำเชิญ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setShowAddModal(false)}
            />
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
              {/* Modal header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-xl z-10">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                  <UserPlus className="w-5 h-5 mr-2 text-[#F4511E]" />
                  เพิ่มสมาชิก
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!generatedLink ? (
                <>
                  <p className="text-sm text-gray-500 dark:text-slate-400 px-5 pt-4">
                    สร้างลิงก์เชิญเพื่อให้ผู้ใช้สมัครและเข้าร่วมบริษัท
                  </p>

                  {/* 2-column layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5">
                    {/* Left: Roles */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        <Shield className="w-4 h-4 inline mr-1 -mt-0.5" />
                        ตำแหน่ง *
                      </label>
                      <RoleCheckboxes selectedRoles={linkRoles} onChange={handleLinkRoleChange} disabled={isGeneratingLink} />
                    </div>

                    {/* Right: Warehouse Permissions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        <Warehouse className="w-4 h-4 inline mr-1 -mt-0.5" />
                        สิทธิ์คลัง / POS
                      </label>
                      {isExclusiveRole(linkRoles) ? (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            เข้าถึงทุกคลังอัตโนมัติ
                          </p>
                        </div>
                      ) : (
                        <WarehousePermissions
                          accessEnabled={linkWarehouseAccess}
                          onAccessChange={setLinkWarehouseAccess}
                          selectedIds={linkWarehouseIds}
                          onChange={setLinkWarehouseIds}
                          disabled={isGeneratingLink}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateLink}
                      disabled={isGeneratingLink}
                      className="px-5 py-2.5 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isGeneratingLink ? (
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                      )}
                      สร้างลิงก์
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="text-center py-2">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">สร้างลิงก์เชิญสำเร็จ</p>
                    <p className="text-sm text-gray-500 dark:text-slate-400">คัดลอกลิงก์ด้านล่างเพื่อส่งให้สมาชิก</p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedLink}
                      readOnly
                      className="flex-1 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-700 text-sm"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        showToast('คัดลอกลิงก์แล้ว');
                      }}
                      className="px-4 py-2.5 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors flex items-center whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4 mr-1.5" />
                      คัดลอก
                    </button>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                      ปิด
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedLink('');
                        handleLinkRoleChange(['sales']);
                      }}
                      className="px-4 py-2.5 text-[#F4511E] bg-[#F4511E]/10 hover:bg-[#F4511E]/20 rounded-lg font-medium transition-colors flex items-center"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      สร้างลิงก์ใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => { setShowEditModal(false); setEditingMember(null); }}
            />
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-xl z-10">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  แก้ไขข้อมูลสมาชิก
                </h3>
                <button
                  onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                {/* 2-column layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5">
                  {/* Left: Profile + Roles */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        ชื่อ-นามสกุล
                      </label>
                      <input
                        type="text"
                        value={editingMember.name}
                        onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        <Shield className="w-4 h-4 inline mr-1 -mt-0.5" />
                        ตำแหน่ง
                      </label>
                      <RoleCheckboxes
                        selectedRoles={editingMember.roles}
                        onChange={handleEditRoleChange}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        <Phone className="w-4 h-4 inline mr-1 -mt-0.5" />
                        เบอร์โทร
                      </label>
                      <input
                        type="tel"
                        value={editingMember.phone}
                        onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                        placeholder="0812345678"
                      />
                    </div>

                    <div>
                      <Checkbox
                        checked={editingMember.is_active}
                        onChange={(v) => setEditingMember({ ...editingMember, is_active: v })}
                        label="เปิดใช้งาน"
                      />
                    </div>
                  </div>

                  {/* Right: Warehouse Permissions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      <Warehouse className="w-4 h-4 inline mr-1 -mt-0.5" />
                      สิทธิ์คลัง / POS
                    </label>
                    {isExclusiveRole(editingMember.roles) ? (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5">
                          <Check className="w-4 h-4" />
                          เข้าถึงทุกคลังอัตโนมัติ
                        </p>
                      </div>
                    ) : (
                      <WarehousePermissions
                        accessEnabled={editingMember.warehouseAccess}
                        onAccessChange={(v) => setEditingMember({ ...editingMember, warehouseAccess: v })}
                        selectedIds={editingMember.warehouse_ids}
                        onChange={(ids) => setEditingMember({ ...editingMember, warehouse_ids: ids })}
                      />
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 px-5 pb-5">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                    className="px-4 py-2.5 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    บันทึก
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
