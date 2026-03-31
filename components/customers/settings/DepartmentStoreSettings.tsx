'use client';

import { Store } from 'lucide-react';

interface Props {
  saleType?: string;
}

export default function DepartmentStoreSettings({ saleType }: Props) {
  const isConsignment = saleType === 'consignment';

  return (
    <div className="card border border-purple-200 dark:border-purple-800/50">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <Store className="w-5 h-5 text-purple-600" />
        ตั้งค่าห้าง
      </h3>
      <div className="space-y-3">
        <div className="rounded-lg bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 p-3">
          <p className="text-sm text-purple-700 dark:text-purple-400">
            {isConsignment
              ? 'ห้างฝากขาย — ส่งของให้ห้าง แล้วออกใบแจ้งหนี้รายเดือน (ห้างจ่ายตาม Statement)'
              : 'ห้างขายขาด — เหมือนตัวแทนขายขาด มีทั้งเงินสดและเครดิต'
            }
          </p>
        </div>
        <p className="data-muted text-gray-400 dark:text-slate-500 text-sm">
          ตั้งค่าเพิ่มเติม เช่น รอบวางบิล, เงื่อนไขคอมมิชชัน, เงื่อนไขคืนสินค้า — จะเพิ่มในเวอร์ชันถัดไป
        </p>
      </div>
    </div>
  );
}
