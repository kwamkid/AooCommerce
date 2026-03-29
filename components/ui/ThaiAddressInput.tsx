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
  inputStyle?: React.CSSProperties;
  labelClassName?: string;
  dropdownClassName?: string;
  dropdownStyle?: React.CSSProperties;
  showLabels?: boolean;
  /** Error message for province field */
  provinceError?: string;
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
  inputStyle,
  labelClassName,
  dropdownClassName,
  provinceError,
  dropdownStyle,
  showLabels = true,
}: ThaiAddressInputProps) {
  const [suggestions, setSuggestions] = useState<ThaiAddress[]>([]);
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<FieldType, HTMLDivElement | null>>({
    district: null,
    amphoe: null,
    province: null,
    zipcode: null,
  });

  const handleSearch = useCallback((value: string, field: FieldType) => {
    if (value.length < 1) {
      setSuggestions([]);
      return;
    }
    const results = searchAddress(value, field, 8);
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

  // Position dropdown relative to the active input field
  useEffect(() => {
    if (suggestions.length > 0 && activeField && containerRef.current) {
      const fieldEl = fieldRefs.current[activeField];
      if (!fieldEl) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const fieldRect = fieldEl.getBoundingClientRect();
      const dropdownHeight = suggestions.length * 56; // ~56px per item (2-line wrapped)
      const spaceBelow = window.innerHeight - fieldRect.bottom;
      const shouldDropUp = spaceBelow < dropdownHeight + 8;
      setDropUp(shouldDropUp);
      // Calculate position relative to container
      const left = fieldRect.left - containerRect.left;
      // Use container width but align to the field's left edge; cap so dropdown doesn't overflow container right
      const maxWidth = containerRect.width - left;
      const width = maxWidth;
      if (shouldDropUp) {
        const bottom = containerRect.bottom - fieldRect.top;
        setDropdownPos({ bottom, left, width });
      } else {
        const top = fieldRect.bottom - containerRect.top;
        setDropdownPos({ top, left, width });
      }
    } else {
      setDropdownPos(null);
    }
  }, [suggestions, activeField]);

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

  const defaultInputClass = "w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800";
  const inputClass = inputClassName || defaultInputClass;
  const lblClass = labelClassName || "block text-base text-gray-600 dark:text-slate-400 mb-1";

  const defaultDropdownClass = "absolute z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-[70vh] overflow-y-auto overflow-x-hidden";
  const dropdownCls = dropdownClassName || defaultDropdownClass;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="grid grid-cols-2 gap-3" onKeyDown={handleKeyDown}>
        <div ref={(el) => { fieldRefs.current.district = el; }}>
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
            style={inputStyle}
          />
        </div>
        <div ref={(el) => { fieldRefs.current.amphoe = el; }}>
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
            style={inputStyle}
          />
        </div>
        <div ref={(el) => { fieldRefs.current.province = el; }}>
          {showLabels && <label className={lblClass}>จังหวัด <span className="text-red-500">*</span></label>}
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
            data-field="shipping_province"
            className={`${inputClass} ${provinceError ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            style={inputStyle}
          />
          {provinceError && <p className="text-red-500 text-xs mt-1">{provinceError}</p>}
        </div>
        <div ref={(el) => { fieldRefs.current.zipcode = el; }}>
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
            style={inputStyle}
          />
        </div>
      </div>

      {/* Dropdown suggestions */}
      {suggestions.length > 0 && activeField && dropdownPos && (
        <div
          ref={dropdownRef}
          className={dropdownCls}
          style={{
            ...(dropUp
              ? { bottom: dropdownPos.bottom, marginBottom: 4 }
              : { top: dropdownPos.top, marginTop: 4 }),
            left: dropdownPos.left,
            width: dropdownPos.width,
            right: 'auto',
            ...dropdownStyle,
          }}
        >
          {suggestions.map((addr, i) => (
            <button
              key={`${addr.district}-${addr.amphoe}-${addr.province}-${addr.zipcode}`}
              data-suggestion
              type="button"
              onClick={() => handleSelect(addr)}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors border-b last:border-b-0 ${
                dropdownStyle
                  ? (i === highlightIndex ? 'border-gray-100' : 'border-gray-100')
                  : (i === highlightIndex
                    ? 'bg-orange-50 dark:bg-slate-700 border-gray-100 dark:border-slate-700'
                    : 'hover:bg-orange-50 dark:hover:bg-slate-700 border-gray-100 dark:border-slate-700')
              }`}
              style={dropdownStyle ? {
                color: dropdownStyle.color,
                backgroundColor: i === highlightIndex ? '#fff7ed' : undefined,
                borderColor: dropdownStyle.borderColor || '#f3f4f6',
              } : undefined}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={dropdownStyle ? { color: '#9ca3af' } : undefined} />
              <div className="flex-1 min-w-0 leading-relaxed">
                <span className={activeField === 'district' ? 'font-medium text-primary' : ''} style={dropdownStyle && activeField !== 'district' ? { color: dropdownStyle.color } : undefined}>{addr.district}</span>
                <span className={dropdownStyle ? 'mx-0.5' : 'text-gray-400 mx-0.5'} style={dropdownStyle ? { color: '#9ca3af' } : undefined}>&raquo;</span>
                <span className={activeField === 'amphoe' ? 'font-medium text-primary' : ''} style={dropdownStyle && activeField !== 'amphoe' ? { color: dropdownStyle.color } : undefined}>{addr.amphoe}</span>
                <span className={dropdownStyle ? 'mx-0.5' : 'text-gray-400 mx-0.5'} style={dropdownStyle ? { color: '#9ca3af' } : undefined}>&raquo;</span>
                <span className={activeField === 'province' ? 'font-medium text-primary' : ''} style={dropdownStyle && activeField !== 'province' ? { color: dropdownStyle.color } : undefined}>{addr.province}</span>
                <span className={dropdownStyle ? 'mx-1' : 'text-gray-400 mx-1'} style={dropdownStyle ? { color: '#9ca3af' } : undefined}>&middot;</span>
                <span className={`${activeField === 'zipcode' ? 'font-medium text-primary' : (dropdownStyle ? '' : 'text-gray-500 dark:text-slate-400')}`} style={dropdownStyle && activeField !== 'zipcode' ? { color: '#6b7280' } : undefined}>{addr.zipcode}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
