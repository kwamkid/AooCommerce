// Path: app/pos/components/SessionModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Monitor, DollarSign, Warehouse, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';

interface TerminalOption {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string | null;
  warehouse: { id: string; name: string; code: string | null } | null;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string | null;
}

interface SessionData {
  id: string;
  warehouse_id: string | null;
  terminal_id: string | null;
  cashier_name: string;
  opening_float: number;
  total_sales: number;
  total_orders: number;
  total_voids: number;
  payment_summary: Record<string, number>;
  warehouse: { id: string; name: string; code: string | null } | null;
  terminal: { id: string; name: string; code: string | null } | null;
}

interface SessionModalProps {
  mode: 'open' | 'close';
  session?: SessionData | null;
  onOpenShift: (terminalId: string, openingFloat: number) => void;
  onCloseShift: (closingCash: number, notes: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function SessionModal({
  mode,
  session,
  onOpenShift,
  onCloseShift,
  onCancel,
  loading,
}: SessionModalProps) {
  const [terminals, setTerminals] = useState<TerminalOption[]>([]);
  const [loadingTerminals, setLoadingTerminals] = useState(true);
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');

  // Quick create terminal state
  const [showCreateTerminal, setShowCreateTerminal] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState('');
  const [newTerminalWarehouseId, setNewTerminalWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [creatingTerminal, setCreatingTerminal] = useState(false);

  // Fetch terminals for open mode
  useEffect(() => {
    if (mode !== 'open') {
      setLoadingTerminals(false);
      return;
    }

    (async () => {
      try {
        const res = await apiFetch('/api/pos/terminals?active=true');
        const data = await res.json();
        const terms = data.terminals || [];
        setTerminals(terms);
        if (terms.length === 1) setSelectedTerminal(terms[0].id);
      } catch {
        setTerminals([]);
      } finally {
        setLoadingTerminals(false);
      }
    })();
  }, [mode]);

  // Fetch warehouses when showing create form
  useEffect(() => {
    if (!showCreateTerminal) return;

    (async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        const data = await res.json();
        setWarehouses((data.warehouses || []).filter((w: any) => w.is_active));
      } catch {
        setWarehouses([]);
      }
    })();
  }, [showCreateTerminal]);

  const handleCreateTerminal = async () => {
    if (!newTerminalName.trim()) return;

    setCreatingTerminal(true);
    try {
      const res = await apiFetch('/api/pos/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTerminalName,
          warehouse_id: newTerminalWarehouseId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      const data = await res.json();
      const newTerminal = data.terminal;

      // Re-fetch terminals and auto-select new one
      const refetch = await apiFetch('/api/pos/terminals?active=true');
      const refetchData = await refetch.json();
      const terms = refetchData.terminals || [];
      setTerminals(terms);

      if (newTerminal?.id) {
        setSelectedTerminal(newTerminal.id);
      }

      setShowCreateTerminal(false);
      setNewTerminalName('');
      setNewTerminalWarehouseId('');
    } catch (err) {
      console.error('Create terminal error:', err);
    } finally {
      setCreatingTerminal(false);
    }
  };

  const expectedCash = session
    ? Number(session.opening_float || 0) + Number(session.payment_summary?.['cash'] || 0)
    : 0;
  const actualCash = Number(closingCash) || 0;
  const cashDifference = actualCash - expectedCash;

  // Get display name for session (terminal or warehouse fallback)
  const sessionLocationName = session?.terminal?.name || session?.warehouse?.name || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto shadow-xl dark:shadow-none">
        {mode === 'open' ? (
          <>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">เปิดกะ</h3>

            {loadingTerminals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#F4511E]" />
              </div>
            ) : terminals.length === 0 && !showCreateTerminal ? (
              /* No terminals — prompt to create */
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-center">
                  <Monitor className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-1">ยังไม่มีจุดขาย POS</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mb-3">สร้างจุดขายเพื่อเริ่มเปิดกะ</p>
                  <button
                    onClick={() => setShowCreateTerminal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    สร้างจุดขาย
                  </button>
                </div>
                <button
                  onClick={onCancel}
                  className="w-full py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20"
                >
                  ยกเลิก
                </button>
              </div>
            ) : showCreateTerminal ? (
              /* Quick create terminal form */
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-3">
                  <p className="text-gray-900 dark:text-white font-medium text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#F4511E]" />
                    สร้างจุดขายใหม่
                  </p>

                  <div>
                    <label className="text-gray-500 dark:text-gray-400 text-xs mb-1 block">ชื่อจุดขาย *</label>
                    <input
                      type="text"
                      value={newTerminalName}
                      onChange={(e) => setNewTerminalName(e.target.value)}
                      placeholder="เช่น สาขาสยาม, หน้าร้าน"
                      className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-gray-500 dark:text-gray-400 text-xs mb-1 block">คลังสินค้า (ตัดสต็อก)</label>
                    <select
                      value={newTerminalWarehouseId}
                      onChange={(e) => setNewTerminalWarehouseId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    >
                      <option value="">ไม่ตัดสต็อก</option>
                      {warehouses.map(wh => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}{wh.code ? ` (${wh.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateTerminal(false)}
                    className="flex-1 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleCreateTerminal}
                    disabled={!newTerminalName.trim() || creatingTerminal}
                    className="flex-1 py-3 bg-[#F4511E] hover:bg-[#D63B0E] text-white font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creatingTerminal ? <Loader2 className="w-5 h-5 animate-spin" /> : 'สร้าง'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Terminal selector */}
                <div>
                  <label className="text-gray-500 dark:text-gray-400 text-sm mb-2 block">
                    <Monitor className="w-4 h-4 inline mr-1" />
                    เลือกจุดขาย
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {terminals.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTerminal(t.id)}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedTerminal === t.id
                            ? 'bg-[#F4511E]/10 dark:bg-[#F4511E]/20 border-2 border-[#F4511E]'
                            : 'bg-gray-50 dark:bg-white/5 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}
                      >
                        <p className="text-gray-900 dark:text-white font-medium">{t.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.code && <span className="text-gray-500 dark:text-gray-400 text-xs">{t.code}</span>}
                          {t.warehouse ? (
                            <span className="text-gray-500 dark:text-gray-400 text-xs inline-flex items-center gap-1">
                              <Warehouse className="w-3 h-3" />
                              {t.warehouse.name}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">ไม่ตัดสต็อก</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick add terminal button */}
                  <button
                    onClick={() => setShowCreateTerminal(true)}
                    className="w-full mt-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-400 dark:text-gray-500 text-xs flex items-center justify-center gap-1 hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Plus className="w-3 h-3" />
                    เพิ่มจุดขายใหม่
                  </button>
                </div>

                {/* Opening float */}
                <div>
                  <label className="text-gray-500 dark:text-gray-400 text-sm mb-2 block">
                    <DollarSign className="w-4 h-4 inline mr-1" />
                    เงินเปิดลิ้นชัก (฿)
                  </label>
                  <input
                    type="number"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-lg text-center focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => {
                      if (selectedTerminal) {
                        onOpenShift(selectedTerminal, Number(openingFloat) || 0);
                      }
                    }}
                    disabled={!selectedTerminal || loading}
                    className="flex-1 py-3 bg-[#F4511E] hover:bg-[#D63B0E] text-white font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'เปิดกะ'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Close shift */
          <>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">ปิดกะ</h3>

            {session && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">สรุปกะ{sessionLocationName ? ` — ${sessionLocationName}` : ''}</p>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">จำนวนบิล</span>
                    <span className="text-gray-900 dark:text-white font-medium">{session.total_orders} รายการ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">ยอดขายรวม</span>
                    <span className="text-gray-900 dark:text-white font-medium">฿{formatPrice(session.total_sales)}</span>
                  </div>
                  {session.total_voids > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-300">Void</span>
                      <span className="text-red-500 dark:text-red-400">{session.total_voids} รายการ</span>
                    </div>
                  )}
                </div>

                {/* Payment breakdown */}
                {Object.keys(session.payment_summary || {}).length > 0 && (
                  <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">แยกตามช่องทาง</p>
                    {Object.entries(session.payment_summary).map(([method, amount]) => (
                      <div key={method} className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">{method}</span>
                        <span className="text-gray-900 dark:text-white">฿{formatPrice(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cash count */}
                <div>
                  <label className="text-gray-500 dark:text-gray-400 text-sm mb-2 block">นับเงินสดในลิ้นชัก (฿)</label>
                  <input
                    type="number"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-lg text-center focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    autoFocus
                  />
                </div>

                {/* Expected vs actual */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">เงินสดที่ควรจะมี</span>
                    <span className="text-gray-900 dark:text-white">฿{formatPrice(expectedCash)}</span>
                  </div>
                  {actualCash > 0 && (
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-gray-500 dark:text-gray-400">ผลต่าง</span>
                      <span className={cashDifference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                        {cashDifference >= 0 ? '+' : ''}฿{formatPrice(cashDifference)}
                        {cashDifference > 0 ? ' (เกิน)' : cashDifference < 0 ? ' (ขาด)' : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-gray-500 dark:text-gray-400 text-sm mb-1 block">หมายเหตุ (ไม่บังคับ)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none"
                    placeholder="เช่น เงินหาย, เงินเกิน..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => onCloseShift(actualCash, notes)}
                    disabled={loading}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ปิดกะ'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
