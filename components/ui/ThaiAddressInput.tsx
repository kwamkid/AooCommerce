'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchAddress, ThaiAddress } from '@/lib/thai-address-data';
import { MapPin } from 'lucide-react';

interface ThaiAddressInputProps {
  district: string;
  amphoe: string;
  province: string;
  postalCode: string;
  onAddressChange: (address: Partial<{ district: string; amphoe: string; province: string; postalCode: string }>) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  dropdownClassName?: string;
  showLabels?: boolean;
}

type FieldType = 'district' | 'amphoe' | 'province' | 'zipcode';

export default function ThaiAddressInput({
  district,
  amphoe,
  province,
  postalCode,
  onAddressChange,
  disabled = false,
  className = '',
  inputClassName,
  labelClassName,
  dropdownClassName,
  showLabels = true,
}: ThaiAddressInputProps) {
  const [suggestions, setSuggestions] = useState<ThaiAddress[]>([]);
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback((value: string, field: FieldType) => {
    if (value.length < 1) {
      setSuggestions([]);
      return;
    }
    const results = searchAddress(value, field, 20);
    setSuggestions(results);
    setHighlightIndex(-1);
  }, []);

  const handleSelect = useCallback((addr: ThaiAddress) => {
    onAddressChange({
      district: addr.district,
      amphoe: addr.amphoe,
      province: addr.province,
      postalCode: String(addr.zipcode),
    });
    setSuggestions([]);
    setActiveField(null);
  }, [onAddressChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setActiveField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if dropdown should open upward
  useEffect(() => {
    if (suggestions.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = Math.min(suggestions.length * 40, 240); // max-h-60 = 240px
      setDropUp(spaceBelow < dropdownHeight + 8);
    }
  }, [suggestions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveField(null);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-suggestion]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const defaultInputClass = "w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] disabled:bg-gray-100 dark:disabled:bg-slate-800";
  const inputClass = inputClassName || defaultInputClass;
  const lblClass = labelClassName || "block text-sm text-gray-600 dark:text-slate-400 mb-1";

  const defaultDropdownClass = "absolute z-50 left-0 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto";
  const dropdownCls = dropdownClassName || defaultDropdownClass;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="grid grid-cols-2 gap-3" onKeyDown={handleKeyDown}>
        <div>
          {showLabels && <label className={lblClass}>ตำบล/แขวง</label>}
          <input
            type="text"
            value={district}
            onChange={(e) => {
              onAddressChange({ district: e.target.value });
              setActiveField('district');
              handleSearch(e.target.value, 'district');
            }}
            onFocus={() => {
              if (district) {
                setActiveField('district');
                handleSearch(district, 'district');
              }
            }}
            placeholder="พิมพ์ตำบล/แขวง"
            disabled={disabled}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          {showLabels && <label className={lblClass}>อำเภอ/เขต</label>}
          <input
            type="text"
            value={amphoe}
            onChange={(e) => {
              onAddressChange({ amphoe: e.target.value });
              setActiveField('amphoe');
              handleSearch(e.target.value, 'amphoe');
            }}
            onFocus={() => {
              if (amphoe) {
                setActiveField('amphoe');
                handleSearch(amphoe, 'amphoe');
              }
            }}
            placeholder="พิมพ์อำเภอ/เขต"
            disabled={disabled}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          {showLabels && <label className={lblClass}>จังหวัด</label>}
          <input
            type="text"
            value={province}
            onChange={(e) => {
              onAddressChange({ province: e.target.value });
              setActiveField('province');
              handleSearch(e.target.value, 'province');
            }}
            onFocus={() => {
              if (province) {
                setActiveField('province');
                handleSearch(province, 'province');
              }
            }}
            placeholder="พิมพ์จังหวัด"
            disabled={disabled}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          {showLabels && <label className={lblClass}>รหัสไปรษณีย์</label>}
          <input
            type="text"
            value={postalCode}
            onChange={(e) => {
              onAddressChange({ postalCode: e.target.value });
              setActiveField('zipcode');
              handleSearch(e.target.value, 'zipcode');
            }}
            onFocus={() => {
              if (postalCode) {
                setActiveField('zipcode');
                handleSearch(postalCode, 'zipcode');
              }
            }}
            placeholder="10xxx"
            disabled={disabled}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      </div>

      {/* Dropdown suggestions */}
      {suggestions.length > 0 && activeField && (
        <div
          ref={dropdownRef}
          className={dropdownCls}
          style={dropUp ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }}
        >
          {suggestions.map((addr, i) => (
            <button
              key={`${addr.district}-${addr.amphoe}-${addr.province}-${addr.zipcode}`}
              data-suggestion
              type="button"
              onClick={() => handleSelect(addr)}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors border-b last:border-b-0 ${
                i === highlightIndex
                  ? 'bg-orange-50 dark:bg-slate-700 border-gray-100 dark:border-slate-700'
                  : 'hover:bg-orange-50 dark:hover:bg-slate-700 border-gray-100 dark:border-slate-700'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className={activeField === 'district' ? 'font-medium text-[#F4511E]' : ''}>{addr.district}</span>
                <span className="text-gray-400 mx-1">&raquo;</span>
                <span className={activeField === 'amphoe' ? 'font-medium text-[#F4511E]' : ''}>{addr.amphoe}</span>
                <span className="text-gray-400 mx-1">&raquo;</span>
                <span className={activeField === 'province' ? 'font-medium text-[#F4511E]' : ''}>{addr.province}</span>
                <span className="text-gray-400 mx-1.5">&middot;</span>
                <span className={`${activeField === 'zipcode' ? 'font-medium text-[#F4511E]' : 'text-gray-500 dark:text-slate-400'}`}>{addr.zipcode}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
