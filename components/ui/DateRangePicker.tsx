'use client';

import Datepicker, { DateValueType } from 'react-tailwindcss-datepicker';

interface DateRangePickerProps {
  value: DateValueType;
  onChange: (value: DateValueType) => void;
  asSingle?: boolean;
  useRange?: boolean;
  showShortcuts?: boolean;
  showFooter?: boolean;
  placeholder?: string;
  displayFormat?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export default function DateRangePicker({
  value,
  onChange,
  asSingle = false,
  useRange = true,
  showShortcuts = true,
  showFooter = true,
  placeholder,
  displayFormat = 'DD/MM/YYYY',
  disabled = false,
  readOnly = false,
}: DateRangePickerProps) {
  return (
    <Datepicker
      value={value}
      onChange={onChange}
      asSingle={asSingle}
      useRange={useRange}
      showShortcuts={showShortcuts}
      showFooter={showFooter}
      placeholder={placeholder}
      displayFormat={displayFormat}
      disabled={disabled}
      readOnly={readOnly}
      primaryColor="amber"
      i18n="th"
      configs={{
        shortcuts: {
          today: 'วันนี้',
          yesterday: 'เมื่อวาน',
          past: (period: number) => `${period} วันที่แล้ว`,
          currentMonth: 'เดือนนี้',
          pastMonth: 'เดือนที่แล้ว',
        },
        footer: {
          cancel: 'ยกเลิก',
          apply: 'ตกลง',
        },
      }}
      inputClassName="w-full h-[42px] px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white text-gray-900 placeholder:text-gray-400"
      toggleClassName="absolute right-0 h-full px-3 text-amber-500 focus:outline-none"
      containerClassName="relative"
      classNames={{
        footer: () => "flex items-center justify-end pb-2.5 pt-2 px-4 gap-2",
      }}
    />
  );
}
