// Path: app/settings/members/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import {
  Users, Mail, UserPlus, Shield, Trash2, Edit2, X, Check,
  AlertCircle, Loader2, CheckCircle, Clock, Copy, Phone,
  Search, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Warehouse,
} from 'lucide-react';

interface Member {
  id: string;
  role: string;
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
  role: string;
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
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'ฝ่ายขาย',
  operation: 'พนักงานผลิต',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-red-100 text-red-800 border-red-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  account: 'bg-green-100 text-green-800 border-green-200',
  warehouse: 'bg-orange-100 text-orange-800 border-orange-200',
  sales: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  operation: 'bg-green-100 text-green-800 border-green-200',
};

interface CreateUserForm {
  email: string;
  name: string;
  password: string;
  role: string;
  phone: string;
}

interface EditMemberForm {
  memberId: string;
  userId: string;
  name: string;
  role: string;
  phone: string;
  is_active: boolean;
  warehouse_ids: string[];
}

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
}

export default function MembersPage() {
  const { currentCompany, companyRole } = useCompany();
  const { userProfile } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Add mode toggle
  const [addMode, setAddMode] = useState<AddMode>('invite');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('sales');
  const [isInviting, setIsInviting] = useState(false);

  // Create user form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '', name: '', password: '', role: 'sales', phone: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Edit member state
  const [editingMember, setEditingMember] = useState<EditMemberForm | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Inline role edit
  const [editingRoleMemberId, setEditingRoleMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('');

  // Warehouses (for permission assignment)
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  const isOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';

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
        }
      } catch { /* silent */ }
    };
    fetchWarehouses();
  }, !!currentCompany?.id);

  // Clear alerts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(''); setSuccess(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

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
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('ส่งคำเชิญสำเร็จ');
        setInviteEmail('');
        setInviteRole('sales');
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
          role: createForm.role,
          phone: createForm.phone || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('เพิ่มสมาชิกใหม่สำเร็จ');
        setShowCreateModal(false);
        setCreateForm({ email: '', name: '', password: '', role: 'sales', phone: '' });
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
        body: JSON.stringify({ memberId, role: editingRole }),
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
      role: member.role,
      phone: member.user.phone || '',
      is_active: member.is_active,
      warehouse_ids: [],
    });
    setShowEditModal(true);

    // Fetch warehouse permissions
    try {
      const res = await apiFetch(`/api/users/warehouse-permissions?user_id=${member.user.id}`);
      if (res.ok) {
        const data = await res.json();
        setEditingMember(prev => prev ? { ...prev, warehouse_ids: data.warehouse_ids || [] } : prev);
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
      // Update user profile + company_members role via /api/users PUT
      const profileRes = await apiFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMember.userId,
          name: editingMember.name,
          role: editingMember.role,
          phone: editingMember.phone || null,
          is_active: editingMember.is_active,
        }),
      });

      const profileResult = await profileRes.json();

      if (!profileRes.ok) {
        throw new Error(profileResult.error || 'ไม่สามารถอัพเดทข้อมูลได้');
      }

      // Save warehouse permissions
      await apiFetch('/api/users/warehouse-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingMember.userId,
          warehouse_ids: editingMember.warehouse_ids,
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

  // Role badge component
  const RoleBadge = ({ role }: { role: string }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );

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
        <div className="space-y-6 max-w-4xl">
          {/* Alerts */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 flex-1">{error}</p>
              <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 flex-1">{success}</p>
              <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Add Member Section */}
          {isOwnerOrAdmin && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
              {/* Toggle between Invite / Create */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <UserPlus className="w-5 h-5 mr-2 text-[#F4511E]" />
                  เพิ่มสมาชิก
                </h3>
                <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setAddMode('invite')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'invite'
                        ? 'bg-white dark:bg-slate-600 text-[#F4511E] shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                    }`}
                  >
                    ส่งคำเชิญ
                  </button>
                  <button
                    onClick={() => setAddMode('create')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'create'
                        ? 'bg-white dark:bg-slate-600 text-[#F4511E] shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                    }`}
                  >
                    สร้างบัญชีโดยตรง
                  </button>
                </div>
              </div>

              {addMode === 'invite' ? (
                /* Invite Form */
                <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                        placeholder="อีเมลสมาชิก"
                        required
                        disabled={isInviting}
                      />
                    </div>
                  </div>
                  <div className="w-full sm:w-48">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      disabled={isInviting}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="px-6 py-2.5 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
                  >
                    {isInviting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        ส่งคำเชิญ
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Create User Button */
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                    สร้างบัญชีผู้ใช้พร้อมรหัสผ่านโดยตรง (ไม่ต้องรอตอบรับคำเชิญ)
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center px-4 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-semibold transition-colors"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    สร้างบัญชีสมาชิกใหม่
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <Users className="w-5 h-5 mr-2 text-[#F4511E]" />
                สมาชิกปัจจุบัน ({activeMembers.length})
              </h3>
              {activeMembers.length > 5 && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อหรืออีเมล..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                  />
                </div>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredMembers.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-center space-x-4 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                      {member.user?.name?.charAt(0)?.toUpperCase() || member.user?.email?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {member.user?.name || 'ไม่ระบุชื่อ'}
                        {member.user?.id === userProfile?.id && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">(คุณ)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                        <span className="flex items-center truncate">
                          <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                          {member.user?.email}
                        </span>
                        {member.user?.phone && (
                          <span className="flex items-center">
                            <Phone className="w-3 h-3 mr-1 flex-shrink-0" />
                            {member.user.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 flex-shrink-0 ml-3">
                    {editingRoleMemberId === member.id ? (
                      <div className="flex items-center space-x-2">
                        <select
                          value={editingRole}
                          onChange={(e) => setEditingRole(e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
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
                        <RoleBadge role={member.role} />
                        {isOwnerOrAdmin && member.role !== 'owner' && member.user?.id !== userProfile?.id && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditModal(member)}
                              className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              title="แก้ไขข้อมูล"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingRoleMemberId(member.id);
                                setEditingRole(member.role);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="เปลี่ยนตำแหน่ง"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRemoveMember(member.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
              ))}
              {filteredMembers.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>{searchTerm ? 'ไม่พบสมาชิกที่ค้นหา' : 'ยังไม่มีสมาชิก'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-[#F4511E]" />
                  คำเชิญที่รอการตอบรับ ({invitations.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-gray-500 dark:text-slate-400">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{invitation.email}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          หมดอายุ: {new Date(invitation.expires_at).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RoleBadge role={invitation.role} />
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                        รอตอบรับ
                      </span>
                      {isOwnerOrAdmin && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => copyInviteLink(invitation.token)}
                            className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="คัดลอกลิงก์คำเชิญ"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCancelInvitation(invitation.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="ยกเลิกคำเชิญ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setShowCreateModal(false)}
            />
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-md w-full shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  สร้างบัญชีสมาชิกใหม่
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="p-5">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      อีเมล *
                    </label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      อย่างน้อย 6 ตัวอักษร
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ตำแหน่ง *
                    </label>
                    <select
                      value={createForm.role}
                      onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      เบอร์โทร
                    </label>
                    <input
                      type="tel"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      placeholder="0812345678"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    สร้างบัญชี
                  </button>
                </div>
              </form>
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
            <div className="relative bg-white dark:bg-slate-800 rounded-xl max-w-md w-full shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ตำแหน่ง
                    </label>
                    <select
                      value={editingMember.role}
                      onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      required
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      เบอร์โทร
                    </label>
                    <input
                      type="tel"
                      value={editingMember.phone}
                      onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700"
                      placeholder="0812345678"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingMember.is_active}
                        onChange={(e) => setEditingMember({ ...editingMember, is_active: e.target.checked })}
                        className="mr-2 rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">เปิดใช้งาน</span>
                    </label>
                  </div>

                  {/* Warehouse Permissions */}
                  {warehouses.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        <Warehouse className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                        สิทธิ์คลังสินค้า
                      </label>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">
                        ไม่เลือก = เข้าถึงทุกคลัง, เลือกบางคลัง = เข้าถึงเฉพาะที่เลือก
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg p-2">
                        {warehouses.map(wh => (
                          <label key={wh.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingMember.warehouse_ids.includes(wh.id)}
                              onChange={(e) => {
                                const ids = e.target.checked
                                  ? [...editingMember.warehouse_ids, wh.id]
                                  : editingMember.warehouse_ids.filter(id => id !== wh.id);
                                setEditingMember({ ...editingMember, warehouse_ids: ids });
                              }}
                              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
                            />
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {wh.name}{wh.code ? ` (${wh.code})` : ''}{wh.is_default ? ' - ค่าเริ่มต้น' : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                    className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
