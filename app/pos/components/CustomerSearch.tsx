// Path: app/pos/components/CustomerSearch.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { X, User } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import type { EntitySearchOption } from '@/components/ui/EntitySearchInput';

interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

interface CustomerSearchProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null) => void;
  onClose: () => void;
}

export default function CustomerSearch({ selectedCustomer, onSelect, onClose }: CustomerSearchProps) {
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((query: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/customers?search=${encodeURIComponent(query)}&limit=10`);
        const data = await res.json();
        setResults(data.customers || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const customerOptions: EntitySearchOption[] = results.map(c => ({
    id: c.id,
    label: c.name,
    subtitle: c.customer_code + (c.phone ? ` • ${c.phone}` : ''),
    icon: (
      <div className="w-8 h-8 rounded-full bg-[#F4511E]/10 dark:bg-[#F4511E]/20 flex items-center justify-center">
        <User className="w-4 h-4 text-[#F4511E]" />
      </div>
    ),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1E293B] rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col shadow-xl dark:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">เลือกลูกค้า</h3>
          <button onClick={onClose} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Walk-in button */}
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className={`w-full p-3 rounded-lg mb-3 text-left flex items-center gap-3 transition-colors ${
            !selectedCustomer ? 'bg-[#F4511E]/10 dark:bg-[#F4511E]/20 border border-[#F4511E]' : 'bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20'
          }`}
        >
          <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="text-gray-900 dark:text-white">ลูกค้าทั่วไป (Walk-in)</span>
        </button>

        {/* Customer search */}
        <EntitySearchInput
          value=""
          onChange={(id, option) => {
            const customer = results.find(c => c.id === id);
            if (customer) { onSelect(customer); onClose(); }
          }}
          options={customerOptions}
          onSearchChange={handleSearchChange}
          loading={loading}
          minSearchLength={2}
          autoFocus
          placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..."
          emptyMessage="พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา"
        />
      </div>
    </div>
  );
}
