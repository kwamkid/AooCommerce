'use client';

import { useState, useRef } from 'react';
import { Search, X, Check, Phone, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
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
  const customerSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const customerSearchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchCustomers = async (search: string) => {
    try {
      setLoadingCustomers(true);
      const response = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}&limit=10`);
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      setCustomers(result.customers || result || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

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
          {!confirmLinkCustomer && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" key="link-search" defaultValue="" ref={(el) => { customerSearchInputRef.current = el; if (el) { setTimeout(() => el.focus(), 50); } }} onChange={(e) => {
                const val = e.target.value.trim();
                if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current);
                if (val.length >= 2) {
                  customerSearchTimer.current = setTimeout(() => { setLoadingCustomers(true); fetchCustomers(val); }, 500);
                } else if (customers.length > 0 || loadingCustomers) {
                  setCustomers([]);
                  setLoadingCustomers(false);
                }
              }}
              placeholder="ค้นหาชื่อหรือรหัสลูกค้า..." className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
          </div>
          )}
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
              <div className="max-h-64 overflow-y-auto">
                {loadingCustomers ? (<div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : customers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 dark:text-slate-400 text-sm">{(customerSearchInputRef.current?.value?.length || 0) >= 2 ? 'ไม่พบลูกค้า' : 'พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา'}</div>
                ) : (
                  <div className="space-y-1">
                    {customers.map((customer) => (
                      <button key={customer.id} onClick={() => setConfirmLinkCustomer(customer)} className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center justify-between">
                        <div><div className="text-xs text-gray-400 dark:text-slate-500">{customer.customer_code}</div><div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>{customer.phone && (<div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</div>)}</div>
                        <Check className="w-5 h-5" style={{ color: platformColor }} />
                      </button>
                    ))}
                  </div>
                )}
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
