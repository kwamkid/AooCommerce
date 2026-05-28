'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Button from '@/components/ui/Button';
import Modal from './Modal';
import { apiFetch } from '@/lib/api-client';

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

interface CarrierOption {
  id: string;
  code: string;
  name: string;
}

// Module-level cache so re-opening the modal doesn't re-fetch.
let cachedCarriers: CarrierOption[] | null = null;
let inflight: Promise<CarrierOption[]> | null = null;

async function loadCarriers(): Promise<CarrierOption[]> {
  if (cachedCarriers) return cachedCarriers;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await apiFetch('/api/carriers?active=true');
    if (!res.ok) throw new Error('โหลดรายชื่อขนส่งไม่สำเร็จ');
    const json = await res.json();
    const list: CarrierOption[] = (json.carriers || [])
      .filter((c: { code: string }) => c.code !== 'self' && c.code !== 'other' && c.code !== 'lalamove')
      .map((c: { id: string; code: string; name: string }) => ({ id: c.id, code: c.code, name: c.name }));
    // Always offer "อื่นๆ" so users can still type a free-form name.
    list.push({ id: '__other', code: 'other', name: 'อื่นๆ (ระบุเอง)' });
    cachedCarriers = list;
    return list;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
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
  const [carrierCode, setCarrierCode] = useState('');
  const [carrierCustom, setCarrierCustom] = useState('');
  const [tracking, setTracking] = useState(initialTracking || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);

  useEffect(() => {
    loadCarriers().then(list => {
      setCarriers(list);
      // Resolve initialCarrier (which may be a code OR a free-form name from old orders)
      if (initialCarrier) {
        const match = list.find(c => c.code === initialCarrier);
        if (match) {
          setCarrierCode(match.code);
        } else {
          setCarrierCode('other');
          setCarrierCustom(initialCarrier);
        }
      }
    }).catch(() => {
      // If carriers fail to load, keep modal usable — fallback to manual input.
      if (initialCarrier) {
        setCarrierCode('other');
        setCarrierCustom(initialCarrier);
      }
    });
  }, [initialCarrier]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Carrier wire format: prefer code; if "other", send the typed name as-is so existing
      // PDF code that does carrier_label fallback (label || raw code) still works.
      let carrier = '';
      if (method === 'courier') {
        carrier = carrierCode === 'other' ? carrierCustom.trim() : carrierCode;
      }
      await onSubmit({ method, carrier, tracking, notes });
    } finally {
      setSubmitting(false);
    }
  };

  const carrierOptions = carriers.map(c => ({ id: c.code, label: c.name }));

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="จัดส่งสินค้า"
      icon={<Send className="w-5 h-5 text-primary" />}
      size="md"
      disableBackdropClose={submitting}
      footer={
        <div className="flex gap-3 p-5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            loading={submitting}
            icon={<Send className="w-4 h-4" />}
          >
            จัดส่ง
          </Button>
        </div>
      }
    >
      <div className="p-5">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ขนส่ง</label>
                <FormSelect
                  value={carrierCode}
                  onChange={(v) => { setCarrierCode(v); if (v !== 'other') setCarrierCustom(''); }}
                  options={carrierOptions}
                  placeholder={carriers.length === 0 ? 'กำลังโหลด...' : 'เลือกขนส่ง'}
                  disabled={carriers.length === 0}
                />
              </div>
              {carrierCode === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ระบุชื่อขนส่ง</label>
                  <input type="text" value={carrierCustom} onChange={e => setCarrierCustom(e.target.value)}
                    placeholder="พิมพ์ชื่อขนส่ง"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
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
      </div>
    </Modal>
  );
}
