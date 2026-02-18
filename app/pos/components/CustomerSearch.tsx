// Path: app/pos/components/CustomerSearch.tsx
'use client';

import { useState } from 'react';
import { Search, X, User } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

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
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) {
      setResults([]);
      return;
    }

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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1E293B] rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">เลือกลูกค้า</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Walk-in button */}
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className={`w-full p-3 rounded-lg mb-3 text-left flex items-center gap-3 transition-colors ${
            !selectedCustomer ? 'bg-[#F4511E]/20 border border-[#F4511E]' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          <User className="w-5 h-5 text-gray-400" />
          <span className="text-white">ลูกค้าทั่วไป (Walk-in)</span>
        </button>

        {/* Search input */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading && <p className="text-gray-400 text-sm text-center py-4">กำลังค้นหา...</p>}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">ไม่พบลูกค้า</p>
          )}
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); onClose(); }}
              className={`w-full p-3 rounded-lg text-left flex items-center gap-3 transition-colors ${
                selectedCustomer?.id === c.id
                  ? 'bg-[#F4511E]/20 border border-[#F4511E]'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-[#F4511E]/20 flex items-center justify-center">
                <User className="w-4 h-4 text-[#F4511E]" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-gray-400 text-xs">{c.customer_code}{c.phone ? ` • ${c.phone}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
