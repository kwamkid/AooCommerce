'use client';

import { useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import type { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import type { UnifiedContact, Customer } from '../lib/chatTypes';

interface LinkCustomerModalProps {
  contact: UnifiedContact;
  platformColor: string;
  onLink: (customerId: string | null) => void;
  onClose: () => void;
}

export default function LinkCustomerModal({ contact, platformColor, onLink, onClose }: LinkCustomerModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [confirmLinkCustomer, setConfirmLinkCustomer] = useState<Customer | null>(null);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((search: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const val = search.trim();
    if (val.length >= 2) {
      searchTimer.current = setTimeout(async () => {
        try {
          setLoadingCustomers(true);
          const response = await apiFetch(`/api/customers?search=${encodeURIComponent(val)}&limit=10`);
          if (!response.ok) throw new Error('Failed');
          const result = await response.json();
          setCustomers(result.customers || result || []);
        } catch (error) {
          console.error('Error fetching customers:', error);
        } finally {
          setLoadingCustomers(false);
        }
      }, 500);
    } else {
      setCustomers([]);
      setLoadingCustomers(false);
    }
  }, []);

  const customerOptions: EntitySearchOption[] = customers.map(c => ({
    id: c.id,
    label: c.name,
    subtitle: c.customer_code + (c.phone ? ` • ${c.phone}` : ''),
  }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={0} ref={(el) => el?.focus()}>
      <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">เชื่อมกับลูกค้าในระบบ</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">
          {confirmLinkCustomer ? (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">ต้องการเชื่อม</p>
                <p className="text-base font-semibold text-gray-900 dark:text-white">{contact.display_name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">กับลูกค้า</p>
                <p className="text-base font-semibold mt-1" style={{ color: platformColor }}>{confirmLinkCustomer.name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{confirmLinkCustomer.customer_code}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setConfirmLinkCustomer(null); setCustomers([]); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">ย้อนกลับ</button>
                <button onClick={() => { onLink(confirmLinkCustomer.id); setConfirmLinkCustomer(null); }} className="flex-1 px-4 py-2 rounded-lg text-sm text-white transition-colors bg-[#F4511E] hover:bg-[#D63B0E]">ยืนยันเชื่อม</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <EntitySearchInput
                  value=""
                  onChange={(id) => {
                    const customer = customers.find(c => c.id === id);
                    if (customer) setConfirmLinkCustomer(customer);
                  }}
                  options={customerOptions}
                  onSearchChange={handleSearchChange}
                  loading={loadingCustomers}
                  minSearchLength={2}
                  autoFocus
                  placeholder="ค้นหาชื่อหรือรหัสลูกค้า..."
                  emptyMessage="พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา"
                />
              </div>
              {contact.customer && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700"><button onClick={() => onLink(null)} className="w-full p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-sm transition-colors">ยกเลิกการเชื่อมกับลูกค้า</button></div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
