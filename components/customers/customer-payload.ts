/**
 * รูปร่างข้อมูลฟอร์มลูกค้า + ตัวประกอบ payload ส่ง API — **pure ล้วน ไม่มี React/UI**
 *
 * WHY แยกออกมาจาก CustomerForm.tsx: หน้าที่ต้องการแค่ type กับ `buildCustomerPayload()`
 * (หน้าแชท) ไม่ควรลาก component 737 บรรทัดพร้อม dependency ทั้งพวง (ThaiAddressInput,
 * TaxInfoForm, pdfMake ผ่าน print-pdf ฯลฯ) เข้ามาใน first-load JS — ตัวฟอร์มโหลดแบบ
 * dynamic ได้ก็ต่อเมื่อไม่มีใคร import ค่าอื่นจากไฟล์เดียวกันแบบ static
 *
 * CustomerForm.tsx re-export ทั้งสองตัวต่อให้ → call site เดิมไม่ต้องแก้
 */

// Form data interface
// ที่อยู่จัดส่ง = shipping_* (ThaiAddressInput, แยก field)
// ที่อยู่ออกบิล = billing_address (textarea เดียว, อยู่ในส่วนข้อมูลภาษี — ถ้าว่าง = ใช้ที่อยู่จัดส่ง)
export interface CustomerFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  customer_type: string;
  sale_type: string;
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes: string;
  // Shipping address (ที่อยู่จัดส่ง)
  shipping_address: string;
  shipping_district: string;
  shipping_amphoe: string;
  shipping_province: string;
  shipping_postal_code: string;
  shipping_google_maps_link: string;
  shipping_delivery_notes: string;
  // Tax invoice info
  needs_tax_invoice: boolean;
  tax_type: 'personal' | 'corporate';
  tax_company_name: string;
  tax_id: string;
  tax_branch: string;
  billing_address: string; // ที่อยู่ออกบิล (ถ้าว่าง = ใช้ shipping join)
  // Consignment fields
  consignment_mode?: string;
  consignment_gp_rate?: number | '';
  consignment_gp_base_price?: 'retail' | 'discounted' | null;
  consignment_report_due_days?: number | '';
  consignment_payment_terms?: number | '';
  contract_number?: string;
  contract_date?: string;
  rd_submitted_at?: string;
}

/** Build API payload — billing_address = ถ้าว่างใช้ shipping join */
export function buildCustomerPayload(data: CustomerFormData, customerId?: string) {
  const isConsignment = data.customer_type === 'consignment_dealer';
  const shippingJoined = [data.shipping_address, data.shipping_district, data.shipping_amphoe, data.shipping_province, data.shipping_postal_code].filter(Boolean).join(' ');
  const hasTax = data.needs_tax_invoice || ['dealer', 'wholesale_dealer', 'consignment_dealer', 'department_store', 'wholesale_department', 'corporate'].includes(data.customer_type);

  return {
    ...(customerId ? { id: customerId } : {}),
    name: data.name, contact_person: data.contact_person, phone: data.phone, email: data.email,
    customer_type: data.customer_type, sale_type: data.sale_type || null,
    credit_limit: data.credit_limit, credit_days: data.credit_days,
    is_active: data.is_active, notes: data.notes,
    tax_id: hasTax ? data.tax_id : '',
    tax_company_name: hasTax ? data.tax_company_name : '',
    tax_branch: hasTax ? data.tax_branch : '',
    billing_address: data.billing_address || shippingJoined,
    ...(isConsignment ? {
      consignment_mode: data.consignment_mode || null,
      consignment_gp_rate: data.consignment_gp_rate !== '' ? data.consignment_gp_rate : null,
      consignment_report_due_days: data.consignment_report_due_days !== '' ? data.consignment_report_due_days : null,
      consignment_payment_terms: data.consignment_payment_terms !== '' ? data.consignment_payment_terms : null,
      contract_number: data.contract_number || null, contract_date: data.contract_date || null,
      rd_submitted_at: data.rd_submitted_at || null,
    } : {}),
  };
}
