// Shared types for orders page components

export interface ItemPreview {
  product_name: string;
  variation_label?: string | null;
  subtitle?: string | null;
  quantity: number;
  image?: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  order_date: string;
  created_at: string;
  delivery_date?: string;
  total_amount: number;
  payment_status: string;
  payment_method?: string;
  order_status: string;
  fulfillment_status?: string;
  hold_reason?: string | null;
  tracking_number?: string | null;
  shipping_carrier?: string | null;
  is_split?: boolean;
  can_split_order?: boolean;
  parcel_count?: number;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  contact_person?: string;
  customer_phone?: string;
  delivery_name?: string;
  delivery_phone?: string;
  item_count: number;
  item_line_count: number;
  branch_count: number;
  branch_names?: string[];
  source?: string;
  external_status?: string;
  external_order_sn?: string;
  created_by?: string;
  created_by_name?: string | null;
  items_preview?: ItemPreview[];
  customer_picture_url?: string | null;
  tax_invoice_requested?: boolean;
  channel?: {
    platform: string;
    account_name: string;
    account_id: string;
    picture_url: string | null;
  } | null;
}

export interface ChannelOption {
  id: string;
  platform: string;
  name: string;
  picture_url: string | null;
}

export interface CreatedByOption {
  id: string;
  name: string;
}

// Status config
export const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; headerBg: string; headerText: string }> = {
  new: { label: 'ใหม่', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40', headerBg: 'bg-blue-50 dark:bg-blue-950/40', headerText: 'text-blue-800 dark:text-blue-200' },
  ready_to_ship: { label: 'รอกดรับ', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40', headerBg: 'bg-orange-50 dark:bg-orange-950/40', headerText: 'text-orange-800 dark:text-orange-200' },
  processing: { label: 'ที่ต้องจัดส่ง', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40', headerBg: 'bg-indigo-50 dark:bg-indigo-950/40', headerText: 'text-indigo-800 dark:text-indigo-200' },
  shipping: { label: 'กำลังส่ง', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40', headerBg: 'bg-amber-50 dark:bg-amber-950/40', headerText: 'text-amber-800 dark:text-amber-200' },
  completed: { label: 'สำเร็จ', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40', headerBg: 'bg-green-50 dark:bg-green-950/40', headerText: 'text-green-800 dark:text-green-200' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40', headerBg: 'bg-gray-50 dark:bg-gray-800/40', headerText: 'text-gray-600 dark:text-gray-300' },
};

export const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'รอชำระ', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  verifying: { label: 'รอตรวจสอบ', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  paid: { label: 'ชำระแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

export const SHIPPING_CARRIERS = [
  { value: 'thai_post', label: 'ไปรษณีย์ไทย' },
  { value: 'kerry', label: 'Kerry Express' },
  { value: 'flash', label: 'Flash Express' },
  { value: 'j&t', label: 'J&T Express' },
  { value: 'scg', label: 'SCG Express' },
  { value: 'ninja', label: 'Ninja Van' },
  { value: 'best', label: 'BEST Express' },
  { value: 'dhl', label: 'DHL' },
  { value: 'grab', label: 'Grab Express' },
  { value: 'lalamove', label: 'Lalamove' },
  { value: 'self', label: 'จัดส่งเอง' },
  { value: 'other', label: 'อื่นๆ' },
];

export const PLATFORM_ICONS: Record<string, string> = {
  line: '/social/line_oa.svg',
  facebook: '/social/facebook.svg',
  instagram: '/social/instagram.svg',
  shopee: '/marketplace/shopee.svg',
};

// Helper: relative time
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins}นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// Helper: deadline info
export function getDeadlineInfo(deliveryDate?: string): { label: string; color: string; urgent: boolean } | null {
  if (!deliveryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deliveryDate);
  deadline.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((deadline.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { label: `เลยกำหนด ${Math.abs(diffDays)} วัน`, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400', urgent: true };
  if (diffDays === 0) return { label: 'ส่งวันนี้', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400', urgent: true };
  if (diffDays === 1) return { label: 'ส่งพรุ่งนี้', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', urgent: false };
  return { label: `ส่งอีก ${diffDays} วัน`, color: 'text-gray-500 bg-gray-50 dark:bg-gray-800 dark:text-gray-400', urgent: false };
}

// Helper: classify delivery date group
export type DeliveryGroup = 'today' | 'tomorrow' | 'other' | 'on_hold';

export function classifyDeliveryGroup(order: Order): DeliveryGroup {
  if (order.fulfillment_status === 'on_hold') return 'on_hold';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (!order.delivery_date) return 'today'; // null = today

  const dd = new Date(order.delivery_date);
  dd.setHours(0, 0, 0, 0);

  if (dd.getTime() <= today.getTime()) return 'today'; // today or overdue
  if (dd.getTime() === tomorrow.getTime()) return 'tomorrow';
  return 'other';
}

export const DELIVERY_GROUP_CONFIG: Record<DeliveryGroup, { label: string; color: string; bgColor: string }> = {
  today: { label: 'ที่ต้องส่งวันนี้', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/40' },
  tomorrow: { label: 'ที่ต้องส่งพรุ่งนี้', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/40' },
  other: { label: 'ที่ต้องส่งวันอื่น', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/40' },
  on_hold: { label: 'พักไว้', color: 'text-gray-500 dark:text-gray-400', bgColor: 'bg-gray-200 dark:bg-gray-700/50' },
};
