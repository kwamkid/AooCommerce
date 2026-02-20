// Path: app/settings/members/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  Users, Mail, UserPlus, Shield, Trash2, Edit2, X, Check,
  AlertCircle, Loader2, CheckCircle, Clock, Copy, Phone,
  Plus,
  Warehouse, Monitor,
} from 'lucide-react';

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
  email: string;
  roles: string[];
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

type AddMode = 'invite' | 'create';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'ผู้ดูแลระบบ' },
  { value: 'manager', label: 'ผู้จัดการ' },
  { value: 'account', label: 'บัญชี' },
  { value: 'warehouse', label: 'คลังสินค้า' },
  { value: 'sales', label: 'ฝ่ายขาย' },
  { value: 'cashier', label: 'แคชเชียร์' },
];

// Roles that are exclusive (cannot combine with others)
const EXCLUSIVE_ROLES = ['owner', 'admin'];

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'ฝ่ายขาย',
  cashier: 'แคชเชียร์',
  operation: 'พนักงานผลิต',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-red-100 text-red-800 border-red-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  account: 'bg-green-100 text-green-800 border-green-200',
  warehouse: 'bg-orange-100 text-orange-800 border-orange-200',
  sales: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  cashier: 'bg-amber-100 text-amber-800 border-amber-200',
  operation: 'bg-green-100 text-green-800 border-green-200',
};

interface CreateUserForm {
  email: string;
  name: string;
  password: string;
  roles: string[];
  phone: string;
  warehouse_ids: string[];
  terminal_ids: string[];
}

