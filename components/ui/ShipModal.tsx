'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';

const SHIPPING_METHODS = [
  { id: 'own_vehicle', label: 'รถเราเอง' },
  { id: 'courier', label: 'ขนส่ง (Kerry, Flash, J&T, ฯลฯ)' },
  { id: 'lalamove', label: 'Lalamove' },
];

export interface ShipResult {
  method: string;
  carrier: string;
  tracking: string;
  notes: string;
}

interface ShipModalProps {
  orderNumber: string;
  customerName: string;
  onSubmit: (result: ShipResult) => Promise<void>;
  onClose: () => void;
  initialMethod?: string;
  initialCarrier?: string;
  initialTracking?: string;
}

/**
 * Shared shipping modal — used by dealer-orders, dept-wholesale, replenishments
 */
export default function ShipModal({ orderNumber, customerName, onSubmit, onClose, initialMethod, initialCarrier, initialTracking }: ShipModalProps) {
  const [method, setMethod] = useState(initialMethod || '');
  const [carrier, setCarrier] = useState(initialCarrier || '');
  const [tracking, setTracking] = useState(initialTracking || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ method, carrier, tracking, notes });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <Send className="w-5 h-5 text-primary" /> จัดส่งสินค้า
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">{orderNumber} — {customerName}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วิธีส่ง</label>
            <FormSelect
              value={method}
              onChange={setMethod}
              options={SHIPPING_METHODS}
              placeholder="เลือกวิธีส่ง"
            />
          </div>

          {method === 'courier' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อขนส่ง</label>
                <input type="text" value={carrier} onChange={e => setCarrier(e.target.value)}
                  placeholder="เช่น Kerry, Flash, J&T"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลข Tracking</label>
                <input type="text" value={tracking} onChange={e => setTracking(e.target.value)}
                  placeholder="เลขพัสดุ"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </>
          )}

          {method === 'lalamove' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรคนขับ / รายละเอียด</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="เบอร์โทรติดต่อ Lalamove"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}

          {method === 'own_vehicle' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
            ยกเลิก
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            จัดส่ง
          </button>
        </div>
      </div>
    </div>
  );
}
