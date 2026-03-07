'use client';

import { useState } from 'react';
import { X, Printer, Loader2, CheckSquare, Square } from 'lucide-react';

interface PrintOption {
  key: string;
  label: string;
  count: number;
  defaultChecked: boolean;
}

interface PrintAfterActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: PrintOption[];
  onPrint: (selectedKeys: string[]) => Promise<void>;
}

export default function PrintAfterActionModal({
  open,
  onClose,
  title,
  options,
  onPrint,
}: PrintAfterActionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(options.filter(o => o.defaultChecked).map(o => o.key))
  );
  const [printing, setPrinting] = useState(false);

  if (!open) return null;

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePrint = async () => {
    const keys = Array.from(selected);
    if (keys.length === 0) { onClose(); return; }
    setPrinting(true);
    try {
      await onPrint(keys);
      onClose();
    } catch {
      // error handled by caller
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">เลือกเอกสารที่ต้องการพิมพ์</p>
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={() => toggle(opt.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              {selected.has(opt.key)
                ? <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                : <Square className="w-5 h-5 text-gray-300 dark:text-slate-600 shrink-0" />
              }
              <span className="text-sm text-gray-700 dark:text-slate-200 flex-1">{opt.label}</span>
              <span className="text-xs text-gray-400 dark:text-slate-500">({opt.count})</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            disabled={printing}
            className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            ข้ามไปก่อน
          </button>
          <button
            onClick={handlePrint}
            disabled={printing || selected.size === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            พิมพ์ที่เลือก
          </button>
        </div>
      </div>
    </div>
  );
}
