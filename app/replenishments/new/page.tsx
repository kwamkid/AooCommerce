'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { ArrowLeft, ArrowUpFromLine, Warehouse } from 'lucide-react';
import Link from 'next/link';
import ReplenishmentForm from '@/components/replenishments/ReplenishmentForm';
import FormSelect from '@/components/ui/FormSelect';
import { apiFetch } from '@/lib/api-client';

interface WarehouseItem {
  id: string;
  name: string;
  is_default: boolean;
}

export default function NewReplenishmentPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  useEffect(() => {
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(d => {
        const whs: WarehouseItem[] = d.warehouses || [];
        setWarehouses(whs);
        const def = whs.find(w => w.is_default) || whs[0];
        if (def) setSelectedWarehouseId(def.id);
      })
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/replenishments"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <ArrowUpFromLine className="w-6 h-6 text-[#F4511E]" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างใบเติมสินค้า</h1>
          </div>
        </div>

        {/* Warehouse picker */}
        {warehouses.length > 0 && (
          <div className="inline-block min-w-[160px]">
            <FormSelect
              value={selectedWarehouseId}
              onChange={setSelectedWarehouseId}
              options={warehouses.map(w => ({
                id: w.id,
                label: `${w.is_default ? '⭐ ' : ''}${w.name}`,
              }))}
              icon={<Warehouse className="w-4 h-4" />}
              placeholder="-- เลือกคลัง --"
              searchThreshold={99}
            />
          </div>
        )}

        <ReplenishmentForm warehouseId={selectedWarehouseId} />
      </div>
    </Layout>
  );
}
