// Path: app/users/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import {
  Users,
  Plus,
  Edit2,
  Search,
  Mail,
  Phone,
  Shield,
  AlertCircle,
  Check,
  X,
  Loader2,
  Trash2,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';

// User interface
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'operation' | 'sales';
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Type for role keys
type UserRole = 'admin' | 'manager' | 'operation' | 'sales';

// Role configuration type
interface RoleConfig {
  color: string;
  label: string;
}

// Role configurations
const roleConfigs: Record<UserRole, RoleConfig> = {
  admin: { color: 'bg-red-100 text-red-800', label: 'ผู้ดูแลระบบ' },
  manager: { color: 'bg-blue-100 text-blue-800', label: 'ผู้จัดการ' },
  operation: { color: 'bg-green-100 text-green-800', label: 'พนักงานผลิต' },
  sales: { color: 'bg-purple-100 text-purple-800', label: 'ฝ่ายขาย' }
};

// Role badge component
function RoleBadge({ role }: { role: UserRole }) {
  const config = roleConfigs[role];
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// Status badge component
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="flex items-center text-green-600">
      <Check className="w-4 h-4 mr-1" />
      <span className="text-sm">ใช้งาน</span>
    </span>
  ) : (
    <span className="flex items-center text-red-600">
      <X className="w-4 h-4 mr-1" />
      <span className="text-sm">ระงับ</span>
    </span>
  );
}

// Form data interface
interface UserFormData {
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  password: string;
  is_active: boolean;
}

