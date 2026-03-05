'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import FormSelect from '@/components/ui/FormSelect';
import { Award, Plus, Trash2, Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BrandOption {
  id: string;
  name: string;
}

// ── Exported types ───────────────────────────────────────────────────────

export interface BrandGpRow {
  brand_id: string;
  brand_name?: string; // for display — resolved from allBrands
  gp_rate: string; // string so input is controlled without parseFloat on every keystroke
  gp_base_price: 'retail' | 'discounted';
}

// ── Props — always controlled ──────────────────────────────────────────────

interface Props {
  rows: BrandGpRow[];
  onRowsChange: (rows: BrandGpRow[]) => void;
  canEdit?: boolean;
  /** portal mode for FormSelect dropdown (use inside nested containers) */
  portal?: boolean;
  /** Show gp_base_price radio per row (default: true) */
  showBasePrice?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BrandGpCommissions({ rows, onRowsChange, canEdit = false, portal = false, showBasePrice = true }: Props) {
  const [allBrands, setAllBrands] = useState<BrandOption[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);

  useEffect(() => {
    apiFetch('/api/brands').then(r => r.ok ? r.json() : { data: [] }).then(d => {
      setAllBrands((d.data || []).map((b: BrandOption) => ({ id: b.id, name: b.name })));
    }).catch(() => {}).finally(() => setLoadingBrands(false));
  }, []);

  const usedBrandIds = new Set(rows.map(r => r.brand_id));
  const available = allBrands.filter(b => !usedBrandIds.has(b.id));

  // Resolve brand_name for display
  const resolvedRows = rows.map(r => ({
    ...r,
    brand_name: r.brand_name || allBrands.find(b => b.id === r.brand_id)?.name || '—',
  }));

  const addRow = (brandId: string) => {
    const brand = allBrands.find(b => b.id === brandId);
    onRowsChange([
      ...rows,
      { brand_id: brandId, brand_name: brand?.name, gp_rate: '', gp_base_price: 'retail' },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<BrandGpRow>) => {
    onRowsChange(rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeRow = (idx: number) => {
    onRowsChange(rows.filter((_, i) => i !== idx));
  };

  if (loadingBrands) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {resolvedRows.map((row, idx) => {
        const opts = allBrands.filter(b => b.id === row.brand_id || !usedBrandIds.has(b.id));
        return (
          <div key={idx} className="flex items-center gap-2">
            {/* Brand dropdown */}
            <div className="flex-1 min-w-0">
              <FormSelect
                value={row.brand_id}
                onChange={(id) => {
                  const brand = allBrands.find(b => b.id === id);
                  updateRow(idx, { brand_id: id, brand_name: brand?.name });
                }}
                options={opts.map(b => ({ id: b.id, label: b.name }))}
                placeholder="-- เลือกแบรนด์ --"
                disabled={!canEdit}
                portal={portal}
              />
            </div>
            {/* GP% input */}
            <div className="relative flex-shrink-0 w-20">
              <input
                type="number" min={0} max={100} step={0.1}
                value={row.gp_rate}
                onChange={e => updateRow(idx, { gp_rate: e.target.value })}
                placeholder="GP%"
                disabled={!canEdit}
                className="w-full px-2 py-2 pr-6 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#F4511E] disabled:opacity-50"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
            {/* Base price radio */}
            {showBasePrice && (
              <GpBaseRadio
                name={`gpbase_${idx}`}
                value={row.gp_base_price}
                onChange={(v) => updateRow(idx, { gp_base_price: v })}
                disabled={!canEdit}
              />
            )}
            {/* Delete */}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add row button */}
      {canEdit && available.length > 0 && (
        <AddBrandRow
          options={available}
          onAdd={addRow}
          portal={portal}
        />
      )}

      {rows.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-slate-500">
          ยังไม่มี GP เฉพาะแบรนด์
        </p>
      )}
    </div>
  );
}

// ── Add brand row ────────────────────────────────────────────────────────

function AddBrandRow({
  options,
  onAdd,
  portal,
}: {
  options: BrandOption[];
  onAdd: (brandId: string) => void;
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-sm text-[#F4511E] hover:text-[#D63B0E] transition-colors mt-1"
      >
        <Plus className="w-4 h-4" />
        เพิ่มแบรนด์
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 min-w-0">
        <FormSelect
          value=""
          onChange={(id) => { onAdd(id); setOpen(false); }}
          options={options.map(b => ({ id: b.id, label: b.name }))}
          placeholder="-- เลือกแบรนด์ --"
          portal={portal}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1"
      >
        ยกเลิก
      </button>
    </div>
  );
}

// ── Exported shared sub-components ────────────────────────────────────────

export function GpBaseRadio({
  name, value, onChange, disabled,
}: {
  name: string;
  value: 'retail' | 'discounted';
  onChange: (v: 'retail' | 'discounted') => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs flex-shrink-0">
      <label className={`flex items-center gap-1 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        <input type="radio" name={name} checked={value === 'retail'} onChange={() => !disabled && onChange('retail')} className="accent-[#F4511E]" disabled={disabled} />
        <span className="text-gray-600 dark:text-slate-400">ราคาปลีก</span>
      </label>
      <label className={`flex items-center gap-1 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        <input type="radio" name={name} checked={value === 'discounted'} onChange={() => !disabled && onChange('discounted')} className="accent-[#F4511E]" disabled={disabled} />
        <span className="text-gray-600 dark:text-slate-400">ราคาลด</span>
      </label>
    </div>
  );
}
