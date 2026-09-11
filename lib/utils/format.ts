/**
 * Add comma separators every 3 digits (from the right).
 * e.g. 12900 → "12,900", 1234567 → "1,234,567"
 */
function addCommas(numStr: string): string {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format number as currency string with comma separators and 2 decimal places.
 * e.g. 12900 → "12,900.00", 150.5 → "150.50"
 */
export function formatPrice(amount: number | null | undefined): string {
  const num = amount || 0;
  const [intPart, decPart = ''] = num.toFixed(2).split('.');
  return addCommas(intPart) + '.' + decPart;
}

/**
 * Format number with comma separators (no decimals).
 * e.g. 12900 → "12,900"
 */
export function formatNumber(amount: number | null | undefined): string {
  const num = Math.round(amount || 0);
  return addCommas(num.toString());
}

/**
 * Format date string/Date as Thai short date. Single source of truth —
 * ห้ามเขียน toLocaleDateString('th-TH', ...) inline ในหน้า (เคยมี 16 สูตรปนกัน)
 * e.g. '2026-08-22' → "22 ส.ค. 2569" · null/invalid → "-"
 */
export function formatThaiDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Same as formatThaiDate but with HH:mm time.
 * e.g. → "22 ส.ค. 2569 14:30"
 */
export function formatThaiDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * วันเวลาแยกเป็นส่วน ๆ ให้วางเป็นช่อง (หน้ารายการที่วันที่ต้องเด่น เช่นกระดาษปฏิทินของบรอดแคสต์)
 * วันในสัปดาห์เป็นตัวย่ออังกฤษตัวใหญ่ ชุดเดียวกับหัวปฏิทินของ DateRangePicker · null/invalid → null
 * e.g. → { weekday: 'THU', day: '11', monthYear: 'ก.ย. 2569', time: '08:26' }
 */
export function formatDateParts(value: string | Date | null | undefined): {
  weekday: string;
  day: string;
  monthYear: string;
  time: string;
} | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    monthYear: d.toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  };
}
