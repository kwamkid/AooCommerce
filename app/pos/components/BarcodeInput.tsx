// Path: app/pos/components/BarcodeInput.tsx
'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Search, Camera } from 'lucide-react';
import dynamic from 'next/dynamic';

const CameraScanner = dynamic(() => import('./CameraScanner'), { ssr: false });

interface BarcodeInputProps {
  onBarcodeScan: (barcode: string) => void;
  onSearchChange: (search: string) => void;
  searchValue: string;
  disabled?: boolean;
}

export default function BarcodeInput({ onBarcodeScan, onSearchChange, searchValue, disabled }: BarcodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeystrokeTime = useRef<number>(0);
  const barcodeBuffer = useRef<string>('');
  const [showCamera, setShowCamera] = useState(false);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const timeSinceLastKey = now - lastKeystrokeTime.current;

    if (e.key === 'Enter') {
      e.preventDefault();
      // Use barcode buffer (rapid input from scanner) or fall back to current input value
      const code = barcodeBuffer.current.length >= 3
        ? barcodeBuffer.current
        : searchValue.trim();

      if (code.length >= 1) {
        onBarcodeScan(code);
        barcodeBuffer.current = '';
      }
      barcodeBuffer.current = '';
      return;
    }

    // Barcode scanners type very fast (< 50ms between keystrokes)
    if (timeSinceLastKey < 50 && e.key.length === 1) {
      barcodeBuffer.current += e.key;
    } else if (e.key.length === 1) {
      barcodeBuffer.current = e.key;
    }

    lastKeystrokeTime.current = now;
  }, [onBarcodeScan, onSearchChange, searchValue]);

  // Auto-focus on mount
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [disabled]);

  // Refocus on keydown (for barcode scanner — scanners send keystrokes even when input not focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inputRef.current && !disabled && document.activeElement !== inputRef.current) {
        // Don't steal focus from modals (inputs/textareas/selects inside overlays)
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
          return;
        }
        // Don't steal focus if a modal overlay is open (z-50 fixed elements)
        const modal = document.querySelector('.fixed.inset-0.z-50');
        if (modal) return;

        // Only refocus for printable characters or Enter (barcode scanner)
        if (e.key.length === 1 || e.key === 'Enter') {
          inputRef.current.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled]);

  const handleCameraScan = (code: string) => {
    onBarcodeScan(code);
  };

  return (
    <>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ค้นหาชื่อ, รหัส, SKU หรือสแกนบาร์โค้ด..."
            disabled={disabled}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent text-base"
          />
        </div>
        <button
          onClick={() => setShowCamera(true)}
          disabled={disabled}
          className="px-3 bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/20 transition-colors disabled:opacity-30 flex-shrink-0"
          title="สแกนด้วยกล้อง"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      {showCamera && (
        <CameraScanner
          onScan={handleCameraScan}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}
