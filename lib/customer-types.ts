// ─────────────────────────────────────────────────────────────────────────────
// ประเภทลูกค้า — แหล่งความจริงเดียวของ label · สี · การจัดกลุ่ม
//
// ทำไมต้องรวมไว้ที่เดียว: ชื่อประเภทเดียวกันเคยถูกพิมพ์ซ้ำในหน้า /customers ·
// ฟอร์มลูกค้า · หน้ารายงาน แล้วเพี้ยนกันเอง ("ตัวแทน" กับ "ตัวแทนฝากขาย" คนละที่)
// แก้คำที่นี่ที่เดียวแล้วเปลี่ยนทั้งระบบ
//
// หมายเหตุเรื่องแกนข้อมูล: "ตัวแทน/ห้าง แบบไหน" ตัดสินจาก **สองคอลัมน์**
//   customer_type = เป็นใคร (ตัวแทนฝากขาย · ตัวแทนขายขาด · ห้างฝากขาย · ห้างขายขาด)
//   sale_type     = ซื้อยังไง (wholesale_cash = เงินสด · wholesale_credit = เครดิต)
// ฝากขายไม่มี sale_type เพราะไม่ใช่การซื้อ — เก็บเงินเมื่อขายได้ (สัญญา ม.78(3))
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeTone =
  | 'gray' | 'red' | 'amber' | 'emerald' | 'blue' | 'indigo' | 'purple' | 'orange';

export interface CustomerTypeConfig {
  label: string;
  tone: BadgeTone;
}

export const CUSTOMER_TYPES: Record<string, CustomerTypeConfig> = {
  // ปลีก
  retail: { label: 'ลูกค้าปลีก', tone: 'blue' },
  dropship: { label: 'Dropship', tone: 'blue' },
  affiliate: { label: 'Affiliate', tone: 'purple' },
  // ตัวแทน (ฟีเจอร์ consignment)
  consignment_dealer: { label: 'ตัวแทนฝากขาย', tone: 'amber' },
  wholesale_dealer: { label: 'ตัวแทนขายขาด', tone: 'orange' },
  dealer: { label: 'ตัวแทน', tone: 'amber' },
  // ห้าง (ฟีเจอร์ department_store)
  department_store: { label: 'ห้างฝากขาย', tone: 'purple' },
  wholesale_department: { label: 'ห้างขายขาด', tone: 'red' },
  // องค์กร
  corporate: { label: 'องค์กร/B2B', tone: 'gray' },
  credit: { label: 'เครดิต (legacy)', tone: 'gray' },
};

export function customerTypeConfig(type: string | null | undefined): CustomerTypeConfig {
  return CUSTOMER_TYPES[type || ''] || { label: type || 'ไม่ระบุ', tone: 'gray' };
}

/** ประเภทลูกค้าที่จัดอยู่ในกลุ่ม "ตัวแทนจำหน่าย" · "ห้างสรรพสินค้า" */
export const DEALER_TYPES = ['consignment_dealer', 'wholesale_dealer', 'dealer'] as const;
export const DEPARTMENT_TYPES = ['department_store', 'wholesale_department'] as const;

export interface CustomerTypeTab {
  id: string;
  label: string;
  /** ค่าที่ส่งไป `?type=` (ว่าง = ไม่กรอง) */
  types: string[];
  /** ค่าที่ส่งไป `?sale_type=` — ใช้แยกเงินสด/เครดิตของสายขายขาด */
  saleType?: string;
  requiredFeature?: 'consignment' | 'department_store';
}

/** แท็บของหน้า /customers (รวมทุกกลุ่ม) */
export const ALL_CUSTOMER_TABS: CustomerTypeTab[] = [
  { id: 'all', label: 'ทั้งหมด', types: [] },
  { id: 'retail', label: 'ลูกค้าปลีก', types: ['retail', 'dropship', 'affiliate'] },
  { id: 'dealer', label: 'ตัวแทน', types: [...DEALER_TYPES], requiredFeature: 'consignment' },
  { id: 'dept', label: 'ห้าง', types: [...DEPARTMENT_TYPES], requiredFeature: 'department_store' },
  { id: 'corporate', label: 'องค์กร/B2B', types: ['corporate', 'credit'] },
];

/**
 * ขอบเขตของหน้ารายชื่อลูกค้า — หน้าเดียวกันใช้ได้ทั้ง 3 ที่ ต่างกันแค่ชุดแท็บกับหัวเรื่อง
 * (`/customers` · `/consignment/customers` · `/department-store/customers`)
 */
export type CustomerScope = 'all' | 'dealer' | 'department';

export interface CustomerScopeConfig {
  title: string;
  subtitle: string;
  /** ประเภทที่หน้านี้แสดงเท่านั้น — ว่าง = ทุกประเภท */
  lockedTypes: string[];
  tabs: CustomerTypeTab[];
  /** path ของหน้านี้ ใช้ทั้ง syncUrl และปุ่มเพิ่มลูกค้า */
  basePath: string;
  /** ประเภทตั้งต้นตอนกดเพิ่มลูกค้าจากหน้านี้ */
  defaultNewType?: string;
  requiredFeature?: 'consignment' | 'department_store';
}

const CASH_LABEL = 'ขายขาดเงินสด';
const CREDIT_LABEL = 'ขายขาดเครดิต';

export const CUSTOMER_SCOPES: Record<CustomerScope, CustomerScopeConfig> = {
  all: {
    title: 'ลูกค้า',
    subtitle: 'จัดการข้อมูลลูกค้าและความสัมพันธ์',
    lockedTypes: [],
    tabs: ALL_CUSTOMER_TABS,
    basePath: '/customers',
  },
  dealer: {
    title: 'ลูกค้าตัวแทน',
    subtitle: 'ตัวแทนฝากขาย · ขายขาดเงินสด · ขายขาดเครดิต',
    lockedTypes: [...DEALER_TYPES],
    basePath: '/consignment/customers',
    defaultNewType: 'consignment_dealer',
    requiredFeature: 'consignment',
    tabs: [
      { id: 'all', label: 'ทั้งหมด', types: [...DEALER_TYPES] },
      { id: 'consign', label: 'ฝากขาย', types: ['consignment_dealer', 'dealer'] },
      { id: 'cash', label: CASH_LABEL, types: ['wholesale_dealer'], saleType: 'wholesale_cash' },
      { id: 'credit', label: CREDIT_LABEL, types: ['wholesale_dealer'], saleType: 'wholesale_credit' },
    ],
  },
  department: {
    title: 'ลูกค้าห้าง',
    subtitle: 'ห้างฝากขาย · ขายขาดเงินสด · ขายขาดเครดิต',
    lockedTypes: [...DEPARTMENT_TYPES],
    basePath: '/department-store/customers',
    defaultNewType: 'department_store',
    requiredFeature: 'department_store',
    tabs: [
      { id: 'all', label: 'ทั้งหมด', types: [...DEPARTMENT_TYPES] },
      { id: 'consign', label: 'ฝากขาย', types: ['department_store'] },
      { id: 'cash', label: CASH_LABEL, types: ['wholesale_department'], saleType: 'wholesale_cash' },
      { id: 'credit', label: CREDIT_LABEL, types: ['wholesale_department'], saleType: 'wholesale_credit' },
    ],
  },
};