interface EditMemberForm {
  memberId: string;
  userId: string;
  name: string;
  roles: string[];
  phone: string;
  is_active: boolean;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stockEnabled, setStockEnabled] = useState(false);

  // Add member modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('invite');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoles, setInviteRoles] = useState<string[]>(['sales']);
  const [inviteWarehouseIds, setInviteWarehouseIds] = useState<string[]>([]);
  const [inviteTerminalIds, setInviteTerminalIds] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  // Create user form state
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '', name: '', password: '', roles: ['sales'], phone: '', warehouse_ids: [], terminal_ids: [],
  });
  const [isCreating, setIsCreating] = useState(false);

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
        setError(data.error || 'ไม่สามารถโหลดข้อมูลสมาชิกได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
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
    if (features.pos) fetchTerminals();
  }, !!currentCompany?.id);

  // Clear alerts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(''); setSuccess(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Reset add modal state
  const openAddModal = () => {
    setAddMode('invite');
    setInviteEmail('');
    setInviteRoles(['sales']);
    setInviteWarehouseIds([]);
    setInviteTerminalIds([]);
    setCreateForm({ email: '', name: '', password: '', roles: ['sales'], phone: '', warehouse_ids: [], terminal_ids: [] });
    setShowAddModal(true);
  };

  // Handle invite member
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!inviteEmail.trim()) {
      setError('กรุณาระบุอีเมล');
      return;
    }

    setIsInviting(true);

    try {
      const response = await apiFetch('/api/companies/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          roles: inviteRoles,
          warehouse_ids: inviteWarehouseIds.length > 0 ? inviteWarehouseIds : undefined,
          terminal_ids: inviteTerminalIds.length > 0 ? inviteTerminalIds : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('ส่งคำเชิญสำเร็จ');
        setShowAddModal(false);
        setInviteEmail('');
        setInviteRoles(['sales']);
        setInviteWarehouseIds([]);
        setInviteTerminalIds([]);
        await fetchMembers();
      } else {
        setError(data.error || 'ไม่สามารถส่งคำเชิญได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการส่งคำเชิญ');
    } finally {
      setIsInviting(false);
    }
  };

  // Handle create user directly
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createForm.email)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }

    if (createForm.password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsCreating(true);

    try {
      const response = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          name: createForm.name,
          roles: createForm.roles,
          phone: createForm.phone || undefined,
          warehouse_ids: createForm.warehouse_ids.length > 0 ? createForm.warehouse_ids : undefined,
          terminal_ids: createForm.terminal_ids.length > 0 ? createForm.terminal_ids : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('เพิ่มสมาชิกใหม่สำเร็จ');
        setShowAddModal(false);
        setCreateForm({ email: '', name: '', password: '', roles: ['sales'], phone: '', warehouse_ids: [], terminal_ids: [] });
        await fetchMembers();
      } else {
        if (result.error?.includes('already registered')) {
          setError('อีเมลนี้มีในระบบแล้ว');
        } else {
          setError(result.error || 'ไม่สามารถสร้างผู้ใช้ได้');
        }
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการสร้างผู้ใช้');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle inline role change
  const handleChangeRole = async (memberId: string) => {
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch('/api/companies/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, roles: editingRoles }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('เปลี่ยนตำแหน่งสำเร็จ');
        setEditingRoleMemberId(null);
        await fetchMembers();
      } else {
        setError(data.error || 'ไม่สามารถเปลี่ยนตำแหน่งได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเปลี่ยนตำแหน่ง');
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
      warehouse_ids: [],
      terminal_ids: [],
    });
    setShowEditModal(true);

    // Fetch warehouse + terminal permissions
    try {
      const res = await apiFetch(`/api/users/warehouse-permissions?user_id=${member.user.id}`);
      if (res.ok) {
        const data = await res.json();
        setEditingMember(prev => prev ? {
          ...prev,
          warehouse_ids: data.warehouse_ids || [],
          terminal_ids: data.terminal_ids || [],
        } : prev);
      }
    } catch { /* silent */ }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setError('');
    setSuccess('');
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
      await apiFetch('/api/users/warehouse-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingMember.userId,
          warehouse_ids: editingMember.warehouse_ids,
          terminal_ids: editingMember.terminal_ids,
        }),
      });

      setSuccess('อัพเดทข้อมูลสมาชิกสำเร็จ');
      setShowEditModal(false);
      setEditingMember(null);
      await fetchMembers();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle remove member
  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('คุณต้องการลบสมาชิกคนนี้หรือไม่?')) return;

    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(`/api/companies/members?id=${memberId}&type=member`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('ลบสมาชิกสำเร็จ');
        await fetchMembers();
      } else {
        setError(data.error || 'ไม่สามารถลบสมาชิกได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการลบสมาชิก');
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('คุณต้องการยกเลิกคำเชิญนี้หรือไม่?')) return;

    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(`/api/companies/members?id=${invitationId}&type=invitation`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('ยกเลิกคำเชิญสำเร็จ');
        await fetchMembers();
      } else {
        setError(data.error || 'ไม่สามารถยกเลิกคำเชิญได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการยกเลิกคำเชิญ');
    }
  };

  // Copy invite link
  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setSuccess('คัดลอกลิงก์คำเชิญแล้ว');
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

  // Role checkboxes component
  const RoleCheckboxes = ({ selectedRoles, onChange, disabled }: { selectedRoles: string[]; onChange: (roles: string[]) => void; disabled?: boolean }) => (
    <div className="flex flex-wrap gap-2">
      {ROLE_OPTIONS.map((option) => (
        <label key={option.value} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors">
          <input
            type="checkbox"
            checked={selectedRoles.includes(option.value)}
            onChange={() => onChange(toggleRole(selectedRoles, option.value))}
            className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
            disabled={disabled}
          />
          <span className="text-sm text-gray-700 dark:text-slate-300">{option.label}</span>
        </label>
      ))}
    </div>
  );

  // Terminal checkboxes component
  const TerminalCheckboxes = ({ selectedIds, onChange, disabled }: { selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) => {
    if (!features.pos || terminals.length === 0) return null;
    return (
      <div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
          <Monitor className="w-4 h-4 inline mr-1 -mt-0.5" />
          สิทธิ์ POS <span className="text-gray-400">(ไม่เลือก = เข้าถึงทุก POS/คลัง)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {terminals.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.includes(t.id)}
                onChange={(e) => {
                  const ids = e.target.checked
                    ? [...selectedIds, t.id]
                    : selectedIds.filter(id => id !== t.id);
                  onChange(ids);
                }}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
                disabled={disabled}
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">
                {t.name}{t.code ? ` (${t.code})` : ''}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  // Warehouse checkboxes component
  const WarehouseCheckboxes = ({ selectedIds, onChange, disabled }: { selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) => {
    if (warehouses.length === 0 || (!stockEnabled && !features.pos)) return null;
    return (
      <div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
          <Warehouse className="w-4 h-4 inline mr-1 -mt-0.5" />
          สิทธิ์ POS/คลัง <span className="text-gray-400">(ไม่เลือก = เข้าถึงทุก POS/คลัง)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {warehouses.map(wh => (
            <label key={wh.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.includes(wh.id)}
                onChange={(e) => {
                  const ids = e.target.checked
                    ? [...selectedIds, wh.id]
                    : selectedIds.filter(id => id !== wh.id);
                  onChange(ids);
                }}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
                disabled={disabled}
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">
                {wh.name}
              </span>
            </label>
          ))}
        </div>
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
          {/* Alerts */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
              <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 dark:text-green-300 flex-1">{success}</p>
              <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
            </div>
          )}

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
                          <Mail className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{invitation.email}</p>
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
                              <Copy className="w-4 h-4" />
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
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
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

              {/* Mode toggle tabs */}
              <div className="px-5 pt-4">
                <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                  <button
                    onClick={() => setAddMode('invite')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'invite'
                        ? 'bg-white dark:bg-slate-600 text-[#F4511E] shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                    }`}
                  >
                    <Mail className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    ส่งคำเชิญ
                  </button>
                  <button
                    onClick={() => setAddMode('create')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'create'
                        ? 'bg-white dark:bg-slate-600 text-[#F4511E] shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                    }`}
                  >
                    <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    สร้างบัญชีโดยตรง
                  </button>
                </div>
              </div>

              {/* Invite Form */}
              {addMode === 'invite' && (
                <form onSubmit={handleInvite} className="p-5 space-y-4">
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    ส่งคำเชิญทางอีเมลเพื่อให้ผู้ใช้ลงทะเบียนและเข้าร่วมบริษัท
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      อีเมล *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                        placeholder="user@company.com"
                        required
                        disabled={isInviting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      ตำแหน่ง * <span className="text-gray-400 font-normal">(เลือกได้หลายตำแหน่ง)</span>
                    </label>
                    <RoleCheckboxes selectedRoles={inviteRoles} onChange={setInviteRoles} disabled={isInviting} />
                  </div>

                  <WarehouseCheckboxes selectedIds={inviteWarehouseIds} onChange={setInviteWarehouseIds} disabled={isInviting} />
                  <TerminalCheckboxes selectedIds={inviteTerminalIds} onChange={setInviteTerminalIds} disabled={isInviting} />

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isInviting}
                      className="px-5 py-2.5 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isInviting ? (
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      ) : (
                        <Mail className="w-4 h-4 mr-2" />
                      )}
                      ส่งคำเชิญ
                    </button>
                  </div>
                </form>
              )}

              {/* Create Account Form */}
              {addMode === 'create' && (
                <form onSubmit={handleCreateUser} className="p-5 space-y-4">
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    สร้างบัญชีผู้ใช้พร้อมรหัสผ่านโดยตรง (ไม่ต้องรอตอบรับคำเชิญ)
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      อีเมล *
                    </label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                      placeholder="user@company.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ชื่อ-นามสกุล *
                    </label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      รหัสผ่าน *
                    </label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                      minLength={6}
                    />
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      อย่างน้อย 6 ตัวอักษร
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      ตำแหน่ง * <span className="text-gray-400 font-normal">(เลือกได้หลายตำแหน่ง)</span>
                    </label>
                    <RoleCheckboxes
                      selectedRoles={createForm.roles}
                      onChange={(roles) => setCreateForm({ ...createForm, roles })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      เบอร์โทร
                    </label>
                    <input
                      type="tel"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      placeholder="0812345678"
                    />
                  </div>

                  <WarehouseCheckboxes
                    selectedIds={createForm.warehouse_ids}
                    onChange={(ids) => setCreateForm({ ...createForm, warehouse_ids: ids })}
                  />
                  <TerminalCheckboxes
                    selectedIds={createForm.terminal_ids}
                    onChange={(ids) => setCreateForm({ ...createForm, terminal_ids: ids })}
                  />

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="px-5 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isCreating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      สร้างบัญชี
                    </button>
                  </div>
                </form>
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
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
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

              <form onSubmit={handleSaveEdit} className="p-5">
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
                      ตำแหน่ง <span className="text-gray-400 font-normal">(เลือกได้หลายตำแหน่ง)</span>
                    </label>
                    <RoleCheckboxes
                      selectedRoles={editingMember.roles}
                      onChange={(roles) => setEditingMember({ ...editingMember, roles })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
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
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingMember.is_active}
                        onChange={(e) => setEditingMember({ ...editingMember, is_active: e.target.checked })}
                        className="mr-2 w-4 h-4 rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">เปิดใช้งาน</span>
                    </label>
                  </div>

                  <WarehouseCheckboxes
                    selectedIds={editingMember.warehouse_ids}
                    onChange={(ids) => setEditingMember({ ...editingMember, warehouse_ids: ids })}
                  />
                  <TerminalCheckboxes
                    selectedIds={editingMember.terminal_ids}
                    onChange={(ids) => setEditingMember({ ...editingMember, terminal_ids: ids })}
                  />
                </div>

                <div className="flex justify-end space-x-3 mt-6">
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
