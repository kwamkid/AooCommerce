'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import FormSelect from '@/components/ui/FormSelect';
import { Award, Plus, Trash2, Loader2, Percent } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BrandCommission {
  id: string;
  customer_id: string;
  brand_id: string;
  gp_rate: number;
  gp_base_price?: 'retail' | 'discounted' | null;
  brand?: { id: string; name: string } | null;
}

interface BrandOption {
  id: string;
  name: string;
  default_gp_rate?: number | null;
  gp_base_price?: 'retail' | 'discounted' | null;
}

// ── Exported types for controlled (global) mode ───────────────────────────

export interface BrandGpRow {
  brand_id: string;
  gp_rate: string; // string so input is controlled without parseFloat on every keystroke
  gp_base_price: 'retail' | 'discounted';
}

// ── Props ──────────────────────────────────────────────────────────────────

type Props =
  | {
      mode: 'global';
      /** Controlled: current rows */
      rows: BrandGpRow[];
      /** Called on any change — parent owns state */
      onRowsChange: (rows: BrandGpRow[]) => void;
      canEdit?: boolean;
      customerId?: never;
    }
  | {
      mode: 'customer';
      customerId: string;
      canEdit?: boolean;
      rows?: never;
      onRowsChange?: never;
    };

// ── Component ──────────────────────────────────────────────────────────────

