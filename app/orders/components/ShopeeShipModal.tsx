'use client';

import { useState, useEffect } from 'react';
import { Package, Truck, MapPin, Clock, X, Loader2, CheckCircle2 } from 'lucide-react';

interface TimeSlot {
  pickup_time_id: string;
  date: number;
  is_recommended: boolean;
}

interface PickupAddress {
  address_id: number;
  address_flag?: string[];
  time_slots: TimeSlot[];
}

interface Branch {
  branch_id: number;
  address?: string;
  city?: string;
  district?: string;
}

interface ShippingMode {
  mode: 'pickup' | 'dropoff' | 'non_integrated';
  label: string;
  details?: {
    addresses?: PickupAddress[];
    branches?: Branch[];
  };
}

interface Props {
  orderId: string;
  orderSn: string;
  onClose: () => void;
  onSuccess: () => void;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ShopeeShipModal({ orderId, orderSn, onClose, onSuccess, apiFetch, showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [modes, setModes] = useState<ShippingMode[]>([]);
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [error, setError] = useState<string>('');

  // Fetch shipping options on mount
  useEffect(() => {
    fetchShippingOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchShippingOptions = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch('/api/shopee/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถดึงข้อมูลขนส่งได้');

      setModes(data.modes || []);

      // Auto-select if only one mode
      if (data.modes?.length === 1) {
        const m = data.modes[0];
        setSelectedMode(m.mode);
        if (m.mode === 'pickup' && m.details?.addresses?.[0]) {
          setSelectedAddressId(m.details.addresses[0].address_id);
          const recommended = m.details.addresses[0].time_slots?.find((ts: TimeSlot) => ts.is_recommended);
          if (recommended) setSelectedTimeSlotId(recommended.pickup_time_id);
          else if (m.details.addresses[0].time_slots?.[0]) setSelectedTimeSlotId(m.details.addresses[0].time_slots[0].pickup_time_id);
        }
        if (m.mode === 'dropoff' && m.details?.branches?.[0]) {
          setSelectedBranchId(m.details.branches[0].branch_id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMode = (mode: string) => {
    setSelectedMode(mode);
    const m = modes.find(m => m.mode === mode);
    if (mode === 'pickup' && m?.details?.addresses?.[0]) {
      setSelectedAddressId(m.details.addresses[0].address_id);
      const recommended = m.details.addresses[0].time_slots?.find(ts => ts.is_recommended);
      if (recommended) setSelectedTimeSlotId(recommended.pickup_time_id);
      else if (m.details.addresses[0].time_slots?.[0]) setSelectedTimeSlotId(m.details.addresses[0].time_slots[0].pickup_time_id);
    }
    if (mode === 'dropoff' && m?.details?.branches?.[0]) {
      setSelectedBranchId(m.details.branches[0].branch_id);
    }
  };

  const handleShip = async () => {
    try {
      setShipping(true);
      const res = await apiFetch('/api/shopee/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          mode: selectedMode,
          ...(selectedMode === 'pickup' && selectedAddressId ? { address_id: selectedAddressId } : {}),
          ...(selectedMode === 'pickup' && selectedTimeSlotId ? { pickup_time_id: selectedTimeSlotId } : {}),
          ...(selectedMode === 'dropoff' && selectedBranchId ? { branch_id: selectedBranchId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'รับออเดอร์ไม่สำเร็จ');
      showToast('รับออเดอร์ Shopee สำเร็จ');
      onSuccess();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShipping(false);
    }
  };

  const canShip = selectedMode && (
    selectedMode === 'non_integrated' ||
    (selectedMode === 'pickup' && selectedTimeSlotId) ||
    (selectedMode === 'dropoff' && selectedBranchId)
  );

  const selectedModeObj = modes.find(m => m.mode === selectedMode);

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !shipping && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">รับออเดอร์ Shopee</h3>
            <p className="text-sm text-gray-500">{orderSn}</p>
          </div>
          <button onClick={onClose} disabled={shipping} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">กำลังดึงข้อมูลขนส่ง...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">{error}</p>
              <button onClick={fetchShippingOptions} className="text-sm text-blue-600 hover:underline">ลองใหม่</button>
            </div>
          ) : modes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">ไม่พบตัวเลือกขนส่ง</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 mb-2">เลือกวิธีจัดส่ง</p>

              {modes.map(m => (
                <div key={m.mode}>
                  <button
                    onClick={() => handleSelectMode(m.mode)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      selectedMode === m.mode
                        ? 'border-[#F4511E] bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${selectedMode === m.mode ? 'bg-[#F4511E] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {m.mode === 'pickup' && <Truck className="w-5 h-5" />}
                      {m.mode === 'dropoff' && <MapPin className="w-5 h-5" />}
                      {m.mode === 'non_integrated' && <Package className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{m.label}</p>
                      {m.mode === 'pickup' && <p className="text-xs text-gray-500">ขนส่งมารับพัสดุที่ที่อยู่ของคุณ</p>}
                      {m.mode === 'dropoff' && <p className="text-xs text-gray-500">นำพัสดุไปส่งที่จุดรับพัสดุ</p>}
                      {m.mode === 'non_integrated' && <p className="text-xs text-gray-500">จัดส่งด้วยขนส่งของคุณเอง</p>}
                    </div>
                    {selectedMode === m.mode && <CheckCircle2 className="w-5 h-5 text-[#F4511E]" />}
                  </button>

                  {/* Pickup: time slot selection */}
                  {selectedMode === 'pickup' && m.mode === 'pickup' && m.details?.addresses?.[0]?.time_slots && (
                    <div className="mt-2 ml-4 pl-4 border-l-2 border-orange-200">
                      <p className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <Clock className="w-4 h-4" /> เลือกเวลารับพัสดุ
                      </p>
                      <div className="space-y-1.5">
                        {m.details.addresses[0].time_slots.map(ts => (
                          <button
                            key={ts.pickup_time_id}
                            onClick={() => setSelectedTimeSlotId(ts.pickup_time_id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                              selectedTimeSlotId === ts.pickup_time_id
                                ? 'bg-[#F4511E] text-white'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {formatDate(ts.date)}
                            {ts.is_recommended && (
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                selectedTimeSlotId === ts.pickup_time_id ? 'bg-white/20' : 'bg-green-100 text-green-700'
                              }`}>แนะนำ</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dropoff: branch selection */}
                  {selectedMode === 'dropoff' && m.mode === 'dropoff' && m.details?.branches && m.details.branches.length > 1 && (
                    <div className="mt-2 ml-4 pl-4 border-l-2 border-orange-200">
                      <p className="text-sm font-medium text-gray-600 mb-2">เลือกสาขา</p>
                      <div className="space-y-1.5">
                        {m.details.branches.map(b => (
                          <button
                            key={b.branch_id}
                            onClick={() => setSelectedBranchId(b.branch_id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                              selectedBranchId === b.branch_id
                                ? 'bg-[#F4511E] text-white'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {b.address || `สาขา ${b.branch_id}`}
                            {b.city && <span className="opacity-70"> — {b.city}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && modes.length > 0 && (
          <div className="px-5 py-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={shipping}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleShip}
              disabled={!canShip || shipping}
              className="px-5 py-2 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {shipping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังรับออเดอร์...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  รับออเดอร์
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
