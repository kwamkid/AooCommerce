'use client';

import { useState } from 'react';
import { Warehouse, Check } from 'lucide-react';
import WizardShell from '@/components/onboarding/WizardShell';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { apiFetch } from '@/lib/api-client';

export default function OnboardingWarehousePage() {
  // Prefill: use warehouse + name "คลังหลัก"
  const [useWarehouse, setUseWarehouse] = useState(true);
  const [name, setName] = useState('คลังหลัก');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [amphoe, setAmphoe] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');

  const handleNext = async () => {
    const body = useWarehouse
      ? {
          use_warehouse: true,
          name: name.trim() || 'คลังหลัก',
          address: address.trim() || null,
          district: district.trim() || null,
          amphoe: amphoe.trim() || null,
          province: province.trim() || null,
          postal_code: postalCode.trim() || null,
          phone: phone.trim() || null,
        }
      : { use_warehouse: false };

    const res = await apiFetch('/api/onboarding/warehouse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'บันทึกไม่สำเร็จ');
    }
  };

  const cardClass = (active: boolean) =>
    `relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
      active
        ? 'border-primary bg-primary/5 dark:bg-primary/10'
        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
    }`;

  return (
    <WizardShell step={2} onNext={handleNext}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ใช้ระบบคลังสินค้ามั้ย?</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">ติดตามจำนวนสต็อก, รับเข้า, ย้ายคลัง — เปิดใช้ภายหลังได้</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div onClick={() => setUseWarehouse(true)} className={cardClass(useWarehouse)}>
          {useWarehouse && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          )}
          <Warehouse className="w-7 h-7 mb-3 text-emerald-600 dark:text-emerald-400" />
          <div className="font-semibold text-gray-900 dark:text-white">ใช้ระบบคลัง</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mt-1.5">ติดตามสต็อกแยกตามสาขา รับเข้า ย้ายคลัง</div>
        </div>

        <div onClick={() => setUseWarehouse(false)} className={cardClass(!useWarehouse)}>
          {!useWarehouse && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          )}
          <div className="w-7 h-7 mb-3 rounded-full border-2 border-gray-300 dark:border-slate-600" />
          <div className="font-semibold text-gray-900 dark:text-white">ไม่ใช้ระบบคลัง</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mt-1.5">เน้นรับออเดอร์อย่างเดียว ไม่ track สต็อก</div>
        </div>
      </div>

      {useWarehouse && (
        <div className="space-y-4 p-5 rounded-xl bg-gray-50 dark:bg-slate-700/40">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อคลัง</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="คลังหลัก"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ (ไม่บังคับ)</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="เลขที่ ซอย ถนน"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <ThaiAddressInput
            district={district}
            amphoe={amphoe}
            province={province}
            postalCode={postalCode}
            onAddressChange={(addr) => {
              if (addr.district !== undefined) setDistrict(addr.district);
              if (addr.amphoe !== undefined) setAmphoe(addr.amphoe);
              if (addr.province !== undefined) setProvince(addr.province);
              if (addr.postalCode !== undefined) setPostalCode(addr.postalCode);
            }}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร (ไม่บังคับ)</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0XX-XXX-XXXX"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      )}
    </WizardShell>
  );
}
