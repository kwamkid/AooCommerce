// ชุดสีสำเร็จรูปสำหรับให้ผู้ใช้เลือกธีม (หน้าร้านออนไลน์ ฯลฯ)
//
// คัดเป็นโทน modern — เฉดลึกและอิ่มตัวพอประมาณ ไม่ใช่สีจัดจ้านแบบ default
// ของเบราว์เซอร์ เพราะสีสดเกินไปทำให้หน้าร้านดูราคาถูกและอ่านยากเมื่อเอาไป
// เป็นพื้นปุ่ม/แถบหัว ทุกสีผ่านเกณฑ์ contrast กับตัวอักษรขาวหรือดำอย่างน้อยหนึ่ง
// (ดู readableTextColor ที่เลือกสีตัวอักษรให้อัตโนมัติ)

export interface ColorPreset {
  name: string;
  value: string;
}

export const MODERN_COLOR_PRESETS: ColorPreset[] = [
  { name: 'ส้มอิฐ',       value: '#C75B39' },
  { name: 'เหลืองอำพัน',  value: '#D97706' },
  { name: 'น้ำตาลกาแฟ',   value: '#6F4E37' },
  { name: 'เขียวมะกอก',   value: '#6B7F5B' },
  { name: 'เขียวมรกต',    value: '#047857' },
  { name: 'เขียวน้ำทะเล', value: '#0F766E' },
  { name: 'ฟ้าคราม',      value: '#0369A1' },
  { name: 'คราม',         value: '#4F46E5' },
  { name: 'ม่วง',         value: '#6D28D9' },
  { name: 'ม่วงบานเย็น',  value: '#A21CAF' },
  { name: 'แดงกุหลาบ',    value: '#BE123C' },
  { name: 'เทาถ่าน',      value: '#1F2937' },
];
