// Path: app/pos/components/PaymentModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';
import { CASH_DENOMINATIONS } from '@/lib/pos-utils';
import { apiFetch } from '@/lib/api-client';

interface PaymentChannel {
  id: string;
  name: string;
  type: string; // 'cash' | 'bank_transfer' | 'payment_gateway' | 'card_terminal'
}

interface Tender {
  payment_channel_id: string;
  payment_method: string;
  channel_name: string;
  amount: number;
  change_amount: number;
  reference: string;
}

interface PaymentModalProps {
  totalAmount: number;
  onConfirm: (tenders: Tender[]) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function PaymentModal({ totalAmount, onConfirm, onClose, loading }: PaymentModalProps) {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [splitMode, setSplitMode] = useState(false);

  // Selected channel for single mode
  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel | null>(null);
  const [cashInput, setCashInput] = useState('');
  const [refInput, setRefInput] = useState('');

  // Fetch POS payment channels
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/pos/payment-channels');
        const data = await res.json();
        const ch = data.channels || [];
        setChannels(ch);

        // Auto-select cash if available
        const cashCh = ch.find((c: PaymentChannel) => c.type === 'cash');
        if (cashCh) setSelectedChannel(cashCh);
        else if (ch.length > 0) setSelectedChannel(ch[0]);
      } catch {
        // No channels
      } finally {
        setLoadingChannels(false);
      }
    })();
  }, []);

  const isCash = selectedChannel?.type === 'cash';
  const cashTendered = Number(cashInput) || 0;
  const change = isCash ? Math.max(0, cashTendered - totalAmount) : 0;

  const handleConfirmSingle = () => {
    if (!selectedChannel) return;
    const tender: Tender = {
      payment_channel_id: selectedChannel.id,
      payment_method: selectedChannel.type === 'cash' ? 'cash' : selectedChannel.type,
      channel_name: selectedChannel.name,
      amount: isCash ? cashTendered : totalAmount,
      change_amount: change,
      reference: refInput,
    };
    onConfirm([tender]);
  };

  // Split mode helpers
  const splitTotal = tenders.reduce((s, t) => s + (t.amount - t.change_amount), 0);
  const splitRemaining = totalAmount - splitTotal;

  const addSplitTender = () => {
    if (!selectedChannel) return;
    const newTender: Tender = {
      payment_channel_id: selectedChannel.id,
      payment_method: selectedChannel.type === 'cash' ? 'cash' : selectedChannel.type,
      channel_name: selectedChannel.name,
      amount: splitRemaining > 0 ? splitRemaining : 0,
      change_amount: 0,
      reference: '',
    };
    setTenders([...tenders, newTender]);
  };

  const updateSplitTender = (idx: number, field: keyof Tender, value: string | number) => {
    const updated = [...tenders];
    (updated[idx] as any)[field] = value;
    setTenders(updated);
  };

  const removeSplitTender = (idx: number) => {
    setTenders(tenders.filter((_, i) => i !== idx));
  };

  const canConfirmSingle = isCash ? cashTendered >= totalAmount : true;
  const canConfirmSplit = Math.abs(splitRemaining) < 0.01 && tenders.length > 0;

  if (loadingChannels) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#1E293B] rounded-2xl p-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#F4511E] mx-auto" />
          <p className="text-gray-400 mt-3 text-sm">กำลังโหลดช่องทางชำระเงิน...</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div className="bg-[#1E293B] rounded-2xl p-8 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
          <p className="text-white text-center mb-2">ไม่พบช่องทางชำระเงิน POS</p>
          <p className="text-gray-400 text-sm text-center mb-4">กรุณาเพิ่มช่องทางชำระเงิน (กลุ่ม POS) ในหน้าตั้งค่า</p>
          <button onClick={onClose} className="w-full py-2 bg-white/10 text-white rounded-lg hover:bg-white/20">ปิด</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#1E293B] rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">ชำระเงิน</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Total */}
        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm">ยอดรวม</p>
          <p className="text-3xl font-bold text-[#F4511E]">฿{formatPrice(totalAmount)}</p>
        </div>

        {!splitMode ? (
          <>
            {/* Channel selector */}
            <div className="flex flex-wrap gap-2 mb-6">
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => { setSelectedChannel(ch); setCashInput(''); setRefInput(''); }}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selectedChannel?.id === ch.id
                      ? 'bg-[#F4511E] text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {ch.name}
                </button>
              ))}
            </div>

            {/* Cash UI */}
            {isCash && (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">รับมา (฿)</label>
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder={formatPrice(totalAmount)}
                    className="w-full px-4 py-3 bg-white/10 border border-gray-600 rounded-xl text-white text-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    autoFocus
                  />
                </div>

                {/* Denomination buttons */}
                <div className="flex flex-wrap gap-2">
                  {CASH_DENOMINATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setCashInput(String(d))}
                      className="px-4 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20 active:scale-95"
                    >
                      ฿{d}
                    </button>
                  ))}
                  <button
                    onClick={() => setCashInput(String(totalAmount))}
                    className="px-4 py-2 bg-[#F4511E]/20 rounded-lg text-[#F4511E] text-sm hover:bg-[#F4511E]/30 active:scale-95"
                  >
                    พอดี
                  </button>
                </div>

                {/* Change display */}
                {cashTendered > 0 && (
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-gray-400 text-sm">เงินทอน</p>
                    <p className={`text-2xl font-bold ${change > 0 ? 'text-green-400' : 'text-white'}`}>
                      ฿{formatPrice(change)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Non-cash UI */}
            {!isCash && selectedChannel && (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">
                    หมายเลขอ้างอิง (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    placeholder="เลข Ref, Approval code..."
                    className="w-full px-4 py-3 bg-white/10 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
              </div>
            )}

            {/* Split payment toggle */}
            <button
              onClick={() => setSplitMode(true)}
              className="w-full mt-4 py-2 text-gray-400 text-sm hover:text-white transition-colors"
            >
              แบ่งจ่ายหลายช่องทาง
            </button>

            {/* Confirm button */}
            <button
              onClick={handleConfirmSingle}
              disabled={!canConfirmSingle || loading}
              className="w-full mt-3 py-4 bg-[#F4511E] hover:bg-[#D63B0E] text-white font-bold text-lg rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> กำลังดำเนินการ...</>
              ) : (
                'ยืนยันชำระเงิน'
              )}
            </button>
          </>
        ) : (
          /* Split payment mode */
          <div>
            <div className="space-y-3 mb-4">
              {tenders.map((t, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <select
                    value={t.payment_channel_id}
                    onChange={(e) => {
                      const ch = channels.find(c => c.id === e.target.value);
                      if (ch) {
                        updateSplitTender(idx, 'payment_channel_id', ch.id);
                        updateSplitTender(idx, 'payment_method', ch.type === 'cash' ? 'cash' : ch.type);
                        updateSplitTender(idx, 'channel_name', ch.name);
                      }
                    }}
                    className="bg-white/10 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none"
                  >
                    {channels.map(ch => (
                      <option key={ch.id} value={ch.id} className="bg-[#1E293B]">{ch.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={t.amount || ''}
                    onChange={(e) => updateSplitTender(idx, 'amount', Number(e.target.value) || 0)}
                    placeholder="จำนวนเงิน"
                    className="flex-1 px-3 py-1.5 bg-white/10 border border-gray-600 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                  />
                  <button onClick={() => removeSplitTender(idx)} className="text-gray-400 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addSplitTender}
              className="w-full py-2 border border-dashed border-gray-600 rounded-xl text-gray-400 text-sm flex items-center justify-center gap-2 hover:border-gray-400 hover:text-white"
            >
              <Plus className="w-4 h-4" /> เพิ่มช่องทาง
            </button>

            {/* Split remaining */}
            <div className="mt-4 text-center">
              <p className="text-gray-400 text-sm">
                ยอดคงเหลือ: <span className={splitRemaining > 0.01 ? 'text-yellow-400' : 'text-green-400'}>
                  ฿{formatPrice(splitRemaining)}
                </span>
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setSplitMode(false); setTenders([]); }}
                className="flex-1 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
              >
                ย้อนกลับ
              </button>
              <button
                onClick={() => onConfirm(tenders)}
                disabled={!canConfirmSplit || loading}
                className="flex-1 py-3 bg-[#F4511E] hover:bg-[#D63B0E] text-white font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ยืนยัน'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
