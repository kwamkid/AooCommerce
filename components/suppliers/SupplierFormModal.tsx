// Path: components/suppliers/SupplierFormModal.tsx
'use client';

import { useEffect, useRef } from 'react';
import { X, Factory } from 'lucide-react';
import SupplierForm, { type SupplierFormData } from './SupplierForm';

interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: { id: string; name: string; supplier_type: string }) => void;
}

export default function SupplierFormModal({ open, onClose, onCreated }: SupplierFormModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Factory className="w-5 h-5 text-primary" />
            เพิ่มซัพพลายเออร์ใหม่
          </h2>
          <button type="button" onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4">
          <SupplierForm
            onSubmit={handleSubmit}
            onCancel={onClose}
            compact
          />
        </div>
      </div>
    </div>
  );
}