export default function BrandGpCommissions(props: Props) {
  const { mode, canEdit = false } = props;
  const { confirmDialog, confirm } = useConfirmDialog();

  // allBrands needed in both modes (for dropdown options)
  const [allBrands, setAllBrands] = useState<BrandOption[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);

  // Customer mode only
  const [commissions, setCommissions] = useState<BrandCommission[]>([]);
  const [loadingCommissions, setLoadingCommissions] = useState(mode === 'customer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBrands();
    if (mode === 'customer') fetchCommissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mode === 'customer' ? props.customerId : null]);

  const fetchBrands = async () => {
    try {
      setLoadingBrands(true);
      const res = await apiFetch('/api/brands');
      if (res.ok) setAllBrands((await res.json()).data || []);
    } catch { /* ignore */ }
    finally { setLoadingBrands(false); }
  };

  const fetchCommissions = async () => {
    if (mode !== 'customer') return;
    try {
      setLoadingCommissions(true);
      const res = await apiFetch(`/api/customer-brand-commissions?customer_id=${props.customerId}`);
      if (res.ok) setCommissions((await res.json()).data || []);
    } catch { /* ignore */ }
    finally { setLoadingCommissions(false); }
  };

  // ── Global mode helpers ───────────────────────────────────────────────────

  const globalRows = mode === 'global' ? props.rows : [];
  const usedBrandIds = new Set(globalRows.map(r => r.brand_id));
  const availableForGlobal = allBrands.filter(b => !usedBrandIds.has(b.id));

  const addGlobalRow = () => {
    if (mode !== 'global' || availableForGlobal.length === 0) return;
    props.onRowsChange([
      ...props.rows,
      { brand_id: availableForGlobal[0].id, gp_rate: '', gp_base_price: 'retail' },
    ]);
  };

  const updateGlobalRow = (idx: number, patch: Partial<BrandGpRow>) => {
    if (mode !== 'global') return;
    const next = props.rows.map((r, i) => i === idx ? { ...r, ...patch } : r);
    props.onRowsChange(next);
  };

  const removeGlobalRow = (idx: number) => {
    if (mode !== 'global') return;
    props.onRowsChange(props.rows.filter((_, i) => i !== idx));
  };

  // ── Customer mode helpers ─────────────────────────────────────────────────

  const usedInCustomer = new Set(commissions.map(c => c.brand_id));
  const availableForCustomer = allBrands.filter(b => !usedInCustomer.has(b.id));

  const handleCustomerAdd = async (brandId: string) => {
    if (mode !== 'customer' || !brandId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/customer-brand-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: props.customerId,
          brand_id: brandId,
          gp_rate: 0,
          gp_base_price: 'retail',
        }),
      });
      if (!res.ok) throw new Error();
      await fetchCommissions();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleCustomerUpdate = async (c: BrandCommission, patch: { gp_rate?: number; gp_base_price?: 'retail' | 'discounted' }) => {
    if (mode !== 'customer') return;
    try {
      await apiFetch('/api/customer-brand-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: props.customerId,
          brand_id: c.brand_id,
          gp_rate: patch.gp_rate ?? c.gp_rate,
          gp_base_price: patch.gp_base_price ?? c.gp_base_price,
        }),
      });
      await fetchCommissions();
    } catch { /* ignore */ }
  };

  const handleCustomerDelete = async (c: BrandCommission) => {
    const ok = await confirm({ title: `ลบ GP override สำหรับ "${c.brand?.name}"?`, variant: 'danger' });
    if (!ok) return;
    try {
      await apiFetch(`/api/customer-brand-commissions?id=${c.id}`, { method: 'DELETE' });
      await fetchCommissions();
    } catch { /* ignore */ }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const loading = loadingBrands || loadingCommissions;

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">

      {/* ── GLOBAL MODE ── */}
      {mode === 'global' && (
        <>
          {globalRows.map((row, idx) => {
            const brand = allBrands.find(b => b.id === row.brand_id);
            // options: current brand + brands not yet used
            const opts = allBrands.filter(b => b.id === row.brand_id || !usedBrandIds.has(b.id));
            return (
              <div key={idx} className="flex items-center gap-2">
                {/* Brand dropdown */}
                <div className="flex-1 min-w-0">
                  <FormSelect
                    value={row.brand_id}
                    onChange={(id) => updateGlobalRow(idx, { brand_id: id })}
                    options={opts.map(b => ({ id: b.id, label: b.name }))}
                    placeholder="-- เลือกแบรนด์ --"
                    disabled={!canEdit}
                  />
                </div>
                {/* GP% input */}
                <div className="relative flex-shrink-0 w-20">
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={row.gp_rate}
                    onChange={e => updateGlobalRow(idx, { gp_rate: e.target.value })}
                    placeholder="GP%"
                    disabled={!canEdit}
                    className="w-full px-2 py-2 pr-6 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#F4511E] disabled:opacity-50"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {/* Base price radio */}
                <GpBaseRadio
                  name={`global_gpbase_${idx}`}
                  value={row.gp_base_price}
                  onChange={(v) => updateGlobalRow(idx, { gp_base_price: v })}
                  disabled={!canEdit}
                />
                {/* Delete */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeGlobalRow(idx)}
                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add row button */}
          {canEdit && availableForGlobal.length > 0 && (
            <button
              type="button"
              onClick={addGlobalRow}
              className="flex items-center gap-1 text-sm text-[#F4511E] hover:text-[#D63B0E] transition-colors mt-1"
            >
              <Plus className="w-4 h-4" />
              เพิ่มแบรนด์
            </button>
          )}

          {globalRows.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500">
              ยังไม่มี — กด &ldquo;เพิ่มแบรนด์&rdquo; เพื่อตั้งค่า GP เฉพาะแบรนด์
            </p>
          )}
        </>
      )}

      {/* ── CUSTOMER MODE ── */}
      {mode === 'customer' && (
        <>
          {commissions.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              {/* Brand name (read-only label) */}
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                  <Award className="w-3 h-3 text-[#F4511E]" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.brand?.name}</span>
              </div>
              {/* GP% input */}
              <div className="relative flex-shrink-0 w-20">
                <input
                  type="number" min={0} max={100} step={0.1}
                  defaultValue={c.gp_rate}
                  onBlur={e => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val !== c.gp_rate) handleCustomerUpdate(c, { gp_rate: val });
                  }}
                  disabled={!canEdit}
                  className="w-full px-2 py-1.5 pr-6 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#F4511E] disabled:opacity-50"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              {/* Base price radio */}
              <GpBaseRadio
                name={`customer_gpbase_${c.id}`}
                value={c.gp_base_price || 'retail'}
                onChange={(v) => handleCustomerUpdate(c, { gp_base_price: v })}
                disabled={!canEdit}
              />
              {/* Delete */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleCustomerDelete(c)}
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {/* Add brand row */}
          {canEdit && availableForCustomer.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 min-w-0">
                <FormSelect
                  value=""
                  onChange={handleCustomerAdd}
                  options={availableForCustomer.map(b => ({ id: b.id, label: b.name }))}
                  placeholder="+ เพิ่มแบรนด์..."
                  disabled={saving}
                />
              </div>
              {/* spacer to align with rows above */}
              <div className="w-20 flex-shrink-0" />
              <div className="flex-shrink-0" style={{ width: '6.5rem' }} />
              <div className="w-8 flex-shrink-0" />
            </div>
          )}

          {commissions.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500">
              ยังไม่มี GP override รายแบรนด์
            </p>
          )}
        </>
      )}

      {confirmDialog}
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
