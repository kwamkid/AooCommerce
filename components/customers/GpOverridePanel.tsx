'use client';

import { useState } from 'react';
import { Award, ChevronDown, ChevronUp } from 'lucide-react';
import BrandGpCommissions, { GpBaseRadio, type BrandGpRow } from '@/components/customers/BrandGpCommissions';

// Re-export for consumers
export type { BrandGpRow };

// ── Global mode (Settings > Consignment) ─────────────────────────────────────
interface GlobalProps {
  mode: 'global';
  gpRate: number;
  gpBasePrice: 'retail' | 'discounted';
  onGpRateChange: (v: number) => void;
  onGpBasePriceChange: (v: 'retail' | 'discounted') => void;
  brandGpRows: BrandGpRow[];
  onBrandGpRowsChange: (rows: BrandGpRow[]) => void;
  canEdit?: boolean;
  wholesale?: boolean;
}

// ── Customer mode (Customer detail page) ─────────────────────────────────────
interface CustomerProps {
  mode: 'customer';
  gpRate: number | null;
  gpBasePrice: 'retail' | 'discounted' | null;
  onGpRateChange: (v: number | null) => void;
  onGpBasePriceChange: (v: 'retail' | 'discounted') => void;
  brandGpRows: BrandGpRow[];
  onBrandGpRowsChange: (rows: BrandGpRow[]) => void;
  canEdit?: boolean;
  wholesale?: boolean;
  // Company defaults — for placeholder display
  defaultGpRate?: number;
  defaultGpBasePrice?: 'retail' | 'discounted';
}

type Props = GlobalProps | CustomerProps;

export default function GpOverridePanel(props: Props) {
  const { mode, gpRate, gpBasePrice, onGpRateChange, onGpBasePriceChange, canEdit = false, wholesale = false } = props;
  const defaultGpRate = mode === 'customer' ? (props as CustomerProps).defaultGpRate : undefined;
  const defaultGpBasePrice = mode === 'customer' ? (props as CustomerProps).defaultGpBasePrice : undefined;
  const [gpExpanded, setGpExpanded] = useState(false);

  const brandGpRows = props.brandGpRows;
  const brandCount = brandGpRows.filter(r => r.brand_id && r.gp_rate !== '').length;

  const isGlobal = mode === 'global';
  const termLabel = wholesale ? 'ส่วนลด' : 'GP%';
  const defaultLabel = isGlobal ? `${termLabel} Default` : `${termLabel} Default (ลูกค้านี้)`;
  const defaultDesc  = isGlobal ? 'ใช้เมื่อไม่มีค่าเฉพาะแบรนด์หรือลูกค้า' : 'ถ้าว่าง = ใช้ค่า default บริษัท';

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/50">

      {/* GP% Default row */}
      <div className={`flex items-center gap-4 px-4 py-3 bg-amber-50/40 dark:bg-amber-900/10 ${gpExpanded ? '' : 'rounded-b-xl'}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{defaultLabel}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{defaultDesc}</p>
        </div>
        <GpBaseRadio
          name={`gp_base_price_${mode}`}
          value={gpBasePrice || 'retail'}
          onChange={onGpBasePriceChange}
          disabled={!canEdit}
        />
        <div className="relative w-24 flex-shrink-0">
          <input
            type="number"
            value={gpRate ?? ''}
            onChange={(e) => {
              if (isGlobal) {
                (onGpRateChange as (v: number) => void)(parseFloat(e.target.value) || 0);
              } else {
                (onGpRateChange as (v: number | null) => void)(e.target.value === '' ? null : parseFloat(e.target.value));
              }
            }}
            className="w-full px-3 py-1.5 pr-7 border border-amber-300 dark:border-amber-700/50 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
            min="0" max="100" step="0.5"
            placeholder={isGlobal ? undefined : '—'}
            disabled={!canEdit}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
        </div>
      </div>

      {/* Expand button: GP% เฉพาะแบรนด์ */}
      <button
        type="button"
        onClick={() => setGpExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-amber-200 dark:border-amber-800/50 hover:bg-amber-50/60 dark:hover:bg-amber-900/10 transition-colors text-left"
      >
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Award className="w-4 h-4" />
          {termLabel} เฉพาะแบรนด์
          {brandCount > 0 && (
            <span className="text-xs font-normal text-gray-400 dark:text-slate-500">
              ({brandCount} แบรนด์)
            </span>
          )}
        </span>
        {gpExpanded
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        }
      </button>

      {gpExpanded && (
        <div className="border-t border-amber-200 dark:border-amber-800/50 px-4 py-3 rounded-b-xl">
          <BrandGpCommissions
            rows={brandGpRows}
            onRowsChange={props.onBrandGpRowsChange}
            canEdit={canEdit}
            portal={mode === 'customer'}
            showBasePrice
          />
        </div>
      )}

    </div>
  );
}