export default function UsersPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Form state with proper typing
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    role: 'operation',
    phone: '',
    password: '',
    is_active: true
  });

  // Fetch users function
  const fetchUsers = useCallback(async () => {
    if (dataFetched) return;

    try {
      setLoading(true);

      // ใช้ API route แทน direct Supabase call เพื่อหลีก RLS
      const response = await apiFetch('/api/users');

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch users');
      }

      if (result.users) {
        const validatedUsers = result.users as User[];
        setUsers(validatedUsers);
        setDataFetched(true);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  }, [dataFetched]);

  // Check auth
  useEffect(() => {
    if (authLoading) return;
    
    if (!userProfile) {
      router.push('/login');
      return;
    }
    
    if (userProfile.role !== 'admin' && userProfile.role !== 'owner') {
      router.push('/dashboard');
      return;
    }
  }, [userProfile, authLoading, router]);

  // Fetch users
  useEffect(() => {
    if (!authLoading && (userProfile?.role === 'admin' || userProfile?.role === 'owner') && !dataFetched) {
      fetchUsers();
    }
  }, [authLoading, userProfile, dataFetched, fetchUsers]);

  // Handle create/update user
  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      setSaving(false);
      return;
    }

    try {
      if (editingUser) {
        // Update existing user - ใช้ API route
        const response = await apiFetch('/api/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingUser.id,
            name: formData.name,
            role: formData.role,
            phone: formData.phone,
            is_active: formData.is_active
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'ไม่สามารถอัพเดทผู้ใช้ได้');
        }

        setSuccess('อัพเดทข้อมูลผู้ใช้สำเร็จ');
      } else {
        // Create new user - ใช้ API route
        const response = await apiFetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            role: formData.role,
            phone: formData.phone,
            is_active: formData.is_active
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          // จัดการ error messages
          if (result.error?.includes('already registered')) {
            throw new Error('อีเมลนี้มีในระบบแล้ว');
          } else if (result.error?.includes('invalid')) {
            throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
          } else if (result.error?.includes('password')) {
            throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
          }
          throw new Error(result.error || 'ไม่สามารถสร้างผู้ใช้ได้');
        }

        setSuccess('เพิ่มผู้ใช้ใหม่สำเร็จ');
      }

      // Reset form and refresh
      setShowModal(false);
      setEditingUser(null);
      setFormData({
        email: '',
        name: '',
        role: 'operation',
        phone: '',
        password: '',
        is_active: true
      });
      
      // Refetch users
      setDataFetched(false);
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle toggle user status
  const handleToggleUserStatus = async (user: User) => {
    const newStatus = !user.is_active;
    const action = newStatus ? 'เปิดใช้งาน' : 'ระงับ';

    if (!confirm(`คุณต้องการ${action}ผู้ใช้นี้หรือไม่?`)) return;

    try {
      const response = await apiFetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          name: user.name,
          role: user.role,
          phone: user.phone,
          is_active: newStatus
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `ไม่สามารถ${action}ผู้ใช้ได้`);
      }

      setSuccess(`${action}ผู้ใช้สำเร็จ`);
      setDataFetched(false);
      fetchUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(`ไม่สามารถ${action}ผู้ใช้ได้`);
      }
    }
  };

  // Handle delete user permanently
  const handleDeleteUser = async (user: User) => {
    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ที่จะลบผู้ใช้ "${user.name}" ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้!`)) return;

    try {
      const response = await apiFetch(`/api/users?id=${user.id}&hard=true`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถลบผู้ใช้ได้');
      }

      // Remove user from local state immediately
      setUsers(prevUsers => prevUsers.filter(u => u.id !== user.id));
      setSuccess('ลบผู้ใช้สำเร็จ');
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('ไม่สามารถลบผู้ใช้ได้');
      }
    }
  };

  // Handle edit user
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone || '',
      password: '',
      is_active: user.is_active
    });
    setShowModal(true);
  };

  // Handle role change
  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole;
    setFormData({ ...formData, role: newRole });
  };

  // Filter users based on search
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
  const totalFiltered = filteredUsers.length;
  const totalPages = Math.ceil(totalFiltered / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + rowsPerPage);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Clear alerts after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!userProfile || (userProfile.role !== 'admin' && userProfile.role !== 'owner')) {
    return null;
  }

  // Loading users
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      title="จัดการผู้ใช้งาน"
      breadcrumbs={[
        { label: 'หน้าแรก', href: '/dashboard' },
        { label: 'จัดการผู้ใช้งาน' }
      ]}
    >
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-[#F4511E]" />
          <div>
            <p className="text-sm text-gray-500 dark:text-slate-400">จำนวนผู้ใช้ทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length} คน</p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({
              email: '',
              name: '',
              role: 'operation',
              phone: '',
              password: '',
              is_active: true
            });
            setShowModal(true);
          }}
          className="flex items-center px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-medium transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          เพิ่มผู้ใช้ใหม่
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
          <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-700">{success}</p>
          </div>
          <button
            onClick={() => setSuccess('')}
            className="text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="data-filter-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อหรืออีเมล..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="data-table-wrap-shadow">
        <div className="overflow-x-auto">
          <table className="data-table-fixed">
            <thead className="data-thead">
              <tr>
                <th className="data-th">
                  ผู้ใช้
                </th>
                <th className="data-th">
                  Role
                </th>
                <th className="data-th">
                  เบอร์โทร
                </th>
                <th className="data-th">
                  สถานะ
                </th>
                <th className="data-th">
                  วันที่สร้าง
                </th>
                <th className="data-th text-right">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="data-tbody">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="data-tr">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-[#F4511E]/20 flex items-center justify-center">
                          <span className="text-[#F4511E] font-semibold">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.name}
                          {user.id === userProfile?.id && (
                            <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">(คุณ)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                    {user.phone ? (
                      <span className="flex items-center">
                        <Phone className="w-3 h-3 mr-1" />
                        {user.phone}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                    {new Date(user.created_at).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-[#F4511E] hover:text-[#F4511E]/80 p-1"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {user.id !== userProfile?.id && (
                        <>
                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            className={user.is_active ? 'text-orange-600 hover:text-orange-900 p-1' : 'text-green-600 hover:text-green-900 p-1'}
                            title={user.is_active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                          >
                            {user.is_active ? (
                              <X className="w-4 h-4" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-600 hover:text-red-900 p-1"
                            title="ลบผู้ใช้ถาวร"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400">ไม่พบผู้ใช้งาน</p>
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalFiltered}
            startIdx={startIndex}
            endIdx={Math.min(startIndex + rowsPerPage, totalFiltered)}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={setRowsPerPage}
            setPage={setCurrentPage}
          />
        </div>
      </div>

      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setShowModal(false)}
            />

            <div className="relative bg-white rounded-lg max-w-md w-full">
              <div className="flex items-center justify-between p-5 border-b">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {editingUser ? 'แก้ไขข้อมูลผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="p-5">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      อีเมล *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                      required
                      disabled={!!editingUser}
                      placeholder="user@company.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ชื่อ-นามสกุล *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                      required
                    />
                  </div>

                  {!editingUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        รหัสผ่าน *
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                        required
                        minLength={6}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        อย่างน้อย 6 ตัวอักษร
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ตำแหน่ง *
                    </label>
                    <select
                      value={formData.role}
                      onChange={handleRoleChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                      required
                    >
                      <option value="operation">พนักงานผลิต</option>
                      <option value="sales">ฝ่ายขาย</option>
                      <option value="manager">ผู้จัดการ</option>
                      <option value="admin">ผู้ดูแลระบบ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      เบอร์โทร
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                      placeholder="0812345678"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="mr-2 rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">เปิดใช้งาน</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#F4511E]/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editingUser ? 'บันทึก' : 'เพิ่มผู้ใช้'}
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