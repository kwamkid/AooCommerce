// Path: components/suppliers/SupplierFormModal.tsx
'use client';

import { Factory } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import SupplierForm, { type SupplierFormData } from './SupplierForm';

interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: { id: string; name: string; supplier_type: string }) => void;
}

export default function SupplierFormModal({ open, onClose, onCreated }: SupplierFormModalProps) {
  const handleSubmit = async (data: SupplierFormData) => {
    const { apiFetch } = await import('@/lib/api-client');
    const res = await apiFetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'ไม่สามารถบันทึกได้');
    }

    const result = await res.json();
    const created = result.data || result;
    onCreated({ id: created.id, name: data.name, supplier_type: data.supplier_type });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="เพิ่มซัพพลายเออร์ใหม่"
      icon={<Factory className="w-5 h-5 text-primary" />}
    >
      <div className="p-4">
        <SupplierForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          compact
        />
      </div>
    </Modal>
  );
}
